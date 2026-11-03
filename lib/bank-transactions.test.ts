import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  aiSuggestionsFrom,
  approveAllApi,
  bulkApprovalIssue,
  fetchSuggestionsPage,
  rejectSuggestionsApi,
  bulkMatchApi,
  bulkMatchIssue,
  bulkMatchSkipsContact,
  markTransactionsApi,
  approvalIssue,
  approveTransactionApi,
  confidencePercent,
  currentFinancialYearLabel,
  deleteUnmatchedTransactionApi,
  deleteUnmatchedTransactionsApi,
  fetchTransactionBalances,
  fetchTransactionsPage,
  financialYearChoices,
  financialYearRange,
  listQueryParams,
  mapMatchedRow,
  mapUnmatchedRow,
  markTransactionApi,
  sourceLabel,
  tabForFilter,
  undoMarkTransactionApi,
  undoMatchEntryApi,
  unmatchTransactionsApi,
  unmatchTransactionApi,
} = await import("@/lib/bank-transactions");

function decrypted(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

describe("financial years", () => {
  it("lists this year back to FY 21/22, newest first", () => {
    expect(financialYearChoices(new Date(2026, 9, 5))).toEqual([
      "FY 26/27",
      "FY 25/26",
      "FY 24/25",
      "FY 23/24",
      "FY 22/23",
      "FY 21/22",
    ]);
    expect(financialYearChoices(new Date(2026, 5, 30))[0]).toBe("FY 25/26");
  });

  it("labels the current year", () => {
    expect(currentFinancialYearLabel(new Date(2026, 6, 1))).toBe("FY 26/27");
  });

  it("turns a label into July–June dates", () => {
    expect(financialYearRange("FY 25/26")).toEqual({
      start: "2025-07-01",
      end: "2026-06-30",
    });
    expect(financialYearRange("All periods")).toBeNull();
  });
});

describe("tabForFilter / listQueryParams", () => {
  it("sends only Unmatched to the unmatched list", () => {
    expect(tabForFilter("Review")).toBe("unmatched");
    expect(tabForFilter("Matched")).toBe("matched");
    expect(tabForFilter("Personal")).toBe("matched");
    expect(tabForFilter("Transfer")).toBe("matched");
  });

  it("builds sole-webapp's filter_by params", () => {
    expect(
      listQueryParams({
        tab: "matched",
        page: 2,
        pageSize: 50,
        period: "FY 25/26",
        search: "  stripe ",
        personal: true,
      }),
    ).toEqual({
      page: 2,
      page_size: 50,
      "filter_by[start_date]": "2025-07-01",
      "filter_by[end_date]": "2026-06-30",
      "filter_by[search]": "stripe",
      "filter_by[personal]": 1,
    });
  });

  it("ignores personal/transfer on the unmatched list, and an empty search", () => {
    expect(
      listQueryParams({
        tab: "unmatched",
        page: 1,
        pageSize: 10,
        period: "FY 25/26",
        search: " ",
        transfer: true,
      }),
    ).toEqual({
      page: 1,
      page_size: 10,
      "filter_by[start_date]": "2025-07-01",
      "filter_by[end_date]": "2026-06-30",
    });
  });
});

describe("row mapping", () => {
  it("maps an unmatched debit with its AI suggestion", () => {
    expect(
      mapUnmatchedRow({
        bank_transacton_id: 91,
        bank_name: "ANZ",
        source: "bank_feed",
        amount: "-120.5",
        description: "Officeworks",
        direction: "debit",
        transaction_date: "2026-09-01",
        available_amount: 100,
        gst_exclude: 0,
        classification_prediction: {
          account_subcategory_id: 12,
          name: "Office supplies",
          confidence: 0.87,
        },
      }),
    ).toMatchObject({
      id: "91",
      reference: "91",
      date: "2026-09-01",
      description: "Officeworks",
      type: "Debit",
      amount: 120.5,
      status: "Review",
      account: "ANZ",
      source: "Bank Feed",
      suggestedCategory: { category: "Office supplies", confidence: 87 },
      suggestedCategoryId: "12",
      gst: true,
      matchedTotal: 20.5,
      deletable: false,
    });
  });

  it("offers the suggestion on money in too, and lets a manual row be deleted", () => {
    const row = mapUnmatchedRow({
      bank_transacton_id: 5,
      source: "manual_upload",
      amount: 10,
      direction: "credit",
      classification_prediction: { account_subcategory_id: 51, name: "Sales", confidence: 0.9 },
    });
    expect(row).toMatchObject({
      type: "Credit",
      suggestedCategory: { category: "Sales", confidence: 90 },
      suggestedCategoryId: "51",
      account: "Manual Upload",
      source: "Manual",
      deletable: true,
      gst: false,
    });
  });

  it("maps a matched row with split lines", () => {
    const row = mapMatchedRow({
      id: 7,
      transaction_date: "2026-08-10",
      amount: 110,
      direction: "credit",
      description: "Payment",
      data: [
        { entry_id: 1, name: "GST Collected", amount: 10 },
        { entry_id: 2, name: "Sales Income", amount: 100, item_code: "INV-9", reference_type: "invoice", client_name: "Acme" },
      ],
    });
    expect(row).toMatchObject({
      id: "7",
      status: "Matched",
      category: "Sales Income",
      supplier: "Acme",
      type: "Credit",
      matchedTotal: 110,
      personal: false,
      transfer: null,
      source: "Unknown",
    });
    expect(row.splits).toHaveLength(2);
    expect(row.splits[1]).toMatchObject({ id: "2", reference: "INV-9", referenceType: "invoice" });
  });

  it("spots personal and transfer marks", () => {
    expect(mapMatchedRow({ id: 1, data: [{ account_subcategory_id: 133, name: "Personal", amount: 5 }] }).personal).toBe(true);
    expect(mapMatchedRow({ id: 2, data: [{ name: "Transfer", amount: 5 }] }).transfer).not.toBeNull();
    expect(mapMatchedRow({ id: 3, data: [{ name: "Personal", amount: 5 }] }).splits).toEqual([]);
  });

  it("labels sources and normalises confidence", () => {
    expect(sourceLabel("paid_with_cash")).toBe("Cash Payment");
    expect(sourceLabel(undefined)).toBe("Unknown");
    expect(confidencePercent(0.5)).toBe(50);
    expect(confidencePercent(73)).toBe(73);
    expect(confidencePercent("x")).toBe(0);
  });
});

describe("fetchTransactionsPage", () => {
  const params = { page: 1, pageSize: 50, period: "FY 25/26", search: "" };

  it("reads the unmatched list", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          bank_transactions: {
            bank_transaction_details: [{ bank_transacton_id: 1, amount: 5, direction: "debit" }],
            total: 41,
          },
        },
      },
    });
    const page = await fetchTransactionsPage({ ...params, tab: "unmatched" });
    expect(page.total).toBe(41);
    expect(page.rows[0].id).toBe("1");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bankTransaction.bankTransactions, {
      params: expect.objectContaining({ page: 1, page_size: 50 }),
    });
  });

  it("reads the matched list, which has no data wrapper", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, sole_transaction_details: [{ id: 3, amount: 9, data: [] }], total: 1 },
    });
    const page = await fetchTransactionsPage({ ...params, tab: "matched" });
    expect(page).toMatchObject({ total: 1 });
    expect(page.rows[0].status).toBe("Matched");
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.soleTransactions);
  });

  it("throws the server's message on failure", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(fetchTransactionsPage({ ...params, tab: "unmatched" })).rejects.toThrow("Nope");
  });
});

