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
  bulkDeleteExpensesApi,
  createExpenseApi,
  deleteExpenseAttachment,
  draftFromExpense,
  emptyExpenseDraft,
  fetchExpenseAttachmentsZip,
  fetchExpenseCategories,
  fetchExpenseDetail,
  fetchExpenses,
  fetchExpensesPage,
  expenseCategoriesInUse,
  filterExpenses,
  formatBytes,
  isImageAttachment,
  isImageReceipt,
  sortExpenses,
  updateExpenseApi,
  uploadExpenseAttachment,
} = await import("@/lib/expenses");

import type { Expense } from "@/lib/expenses";

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

describe("fetchExpenses / fetchExpenseDetail — real invoice reference and receipt mapping", () => {
  it("prefers the real invoice_no over the raw invoice_id for display", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          expense_details: [
            apiRow({ invoice_id: 137497, invoice_no: "invoice12" }),
          ],
        },
      },
    });

    const [expense] = await fetchExpenses();
    expect(expense.invoiceId).toBe("137497");
    expect(expense.invoiceNo).toBe("invoice12");
  });

  it("falls back to the nested invoice.invoice_no when the flat field is absent", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          expense_details: [
            apiRow({
              invoice_id: 137497,
              invoice: { id: 137497, invoice_no: "invoice12" },
            }),
          ],
        },
      },
    });

    const [expense] = await fetchExpenses();
    expect(expense.invoiceNo).toBe("invoice12");
  });

  it("is null when there's no invoice at all", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { expense_details: [apiRow({ invoice_id: null })] },
      },
    });

    const [expense] = await fetchExpenses();
    expect(expense.invoiceId).toBeNull();
    expect(expense.invoiceNo).toBeNull();
  });

  it("leaves the receipt null on a list row — it never carries documents[]", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { expense_details: [apiRow()] } },
    });

    const [expense] = await fetchExpenses();
    expect(expense.receipt).toBeNull();
  });

  it("maps the detail response's documents[] onto a real receipt, using the most recent one", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: apiRow({
          documents: [
            { document_id: 1, file_name: "old.pdf", file_path: "https://s3/old.pdf" },
            {
              document_id: 2,
              file_name: "receipt.png",
              file_path: "https://s3.amazonaws.com/bucket/receipt.png",
            },
          ],
        }),
      },
    });

    const expense = await fetchExpenseDetail("89263");
    expect(expense.receipt).toEqual({
      dataUrl: "https://s3.amazonaws.com/bucket/receipt.png",
      name: "receipt.png",
      size: 0,
      documentId: "2",
    });
  });

  it("keeps every document as a thumbnail-ready attachment, not just the last one", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: apiRow({
          documents: [
            { document_id: 1, file_name: "old.pdf", file_path: "https://s3/old.pdf" },
            {
              document_id: 2,
              file_name: "receipt.png",
              file_path: "https://s3.amazonaws.com/bucket/receipt.png",
            },
          ],
        }),
      },
    });

    const expense = await fetchExpenseDetail("89263");
    expect(expense.attachments).toEqual([
      { documentId: "1", name: "old.pdf", url: "https://s3/old.pdf" },
      {
        documentId: "2",
        name: "receipt.png",
        url: "https://s3.amazonaws.com/bucket/receipt.png",
      },
    ]);
  });

  it("is an empty array on a list row — same as receipt, there's nothing to build it from", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { expense_details: [apiRow()] } },
    });

    const [expense] = await fetchExpenses();
    expect(expense.attachments).toEqual([]);
  });
});

