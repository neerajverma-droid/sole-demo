import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  accountsForType,
  autofillFromMatches,
  buildManualTransactionFields,
  contactIdForClient,
  sendsContactPair,
  canSelectMatch,
  createManualTransaction,
  defaultAccountFor,
  emptyManualTransactionDraft,
  fetchInvestmentProperties,
  fetchManualAccounts,
  fetchPossibleMatches,
  manualTransactionIssues,
  matchCategoryGroups,
  mapPossibleMatch,
  toggleMatch,
} = await import("@/lib/manual-transaction");

import type {
  ManualAccount,
  ManualTransactionDraft,
  PossibleMatch,
} from "@/lib/manual-transaction";

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string") throw new Error("FormData had no 'data'");
    return decryptPayload(data);
  }
  return decryptPayload((body as { data: string }).data);
}

const TODAY = "2026-10-05";

function draft(overrides: Partial<ManualTransactionDraft> = {}) {
  return { ...emptyManualTransactionDraft(TODAY), ...overrides };
}

function account(
  id: string,
  name: string,
  categoryId: number,
  code = "",
): ManualAccount {
  return { id, name, categoryId, parentName: "", code };
}

const ACCOUNTS: ManualAccount[] = [
  account("51", "Sales Income", 4, "101"),
  account("52", "Interest Income", 4),
  account("53", "Service Income", 4),
  account("180", "Vendor Refund", 4),
  account("185", "Investment Property Income", 4),
  account("10", "Rent", 1),
  account("11", "Credit Note", 1),
  account("140", "Super Contribution", 1),
  account("181", "Client Refund", 1),
  account("60", "Vehicles", 6),
  account("61", "Accumulated Depreciation", 6),
  account("30", "Owner Capital Input", 3),
  account("31", "Retained Earnings", 3),
  account("20", "Credit Card", 2),
  account("21", "Car Loan", 2),
  account("22", "GST Payable", 2),
];

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

describe("fetchManualAccounts", () => {
  it("flattens the chart of accounts with category ids", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          account_categories: [
            {
              account_category_id: 4,
              name: "Income",
              account_subcategories: [
                { account_subcategory_id: 51, name: "Sales Income", code: 101 },
                { account_subcategory_id: 52, subcategory_name: "Interest" },
              ],
            },
          ],
        },
      },
    });

    expect(await fetchManualAccounts()).toEqual([
      { id: "51", name: "Sales Income", categoryId: 4, parentName: "Income", code: "101" },
      { id: "52", name: "Interest", categoryId: 4, parentName: "Income", code: "" },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.accountCategory.list);
  });
});

describe("accountsForType", () => {
  const names = (type: 1 | 2 | 3 | 4 | 5) =>
    accountsForType(ACCOUNTS, type).map((entry) => entry.name);

  it("narrows Income and drops sole-webapp's excluded and refund accounts", () => {
    expect(names(3)).toEqual([
      "Interest Income",
      "Investment Property Income",
      "Sales Income",
    ]);
  });

  it("narrows Expense, dropping Credit Note and Client Refund", () => {
    expect(names(1)).toEqual(["Rent", "Super Contribution"]);
  });

  it("narrows Asset, Capital and Liabilities", () => {
    expect(names(2)).toEqual(["Vehicles"]);
    expect(names(4)).toEqual(["Owner Capital Input"]);
    expect(names(5)).toEqual(["Car Loan", "Credit Card"]);
  });
});

describe("defaultAccountFor", () => {
  it("picks Sales Income for Income", () => {
    expect(defaultAccountFor(accountsForType(ACCOUNTS, 3), 3)?.id).toBe("51");
  });

  it("falls back to the first Income account when Sales Income is missing", () => {
    const list = [account("52", "Interest Income", 4)];
    expect(defaultAccountFor(list, 3)?.id).toBe("52");
  });

  it("picks the first loan for Liabilities", () => {
    expect(defaultAccountFor(accountsForType(ACCOUNTS, 5), 5)?.id).toBe("21");
  });

  it("picks the first account otherwise, or nothing", () => {
    expect(defaultAccountFor(accountsForType(ACCOUNTS, 1), 1)?.id).toBe("10");
    expect(defaultAccountFor([], 2)).toBeUndefined();
  });
});