describe("fetchTransactionBalances", () => {
  it("reads both piles' money for the year", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { balances: { total_unmatched: "120.5", total_saved: 300 } } },
    });
    expect(await fetchTransactionBalances("FY 25/26")).toEqual({ unmatched: 120.5, matched: 300 });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bankTransaction.fetchMatchingBalance, {
      params: { "filter_by[start_date]": "2025-07-01", "filter_by[end_date]": "2026-06-30" },
    });
  });
});

describe("row actions", () => {
  beforeEach(() => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "ok" } });
  });

  it("marks and unmarks personal/transfer", async () => {
    await markTransactionApi("9", "personal");
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.markTransaction);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({ bank_transaction_id: "9", type: "personal" });

    await undoMarkTransactionApi("9", "transfer");
    expect(apiMock.post.mock.calls[1][0]).toBe(apiRoutes.bankTransaction.undoMarkTransaction);
    expect(decrypted(apiMock.post.mock.calls[1][1])).toEqual({ bank_transaction_id: "9", type: "transfer" });
  });

  it("unmatches a whole transaction and deletes an unmatched one", async () => {
    await unmatchTransactionApi("4");
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.bulkUndoMatchTransaction);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({ transaction_ids: ["4"] });

    await deleteUnmatchedTransactionApi("4");
    expect(apiMock.post.mock.calls[1][0]).toBe(apiRoutes.bankTransaction.deleteUnmatchedTransaction);
    expect(decrypted(apiMock.post.mock.calls[1][1])).toEqual({ transaction_id: "4" });
  });

  it("bulk deletes unmatched transactions in one call", async () => {
    await deleteUnmatchedTransactionsApi(["4", "7"]);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.bulkDeleteUnmatchedTransaction);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({ transaction_ids: ["4", "7"] });
  });

  it("throws the server's message on failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Already matched" } });
    await expect(markTransactionApi("1", "personal")).rejects.toThrow("Already matched");
  });
});