describe("fetchExpensesPage", () => {
  it("sends page and page_size — the default listing no longer pulls hundreds of rows at once", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { expense_details: [], total: 0 } },
    });

    await fetchExpensesPage(2, 25);

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.listOcr);
    expect(config.params).toEqual({ page: 2, page_size: 25 });
  });

  it("sends filter_by[name] for a search term, trimmed", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { expense_details: [], total: 0 } },
    });

    await fetchExpensesPage(1, 25, { search: "  coffee  " });

    const config = apiMock.get.mock.calls[0][1];
    expect(config.params).toMatchObject({ "filter_by[name]": "coffee" });
  });

  it("maps the Matched/Pending status pill to filter_by[matched]", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { expense_details: [], total: 0 } },
    });

    await fetchExpensesPage(1, 25, { status: "Matched" });
    expect(apiMock.get.mock.calls[0][1].params).toMatchObject({
      "filter_by[matched]": 1,
    });

    await fetchExpensesPage(1, 25, { status: "Pending" });
    expect(apiMock.get.mock.calls[1][1].params).toMatchObject({
      "filter_by[matched]": 0,
    });
  });

  it("maps a date/price sort to sort_by[<field>], and sends no sort_by at all for Supplier A–Z", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { expense_details: [], total: 0 } },
    });

    await fetchExpensesPage(1, 25, { sort: "Date, oldest" });
    expect(apiMock.get.mock.calls[0][1].params).toMatchObject({
      "sort_by[date]": "asc",
    });

    await fetchExpensesPage(1, 25, { sort: "Price, highest" });
    expect(apiMock.get.mock.calls[1][1].params).toMatchObject({
      "sort_by[price]": "desc",
    });

    await fetchExpensesPage(1, 25, { sort: "Supplier A–Z" });
    const params = apiMock.get.mock.calls[2][1].params;
    expect(Object.keys(params).some((key) => key.startsWith("sort_by"))).toBe(
      false,
    );
  });

  it("maps the date range, price range and paid-with-cash filters — sole-webapp's own SmartFilter fields", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { expense_details: [], total: 0 } },
    });

    await fetchExpensesPage(1, 25, {
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      minPrice: 10,
      maxPrice: 500,
      paidWithCash: true,
    });

    expect(apiMock.get.mock.calls[0][1].params).toMatchObject({
      "filter_by[start_date]": "2026-01-01",
      "filter_by[end_date]": "2026-01-31",
      "filter_by[min_price]": 10,
      "filter_by[max_price]": 500,
      "filter_by[paid_with_cash]": 1,
    });
  });

  it("omits every date/price/cash param when none are given", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { expense_details: [], total: 0 } },
    });

    await fetchExpensesPage(1, 25);
    const params = apiMock.get.mock.calls[0][1].params;
    expect(params).not.toHaveProperty("filter_by[start_date]");
    expect(params).not.toHaveProperty("filter_by[min_price]");
    expect(params).not.toHaveProperty("filter_by[paid_with_cash]");
  });

  it("maps the real total and rows, defaulting total to the row count when the server omits it", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { expense_details: [apiRow(), apiRow({ expense_id: 2 })] },
      },
    });

    const result = await fetchExpensesPage(1, 25);
    expect(result.expenses).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("uses the server's own total when given, even if it exceeds this page's rows", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { expense_details: [apiRow()], total: 137 },
      },
    });

    const result = await fetchExpensesPage(1, 25);
    expect(result.total).toBe(137);
  });
});