describe("manualTransactionIssues", () => {
  const valid = draft({
    accountId: "51",
    amount: "100",
    contactId: "9",
    description: "Payout",
  });

  it("passes a complete Income draft", () => {
    expect(manualTransactionIssues(valid, TODAY)).toEqual({});
  });

  it("uses sole-webapp's messages", () => {
    expect(manualTransactionIssues(draft(), TODAY)).toEqual({
      account: "Please select an account.",
      amount: "Please enter amount",
      contact: "Name of client is required.",
      description: "Description is required",
    });
  });

  it("checks the amount format and minimum", () => {
    expect(manualTransactionIssues({ ...valid, amount: "0" }, TODAY).amount).toBe(
      "Please enter minimum 0.01 amount",
    );
    expect(manualTransactionIssues({ ...valid, amount: "0.01" }, TODAY).amount).toBeUndefined();
    expect(manualTransactionIssues({ ...valid, amount: "1." }, TODAY).amount).toBe(
      "Please enter a number format only.",
    );
  });

  it("limits the date to the last 365 days", () => {
    expect(manualTransactionIssues({ ...valid, date: "2026-10-06" }, TODAY).date).toBeDefined();
    expect(manualTransactionIssues({ ...valid, date: "2025-10-05" }, TODAY).date).toBeUndefined();
    expect(manualTransactionIssues({ ...valid, date: "2025-10-04" }, TODAY).date).toBeDefined();
    expect(manualTransactionIssues({ ...valid, date: "" }, TODAY).date).toBe(
      "Please select transaction date",
    );
  });

  it("asks for a supplier, fund, name or property by type and account", () => {
    const base = { ...valid, contactId: "" };
    expect(manualTransactionIssues({ ...base, type: 1, accountId: "10" }, TODAY)).toMatchObject({
      contact: "Name of supplier is required.",
      name: "Name of expense is required.",
    });
    expect(manualTransactionIssues({ ...base, type: 2, accountId: "60" }, TODAY).name).toBe(
      "Name of asset is required.",
    );
    expect(manualTransactionIssues({ ...base, type: 1, accountId: "140", name: "x" }, TODAY).contact).toBe(
      "Fund name is required.",
    );
    expect(manualTransactionIssues({ ...base, type: 5, accountId: "21" }, TODAY).contact).toBe(
      "Name of supplier is required.",
    );
    expect(manualTransactionIssues({ ...base, type: 4, accountId: "30" }, TODAY).contact).toBeUndefined();
    expect(manualTransactionIssues({ ...base, accountId: "185" }, TODAY)).toMatchObject({
      property: "Investment property is required.",
    });
    expect(manualTransactionIssues({ ...base, accountId: "185" }, TODAY).contact).toBeUndefined();
  });

  it("drops the contact rule once Match is ticked, and asks for a selection", () => {
    const ticked = { ...valid, contactId: "", match: true, matchIds: [] };
    const issues = manualTransactionIssues(ticked, TODAY);
    expect(issues.contact).toBeUndefined();
    expect(issues.match).toBe("Please select at least one record to match.");
  });

  it("keeps the expense name rule while Match is ticked with nothing picked", () => {
    const ticked = draft({
      type: 1,
      accountId: "10",
      amount: "10",
      description: "x",
      match: true,
    });
    expect(manualTransactionIssues(ticked, TODAY)).toEqual({
      name: "Name of expense is required.",
      match: "Please select at least one record to match.",
    });
  });

  it("waives contact and name while matching, but checks the total", () => {
    const rows = [
      { id: "1", amount: 60 },
      { id: "2", amount: 40 },
    ] as PossibleMatch[];
    const matched = {
      ...valid,
      type: 1 as const,
      accountId: "10",
      contactId: "",
      match: true,
      matchIds: ["1", "2"],
    };
    expect(manualTransactionIssues(matched, TODAY, rows)).toEqual({});
    expect(manualTransactionIssues({ ...matched, amount: "90" }, TODAY, rows).match).toBe(
      "Selected expenses and transaction amount are different.",
    );
  });
});

