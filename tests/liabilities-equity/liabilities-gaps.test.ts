import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

/*
 * Companion to lib/liabilities.test.ts: the branches that file doesn't reach
 * (docs/testing-liabilities-equity.md → Gaps). Same harness — mocked api,
 * module imported after the mock, strict body decryption.
 */
const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const {
  fetchLiabilitiesPage,
  fetchLiabilityDetail,
  createLiabilityApi,
  updateLiabilityApi,
  deleteLiabilityApi,
  uploadLiabilityAttachmentApi,
  deleteLiabilityAttachmentApi,
  undoLiabilityMatchApi,
  liabilityIssues,
} = await import("@/lib/liabilities");

import type { Liability, LiabilityDraft } from "@/lib/liabilities";

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string") throw new Error("FormData had no 'data' field");
    return decryptPayload(data);
  }
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was neither FormData nor a {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function liability(overrides: Partial<Liability> = {}): Liability {
  return {
    id: "1",
    date: "2026-09-10",
    name: "Equipment finance — van",
    category: "Loan",
    supplierId: "101",
    supplierName: "Turner Consulting",
    supplierEmail: "accounts@turner.test",
    amount: 42000,
    gst: true,
    paidAmount: 0,
    status: "Pending",
    transactionRef: null,
    journalEntryId: null,
    bankTransactionId: null,
    attachment: null,
    possibleMatch: 0,
    ...overrides,
  };
}

const BASE_DRAFT: LiabilityDraft = {
  date: "2026-09-10",
  name: "Equipment finance — van",
  categoryId: "12",
  supplierId: "101",
  supplierName: "Turner Consulting",
  supplierEmail: "accounts@turner.test",
  amount: 42000,
  gst: true,
  gstPercent: null,
  attachment: null,
};

function listReply(rows: Record<string, unknown>[]) {
  return { data: { success: true, data: { rows } } };
}

describe("fetchLiabilitiesPage — flag parsing and defaults", () => {
  it("reads gst '1' as true, and possible_match as 0 when absent", async () => {
    apiMock.get.mockResolvedValue(listReply([{ id: 1, price: 100, gst: "1" }]));

    const [row] = (await fetchLiabilitiesPage(1, 10)).liabilities;

    expect(row.gst).toBe(true);
    expect(row.possibleMatch).toBe(0);
  });

  it("maps a missing client_id to a null supplier and blank date/name/category", async () => {
    apiMock.get.mockResolvedValue(listReply([{ id: 2, price: "50" }]));

    const [row] = (await fetchLiabilitiesPage(1, 10)).liabilities;

    expect(row).toMatchObject({
      supplierId: null,
      supplierName: "",
      date: "",
      name: "",
      category: "",
      status: "Pending",
      journalEntryId: null,
      bankTransactionId: null,
    });
  });

  it("treats any non-'0' string flag as true — including the string 'false'", async () => {
    // Documented quirk of the internal parseFlag (`!!value && value !== "0"`):
    // the backend sends 0/1, but a literal "false" would read as set. Pinned so
    // a change to that rule is deliberate.
    apiMock.get.mockResolvedValue(
      listReply([
        { id: 1, price: 1, gst: "true", is_reconciled: "true" },
        { id: 2, price: 1, gst: "false", is_reconciled: "false" },
        { id: 3, price: 1, gst: "0", is_reconciled: "0" },
      ]),
    );

    const rows = (await fetchLiabilitiesPage(1, 10)).liabilities;

    expect(rows.map((r) => [r.gst, r.status])).toEqual([
      [true, "Matched"],
      [true, "Matched"],
      [false, "Pending"],
    ]);
  });
});

describe("fetchLiabilityDetail — fallback chains", () => {
  it("reads supplier name/email from a nested contact, and the category from account_subcategory.id", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 7,
          name: "ATO payment plan",
          price: "3000",
          client_id: null,
          contact: { name: "Australian Taxation Office", email: "ato@example.test" },
          client: { name: "ignored — contact wins" },
          account_subcategory: { id: 33 },
        },
      },
    });

    const detail = await fetchLiabilityDetail("7");

    expect(detail).toMatchObject({
      date: "",
      categoryId: "33",
      supplierId: null,
      supplierName: "Australian Taxation Office",
      supplierEmail: "ato@example.test",
      amount: 3000,
      gst: false,
      attachment: null,
      documents: [],
    });
  });

  it("maps documents through id/name/url fallbacks, dropping id-less ones", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 7,
          documents: [
            { file_name: "no-id.pdf", file_path: "https://cdn.test/no-id.pdf" },
            { id: 91, file_url: "https://cdn.test/a.pdf" },
            { document_id: 92, name: "Contract", url: "https://cdn.test/b.pdf" },
            { id: 93 },
          ],
        },
      },
    });

    const detail = await fetchLiabilityDetail("7");

    expect(detail.documents).toEqual([
      { id: "91", name: "Attachment", url: "https://cdn.test/a.pdf" },
      { id: "92", name: "Contract", url: "https://cdn.test/b.pdf" },
      { id: "93", name: "Attachment", url: "" },
    ]);
    // The first *kept* document is the preview — not the dropped id-less one.
    expect(detail.attachment).toEqual({
      dataUrl: "https://cdn.test/a.pdf",
      name: "Attachment",
      size: 0,
    });
  });

  it("falls back to a zero amount when neither sub_total nor price is sent", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { id: 7 } } });
    expect((await fetchLiabilityDetail("7")).amount).toBe(0);
  });
});