describe("filterExpenses — the client-side fallback used when a category/supplier filter is active", () => {
  const base = { filter: "All" as const, query: "", categories: [], suppliers: [] };

  it("keeps only rows matching the selected status when filter isn't All", () => {
    const rows = [
      baseExpense({ id: "1", status: "Matched" }),
      baseExpense({ id: "2", status: "Pending" }),
    ];
    expect(
      filterExpenses(rows, { ...base, filter: "Matched" }).map((e) => e.id),
    ).toEqual(["1"]);
  });

  it("keeps every row regardless of status when filter is All", () => {
    const rows = [
      baseExpense({ id: "1", status: "Matched" }),
      baseExpense({ id: "2", status: "Pending" }),
    ];
    expect(filterExpenses(rows, base).map((e) => e.id)).toEqual(["1", "2"]);
  });

  it("keeps only rows whose category is in the selected set — an empty set means no restriction", () => {
    const rows = [
      baseExpense({ id: "1", category: "Travel" }),
      baseExpense({ id: "2", category: "Office Expenses" }),
    ];
    expect(
      filterExpenses(rows, { ...base, categories: ["Travel"] }).map(
        (e) => e.id,
      ),
    ).toEqual(["1"]);
    expect(filterExpenses(rows, base).map((e) => e.id)).toEqual(["1", "2"]);
  });

  it("keeps only rows whose supplier is in the selected set", () => {
    const rows = [
      baseExpense({ id: "1", supplierName: "Acme" }),
      baseExpense({ id: "2", supplierName: "Beta Co" }),
    ];
    expect(
      filterExpenses(rows, { ...base, suppliers: ["Beta Co"] }).map(
        (e) => e.id,
      ),
    ).toEqual(["2"]);
  });

  it("matches a free-text search against description, supplier and category", () => {
    const rows = [
      baseExpense({ id: "1", description: "Coffee with client" }),
      baseExpense({ id: "2", supplierName: "Bunnings", description: "Nails" }),
      baseExpense({ id: "3", category: "Travel", description: "Uber" }),
      baseExpense({ id: "4", description: "Unrelated" }),
    ];
    expect(
      filterExpenses(rows, { ...base, query: "coffee" }).map((e) => e.id),
    ).toEqual(["1"]);
    expect(
      filterExpenses(rows, { ...base, query: "bunnings" }).map((e) => e.id),
    ).toEqual(["2"]);
    expect(
      filterExpenses(rows, { ...base, query: "travel" }).map((e) => e.id),
    ).toEqual(["3"]);
  });

  it("keeps a row whose date falls inside the range, drops one outside it", () => {
    const rows = [
      baseExpense({ id: "1", date: "2026-01-15" }),
      baseExpense({ id: "2", date: "2026-02-01" }),
    ];
    const result = filterExpenses(rows, {
      ...base,
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    expect(result.map((e) => e.id)).toEqual(["1"]);
  });

  it("keeps a row whose price falls inside the min/max range", () => {
    const rows = [
      baseExpense({ id: "1", amount: 50 }),
      baseExpense({ id: "2", amount: 500 }),
    ];
    const result = filterExpenses(rows, { ...base, minPrice: 10, maxPrice: 100 });
    expect(result.map((e) => e.id)).toEqual(["1"]);
  });

  it("keeps only cash-paid rows when paidWithCash is set", () => {
    const rows = [
      baseExpense({ id: "1", paymentMethod: "Cash" }),
      baseExpense({ id: "2", paymentMethod: "Card" }),
    ];
    const result = filterExpenses(rows, { ...base, paidWithCash: true });
    expect(result.map((e) => e.id)).toEqual(["1"]);
  });

  it("applies date, price and cash together with the existing status/category/supplier/search filters", () => {
    const rows = [
      baseExpense({
        id: "1",
        date: "2026-01-15",
        amount: 80,
        paymentMethod: "Cash",
        status: "Matched",
      }),
      baseExpense({
        id: "2",
        date: "2026-01-15",
        amount: 80,
        paymentMethod: "Card",
        status: "Matched",
      }),
    ];
    const result = filterExpenses(rows, {
      filter: "Matched",
      query: "",
      categories: [],
      suppliers: [],
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      minPrice: 50,
      maxPrice: 100,
      paidWithCash: true,
    });
    expect(result.map((e) => e.id)).toEqual(["1"]);
  });
});

describe("sortExpenses — 'Supplier A–Z' is the one sort client-side mode falls back for", () => {
  it("sorts by supplier name alphabetically", () => {
    const rows = [
      baseExpense({ id: "1", supplierName: "Zebra Co" }),
      baseExpense({ id: "2", supplierName: "Acme" }),
      baseExpense({ id: "3", supplierName: "Middle Ltd" }),
    ];
    expect(sortExpenses(rows, "Supplier A–Z").map((e) => e.id)).toEqual([
      "2",
      "3",
      "1",
    ]);
  });

  it("doesn't mutate the input array", () => {
    const rows = [
      baseExpense({ id: "1", supplierName: "Zebra Co" }),
      baseExpense({ id: "2", supplierName: "Acme" }),
    ];
    sortExpenses(rows, "Supplier A–Z");
    expect(rows.map((e) => e.id)).toEqual(["1", "2"]);
  });
});

describe("expenseCategoriesInUse", () => {
  it("returns the distinct real categories present, sorted, with blanks dropped", () => {
    const rows = [
      baseExpense({ category: "Travel" }),
      baseExpense({ category: "Office Expenses" }),
      baseExpense({ category: "Travel" }),
      baseExpense({ category: "" }),
    ];
    expect(expenseCategoriesInUse(rows)).toEqual(["Office Expenses", "Travel"]);
  });
});

describe("isImageReceipt / formatBytes — a receipt synced from the server", () => {
  it("recognises a real https image URL, not just a data: URL", () => {
    expect(
      isImageReceipt({
        dataUrl: "https://s3.amazonaws.com/bucket/receipt.png",
        name: "receipt.png",
        size: 0,
      }),
    ).toBe(true);
  });

  it("treats a PDF URL as not-an-image", () => {
    expect(
      isImageReceipt({
        dataUrl: "https://s3.amazonaws.com/bucket/receipt.pdf",
        name: "receipt.pdf",
        size: 0,
      }),
    ).toBe(false);
  });

  it("returns an empty label instead of '0 B' when the size isn't known", () => {
    expect(formatBytes(0)).toBe("");
  });
});

describe("isImageAttachment", () => {
  it("is true for a real image URL, false for a PDF one", () => {
    expect(
      isImageAttachment({
        documentId: "1",
        name: "receipt.png",
        url: "https://s3.amazonaws.com/bucket/receipt.png",
      }),
    ).toBe(true);
    expect(
      isImageAttachment({
        documentId: "2",
        name: "receipt.pdf",
        url: "https://s3.amazonaws.com/bucket/receipt.pdf",
      }),
    ).toBe(false);
  });
});

describe("uploadExpenseAttachment", () => {
  it("POSTs multipart form data with expense_id and files[]", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { document_id: 501 } },
    });
    const file = new File(["x"], "receipt.png", { type: "image/png" });

    const result = await uploadExpenseAttachment("89263", file);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.uploadAttachment);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("expense_id")).toBe("89263");
    expect((body as FormData).get("files[]")).toBe(file);
    expect(result).toEqual({ documentId: "501" });
  });

  it("falls back to the last id in document_ids when document_id is absent", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { document_ids: [501, 502] } },
    });
    const file = new File(["x"], "receipt.png");

    const result = await uploadExpenseAttachment("89263", file);
    expect(result).toEqual({ documentId: "502" });
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "File too large." },
    });
    const file = new File(["x"], "receipt.png");

    await expect(uploadExpenseAttachment("89263", file)).rejects.toThrow(
      "File too large.",
    );
  });
});