describe("aiSuggestionsFrom", () => {
  it("keeps the top pick, deduped alternatives and the bare reason", () => {
    expect(
      aiSuggestionsFrom({
        account_subcategory_id: 12,
        name: "Office supplies",
        confidence: 0.87,
        reason: "Matched on: merchant name",
        alternatives: [
          { account_subcategory_id: 12, name: "Office supplies", confidence: 0.87 },
          { account_subcategory_id: 13, name: "Software", confidence: 0.4 },
          { account_subcategory_id: 14, name: "Postage", confidence: null },
          { account_subcategory_id: 15, name: "Travel", confidence: 0 },
        ],
      }),
    ).toEqual({
      primary: { id: "12", name: "Office supplies", confidence: 87 },
      alternatives: [
        { id: "13", name: "Software", confidence: 40 },
        { id: "14", name: "Postage", confidence: null },
        // Zero is still an answer — sole-webapp shows "0% confidence".
        { id: "15", name: "Travel", confidence: 0 },
      ],
      reason: "merchant name",
    });
  });

  it("is null without a named prediction", () => {
    expect(aiSuggestionsFrom(null)).toBeNull();
    expect(aiSuggestionsFrom({ name: "X" })).toBeNull();
  });
});

describe("matched rows: undo targets", () => {
  it("keeps a single line's entry id and reference", () => {
    expect(
      mapMatchedRow({ id: 9, data: [{ entry_id: 44, item_code: "INV-3", name: "Sales Income", amount: 10 }] }),
    ).toMatchObject({ entryId: "44", matchReference: "INV-3" });
  });

  it("leaves both to the lines once it's split", () => {
    const row = mapMatchedRow({
      id: 9,
      data: [
        { entry_id: 1, item_code: "INV-1", name: "A", amount: 5 },
        { entry_id: 2, item_code: "INV-2", name: "B", amount: 5 },
      ],
    });
    expect(row).toMatchObject({ entryId: null, matchReference: "" });
    expect(row.splits.map((line) => line.id)).toEqual(["1", "2"]);
  });

  it("posts bulk and per-line undo, encrypted", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await unmatchTransactionsApi(["1", "2"]);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.bulkUndoMatchTransaction);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({ transaction_ids: ["1", "2"] });

    await undoMatchEntryApi("44");
    expect(apiMock.post.mock.calls[1][0]).toBe(apiRoutes.bankTransaction.undoMatchTransaction);
    expect(decrypted(apiMock.post.mock.calls[1][1])).toEqual({ journal_entry_id: "44" });
  });
});