describe("possible matches", () => {
  it("maps each kind's own fields", () => {
    expect(
      mapPossibleMatch(
        {
          invoice_id: 7,
          invoice_no: "INV-7",
          client_id: 3,
          client_name: "Acme",
          client_email: "A@acme.com",
          status: "Partially_Paid",
          total: "110",
          remaining_amount: 50,
          due_date: "2026-09-01T00:00:00Z",
          account_subcategory_id: 51,
        },
        "invoice",
      ),
    ).toMatchObject({
      id: "7",
      title: "INV-7",
      counterpartyKey: "a@acme.com",
      clientId: "3",
      amount: 110,
      remaining: 50,
      date: "2026-09-01",
      status: "partially_paid",
      accountId: "51",
    });

    expect(
      mapPossibleMatch(
        { expense_id: 4, name: "Fuel", client_id: 8, price: 20, total: 22, date: "2026-08-02" },
        "expense",
      ),
    ).toMatchObject({ id: "4", amount: 20, remaining: 22, counterpartyKey: "8" });

    expect(
      mapPossibleMatch(
        { property_income_id: 2, property_name: "Unit 1", amount: 500, remaining_amount: 300 },
        "property-income",
      ),
    ).toMatchObject({ id: "2", amount: 300, clientId: "" });
  });

  it("posts the type, encrypted, and maps the list", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { list: [{ asset_id: 1, name: "Van", price: 900 }] } },
    });

    const rows = await fetchPossibleMatches(2, "60");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "1", kind: "asset", amount: 900 });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.getPossibleMatch);
    expect(decryptedFieldsFromBody(body)).toEqual({ transaction_type: 2 });
  });

  it("needs a property for property income, and sends it", async () => {
    expect(await fetchPossibleMatches(3, "185")).toEqual([]);
    expect(apiMock.post).not.toHaveBeenCalled();

    apiMock.post.mockResolvedValue({ data: { success: true, data: { list: [] } } });
    await fetchPossibleMatches(3, "185", "12");
    expect(decryptedFieldsFromBody(apiMock.post.mock.calls[0][1])).toEqual({
      transaction_type: 3,
      property_id: "12",
    });
  });

  it("locks the selection to one counterparty", () => {
    const rows = [
      { id: "1", kind: "expense", counterpartyKey: "8" },
      { id: "2", kind: "expense", counterpartyKey: "8" },
      { id: "3", kind: "expense", counterpartyKey: "9" },
    ] as PossibleMatch[];
    expect(canSelectMatch(rows[1], rows, ["1"])).toBe(true);
    expect(canSelectMatch(rows[2], rows, ["1"])).toBe(false);
    expect(canSelectMatch(rows[2], rows, [])).toBe(true);
  });

  it("toggles, with property income single-select", () => {
    expect(toggleMatch({ id: "2", kind: "invoice" } as PossibleMatch, ["1"])).toEqual(["1", "2"]);
    expect(toggleMatch({ id: "1", kind: "invoice" } as PossibleMatch, ["1"])).toEqual([]);
    expect(toggleMatch({ id: "2", kind: "property-income" } as PossibleMatch, ["1"])).toEqual(["2"]);
  });

  it("auto-fills from the selection", () => {
    const rows = [
      mapPossibleMatch({ invoice_id: 1, invoice_no: "INV-1", client_id: 3, total: 10.1, due_date: "2026-09-01", account_subcategory_id: 51 }, "invoice"),
      mapPossibleMatch({ invoice_id: 2, invoice_no: "INV-2", client_id: 3, total: 5.2 }, "invoice"),
    ];
    expect(autofillFromMatches(rows, ["1", "2"])).toEqual({
      amount: "15.30",
      description: "Income of INV-1, INV-2",
      date: "2026-09-01",
      clientId: "3",
      accountId: "51",
      total: 15.3,
    });
    expect(autofillFromMatches(rows, [])).toBeNull();
  });
});