describe("createExpenseApi / updateExpenseApi — split amount", () => {
  it("sends is_split:0 and the full price as business_amount when split is off", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await createExpenseApi({
      ...emptyExpenseDraft("2026-09-10"),
      description: "Coffee",
      amount: 45,
      categoryId: "12",
    });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({
      price: 45,
      is_split: 0,
      business_amount: "45.00",
      personal_amount: "0.00",
    });
  });

  it("splits the total into business_amount/personal_amount when split is on", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await createExpenseApi({
      ...emptyExpenseDraft("2026-09-10"),
      description: "Coffee",
      amount: 100,
      categoryId: "12",
      splitEnabled: true,
      businessAmount: 60,
    });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({
      price: 100,
      is_split: 1,
      business_amount: "60.00",
      personal_amount: "40.00",
    });
  });

  it("carries the same split fields through an update", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await updateExpenseApi("501", {
      ...emptyExpenseDraft("2026-09-10"),
      description: "Coffee",
      amount: 100,
      categoryId: "12",
      splitEnabled: true,
      businessAmount: 60,
    });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({
      is_split: 1,
      business_amount: "60.00",
      personal_amount: "40.00",
    });
  });
});

describe("createExpenseApi — full payload parity with sole-webapp's own create request", () => {
  it("includes project_id, transaction_date and is_asset alongside the rest", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await createExpenseApi({
      ...emptyExpenseDraft("2026-09-15"),
      description: "asdfafd",
      amount: 100,
      categoryId: "2",
      supplierId: "44231",
      gst: true,
      paymentMethod: "Cash",
    });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toEqual({
      name: "asdfafd",
      price: 100,
      date: "2026-09-15",
      account_subcategory_id: "2",
      client_id: "44231",
      gst: 1,
      paid_with_cash: 1,
      is_split: 0,
      business_amount: "100.00",
      personal_amount: "0.00",
      // `encryptPayload` itself normalizes null/undefined to "" before
      // encrypting — still read as "no project"/"no contact" server-side
      // either way.
      project_id: "",
      contact_id: "",
      transaction_date: "2026-09-15",
      is_asset: "no",
    });
  });

  it("sends the real contact_id once one's been picked via the per-contact supplier picker", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await createExpenseApi({
      ...emptyExpenseDraft("2026-09-15"),
      description: "asdfafd",
      amount: 100,
      categoryId: "2",
      supplierId: "44909",
      contactId: "38025",
    });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({ client_id: "44909", contact_id: "38025" });
  });

  it("bundles a freshly-picked receipt file into the same create request, encrypted alongside the rest", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    const file = new File(["x"], "receipt.png", { type: "image/png" });

    await createExpenseApi(
      { ...emptyExpenseDraft("2026-09-15"), description: "Coffee", amount: 45 },
      [file],
    );

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.addV2);
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("files[]")).toBe(file);
    const fields = decryptPayload(form.get("data") as string);
    expect(fields).toMatchObject({ name: "Coffee", price: 45 });
  });

  it("bundles every file from a multi-file pick into the same create request", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    const first = new File(["x"], "receipt-1.png", { type: "image/png" });
    const second = new File(["y"], "receipt-2.pdf", { type: "application/pdf" });

    await createExpenseApi(
      { ...emptyExpenseDraft("2026-09-15"), description: "Coffee", amount: 45 },
      [first, second],
    );

    const form = apiMock.post.mock.calls[0][1] as FormData;
    expect(form.getAll("files[]")).toEqual([first, second]);
  });

  it("sends a plain encrypted body, not FormData, when there's no file", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await createExpenseApi({
      ...emptyExpenseDraft("2026-09-15"),
      description: "Coffee",
      amount: 45,
    });

    expect(apiMock.post.mock.calls[0][1]).not.toBeInstanceOf(FormData);
  });
});

