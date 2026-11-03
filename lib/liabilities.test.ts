import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/liabilities.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  fetchLiabilitiesPage,
  fetchLiabilitySubcategories,
  fetchLiabilityDetail,
  createLiabilityApi,
  updateLiabilityApi,
  deleteLiabilityApi,
  uploadLiabilityAttachmentApi,
  deleteLiabilityAttachmentApi,
  undoLiabilityMatchApi,
  liabilityRemaining,
  formatLiabilityAmount,
  formatLiabilityRemaining,
  formatLiabilityDate,
  liabilityIssues,
  liabilityCanUndoMatch,
  liabilitySummaryLine,
  emptyLiabilityDraft,
} = await import("@/lib/liabilities");

import type { Liability, LiabilityDraft } from "@/lib/liabilities";

/** Decrypts whatever body a call sent, whether a bare `{data}` object or FormData. */
function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string")
      throw new Error("FormData had no 'data' field");
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

/** A full liability — individual fields overridden per test as needed. */
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

describe("fetchLiabilitiesPage", () => {
  it("sends page and limit, and omits searchQuery when there's nothing to search for", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { rows: [], paginationData: { total: 0 } } },
    });

    await fetchLiabilitiesPage(2, 25);

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.liability.list);
    expect(config.params).toEqual({ page: "2", limit: "25" });
  });

  it("sends a trimmed searchQuery param once there's something to search for", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { rows: [], paginationData: { total: 0 } } },
    });

    await fetchLiabilitiesPage(1, 50, "  van  ");

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params).toEqual({
      page: "1",
      limit: "50",
      searchQuery: "van",
    });
  });

  it("maps every raw field, including the supplier, gst and possible_match", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rows: [
            {
              id: 89276,
              name: "Equipment finance — van",
              subcategory_name: "Loan",
              contact_name: "Turner Consulting",
              contact_email: "accounts@turner.test",
              client_id: 101,
              price: 42000,
              remainingAmount: 28000,
              created_at: "2026-09-10T02:00:00.000Z",
              is_reconciled: false,
              possible_match: 2,
              journal_entry_id: null,
              bank_transaction_id: null,
              gst: 1,
            },
          ],
          paginationData: { total: 1 },
        },
      },
    });

    const result = await fetchLiabilitiesPage(1, 50);

    expect(result.total).toBe(1);
    expect(result.liabilities[0]).toEqual({
      id: "89276",
      date: "2026-09-10",
      name: "Equipment finance — van",
      category: "Loan",
      supplierId: "101",
      supplierName: "Turner Consulting",
      supplierEmail: "accounts@turner.test",
      amount: 42000,
      gst: true,
      paidAmount: 14000,
      status: "Pending",
      transactionRef: null,
      journalEntryId: null,
      bankTransactionId: null,
      attachment: null,
      possibleMatch: 2,
    });
  });

  it("reads is_reconciled/journal_entry_id/bank_transaction_id in their various raw forms", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rows: [
            {
              id: 1,
              name: "Wages accrual",
              price: 1000,
              remainingAmount: 0,
              is_reconciled: "1",
              journal_entry_id: 55,
              bank_transaction_id: "77",
              gst: "0",
            },
            {
              id: 2,
              name: "Loan",
              price: 500,
              is_reconciled: 0,
              gst: false,
            },
          ],
          paginationData: { total: 2 },
        },
      },
    });

    const result = await fetchLiabilitiesPage(1, 50);

    expect(result.liabilities[0]).toMatchObject({
      status: "Matched",
      journalEntryId: "55",
      bankTransactionId: "77",
      gst: false,
      paidAmount: 1000,
    });
    expect(result.liabilities[1]).toMatchObject({
      status: "Pending",
      journalEntryId: null,
      bankTransactionId: null,
      // No remainingAmount in the raw row — falls back to the full amount,
      // so nothing reads as paid down.
      paidAmount: 0,
    });
  });

  it("falls back to the array length when the response carries no pagination total", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { rows: [{ id: 1, name: "A", price: 100 }] },
      },
    });

    const result = await fetchLiabilitiesPage(1, 50);
    expect(result.total).toBe(1);
  });

  it("returns an empty page when the response carries no rows at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    const result = await fetchLiabilitiesPage(1, 50);
    expect(result).toEqual({ liabilities: [], total: 0 });
  });
});