describe("approve", () => {
  const ready = { transactionId: "91", categoryId: "12", clientId: "7", gstIncluded: true };

  it("needs a category, then a client/supplier — sole-webapp's messages", () => {
    expect(approvalIssue({ categoryId: "", clientId: "" })).toBe(
      "Please select a suggested category to approve.",
    );
    expect(approvalIssue({ categoryId: "12", clientId: "" })).toBe(
      "Please select a client/supplier before approving.",
    );
    expect(approvalIssue({ categoryId: "12", clientId: "7" })).toBeNull();
  });

  it("posts sole-webapp's payload, encrypted", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Done" } });
    expect(await approveTransactionApi(ready)).toBe("Done");
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.setMatch);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({
      transaction_id: "91",
      account_subcategory_id: "12",
      client_id: "7",
      gst_included: "1",
      is_ai_match: "1",
    });
  });

  it("refuses an incomplete row without calling the server", async () => {
    await expect(approveTransactionApi({ ...ready, clientId: "" })).rejects.toThrow(
      "Please select a client/supplier before approving.",
    );
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("throws the server's message on failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Already matched" } });
    await expect(approveTransactionApi(ready)).rejects.toThrow("Already matched");
  });
});

describe("listQueryParams with filters", () => {
  const base = { page: 1, pageSize: 50, period: "FY 25/26", search: "" };

  it("replaces the financial year with custom dates", () => {
    expect(
      listQueryParams({
        ...base,
        tab: "unmatched",
        filters: { startDate: "2026-01-01", type: "credit|debit", minPrice: 0, maxPrice: 500, bankAccountIds: ["6418"] },
      }),
    ).toEqual({
      page: 1,
      page_size: 50,
      "filter_by[start_date]": "2026-01-01",
      "filter_by[type]": "credit|debit",
      "filter_by[min_price]": 0,
      "filter_by[max_price]": 500,
      "filter_by[bank_account_id]": ["6418"],
    });
  });

  it("sends categories and cash on the matched list only", () => {
    const filters = { categoryIds: ["51", "52"], cash: true, bankAccountIds: ["1"] };
    expect(listQueryParams({ ...base, tab: "matched", filters })).toMatchObject({
      "filter_by[start_date]": "2025-07-01",
      "filter_by[account_subcategory_id]": ["51", "52"],
      "filter_by[cash]": 1,
    });
    expect(listQueryParams({ ...base, tab: "matched", filters })).not.toHaveProperty(
      "filter_by[bank_account_id]",
    );
    expect(listQueryParams({ ...base, tab: "unmatched", filters })).not.toHaveProperty(
      "filter_by[cash]",
    );
  });
});

