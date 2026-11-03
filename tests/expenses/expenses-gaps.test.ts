import { describe, expect, it, vi, beforeEach } from "vitest";

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

// Imported after the mock so `lib/expenses.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  amountError,
  bulkDeleteExpensesApi,
  createExpenseApi,
  duplicateExpenseDraft,
  emptyExpenseDraft,
  expenseExGst,
  expenseGst,
  expenseInvoiceableAmount,
  expenseIssues,
  expensePeriodSummary,
  expenseRemaining,
  expenseStatusVariant,
  expenseTotal,
  fetchExpenseCategories,
  fetchExpenseDetail,
  fetchExpenses,
  fetchExpenseSummary,
  filterExpenses,
  formatExpenseAmount,
  formatExpenseDate,
  formatExpenseRemaining,
  invoiceDraftFromExpense,
  isExpenseInvoiced,
  lineItemFromExpense,
  markExpenseInvoicedApi,
  sortExpenses,
  updateExpenseApi,
  uploadExpenseAttachment,
} = await import("@/lib/expenses");
const { emptyInvoiceDraft } = await import("@/lib/invoices");

import type { Expense, ExpenseDraft } from "@/lib/expenses";

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function baseExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "1",
    date: "2026-09-10",
    description: "Coffee with client",
    supplierId: null,
    supplierName: "",
    contactId: null,
    contactName: "",
    category: "Office Expenses",
    categoryId: "12",
    amount: 45,
    gst: true,
    paymentMethod: "Card",
    paidAmount: 0,
    status: "Pending",
    invoiceId: null,
    invoiceNo: null,
    transactionRef: null,
    journalEntryId: null,
    vendorNote: "",
    receipt: null,
    attachments: [],
    possibleMatch: 0,
    creditNoteId: null,
    creditNoteNo: null,
    isSplit: false,
    totalAmount: 45,
    ...overrides,
  };
}

function validDraft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    ...emptyExpenseDraft("2026-09-10"),
    description: "Coffee",
    supplierId: "77",
    supplierName: "Cafe Co",
    category: "Office Expenses",
    categoryId: "12",
    amount: 45,
    ...overrides,
  };
}

function apiRow(overrides: Record<string, unknown> = {}) {
  return {
    expense_id: 89263,
    name: "Coffee with client",
    price: "45.00",
    total_price: "45.00",
    date: "2026-09-10",
    gst: 1,
    paid_with_cash: 0,
    is_reconciled: 0,
    remainingAmount: "45.00",
    ...overrides,
  };
}

describe("GST and remaining figures", () => {
  it("expenseTotal is the GST-inclusive amount as-is", () => {
    expect(expenseTotal({ amount: 110 })).toBe(110);
  });

  it("expenseGst is amount ÷ 11 (GST-inclusive), not amount × 10%", () => {
    expect(expenseGst({ amount: 110, gst: true })).toBe(10);
    expect(expenseExGst({ amount: 110, gst: true })).toBe(100);
  });

  it("has no GST component when gst is off", () => {
    expect(expenseGst({ amount: 110, gst: false })).toBe(0);
    expect(expenseExGst({ amount: 110, gst: false })).toBe(110);
  });

  it("expenseRemaining is amount minus paid, never negative", () => {
    expect(expenseRemaining({ amount: 100, paidAmount: 40 })).toBe(60);
    expect(expenseRemaining({ amount: 100, paidAmount: 150 })).toBe(0);
  });

  it("expenseStatusVariant is success for Matched, warning for Pending", () => {
    expect(expenseStatusVariant("Matched")).toBe("success");
    expect(expenseStatusVariant("Pending")).toBe("warning");
  });

  it("formats dates and money with the shared invoice formatters", () => {
    expect(formatExpenseDate("2026-09-10")).toBe("10/09/2026");
    expect(formatExpenseAmount({ amount: 1234.5 })).toBe("$1,234.50");
    expect(formatExpenseRemaining({ amount: 100, paidAmount: 150 })).toBe(
      "$0.00",
    );
  });
});