describe("fetchLiabilitySubcategories", () => {
  it("maps account_subcategory_id/account_subcategory_name pairs", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { account_subcategory_id: 12, account_subcategory_name: "Loan" },
          { account_subcategory_id: 13, subcategory_name: "Other Liabilities" },
        ],
      },
    });

    const result = await fetchLiabilitySubcategories();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.liability.subcategoryList);
    expect(result).toEqual([
      { id: "12", name: "Loan" },
      { id: "13", name: "Other Liabilities" },
    ]);
  });

  it("reads a bare array, or one nested under rows/data", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: { rows: [{ id: 1, name: "Loan" }] } },
    });
    expect(await fetchLiabilitySubcategories()).toEqual([
      { id: "1", name: "Loan" },
    ]);
  });

  it("drops rows missing an id or a name", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { account_subcategory_id: 1, account_subcategory_name: "Loan" },
          { account_subcategory_id: "", account_subcategory_name: "No id" },
          { account_subcategory_id: 2, account_subcategory_name: "" },
        ],
      },
    });

    expect(await fetchLiabilitySubcategories()).toEqual([
      { id: "1", name: "Loan" },
    ]);
  });
});

describe("fetchLiabilityDetail", () => {
  it("fetches from viewDetail + id and maps the nested supplier and category", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 89276,
          name: "Equipment finance — van",
          sub_total: 42000,
          total_gst: 4200,
          price: 46200,
          gst: 1,
          gst_percentage: "10.00",
          account_subcategory: { account_subcategory_id: 12 },
          client_id: 101,
          contact_name: "Turner Consulting",
          contact_email: "accounts@turner.test",
          documents: [],
        },
      },
    });

    const result = await fetchLiabilityDetail("89276");

    expect(apiMock.get).toHaveBeenCalledWith(
      `${apiRoutes.liability.viewDetail}89276`,
    );
    expect(result).toMatchObject({
      name: "Equipment finance — van",
      categoryId: "12",
      supplierId: "101",
      supplierName: "Turner Consulting",
      supplierEmail: "accounts@turner.test",
      // The amount before tax — the server adds the tax on top into price.
      amount: 42000,
      gst: true,
      gstPercent: 10,
      attachment: null,
      documents: [],
    });
  });

  it("falls back from sub_total to price, and to a nested client name for the supplier", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          name: "Loan",
          price: 5000,
          account_subcategory_id: 12,
          client: { id: 5, name: "Fallback Client" },
        },
      },
    });

    const result = await fetchLiabilityDetail("1");
    expect(result.amount).toBe(5000);
    expect(result.supplierName).toBe("Fallback Client");
  });

  it("maps the first document into an attachment preview, keyed off its real url", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          name: "Loan",
          price: 100,
          account_subcategory_id: 12,
          documents: [
            {
              document_id: 501,
              file_name: "agreement.pdf",
              file_path: "https://cdn.test/agreement.pdf",
            },
          ],
        },
      },
    });

    const result = await fetchLiabilityDetail("1");
    expect(result.documents).toEqual([
      { id: "501", name: "agreement.pdf", url: "https://cdn.test/agreement.pdf" },
    ]);
    expect(result.attachment).toEqual({
      dataUrl: "https://cdn.test/agreement.pdf",
      name: "agreement.pdf",
      size: 0,
    });
  });

  it("throws when the API returns no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    await expect(fetchLiabilityDetail("does-not-exist")).rejects.toThrow(
      "Liability not found",
    );
  });
});