describe("buildManualTransactionFields", () => {
  const common = {
    is_manual: "1",
    amount: "100",
    transaction_date: TODAY,
    description: "Desc",
  };

  it("builds an Income transaction with its client and GST flag", () => {
    expect(
      buildManualTransactionFields(
        draft({
          accountId: "51",
          amount: "100",
          description: " Desc ",
          contactId: "9",
          primaryContactId: "90",
          name: "Sales Income",
          gstIncluded: true,
        }),
      ),
    ).toEqual({
      ...common,
      transaction_type: "3",
      account_subcategory_id: "51",
      gst_included: "1",
      name: "Sales Income",
      client_id: "9",
      contact_id: "90",
    });
  });

  it("sends a fund and the taxable flag for a super contribution", () => {
    expect(
      buildManualTransactionFields(
        draft({ type: 1, accountId: "140", amount: "100", description: "Desc", contactId: "5", name: "Super", taxable: true }),
      ),
    ).toEqual({
      ...common,
      transaction_type: "1",
      account_subcategory_id: "140",
      gst_included: "0",
      name: "Super",
      is_taxable: "1",
      fund_id: "5",
    });
  });

  it("sends the property and no contact or GST for property income", () => {
    expect(
      buildManualTransactionFields(
        draft({ accountId: "185", amount: "100", description: "Desc", propertyId: "12", gstIncluded: true, name: "Rent" }),
      ),
    ).toEqual({
      ...common,
      transaction_type: "3",
      account_subcategory_id: "185",
      property_id: "12",
      gst_included: "0",
      name: "Rent",
    });
  });

  it("sends the matched ids instead of a name", () => {
    expect(
      buildManualTransactionFields(
        draft({ type: 1, accountId: "10", amount: "100", description: "Desc", contactId: "8", match: true, matchIds: ["4", "5"] }),
      ),
    ).toEqual({
      ...common,
      transaction_type: "1",
      account_subcategory_id: "10",
      gst_included: "0",
      client_id: "8",
      contact_id: "",
      expense_ids: ["4", "5"],
    });
  });

  it("sends only a name for Capital, and a supplier for Liabilities", () => {
    expect(
      buildManualTransactionFields(draft({ type: 4, accountId: "30", amount: "100", description: "Desc", name: "Owner Capital Input" })),
    ).toEqual({
      ...common,
      transaction_type: "4",
      account_subcategory_id: "30",
      name: "Owner Capital Input",
    });
    expect(
      buildManualTransactionFields(draft({ type: 5, accountId: "21", amount: "100", description: "Desc", name: "Car Loan", contactId: "8" })),
    ).toEqual({
      ...common,
      transaction_type: "5",
      account_subcategory_id: "21",
      name: "Car Loan",
      client_id: "8",
      contact_id: "",
    });
  });
});

describe("contactIdForClient", () => {
  const contacts = [
    { contactId: "1", clientId: "34235", name: "Jane" },
    { contactId: "23532", clientId: "34235", name: "Acme Pty" },
    { contactId: "9", clientId: "77", name: "Acme Pty" },
  ];

  it("prefers the client's contact named like the client", () => {
    expect(contactIdForClient("34235", "acme pty ", contacts)).toBe("23532");
  });

  it("falls back to the client's first contact, or nothing", () => {
    expect(contactIdForClient("34235", "Other", contacts)).toBe("1");
    expect(contactIdForClient("5", "Acme Pty", contacts)).toBe("");
  });
});