describe("expensePeriodSummary", () => {
  const expenses = [
    baseExpense({ id: "a", date: "2026-09-02", amount: 100, status: "Matched" }),
    baseExpense({ id: "b", date: "2026-09-20", amount: 50, status: "Pending" }),
    baseExpense({ id: "c", date: "2026-08-15", amount: 75, status: "Matched" }),
    baseExpense({ id: "d", date: "2025-03-01", amount: 200, status: "Pending" }),
  ];

  it("narrows to the current month and compares against last month", () => {
    const summary = expensePeriodSummary(expenses, "This month", "2026-09-30");
    expect(summary.expenses.map((e) => e.id)).toEqual(["a", "b"]);
    expect(summary.total).toBe(150);
    expect(summary.totalCount).toBe(2);
    expect(summary.matched).toBe(100);
    expect(summary.matchedCount).toBe(1);
    expect(summary.pending).toBe(50);
    expect(summary.pendingCount).toBe(1);
    // 150 vs 75 → +100%
    expect(summary.totalChange).toEqual({
      percent: 100,
      up: true,
      label: "100% vs last month",
    });
  });

  it("wraps January's prior month back to December of the previous year", () => {
    const summary = expensePeriodSummary(
      [
        baseExpense({ date: "2027-01-05", amount: 50 }),
        baseExpense({ date: "2026-12-20", amount: 100 }),
      ],
      "This month",
      "2027-01-15",
    );
    expect(summary.totalChange).toEqual({
      percent: 50,
      up: false,
      label: "50% vs last month",
    });
  });

  it("narrows to the calendar year and compares against last year", () => {
    const summary = expensePeriodSummary(expenses, "This year", "2026-09-30");
    expect(summary.total).toBe(225);
    expect(summary.totalChange.label).toBe("13% vs last year");
    expect(summary.totalChange.up).toBe(true);
  });

  it("has no comparison — null, not a percent — when the prior period is empty", () => {
    // August's prior month (July) has nothing in it.
    const summary = expensePeriodSummary(expenses, "This month", "2026-08-31");
    expect(summary.total).toBe(75);
    expect(summary.totalChange.percent).toBeNull();
    expect(summary.pendingChange).toEqual({
      percent: null,
      up: false,
      label: "No comparison for this month",
    });
  });
});

describe("sortExpenses — the server-side-equivalent sorts", () => {
  const rows = [
    baseExpense({ id: "a", date: "2026-09-02", amount: 10 }),
    baseExpense({ id: "b", date: "2026-09-20", amount: 30 }),
    baseExpense({ id: "c", date: "2026-08-15", amount: 20 }),
  ];

  it.each([
    ["Date, newest", ["b", "a", "c"]],
    ["Date, oldest", ["c", "a", "b"]],
    ["Price, highest", ["b", "c", "a"]],
    ["Price, lowest", ["a", "c", "b"]],
  ] as const)("%s", (sort, ids) => {
    expect(sortExpenses(rows, sort).map((e) => e.id)).toEqual(ids);
  });
});