describe("draftFromExpense — split fields seeded from the real total, not the effective amount", () => {
  it("seeds the Price field from totalAmount and Business amount from the effective amount", () => {
    const draft = draftFromExpense(
      baseExpense({ amount: 60, totalAmount: 100, isSplit: true }),
    );
    expect(draft.amount).toBe(100);
    expect(draft.businessAmount).toBe(60);
    expect(draft.splitEnabled).toBe(true);
  });

  it("has splitEnabled false and amount === businessAmount for a plain expense", () => {
    const draft = draftFromExpense(baseExpense({ amount: 45, totalAmount: 45 }));
    expect(draft.splitEnabled).toBe(false);
    expect(draft.amount).toBe(45);
    expect(draft.businessAmount).toBe(45);
  });
});

describe("fetchExpenseCategories", () => {
  function accountCategoriesResponse(subcategories: Record<string, unknown>[]) {
    return {
      data: {
        success: true,
        data: {
          account_categories: [
            { account_category_id: 1, name: "Income", account_subcategories: [] },
            {
              account_category_id: 2,
              name: "Expenses",
              account_subcategories: subcategories,
            },
          ],
        },
      },
    };
  }

  it("excludes Super Contribution (id 140) — the only exclusion sole-webapp's own Add Expense form applies", async () => {
    apiMock.get.mockResolvedValue(
      accountCategoriesResponse([
        { account_subcategory_id: 12, name: "Office Expenses" },
        { account_subcategory_id: 140, name: "Super Contribution" },
        { account_subcategory_id: 15, name: "Travel" },
      ]),
    );

    const categories = await fetchExpenseCategories();

    expect(categories).toEqual([
      { id: "12", name: "Office Expenses" },
      { id: "15", name: "Travel" },
    ]);
  });

  it("keeps everything else — there's no other exclusion in the reference", async () => {
    apiMock.get.mockResolvedValue(
      accountCategoriesResponse([
        { account_subcategory_id: 20, name: "Credit Note" },
        { account_subcategory_id: 21, name: "Client Refund" },
      ]),
    );

    const categories = await fetchExpenseCategories();
    expect(categories.map((c) => c.name)).toEqual(["Credit Note", "Client Refund"]);
  });
});