describe("bulk actions", () => {
  beforeEach(() => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "ok" } });
  });

  it("marks several lines personal or transfer in one call", async () => {
    await markTransactionsApi(["1", "2"], "transfer");
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.markBulkPersonalTransfer);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({
      type: "transfer",
      bank_transaction_ids: ["1", "2"],
    });
  });

  const base = {
    direction: "Debit" as const,
    transactionIds: ["1", "2"],
    categoryId: "10",
    categoryName: "Rent",
    contactId: "7",
    gstIncluded: true,
    notes: " monthly ",
  };

  it("needs two lines, a category and a counterparty", () => {
    expect(bulkMatchIssue({ ...base, transactionIds: ["1"] })).toMatch(/at least two/);
    expect(bulkMatchIssue({ ...base, categoryId: "" })).toBe("Please select a category.");
    expect(bulkMatchIssue({ ...base, contactId: "" })).toBe("Supplier is required");
    expect(bulkMatchIssue({ ...base, direction: "Credit", contactId: "" })).toBe("Client is required");
    expect(bulkMatchIssue({ ...base, categoryId: "140", contactId: "" })).toBe("Fund Name is required");
    expect(bulkMatchIssue({ ...base, categoryId: "46", contactId: "" })).toBeNull();
    expect(bulkMatchIssue(base)).toBeNull();
  });

  it("skips the contact on capital and drawings accounts", () => {
    expect(bulkMatchSkipsContact("Credit", { id: "118", name: "Owner Capital Input" })).toBe(true);
    expect(bulkMatchSkipsContact("Debit", { id: "46", name: "Owner Drawings" })).toBe(true);
    expect(bulkMatchSkipsContact("Debit", { id: "99", name: "Drawings" })).toBe(true);
    expect(bulkMatchSkipsContact("Debit", { id: "10", name: "Rent" })).toBe(false);
  });

  it("posts one match per line", async () => {
    await bulkMatchApi(base);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.bulkMatchNew);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({
      matches: [
        { transaction_id: "1", client_id: "7", account_subcategory_id: "10", gst_included: true, user_description: "monthly" },
        { transaction_id: "2", client_id: "7", account_subcategory_id: "10", gst_included: true, user_description: "monthly" },
      ],
    });
  });

  it("sends a fund, not a client, for a super contribution", async () => {
    await bulkMatchApi({ ...base, categoryId: "140", categoryName: "Super", contactId: "5" });
    const [first] = (decrypted(apiMock.post.mock.calls[0][1]) as { matches: Record<string, unknown>[] }).matches;
    expect(first).toMatchObject({ client_id: "", fund_id: "5", gst_included: false });
  });
});

describe("AI suggestions review", () => {
  it("loads every unmatched line, 25 at a time, without a year", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { bank_transactions: { bank_transaction_details: [], total: 0 } } },
    });
    await fetchSuggestionsPage(2);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bankTransaction.bankTransactions, {
      params: { page: 2, page_size: 25 },
    });
  });

  const row = (overrides = {}) => ({
    transactionId: "1",
    categoryId: "12",
    clientId: "7",
    gstIncluded: true,
    contactPersonId: "70",
    contactName: "Acme",
    ...overrides,
  });

  it("checks every row with sole-webapp's bulk messages", () => {
    expect(bulkApprovalIssue([row(), row({ transactionId: "2", categoryId: "" })])).toBe(
      "Please select a suggested category for all transactions to approve.",
    );
    expect(bulkApprovalIssue([row({ clientId: "" })])).toBe(
      "Please select a client/supplier for all transactions before approving.",
    );
    expect(bulkApprovalIssue([row()])).toBeNull();
  });

  it("approves every row in one call", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Done" } });
    expect(await approveAllApi([row(), row({ transactionId: "2", gstIncluded: false })])).toBe("Done");
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.setMatch);
    const body = decrypted(apiMock.post.mock.calls[0][1]) as { transactions: Record<string, unknown>[] };
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0]).toMatchObject({
      transaction_id: "1",
      account_subcategory_id: "12",
      client_id: "7",
      contact_id: "70",
      gst_included: 1,
      is_ai_match: true,
    });
    expect(body.transactions[1]).toMatchObject({ transaction_id: "2", gst_included: 0 });
  });

  it("refuses an incomplete Approve All without calling the server", async () => {
    await expect(approveAllApi([row({ clientId: "" })])).rejects.toThrow(/client\/supplier/);
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("rejects every loaded row", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await rejectSuggestionsApi(["1", "2"]);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.rejectAiSuggestions);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({
      transaction_ids: ["1", "2"],
      action: "reject",
    });
  });
});