describe("updateLiabilityApi with a file", () => {
  it("sends FormData with the file under files[] and both ids in the ciphertext", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    const file = new File(["bytes"], "statement.pdf", { type: "application/pdf" });

    await updateLiabilityApi("55", BASE_DRAFT, file);

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.liability.update);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).getAll("files[]")).toEqual([file]);
    expect(decryptedFieldsFromBody(body)).toMatchObject({
      id: "55",
      liability_id: "55",
      sub_total: 42000,
      paid_with_cash: 0,
    });
  });
});

describe("createLiabilityApi — reply without an id", () => {
  it("resolves { id: '' } rather than throwing", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(createLiabilityApi(BASE_DRAFT, null)).resolves.toEqual({ id: "" });
  });
});

describe("fallback error messages when the server sends none", () => {
  const failure = { data: { success: false } };

  it.each([
    ["createLiabilityApi", "post", () => createLiabilityApi(BASE_DRAFT, null), "Failed to create liability."],
    ["updateLiabilityApi", "put", () => updateLiabilityApi("1", BASE_DRAFT, null), "Failed to save liability."],
    ["deleteLiabilityApi", "delete", () => deleteLiabilityApi("1"), "Failed to delete liability."],
    [
      "uploadLiabilityAttachmentApi",
      "post",
      () => uploadLiabilityAttachmentApi("1", new File(["x"], "x.pdf")),
      "Failed to upload attachment.",
    ],
    ["deleteLiabilityAttachmentApi", "delete", () => deleteLiabilityAttachmentApi("9"), "Failed to delete attachment."],
    ["undoLiabilityMatchApi", "post", () => undoLiabilityMatchApi(liability()), "Failed to undo the match."],
  ] as const)("%s (%s) falls back to its default message", async (_name, verb, call, message) => {
    apiMock[verb].mockResolvedValue(failure);
    await expect(call()).rejects.toThrow(message);
  });

  it("an empty-string server message also falls back to the default", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "" } });
    await expect(createLiabilityApi(BASE_DRAFT, null)).rejects.toThrow("Failed to create liability.");
  });
});

describe("liabilityIssues — messages and order", () => {
  it("lists supplier, category, name, amount in that order with their messages", () => {
    expect(
      liabilityIssues({ ...BASE_DRAFT, supplierId: null, categoryId: "", name: " a ", amount: -1 }),
    ).toEqual([
      { key: "supplier", message: "Choose a supplier." },
      { key: "category", message: "Choose a category." },
      { key: "name", message: "Liability name must be 2–120 characters." },
      { key: "amount", message: "Sub total must be 0 or greater." },
    ]);
  });

  it("rejects a NaN amount (the check is written !(amount >= 0))", () => {
    expect(liabilityIssues({ ...BASE_DRAFT, amount: Number.NaN })).toEqual([
      { key: "amount", message: "Sub total must be 0 or greater." },
    ]);
  });

  it("measures the name after trimming, accepting exactly 120 characters", () => {
    expect(liabilityIssues({ ...BASE_DRAFT, name: `  ${"x".repeat(120)}  ` })).toEqual([]);
    expect(liabilityIssues({ ...BASE_DRAFT, name: "  ab  " })).toEqual([]);
  });
});