describe("filterExpenses — range boundaries", () => {
  it("treats dateFrom/dateTo and minPrice/maxPrice as inclusive", () => {
    const rows = [
      baseExpense({ id: "a", date: "2026-09-01", amount: 10 }),
      baseExpense({ id: "b", date: "2026-09-30", amount: 20 }),
    ];
    const result = filterExpenses(rows, {
      filter: "All",
      query: "",
      categories: [],
      suppliers: [],
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      minPrice: 10,
      maxPrice: 20,
    });
    expect(result.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("amountError / expenseIssues", () => {
  it("amountError ignores a blank value, accepts up to two decimals, rejects the rest", () => {
    expect(amountError("")).toBeUndefined();
    expect(amountError("  ")).toBeUndefined();
    expect(amountError("12.50")).toBeUndefined();
    for (const bad of ["abc", "-5", "1.234", "0"]) {
      expect(amountError(bad)).toBe(
        "Enter a valid amount — no letters or negatives.",
      );
    }
  });

  it("is empty for a complete draft", () => {
    expect(expenseIssues(validDraft(), "45")).toEqual([]);
  });

  it("flags every required field on a blank draft, in on-screen order", () => {
    const issues = expenseIssues({ ...emptyExpenseDraft(""), date: "" }, "");
    expect(issues).toEqual([
      { key: "description", message: "Enter a description." },
      { key: "amount", message: "Enter a valid amount." },
      { key: "date", message: "Choose a date." },
      { key: "supplier", message: "Select a supplier." },
      { key: "category", message: "Choose a category." },
    ]);
  });

  it("uses the shape message for a malformed amount, not the blank one", () => {
    const issues = expenseIssues(validDraft(), "12abc");
    expect(issues).toEqual([
      {
        key: "amount",
        message: "Enter a valid amount — no letters or negatives.",
      },
    ]);
  });

  it("accepts a typed supplier name with no picked supplier id", () => {
    const issues = expenseIssues(
      validDraft({ supplierId: null, supplierName: "Corner store" }),
      "45",
    );
    expect(issues).toEqual([]);
  });

  it("requires a business portion once split is on, and caps it at the price", () => {
    expect(
      expenseIssues(validDraft({ splitEnabled: true, businessAmount: 0 }), "45"),
    ).toEqual([{ key: "businessAmount", message: "Enter the business portion." }]);
    expect(
      expenseIssues(validDraft({ splitEnabled: true, businessAmount: 50 }), "45"),
    ).toEqual([
      {
        key: "businessAmount",
        message: "Business amount can't exceed the price.",
      },
    ]);
    expect(
      expenseIssues(validDraft({ splitEnabled: true, businessAmount: 45 }), "45"),
    ).toEqual([]);
  });
});

describe("emptyExpenseDraft", () => {
  it("seeds today's date, Card, GST on and split off", () => {
    const draft = emptyExpenseDraft("2026-09-10");
    expect(draft.date).toBe("2026-09-10");
    expect(draft.paymentMethod).toBe("Card");
    expect(draft.gst).toBe(true);
    expect(draft.splitEnabled).toBe(false);
    expect(draft.businessAmount).toBe(0);
    expect(draft.supplierId).toBeNull();
    expect(draft.contactId).toBeNull();
  });
});

describe("converting an expense to an invoice", () => {
  it("expenseInvoiceableAmount is the amount, clamped at zero, 0 for NaN", () => {
    expect(expenseInvoiceableAmount({ amount: 45 })).toBe(45);
    expect(expenseInvoiceableAmount({ amount: -5 })).toBe(0);
    expect(expenseInvoiceableAmount({ amount: Number.NaN })).toBe(0);
  });

  it("isExpenseInvoiced reads off invoiceId", () => {
    expect(isExpenseInvoiced({ invoiceId: "9" })).toBe(true);
    expect(isExpenseInvoiced({ invoiceId: null })).toBe(false);
  });

  it("lineItemFromExpense bills the amount flat, quantity 1, with GST off", () => {
    const line = lineItemFromExpense(baseExpense({ amount: 45.5 }));
    expect(line).toMatchObject({
      description: "Coffee with client",
      quantity: "1",
      price: "45.50",
      gst: false,
    });
    expect(line.id).toBeTruthy();
  });

  it("lineItemFromExpense falls back to 'Expense' for a blank description", () => {
    expect(lineItemFromExpense(baseExpense({ description: "" })).description).toBe(
      "Expense",
    );
  });

  it("invoiceDraftFromExpense carries the expense as the single line, with no client", () => {
    const blank = emptyInvoiceDraft("INV-1", "2026-09-10");
    const draft = invoiceDraftFromExpense(
      baseExpense({ amount: 45 }),
      { ...blank, clientId: "5", clientName: "Old", notes: "x" },
    );
    expect(draft).not.toBeNull();
    expect(draft!.number).toBe("INV-1");
    expect(draft!.clientId).toBeNull();
    expect(draft!.clientName).toBe("");
    expect(draft!.recipients).toEqual([]);
    expect(draft!.notes).toBe("");
    expect(draft!.description).toBe("Coffee with client");
    expect(draft!.items).toHaveLength(1);
    expect(draft!.items[0].price).toBe("45.00");
  });

  it("invoiceDraftFromExpense is null when there's nothing to bill", () => {
    const blank = emptyInvoiceDraft("INV-1", "2026-09-10");
    expect(invoiceDraftFromExpense(baseExpense({ amount: 0 }), blank)).toBeNull();
  });
});

describe("duplicateExpenseDraft", () => {
  it("resets the date, receipt and every paid/reconciled link, keeping the rest", () => {
    const draft = duplicateExpenseDraft(
      baseExpense({
        date: "2026-01-01",
        paidAmount: 45,
        invoiceId: "9",
        transactionRef: "t1",
        journalEntryId: "j1",
        receipt: { dataUrl: "https://x/r.png", name: "r.png", size: 0 },
        supplierName: "Cafe Co",
        isSplit: true,
        amount: 30,
        totalAmount: 45,
      }),
      "2026-09-10",
    );
    expect(draft).toMatchObject({
      date: "2026-09-10",
      receipt: null,
      paidAmount: 0,
      invoiceId: null,
      transactionRef: null,
      journalEntryId: null,
      supplierName: "Cafe Co",
      splitEnabled: true,
      amount: 45,
      businessAmount: 30,
    });
  });
});

describe("fetchExpenses / mapping — remaining fields", () => {
  it("fetches one large page from the list route", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchExpenses()).toEqual([]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.expense.listOcr, {
      params: { page: 1, page_size: 500 },
    });
  });

  it("reads Matched from is_reconciled, or from a fully-paid positive amount", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          expense_details: [
            apiRow({ expense_id: 1, is_reconciled: 1 }),
            apiRow({ expense_id: 2, remainingAmount: "0" }),
            apiRow({ expense_id: 3, remainingAmount: "20.00" }),
            apiRow({ expense_id: 4, price: "0", remainingAmount: "0" }),
          ],
        },
      },
    });
    const rows = await fetchExpenses();
    expect(rows.map((r) => r.status)).toEqual([
      "Matched",
      "Matched",
      "Pending",
      "Pending",
    ]);
    expect(rows[2].paidAmount).toBe(25);
  });

  it("reads back only Cash vs Card — the backend has no other method column", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          expense_details: [
            apiRow({ paid_with_cash: 1 }),
            apiRow({ paid_with_cash: "1" }),
            apiRow({ paid_with_cash: 0 }),
          ],
        },
      },
    });
    const rows = await fetchExpenses();
    expect(rows.map((r) => r.paymentMethod)).toEqual(["Cash", "Cash", "Card"]);
  });

  it("maps the split flag, falling back totalAmount to the price", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          expense_details: [
            apiRow({ is_split: 1, price: "30.00", total_price: "45.00" }),
            apiRow({ is_split: 0, price: "20.00", total_price: null }),
          ],
        },
      },
    });
    const [split, plain] = await fetchExpenses();
    expect(split.isSplit).toBe(true);
    expect(split.amount).toBe(30);
    expect(split.totalAmount).toBe(45);
    expect(plain.isSplit).toBe(false);
    expect(plain.totalAmount).toBe(20);
  });

  it("maps supplier, contact, category, credit note and possible-match fields", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          expense_details: [
            apiRow({
              client: { client_id: 77, name: " Cafe Co " },
              contact_id: 501,
              account_subcategory: { account_subcategory_id: 12, name: "Office Expenses" },
              credit_note_id: 3,
              credit_note_no: "CN-3",
              possible_match: "2",
              bank_transaction_id: 900,
              journal_entry_id: 901,
            }),
          ],
        },
      },
    });
    const [row] = await fetchExpenses();
    expect(row).toMatchObject({
      id: "89263",
      supplierId: "77",
      supplierName: "Cafe Co",
      contactId: "501",
      category: "Office Expenses",
      categoryId: "12",
      creditNoteId: "3",
      creditNoteNo: "CN-3",
      possibleMatch: 2,
      transactionRef: "900",
      journalEntryId: "901",
      gst: true,
    });
  });
});

