import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// The real parser, wrapped so a test can make the local fallback throw.
vi.mock("@/lib/file-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-parser")>();
  return { ...actual, parseSpreadsheet: vi.fn(actual.parseSpreadsheet) };
});

const fileParser = await import("@/lib/file-parser");
const realParse = (
  await vi.importActual<typeof import("@/lib/file-parser")>("@/lib/file-parser")
).parseSpreadsheet;
const { aiTargetFromBulkSpec, importFileError, readImportFile } = await import(
  "@/lib/ai-format"
);
const { INVOICE_IMPORT_SPEC } = await import("@/lib/invoice-import");
const { TXN_AI_TARGET } = await import("@/lib/transaction-import");

const TARGET = {
  type: "contacts" as const,
  fields: [
    { label: "Contact name", required: true },
    { label: "Type", options: ["Client", "Supplier"] },
  ],
};

const CSV = ["Contact name,Type", "Jo Lee,Client"].join("\n");

function csvFile(content = CSV, name = "contacts.csv"): File {
  return new File([content], name);
}

function axiosErrorWith(message: string): AxiosError {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    data: { message },
    status: 422,
  } as AxiosResponse);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fileParser.parseSpreadsheet).mockImplementation(realParse);
});

describe("aiTargetFromBulkSpec", () => {
  it("sends the spec's migration step as the type, and each field's label/required/desc", () => {
    const target = aiTargetFromBulkSpec(INVOICE_IMPORT_SPEC);

    expect(target.type).toBe("invoices");
    expect(target.fields).toHaveLength(INVOICE_IMPORT_SPEC.fields.length);
    expect(target.fields[0]).toEqual({
      label: "Client name",
      required: true,
      description: "Who the invoice is addressed to",
      options: undefined,
    });
  });

  it("carries options only for a select Review editor", () => {
    const target = aiTargetFromBulkSpec(INVOICE_IMPORT_SPEC);
    const withOptions = target.fields.filter((field) => field.options);

    expect(withOptions.map((field) => [field.label, field.options])).toEqual([
      ["Mark as", ["Draft", "Paid", "Overdue"]],
    ]);
  });
});

describe("TXN_AI_TARGET", () => {
  it("targets the transactions step with the four template columns, all required", () => {
    expect(TXN_AI_TARGET.type).toBe("transactions");
    expect(TXN_AI_TARGET.fields.map((f) => [f.label, f.required])).toEqual([
      ["Transaction type", true],
      ["Amount", true],
      ["Date", true],
      ["Description", true],
    ]);
    expect(TXN_AI_TARGET.fields[0].options).toEqual(["Credit", "Debit"]);
  });
});

describe("importFileError", () => {
  it("refuses an unsupported extension before checking size", () => {
    const bigPdf = new File([new Uint8Array(6 * 1024 * 1024)], "scan.pdf");
    expect(importFileError(bigPdf)).toBe(
      "Upload a CSV or Excel file (.csv, .xls, .xlsx).",
    );
  });

  it("refuses anything over 5 MB, and allows exactly 5 MB", () => {
    const over = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.csv");
    const exact = new File([new Uint8Array(5 * 1024 * 1024)], "ok.xlsx");
    expect(importFileError(over)).toBe("That file is over 5 MB. Split it and try again.");
    expect(importFileError(exact)).toBeNull();
  });
});

describe("readImportFile", () => {
  it("turns an unsupported file away without calling the AI endpoint", async () => {
    const result = await readImportFile(new File(["x"], "notes.txt"), TARGET);

    expect(result).toEqual({
      ok: false,
      error: "Upload a CSV or Excel file (.csv, .xls, .xlsx).",
    });
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("turns an oversize file away without calling the AI endpoint", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.csv");

    const result = await readImportFile(big, TARGET);

    expect(result).toEqual({ ok: false, error: "That file is over 5 MB. Split it and try again." });
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("posts the file plus the encrypted type/fields as multipart to the AI route", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { columns: ["Contact name"], rows: [{ "Contact name": "Jo" }] } },
    });
    const file = csvFile();

    await readImportFile(file, TARGET);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.migration.aiFormat);
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("file")).toBeInstanceOf(File);
    expect((form.get("file") as File).name).toBe("contacts.csv");
    expect(decryptPayload(form.get("data") as string)).toEqual({
      type: "contacts",
      fields: TARGET.fields,
    });
  });

  it("returns the AI's sheet and notes when it found rows", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          columns: ["Contact name", "Type"],
          rows: [{ "Contact name": "Jo Lee", Type: "Client" }],
          notes: ["Skipped 2 total rows"],
        },
      },
    });

    const result = await readImportFile(csvFile(), TARGET);

    expect(result).toEqual({
      ok: true,
      aiFormatted: true,
      sheet: {
        columns: ["Contact name", "Type"],
        rows: [{ "Contact name": "Jo Lee", Type: "Client" }],
      },
      notes: ["Skipped 2 total rows"],
    });
    expect(fileParser.parseSpreadsheet).not.toHaveBeenCalled();
  });

  it("defaults columns to the target's labels and notes to [] when the AI omits them", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { rows: [{ "Contact name": "Jo" }] } },
    });

    const result = await readImportFile(csvFile(), TARGET);

    expect(result).toMatchObject({
      ok: true,
      aiFormatted: true,
      notes: [],
      sheet: { columns: ["Contact name", "Type"] },
    });
  });

  it("falls back to a local parse when the AI returns zero rows", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { columns: [], rows: [] } },
    });

    const result = await readImportFile(csvFile(), TARGET);

    expect(result).toEqual({
      ok: true,
      aiFormatted: false,
      notes: [],
      aiError: "AI formatting found no rows to import.",
      sheet: { columns: ["Contact name", "Type"], rows: [{ "Contact name": "Jo Lee", Type: "Client" }] },
    });
  });

  it("falls back to a local parse when the AI call throws, keeping an AxiosError's server message", async () => {
    apiMock.post.mockRejectedValue(axiosErrorWith("Claude is overloaded"));

    const result = await readImportFile(csvFile(), TARGET);

    expect(result).toMatchObject({
      ok: true,
      aiFormatted: false,
      aiError: "Claude is overloaded",
    });
  });

  it("loses the server's own message on a 2xx success:false — aiError is the generic fallback", async () => {
    // aiFormatFile throws a plain Error, and apiErrorMessage only reads
    // AxiosErrors (see the doc's "Behaviour worth a test" note).
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Unsupported layout" } });

    const result = await readImportFile(csvFile(), TARGET);

    expect(result).toMatchObject({ ok: true, aiFormatted: false, aiError: "AI formatting failed." });
  });

  it("treats a 2xx with no data as an AI failure and falls back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    const result = await readImportFile(csvFile(), TARGET);

    expect(result).toMatchObject({ ok: true, aiFormatted: false, aiError: "AI formatting failed." });
  });

  it("reports a file with no data rows once the local parse finds none either", async () => {
    apiMock.post.mockRejectedValue(new Error("offline"));

    const result = await readImportFile(csvFile("Contact name,Type\n"), TARGET);

    expect(result).toEqual({ ok: false, error: "That file has no data rows below the header." });
  });

  it("reports an unreadable file when the local parse throws", async () => {
    apiMock.post.mockRejectedValue(new Error("offline"));
    vi.mocked(fileParser.parseSpreadsheet).mockRejectedValueOnce(new Error("corrupt zip"));

    const result = await readImportFile(csvFile("garbage", "broken.xlsx"), TARGET);

    expect(result).toEqual({ ok: false, error: "That file could not be read." });
  });
});