describe("deleteExpenseAttachment", () => {
  it("sends the document id as a query param, not only the URL path segment", async () => {
    // The real backend's delete controller never reads req.params for this
    // route — only req.query/req.body — so the id has to travel as a query
    // param or the delete silently no-ops server-side despite a 200 back.
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteExpenseAttachment("2");

    expect(apiMock.delete).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.delete.mock.calls[0];
    expect(url).toBe(`${apiRoutes.expense.deleteAttachment}/2`);
    expect(config).toEqual({ params: { document_id: "2" } });
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.delete.mockResolvedValue({
      data: { success: false, message: "Attachment not found." },
    });
    await expect(deleteExpenseAttachment("2")).rejects.toThrow(
      "Attachment not found.",
    );
  });
});

describe("bulkDeleteExpensesApi", () => {
  it("POSTs an encrypted body with expenses[] to the real bulk-delete route", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, message: "Expenses have been deleted successfully." },
    });

    const result = await bulkDeleteExpensesApi(["1", "2", "3"]);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.delete);
    expect(decryptPayload((body as { data: string }).data)).toEqual({
      expenses: ["1", "2", "3"],
    });
    expect(result.message).toBe("Expenses have been deleted successfully.");
  });

  it("works for a single id too — the row menu's own Delete reuses this", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Deleted." } });
    await bulkDeleteExpensesApi(["501"]);
    const body = apiMock.post.mock.calls[0][1];
    expect(decryptPayload((body as { data: string }).data)).toEqual({
      expenses: ["501"],
    });
  });

  it("surfaces the real backend message on a mixed selection, not a generic count", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        message: "3 expense(s) deleted. 1 reconciled expense(s) skipped.",
      },
    });
    const result = await bulkDeleteExpensesApi(["1", "2", "3", "4"]);
    expect(result.message).toBe(
      "3 expense(s) deleted. 1 reconciled expense(s) skipped.",
    );
  });

  it("throws when every selected expense is reconciled and the backend refuses outright", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message: "No non-matched expenses selected for deletion.",
      },
    });
    await expect(bulkDeleteExpensesApi(["1"])).rejects.toThrow(
      "No non-matched expenses selected for deletion.",
    );
  });
});

describe("fetchExpenseAttachmentsZip", () => {
  it("POSTs an encrypted body with expenses[] to the real download route", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { zip: "dGVzdA==" } },
    });

    const zip = await fetchExpenseAttachmentsZip(["1", "2"]);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.download);
    expect(decryptPayload((body as { data: string }).data)).toEqual({
      expenses: ["1", "2"],
    });
    expect(zip).toBe("dGVzdA==");
  });

  it("throws the real message when there's nothing to zip — the backend answers 200 with success:false, not an HTTP error", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "No receipt found" },
    });
    await expect(fetchExpenseAttachmentsZip(["1"])).rejects.toThrow(
      "No receipt found",
    );
  });

  it("throws even on a nominal success if the zip field itself is missing", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(fetchExpenseAttachmentsZip(["1"])).rejects.toThrow(
      "No receipts found for the selected expenses.",
    );
  });
});