describe("fetchExpenseDetail — route and failure", () => {
  it("GETs the info route with the id appended", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: apiRow() } });
    const expense = await fetchExpenseDetail("89263");
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.expense.info}89263`);
    expect(expense.id).toBe("89263");
  });

  it("throws the server's own message, or a generic one", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(fetchExpenseDetail("1")).rejects.toThrow("Nope");
    apiMock.get.mockResolvedValue({ data: { success: true } });
    await expect(fetchExpenseDetail("1")).rejects.toThrow("Expense not found.");
  });
});

describe("fetchExpenseSummary", () => {
  it("asks for the month or year period and maps each bucket", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          has_previous_data: true,
          total_expenses: { total_amount: "500", percentage_change: 12.6 },
          reconciled_expenses: { total_amount: 300, percentage_change: -4.4 },
          pending_expenses: { total_pending_amount: "200", percentage_change: 0 },
        },
      },
    });

    const result = await fetchExpenseSummary("This month");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.expense.summary, {
      params: { period: "month" },
    });
    expect(result).toEqual({
      total: { amount: 500, change: { percent: 13, up: true, label: "13% vs last month" } },
      matched: { amount: 300, change: { percent: 4, up: false, label: "4% vs last month" } },
      pending: { amount: 200, change: { percent: 0, up: true, label: "0% vs last month" } },
    });
  });

  it("has no comparison without previous data, and zeros with no buckets", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    const result = await fetchExpenseSummary("This year");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.expense.summary, {
      params: { period: "year" },
    });
    expect(result.total).toEqual({
      amount: 0,
      change: { percent: null, up: false, label: "No comparison for this period" },
    });
  });
});

describe("createExpenseApi / updateExpenseApi — envelope handling", () => {
  it("createExpenseApi returns the new id as a string", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 42 } } });
    expect(await createExpenseApi(validDraft())).toEqual({ id: "42" });
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.expense.addV2);
  });

  it("createExpenseApi throws on a nominal success with no id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(createExpenseApi(validDraft())).rejects.toThrow(
      "Failed to save expense.",
    );
  });

  // `draftToApiFields` sends `undefined` for these; `encryptPayload` then
  // normalises undefined/null to "" on the wire, so a blank string is what arrives.
  it("sends blank category/supplier/contact ids as empty, never a stale id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await createExpenseApi(
      validDraft({ categoryId: "", supplierId: null, contactId: null, description: "  Coffee  " }),
    );
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.name).toBe("Coffee");
    expect(fields.account_subcategory_id).toBe("");
    expect(fields.client_id).toBe("");
    expect(fields.contact_id).toBe("");
  });

  it("sends gst and paid_with_cash as 1/0 flags", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await createExpenseApi(validDraft({ gst: false, paymentMethod: "Cash" }));
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.gst).toBe(0);
    expect(fields.paid_with_cash).toBe(1);
  });

  it("never sends a negative personal_amount when the business portion exceeds the price", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await createExpenseApi(validDraft({ splitEnabled: true, businessAmount: 60, amount: 45 }));
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.business_amount).toBe("60.00");
    expect(fields.personal_amount).toBe("0.00");
  });

  it("updateExpenseApi sends the id in the body to the fixed edit route", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await updateExpenseApi("89263", validDraft());
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.updateV2);
    expect(decryptedFieldsFromBody(body).id).toBe("89263");
  });

  it("updateExpenseApi throws the server's message, or a generic one", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Locked" } });
    await expect(updateExpenseApi("1", validDraft())).rejects.toThrow("Locked");
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(updateExpenseApi("1", validDraft())).rejects.toThrow(
      "Failed to update expense.",
    );
  });
});

describe("markExpenseInvoicedApi", () => {
  it("POSTs an encrypted expense_id/invoice_id/invoice_no body", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await markExpenseInvoicedApi("89263", "137497", "invoice12");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.markInvoiced);
    expect(decryptedFieldsFromBody(body)).toEqual({
      expense_id: "89263",
      invoice_id: "137497",
      invoice_no: "invoice12",
    });
  });

  it("throws the server's message, or a generic one", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Already invoiced" } });
    await expect(markExpenseInvoicedApi("1", "2", "x")).rejects.toThrow(
      "Already invoiced",
    );
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(markExpenseInvoicedApi("1", "2", "x")).rejects.toThrow(
      "Couldn't link that invoice to the expense.",
    );
  });
});

describe("bulkDeleteExpensesApi / uploadExpenseAttachment — fallbacks", () => {
  it("bulkDeleteExpensesApi falls back to a generic message when the server gives none", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    expect(await bulkDeleteExpensesApi(["1"])).toEqual({
      message: "Expenses deleted.",
    });
  });

  it("uploadExpenseAttachment throws when the upload succeeds but no id comes back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    const file = new File(["x"], "r.png", { type: "image/png" });
    await expect(uploadExpenseAttachment("1", file)).rejects.toThrow(
      "Upload succeeded but no attachment id came back.",
    );
  });
});

describe("fetchExpenseCategories — branch selection", () => {
  it("matches the Expenses branch case-insensitively and trimmed", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          account_categories: [
            {
              account_category_id: 1,
              name: "Income",
              account_subcategories: [{ account_subcategory_id: 1, name: "Sales" }],
            },
            {
              account_category_id: 2,
              name: "  EXPENSES ",
              account_subcategories: [{ account_subcategory_id: 12, name: "Rent" }],
            },
          ],
        },
      },
    });
    expect(await fetchExpenseCategories()).toEqual([{ id: "12", name: "Rent" }]);
  });

  it("is empty when there's no Expenses branch at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchExpenseCategories()).toEqual([]);
  });
});
