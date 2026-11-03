/**
 * Invoice and expense document capture against sole-ocr's upload and extract
 * routes — the same calls sole-webapp's upload components make.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  captureFileIssue,
  uploadCaptureFile,
  deleteCaptureUpload,
  extractInvoiceApi,
  extractExpenseApi,
  invoiceCaptureEditor,
  expenseCaptureEditor,
} = await import("@/lib/ocr-capture");

beforeEach(() => {
  vi.resetAllMocks();
});

const pdf = new File(["x"], "bill.pdf", { type: "application/pdf" });
const s3 = { identifier: "invoice-uploads/abc-bill.pdf", source: "s3" as const };

describe("captureFileIssue", () => {
  it("accepts PDF and PNG/JPEG, rejects the rest and anything over 10MB", () => {
    expect(captureFileIssue(pdf)).toBeUndefined();
    expect(
      captureFileIssue(new File(["x"], "a.gif", { type: "image/gif" })),
    ).toMatch(/isn't supported/);
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    expect(captureFileIssue(big)).toMatch(/over 10MB/);
  });
});

describe("uploadCaptureFile", () => {
  it("posts the file with its folder and returns the S3 key", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, key: "expense-uploads/k.pdf", storage: "s3" },
    });
    const upload = await uploadCaptureFile(pdf, "expense-uploads");
    expect(upload).toEqual({ identifier: "expense-uploads/k.pdf", source: "s3" });
    const [url, form] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.ocr.upload);
    expect((form as FormData).get("folder")).toBe("expense-uploads");
  });

  it("sends the folder before the file, so multer sees it", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, key: "expense-uploads/k.pdf", storage: "s3" },
    });
    await uploadCaptureFile(pdf, "expense-uploads");
    const form = apiMock.post.mock.calls[0][1] as FormData;
    expect([...form.keys()]).toEqual(["folder", "file"]);
  });

  it("falls back to the local filename when there's no bucket", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, filename: "u-bill.pdf", storage: "local" },
    });
    expect(await uploadCaptureFile(pdf, "invoice-uploads")).toEqual({
      identifier: "u-bill.pdf",
      source: "local",
    });
  });

  it("throws the server's reason on failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, error: "nope" } });
    await expect(uploadCaptureFile(pdf, "invoice-uploads")).rejects.toThrow("nope");
  });
});

describe("deleteCaptureUpload", () => {
  it("deletes by key and swallows a failure", async () => {
    apiMock.delete.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deleteCaptureUpload(s3)).resolves.toBeUndefined();
    expect(apiMock.delete).toHaveBeenCalledWith(
      apiRoutes.invoice.ocr.deleteUpload + s3.identifier,
    );
  });
});

describe("extractInvoiceApi", () => {
  it("maps the reading to a draft, with lines and 0–1 confidence", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        extractedData: {
          invoice_no: "INV-7",
          client_name: "Acme",
          invoiceDate: "2026-03-02T00:00:00Z",
          dueDate: "03/16/2026",
          totalAmount: "110.00",
          items: [{ description: "Widget", qty: 2, price: 50, amount: 100 }],
          confidence: 90,
        },
        processingInfo: { confidence: 85 },
      },
    });
    const result = await extractInvoiceApi(pdf, s3, "2026-01-01");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.invoice.ocr.extract, {
      s3Key: s3.identifier,
      fileType: "application/pdf",
      extractionMethod: "hybrid",
    });
    expect(result.confidence).toBe(0.85);
    expect(result.fields).toMatchObject({
      number: "INV-7",
      clientName: "Acme",
      issued: "2026-03-02",
      due: "2026-03-16",
      total: "110",
    });
    expect(result.fields.items).toHaveLength(1);
    expect(result.fields.items[0]).toMatchObject({
      description: "Widget",
      quantity: "2",
      price: "50",
      gst: false,
    });
  });

  it("bills the total as one line when no lines were read", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        extractedData: { totalAmount: 55, description: "Consulting" },
      },
    });
    const { fields, confidence } = await extractInvoiceApi(pdf, s3, "2026-01-01");
    expect(confidence).toBe(0);
    expect(fields.issued).toBe("2026-01-01");
    expect(fields.items).toHaveLength(1);
    expect(fields.items[0]).toMatchObject({
      description: "Consulting",
      quantity: "1",
      price: "55",
    });
  });

  it("surfaces the plan-limit reason a 200 carries", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, error: "Invoice limit reached." },
    });
    await expect(extractInvoiceApi(pdf, s3, "2026-01-01")).rejects.toThrow(
      "Invoice limit reached.",
    );
  });
});

describe("extractExpenseApi", () => {
  it("reads description, total, date and supplier, using the AI method", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        extractedData: {
          description: "Printer paper",
          price: "$24.50",
          date: "2026-02-10T00:00:00.000Z",
          supplier: { label: "Officeworks", id: "", value: "Officeworks" },
          category: "Office Supplies",
        },
        rawData: { confidence: 72 },
      },
    });
    const result = await extractExpenseApi(pdf, s3, "2026-01-01");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.expense.ocr.extract, {
      s3Key: s3.identifier,
      fileType: "application/pdf",
      extractionMethod: "ai",
    });
    expect(result.confidence).toBe(0.72);
    expect(result.fields).toEqual({
      description: "Printer paper",
      amount: "24.5",
      date: "2026-02-10",
      supplierName: "Officeworks",
      category: "Office Supplies",
    });
  });

  it("falls back to the total and today's date", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, extractedData: { total: 9 } },
    });
    const { fields } = await extractExpenseApi(pdf, s3, "2026-01-01");
    expect(fields.amount).toBe("9");
    expect(fields.date).toBe("2026-01-01");
  });
});

describe("capture editors", () => {
  const invoice = {
    confidence: 0.9,
    fields: {
      number: "INV-1",
      clientName: "Acme",
      issued: "2026-03-01",
      due: "2026-03-08",
      total: "100",
      description: "Consulting",
      notes: "",
      items: [
        {
          id: "l1",
          description: "Consulting",
          quantity: "1",
          price: "100",
          discountPercent: "",
          gst: false,
        },
      ],
    },
  } as unknown as Parameters<typeof invoiceCaptureEditor.read>[0];

  it("an invoice edit carries through, and a total-only line follows it", () => {
    const values = { ...invoiceCaptureEditor.read(invoice), total: "250.5", clientName: " Beta " };
    const next = invoiceCaptureEditor.write(invoice, values);
    expect(next.fields.total).toBe("250.5");
    expect(next.fields.clientName).toBe("Beta");
    expect(next.fields.items[0].price).toBe("250.5");
    expect(next.confidence).toBe(0.9);
  });

  it("leaves lines that were read off the document alone", () => {
    const withLines = {
      ...invoice,
      fields: {
        ...invoice.fields,
        total: "300",
        items: [
          { ...invoice.fields.items[0], price: "100" },
          { ...invoice.fields.items[0], id: "l2", price: "200" },
        ],
      },
    };
    const next = invoiceCaptureEditor.write(withLines, {
      ...invoiceCaptureEditor.read(withLines),
      total: "999",
    });
    expect(next.fields.items.map((item) => item.price)).toEqual(["100", "200"]);
  });

  it("an expense edit normalises the amount", () => {
    const expense = {
      confidence: 0.7,
      fields: { description: "a", amount: "9", date: "2026-01-01", supplierName: "x", category: "" },
    };
    const next = expenseCaptureEditor.write(expense, {
      ...expenseCaptureEditor.read(expense),
      amount: "$12.40",
      supplierName: " Bunnings ",
    });
    expect(next.fields).toMatchObject({ amount: "12.4", supplierName: "Bunnings" });
  });
});