describe("creating a liability", () => {
  it("POSTs an encrypted body with client_id, category, name, sub_total and gst", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { id: 900 } },
    });

    const result = await createLiabilityApi(BASE_DRAFT, null);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.liability.add);
    expect(body).not.toBeInstanceOf(FormData);
    expect(decryptedFieldsFromBody(body)).toEqual({
      client_id: "101",
      account_subcategory_id: "12",
      name: "Equipment finance — van",
      sub_total: 42000,
      gst: 1,
      paid_with_cash: 0,
    });
    expect(result).toEqual({ id: "900" });
  });

  it("sends gst 0 when the switch is off", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await createLiabilityApi({ ...BASE_DRAFT, gst: false }, null);
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.gst).toBe(0);
  });

  it("sends the attachment as a raw file beside the ciphertext when there is one", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    const file = new File(["bytes"], "agreement.pdf", {
      type: "application/pdf",
    });

    await createLiabilityApi(BASE_DRAFT, file);

    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("files[]")).toBe(file);
    expect(decryptedFieldsFromBody(body).name).toBe(BASE_DRAFT.name);
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Valid account_subcategory_id is required" },
    });
    await expect(createLiabilityApi(BASE_DRAFT, null)).rejects.toThrow(
      "Valid account_subcategory_id is required",
    );
  });
});

describe("updating a liability", () => {
  it("PUTs an encrypted body carrying both id and liability_id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await updateLiabilityApi("89276", BASE_DRAFT, null);

    expect(apiMock.put).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.liability.update);
    const fields = decryptedFieldsFromBody(body);
    expect(fields.id).toBe("89276");
    expect(fields.liability_id).toBe("89276");
    expect(fields.client_id).toBe("101");
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.put.mockResolvedValue({
      data: { success: false, message: "Liability not found: 999" },
    });
    await expect(
      updateLiabilityApi("999", BASE_DRAFT, null),
    ).rejects.toThrow("Liability not found: 999");
  });
});

describe("deleting a liability", () => {
  it("DELETEs with an encrypted empty body carried as the `data` config option", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteLiabilityApi("89276");

    expect(apiMock.delete).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.delete.mock.calls[0];
    expect(url).toBe(`${apiRoutes.liability.delete}/89276`);
    expect(decryptPayload(config.data.data)).toEqual({});
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.delete.mockResolvedValue({
      data: { success: false, message: "Something went wrong" },
    });
    await expect(deleteLiabilityApi("1")).rejects.toThrow(
      "Something went wrong",
    );
  });
});

describe("attaching and detaching a document", () => {
  it("uploadLiabilityAttachmentApi POSTs the liability id encrypted, with the file raw", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const file = new File(["bytes"], "agreement.pdf");

    await uploadLiabilityAttachmentApi("89276", file);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.liability.uploadAttachment);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("files[]")).toBe(file);
    expect(decryptedFieldsFromBody(body)).toEqual({ liability_id: "89276" });
  });

  it("uploadLiabilityAttachmentApi throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Only PDF, JPG, PNG, WEBP, and AVIF files are allowed" },
    });
    await expect(
      uploadLiabilityAttachmentApi("1", new File(["x"], "x.exe")),
    ).rejects.toThrow("Only PDF, JPG, PNG, WEBP, and AVIF files are allowed");
  });

  it("deleteLiabilityAttachmentApi DELETEs the document by id with an encrypted empty body", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteLiabilityAttachmentApi("501");

    const [url, config] = apiMock.delete.mock.calls[0];
    expect(url).toBe(`${apiRoutes.liability.deleteAttachment}/501`);
    expect(decryptPayload(config.data.data)).toEqual({});
  });

  it("deleteLiabilityAttachmentApi throws with the server's own message on failure", async () => {
    apiMock.delete.mockResolvedValue({
      data: { success: false, message: "Document not found or already deleted" },
    });
    await expect(deleteLiabilityAttachmentApi("does-not-exist")).rejects.toThrow(
      "Document not found or already deleted",
    );
  });
});