describe("sendsContactPair", () => {
  it("is true where the payload carries client_id/contact_id", () => {
    expect(sendsContactPair(draft({ accountId: "51", contactId: "1" }))).toBe(true);
    expect(sendsContactPair(draft({ type: 5, accountId: "21", contactId: "1" }))).toBe(true);
    expect(
      sendsContactPair(draft({ type: 1, accountId: "10", contactId: "1", match: true, matchIds: ["4"] })),
    ).toBe(true);
  });

  it("is false for Capital, property income, a fund, or no contact", () => {
    expect(sendsContactPair(draft({ accountId: "51" }))).toBe(false);
    expect(sendsContactPair(draft({ type: 4, accountId: "30", contactId: "1" }))).toBe(false);
    expect(sendsContactPair(draft({ accountId: "185", contactId: "1" }))).toBe(false);
    expect(sendsContactPair(draft({ type: 1, accountId: "140", contactId: "1" }))).toBe(false);
  });
});

describe("createManualTransaction", () => {
  const expense = draft({
    type: 1,
    accountId: "10",
    amount: "50",
    description: "Fuel",
    contactId: "8",
    name: "Fuel",
  });

  it("posts encrypted JSON without files", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Saved", data: {} } });

    expect(await createManualTransaction(expense)).toEqual({
      duplicate: false,
      message: "Saved",
    });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.addTransactionMultiple);
    expect(decryptedFieldsFromBody(body)).toMatchObject({ name: "Fuel", client_id: "8" });
  });

  it("sends attachments as files[] for an expense", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    const file = new File(["x"], "receipt.pdf", { type: "application/pdf" });

    await createManualTransaction(expense, [file]);

    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.getAll("files[]")).toHaveLength(1);
    expect(decryptedFieldsFromBody(body)).toMatchObject({ transaction_type: "1" });
  });

  it("drops attachments for Income", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    const file = new File(["x"], "receipt.pdf", { type: "application/pdf" });

    await createManualTransaction(draft({ accountId: "51", amount: "1", description: "x", contactId: "1" }), [file]);

    expect(apiMock.post.mock.calls[0][1]).not.toBeInstanceOf(FormData);
  });

  it("reports a duplicate", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, message: "Looks like a duplicate", data: { type: "duplicate" } },
    });
    expect(await createManualTransaction(expense)).toEqual({
      duplicate: true,
      message: "Looks like a duplicate",
    });
  });

  it("throws the server's message on failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Invalid account" } });
    await expect(createManualTransaction(expense)).rejects.toThrow("Invalid account");
  });
});

describe("fetchInvestmentProperties", () => {
  it("keeps named properties, sorted", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 2, property_name: "beach house" },
          { id: 1, property_name: "Apartment" },
          { id: 3, property_name: "" },
        ],
      },
    });
    expect(await fetchInvestmentProperties()).toEqual([
      { id: "1", name: "Apartment" },
      { id: "2", name: "beach house" },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.investment.list, {
      params: { page: 1, limit: 1000 },
    });
  });
});

describe("matchCategoryGroups", () => {
  const chart: ManualAccount[] = [
    account("51", "Sales Income", 4),
    account("53", "Service Income", 4),
    account("180", "Vendor Refund", 4),
    account("10", "Rent", 1),
    account("11", "Credit Note", 1),
    account("181", "Client Refund", 1),
    account("60", "Vehicles", 6),
    account("61", "Accumulated Depreciation", 6),
    account("118", "Owner Capital Input", 3),
    account("46", "Drawings", 3),
    account("47", "Retained Earnings", 3),
    account("20", "Car Loan", 2),
  ];
  const shape = (direction: "Credit" | "Debit") =>
    matchCategoryGroups(chart, direction).map((group) => [
      group.label,
      group.options.map((option) => option.id),
    ]);

  it("offers Income then its Capital account for money in", () => {
    expect(shape("Credit")).toEqual([
      ["Income", ["51"]],
      ["Capital Account", ["118"]],
    ]);
  });

  it("offers Expenses, Assets, then its Capital account for money out", () => {
    expect(shape("Debit")).toEqual([
      ["Expenses", ["10", "11"]],
      ["Assets", ["60"]],
      ["Capital Account", ["46"]],
    ]);
  });

  it("drops empty groups", () => {
    expect(matchCategoryGroups([account("51", "Sales Income", 4)], "Credit")).toEqual([
      { label: "Income", options: [account("51", "Sales Income", 4)] },
    ]);
  });
});