describe("undoLiabilityMatchApi", () => {
  it("always sends the liability's own id under both liability_id and reference_id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await undoLiabilityMatchApi(liability({ id: "42" }));

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.liability.undoMatch);
    expect(decryptedFieldsFromBody(body)).toEqual({
      liability_id: "42",
      id: "42",
      reference_type: "liability",
      reference_id: "42",
    });
  });

  it("includes journal_entry_id and bank_transaction_id only when the liability carries them", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await undoLiabilityMatchApi(
      liability({ id: "42", journalEntryId: "9", bankTransactionId: "77" }),
    );

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.journal_entry_id).toBe("9");
    expect(fields.bank_transaction_id).toBe("77");
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "No matched liability journal entries found" },
    });
    await expect(undoLiabilityMatchApi(liability())).rejects.toThrow(
      "No matched liability journal entries found",
    );
  });
});

describe("figures", () => {
  it("liabilityRemaining never goes below zero", () => {
    expect(liabilityRemaining(liability({ amount: 500, paidAmount: 700 }))).toBe(0);
    expect(liabilityRemaining(liability({ amount: 500, paidAmount: 200 }))).toBe(300);
  });

  it("formatLiabilityAmount and formatLiabilityRemaining read as currency, with an em dash once settled", () => {
    const partiallyPaid = liability({ amount: 1000, paidAmount: 400 });
    expect(formatLiabilityAmount(partiallyPaid)).toBe("$1,000.00");
    expect(formatLiabilityRemaining(partiallyPaid)).toBe("$600.00");
    expect(
      formatLiabilityRemaining(liability({ amount: 1000, paidAmount: 1000 })),
    ).toBe("—");
  });

  it("formatLiabilityDate reads the same as the rest of the platform's date formatting", () => {
    expect(formatLiabilityDate("2026-09-10")).toMatch(/2026/);
  });
});

describe("liabilityCanUndoMatch", () => {
  it("is true once status flips to Matched", () => {
    expect(liabilityCanUndoMatch(liability({ status: "Matched" }))).toBe(true);
  });

  it("is true for a part-paid liability even while status is still Pending", () => {
    expect(
      liabilityCanUndoMatch(
        liability({ status: "Pending", paidAmount: 100 }),
      ),
    ).toBe(true);
  });

  it("is true whenever a journal or bank-transaction id is present", () => {
    expect(
      liabilityCanUndoMatch(liability({ journalEntryId: "9" })),
    ).toBe(true);
    expect(
      liabilityCanUndoMatch(liability({ bankTransactionId: "9" })),
    ).toBe(true);
  });

  it("is false for a plain, untouched Pending liability", () => {
    expect(liabilityCanUndoMatch(liability())).toBe(false);
  });
});

describe("liabilityIssues", () => {
  it("flags a missing supplier, category, short name and negative amount", () => {
    const issues = liabilityIssues({
      ...emptyLiabilityDraft("2026-09-10"),
      name: "A",
      amount: -1,
    });
    expect(issues.map((issue) => issue.key)).toEqual(
      expect.arrayContaining(["supplier", "category", "name", "amount"]),
    );
  });

  it("accepts an amount of exactly zero — only a liability, not equity, allows this", () => {
    const issues = liabilityIssues({ ...BASE_DRAFT, amount: 0 });
    expect(issues.map((issue) => issue.key)).not.toContain("amount");
  });

  it("rejects a name over 120 characters", () => {
    const issues = liabilityIssues({ ...BASE_DRAFT, name: "a".repeat(121) });
    expect(issues.map((issue) => issue.key)).toContain("name");
  });

  it("is empty for a complete draft", () => {
    expect(liabilityIssues(BASE_DRAFT)).toEqual([]);
  });
});

describe("drafts", () => {
  it("emptyLiabilityDraft seeds today's date and blank/null fields", () => {
    expect(emptyLiabilityDraft("2026-09-10")).toEqual({
      date: "2026-09-10",
      name: "",
      categoryId: "",
      supplierId: null,
      supplierName: "",
      supplierEmail: "",
      amount: 0,
      gst: false,
      gstPercent: null,
      attachment: null,
    });
  });

  it("liabilitySummaryLine reads the amount as currency", () => {
    expect(liabilitySummaryLine(BASE_DRAFT)).toBe("$42,000.00");
  });
});
