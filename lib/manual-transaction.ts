/**
 * Manual transaction entry — sole-webapp's
 * `components/Banking/Transactions/ManualTransaction/ManualTransaction.js`
 * (+ `ManualTransactionList.js` for the possible-match table and
 * `schemas/ManualTransaction.schema.js` for validation).
 *
 * The form records a transaction the bank feed hasn't imported, against one
 * account from the chart of accounts. The account list depends on the
 * transaction type, exactly as sole-webapp narrows it: Income → the Income
 * category, Expense → Expenses, Asset → Assets, Capital → Capital,
 * Liabilities → Liabilities.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

/* ------------------------------------------------------------------ *
 * Transaction types
 * ------------------------------------------------------------------ */

/** The numeric id is what the backend takes as `transaction_type`. */
export type ManualTransactionTypeId = 1 | 2 | 3 | 4 | 5;

/** Dropdown order and labels, as sole-webapp's `transactionTypes`. */
export const MANUAL_TRANSACTION_TYPES: {
  id: ManualTransactionTypeId;
  label: string;
}[] = [
  { id: 3, label: "Income" },
  { id: 1, label: "Expense" },
  { id: 2, label: "Asset" },
  { id: 4, label: "Capital" },
  { id: 5, label: "Liabilities" },
];

export const INCOME = 3;
export const EXPENSE = 1;
export const ASSET = 2;
export const CAPITAL = 4;
export const LIABILITIES = 5;

/**
 * Chart-of-accounts category behind each type — sole-webapp's `config.js`
 * ids (income 4, expense 1, asset 6, capital 3, liabilities 2).
 */
const CATEGORY_ID_BY_TYPE: Record<ManualTransactionTypeId, number> = {
  3: 4,
  1: 1,
  2: 6,
  4: 3,
  5: 2,
};

/** Capital and Liabilities carry no GST, attachments or matching. */
export function isCapitalLike(type: ManualTransactionTypeId): boolean {
  return type === CAPITAL || type === LIABILITIES;
}

/** Super Contribution: an Expense against this account takes a fund, not a supplier. */
export const SUPER_CONTRIBUTION_ACCOUNT_ID = "140";
/** Investment Property Income: an Income against this account takes a property, not a client. */
export const INVESTMENT_PROPERTY_INCOME_ACCOUNT_ID = "185";
const SALES_INCOME_ACCOUNT_ID = "51";

export function isSuperContribution(
  type: ManualTransactionTypeId,
  accountId: string,
): boolean {
  return type === EXPENSE && accountId === SUPER_CONTRIBUTION_ACCOUNT_ID;
}

export function isPropertyIncome(
  type: ManualTransactionTypeId,
  accountId: string,
): boolean {
  return type === INCOME && accountId === INVESTMENT_PROPERTY_INCOME_ACCOUNT_ID;
}

/** Who the transaction is with: a client for money in, a supplier otherwise. */
export function contactTypeFor(
  type: ManualTransactionTypeId,
): "Client" | "Supplier" {
  return type === INCOME ? "Client" : "Supplier";
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export type ManualAccount = {
  /** account_subcategory_id */
  id: string;
  name: string;
  /** account_category_id */
  categoryId: number;
  parentName: string;
  code: string;
};

type ApiSubcategory = {
  account_subcategory_id: number | string;
  account_category_id?: number | string;
  name?: string | null;
  subcategory_name?: string | null;
  code?: string | number | null;
};

type ApiCategory = {
  account_category_id: number | string;
  name: string;
  account_subcategories?: ApiSubcategory[];
};

/** The whole chart of accounts, flattened — narrowed per type by `accountsForType`. */
export async function fetchManualAccounts(): Promise<ManualAccount[]> {
  const response = await api.get<
    ApiEnvelope<{ account_categories: ApiCategory[] }>
  >(apiRoutes.accountCategory.list);

  const categories = response.data?.data?.account_categories ?? [];
  return categories.flatMap((category) =>
    (category.account_subcategories ?? []).map((sub) => ({
      id: String(sub.account_subcategory_id),
      name: (sub.name || sub.subcategory_name || "").trim(),
      categoryId: Number(category.account_category_id),
      parentName: category.name,
      code: sub.code != null ? String(sub.code) : "",
    })),
  );
}

/** Never offered, whatever the type — sole-webapp's dropdown hides these. */
const HIDDEN_ACCOUNTS = [
  "retained earnings",
  "accounts payable",
  "gst collected",
  "gst payable",
];

/** sole-webapp's `getSpecificCategories` drops these per category. */
const EXCLUDED_BY_CATEGORY: Record<number, string[]> = {
  4: [
    "account receivable",
    "accounts receivable",
    "service income",
    "sales revenue",
    "general income",
  ],
  6: [
    "accounts receivable",
    "account receivable",
    "accumulated depreciation",
    "gst receivable",
  ],
  // Expense type only: sole-webapp filters "credit note" out of `expanseOnly`.
  1: ["credit note"],
};

/**
 * Client/Vendor Refund accounts open sole-webapp's separate credit-note
 * refund flow rather than this form — not built here yet, so they're left
 * out instead of offered and then silently saved as a plain transaction.
 */
export function isRefundAccount(account: ManualAccount): boolean {
  const name = account.name.toLowerCase();
  return name.includes("client refund") || name.includes("vendor refund");
}

export function accountsForType(
  accounts: ManualAccount[],
  type: ManualTransactionTypeId,
): ManualAccount[] {
  const categoryId = CATEGORY_ID_BY_TYPE[type];
  const excluded = EXCLUDED_BY_CATEGORY[categoryId] ?? [];

  return accounts
    .filter((account) => {
      if (account.categoryId !== categoryId) return false;
      const name = account.name.toLowerCase();
      // The tax accounts are named in the country's word ("VAT Payable" in South Africa).
      const taxNeutral = name.replace(/\bvat\b/g, "gst");
      return (
        !!name &&
        !HIDDEN_ACCOUNTS.includes(taxNeutral) &&
        !excluded.includes(name) &&
        !isRefundAccount(account)
      );
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/**
 * The account a type starts on: Sales Income for Income, the first loan
 * account for Liabilities, otherwise the first in the list. sole-webapp falls
 * back to a hard-coded Sales Income even when it isn't in the list; this
 * falls back to the list's first entry instead, so it never selects an
 * account the user can't see.
 */
export function defaultAccountFor(
  accounts: ManualAccount[],
  type: ManualTransactionTypeId,
): ManualAccount | undefined {
  if (type === INCOME) {
    return (
      accounts.find(
        (account) =>
          account.id === SALES_INCOME_ACCOUNT_ID ||
          account.name.toLowerCase() === "sales income" ||
          account.code === "101",
      ) ?? accounts[0]
    );
  }
  if (type === LIABILITIES) {
    return (
      accounts.find((account) => account.name.toLowerCase().includes("loan")) ??
      accounts[0]
    );
  }
  return accounts[0];
}

/* ------------------------------------------------------------------ *
 * Investment properties (Income → Investment Property Income)
 * ------------------------------------------------------------------ */

export type InvestmentProperty = { id: string; name: string };

export async function fetchInvestmentProperties(): Promise<
  InvestmentProperty[]
> {
  const response = await api.get<
    ApiEnvelope<{ id?: number | string; property_name?: string | null }[]>
  >(apiRoutes.investment.list, { params: { page: 1, limit: 1000 } });

  return (response.data?.data ?? [])
    .filter((row) => row.id != null && !!row.property_name)
    .map((row) => ({ id: String(row.id), name: String(row.property_name) }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/* ------------------------------------------------------------------ *
 * Possible matches ("Match this manual transaction")
 * ------------------------------------------------------------------ */

export type MatchKind = "invoice" | "expense" | "asset" | "property-income";

export type PossibleMatch = {
  id: string;
  kind: MatchKind;
  /** Invoice number, expense/asset name, or property name. */
  title: string;
  /** Account name, client email, or notes — the second line. */
  subtitle: string;
  /** Client or supplier name. */
  contactName: string;
  /** What locks a multi-select to one counterparty. */
  counterpartyKey: string;
  clientId: string;
  /** What a selection adds to the transaction amount. */
  amount: number;
  /** Shown as "Remaining", where the record has one. */
  remaining: number | null;
  /** `YYYY-MM-DD`, or "" when the row carries none. */
  date: string;
  status: string;
  /** The row's own account, synced onto the form when it's picked. */
  accountId: string;
  accountName: string;
};

type ApiMatchRow = {
  invoice_id?: number | string;
  invoice_no?: string;
  expense_id?: number | string;
  asset_id?: number | string;
  property_income_id?: number | string;
  property_name?: string | null;
  notes?: string | null;
  name?: string | null;
  client_id?: number | string | null;
  client_name?: string | null;
  client_email?: string | null;
  status?: string | null;
  total?: number | string | null;
  price?: number | string | null;
  amount?: number | string | null;
  remaining_amount?: number | string | null;
  due_date?: string | null;
  date?: string | null;
  account_subcategory_id?: number | string | null;
  subcategory_id?: number | string | null;
  subcategory_name?: string | null;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDay(value: string | null | undefined): string {
  if (!value) return "";
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

export function mapPossibleMatch(
  row: ApiMatchRow,
  kind: MatchKind,
): PossibleMatch {
  const accountId = String(row.account_subcategory_id ?? row.subcategory_id ?? "");
  const accountName = row.subcategory_name ?? "";
  const clientId = row.client_id != null ? String(row.client_id) : "";

  switch (kind) {
    case "property-income": {
      const amount = num(row.remaining_amount) ?? num(row.amount) ?? 0;
      return {
        id: String(row.property_income_id ?? ""),
        kind,
        title: row.property_name || "-",
        subtitle: (row.notes ?? "").slice(0, 80),
        contactName: "",
        counterpartyKey: "",
        clientId: "",
        amount,
        remaining: num(row.remaining_amount) ?? num(row.amount),
        date: isoDay(row.date),
        status: "",
        accountId,
        accountName,
      };
    }
    case "expense":
    case "asset":
      return {
        id: String((kind === "expense" ? row.expense_id : row.asset_id) ?? ""),
        kind,
        title: row.name || "-",
        subtitle: accountName,
        contactName: row.client_name || "-",
        counterpartyKey: clientId,
        clientId,
        amount: num(row.price) ?? 0,
        remaining:
          kind === "expense"
            ? (num(row.remaining_amount) ?? num(row.total))
            : null,
        date: isoDay(row.date),
        status: "",
        accountId,
        accountName,
      };
    default:
      return {
        id: String(row.invoice_id ?? ""),
        kind: "invoice",
        title: row.invoice_no || "-",
        subtitle: row.client_email || "",
        contactName: row.client_name || "-",
        counterpartyKey: (row.client_email ?? "").toLowerCase(),
        clientId,
        amount: num(row.total) ?? 0,
        remaining: num(row.remaining_amount) ?? num(row.total),
        date: isoDay(row.due_date),
        status: (row.status || "sent").toLowerCase(),
        accountId,
        accountName,
      };
  }
}

export function matchKindFor(
  type: ManualTransactionTypeId,
  accountId: string,
): MatchKind {
  if (isPropertyIncome(type, accountId)) return "property-income";
  if (type === EXPENSE) return "expense";
  if (type === ASSET) return "asset";
  return "invoice";
}

/** Records this transaction could settle — POST, encrypted, as sole-webapp sends it. */
export async function fetchPossibleMatches(
  type: ManualTransactionTypeId,
  accountId: string,
  propertyId?: string,
): Promise<PossibleMatch[]> {
  const kind = matchKindFor(type, accountId);
  if (kind === "property-income" && !propertyId) return [];

  const fields: Record<string, unknown> = { transaction_type: type };
  if (kind === "property-income") fields.property_id = propertyId;

  const response = await api.post<ApiEnvelope<{ list?: ApiMatchRow[] }>>(
    apiRoutes.bankTransaction.getPossibleMatch,
    buildEncryptedRequestBody(fields),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't load possible matches.");
  }
  return (response.data?.data?.list ?? [])
    .map((row) => mapPossibleMatch(row, kind))
    .filter((row) => row.id !== "");
}

/**
 * Whether `row` can join the selection: property income is single-select,
 * and everything else locks to the first selected row's counterparty.
 */
export function canSelectMatch(
  row: PossibleMatch,
  rows: PossibleMatch[],
  selectedIds: string[],
): boolean {
  if (selectedIds.length === 0 || selectedIds.includes(row.id)) return true;
  if (row.kind === "property-income") return true; // replaces the selection
  const first = rows.find((candidate) => selectedIds.includes(candidate.id));
  return !first || first.counterpartyKey === row.counterpartyKey;
}

export function toggleMatch(
  row: PossibleMatch,
  selectedIds: string[],
): string[] {
  if (selectedIds.includes(row.id)) {
    return selectedIds.filter((id) => id !== row.id);
  }
  return row.kind === "property-income" ? [row.id] : [...selectedIds, row.id];
}

export type MatchAutofill = {
  amount: string;
  description: string;
  date: string;
  clientId: string;
  /** The first selected row's account, when it has one. */
  accountId: string;
  total: number;
};

/** What picking rows fills the form with — sole-webapp's `selectMultiple`. */
export function autofillFromMatches(
  rows: PossibleMatch[],
  selectedIds: string[],
): MatchAutofill | null {
  const selected = rows.filter((row) => selectedIds.includes(row.id));
  if (selected.length === 0) return null;

  const first = selected[0];
  const total = roundMoney(
    selected.reduce((sum, row) => sum + row.amount, 0),
  );
  const titles = selected.map((row) => row.title).join(", ");

  const description =
    first.kind === "property-income"
      ? first.subtitle || `Rental income for ${first.title || "property"}`
      : first.kind === "invoice"
        ? `Income of ${titles}`
        : first.kind === "expense"
          ? `Expense for ${titles}`
          : `Asset ${titles}`;

  return {
    amount: total.toFixed(2),
    description,
    date: first.date,
    clientId: first.kind === "property-income" ? "" : first.clientId,
    accountId: first.accountId,
    total,
  };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * Draft + validation
 * ------------------------------------------------------------------ */

export type ManualTransactionDraft = {
  type: ManualTransactionTypeId;
  accountId: string;
  amount: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** client_id, or the fund id for a super contribution. */
  contactId: string;
  contactName: string;
  /** The contact person behind `contactId`, where known. */
  primaryContactId: string;
  propertyId: string;
  /** Name of Expense / Name of Asset. */
  name: string;
  description: string;
  gstIncluded: boolean;
  /** Tax Deduction Contribution — super contributions only. */
  taxable: boolean;
  match: boolean;
  matchIds: string[];
};

export function emptyManualTransactionDraft(today: string): ManualTransactionDraft {
  return {
    type: INCOME,
    accountId: "",
    amount: "",
    date: today,
    contactId: "",
    contactName: "",
    primaryContactId: "",
    propertyId: "",
    name: "",
    description: "",
    gstIncluded: false,
    taxable: false,
    match: false,
    matchIds: [],
  };
}

/** The amount box only accepts digits with up to two decimals. */
export const AMOUNT_INPUT_PATTERN = /^\d*(\.\d{0,2})?$/;

export type ManualField =
  | "type"
  | "account"
  | "amount"
  | "date"
  | "contact"
  | "property"
  | "name"
  | "description"
  | "match";

/** True when the user picked records to match, which waives contact and name. */
export function isMatching(draft: ManualTransactionDraft): boolean {
  return draft.match && draft.matchIds.length > 0;
}

function daysAgo(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Earliest date the picker allows: a year back, as sole-webapp's `minDate`. */
export function earliestTransactionDate(today: string): string {
  return daysAgo(today, 365);
}

/**
 * sole-webapp's Yup schema, field by field, with its messages. `matches`
 * is the possible-match list, for the matched-total check sole-webapp runs
 * on submit.
 */
export function manualTransactionIssues(
  draft: ManualTransactionDraft,
  today: string,
  matches: PossibleMatch[] = [],
): Partial<Record<ManualField, string>> {
  const issues: Partial<Record<ManualField, string>> = {};
  const matching = isMatching(draft);

  if (!draft.accountId) issues.account = "Please select an account.";

  const amount = draft.amount.trim();
  if (!amount) issues.amount = "Please enter amount";
  else if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number.isNaN(Number(amount)))
    issues.amount = "Please enter a number format only.";
  else if (Number(amount) < 0.01)
    issues.amount = "Please enter minimum 0.01 amount";

  if (!draft.date) issues.date = "Please select transaction date";
  else if (draft.date > today || draft.date < earliestTransactionDate(today))
    issues.date = "Please select a valid transaction date";

  const propertyIncome = isPropertyIncome(draft.type, draft.accountId);
  if (propertyIncome && !matching && !draft.propertyId) {
    issues.property = "Investment property is required.";
  }

  // Ticking Match hides the contact field (as sole-webapp does), so it can't
  // be required then — the matched records supply the contact instead.
  if (!propertyIncome && !draft.match && !draft.contactId) {
    if (isSuperContribution(draft.type, draft.accountId)) {
      issues.contact = "Fund name is required.";
    } else if (draft.type === INCOME) {
      issues.contact = "Name of client is required.";
    } else if (draft.type !== CAPITAL) {
      issues.contact = "Name of supplier is required.";
    }
  }

  if (!matching && !draft.name.trim()) {
    if (draft.type === EXPENSE) issues.name = "Name of expense is required.";
    if (draft.type === ASSET) issues.name = "Name of asset is required.";
  }

  if (!draft.description.trim()) issues.description = "Description is required";

  // sole-webapp blocks this case with the hidden contact field's error; here
  // the reason is said where it can be seen.
  if (draft.match && draft.matchIds.length === 0) {
    issues.match = "Please select at least one record to match.";
  }

  if (matching && !issues.amount) {
    const total = roundMoney(
      matches
        .filter((row) => draft.matchIds.includes(row.id))
        .reduce((sum, row) => sum + row.amount, 0),
    );
    if (roundMoney(Number(amount)) !== total) {
      const noun =
        draft.type === EXPENSE
          ? "expenses"
          : draft.type === ASSET
            ? "assets"
            : propertyIncome
              ? "property income"
              : "invoices";
      issues.match = `Selected ${noun} and transaction amount are different.`;
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ *
 * Save
 * ------------------------------------------------------------------ */

const MATCH_ID_FIELD: Record<MatchKind, string> = {
  invoice: "invoice_ids",
  expense: "expense_ids",
  asset: "asset_ids",
  "property-income": "property_income_ids",
};

/** The request body sole-webapp's `handleFormSubmit` builds, field for field. */
export function buildManualTransactionFields(
  draft: ManualTransactionDraft,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    // Strings throughout, as sole-webapp's FormData sends them.
    is_manual: "1",
    transaction_type: String(draft.type),
    account_subcategory_id: draft.accountId,
    amount: draft.amount.trim(),
    transaction_date: draft.date,
    description: draft.description.trim(),
  };

  const propertyIncome = isPropertyIncome(draft.type, draft.accountId);
  if (propertyIncome) fields.property_id = draft.propertyId;

  if (draft.type === CAPITAL) {
    fields.name = draft.name.trim();
    return fields;
  }

  if (draft.type === LIABILITIES) {
    fields.name = draft.name.trim();
    fields.client_id = draft.contactId;
    fields.contact_id = draft.primaryContactId;
    return fields;
  }

  // Income, Expense, Asset.
  fields.gst_included = draft.gstIncluded && !propertyIncome ? "1" : "0";

  if (isMatching(draft)) {
    if (!propertyIncome) {
      fields.client_id = draft.contactId;
      fields.contact_id = draft.primaryContactId;
    }
    fields[MATCH_ID_FIELD[matchKindFor(draft.type, draft.accountId)]] =
      draft.matchIds;
    return fields;
  }

  fields.name = draft.name.trim();
  if (propertyIncome) return fields;

  if (isSuperContribution(draft.type, draft.accountId)) {
    fields.is_taxable = draft.taxable ? "1" : "0";
    if (draft.contactId) fields.fund_id = draft.contactId;
    return fields;
  }

  fields.client_id = draft.contactId;
  fields.contact_id = draft.primaryContactId;
  return fields;
}

/**
 * The contact person behind a client, from `/contact/list` — the list
 * sole-webapp's picker reads, where every row carries its own `contact_id`.
 * The `/client` list this form picks from only knows a client's
 * `primary_contact`, which is often empty. Prefers the contact named like
 * the client, otherwise the first one on it.
 */
export function contactIdForClient(
  clientId: string,
  clientName: string,
  contacts: { contactId: string; clientId: string; name: string }[],
): string {
  const onClient = contacts.filter((contact) => contact.clientId === clientId);
  const wanted = clientName.trim().toLowerCase();
  const named = onClient.find(
    (contact) => contact.name.trim().toLowerCase() === wanted,
  );
  return (named ?? onClient[0])?.contactId ?? "";
}

/** Whether this draft sends a `client_id`/`contact_id` pair at all. */
export function sendsContactPair(draft: ManualTransactionDraft): boolean {
  if (draft.type === CAPITAL || !draft.contactId) return false;
  if (isPropertyIncome(draft.type, draft.accountId)) return false;
  if (!isMatching(draft) && isSuperContribution(draft.type, draft.accountId)) {
    return false;
  }
  return true;
}

export type ManualTransactionResult =
  | { duplicate: false; message: string }
  | { duplicate: true; message: string };

/**
 * Creates the transaction. A `data.type` in the reply means the server found
 * a duplicate and didn't save — sole-webapp's duplicate dialog.
 */
export async function createManualTransaction(
  draft: ManualTransactionDraft,
  files: File[] = [],
): Promise<ManualTransactionResult> {
  const withFiles =
    !isMatching(draft) && (draft.type === EXPENSE || draft.type === ASSET);
  const body = buildEncryptedRequestBody(
    buildManualTransactionFields(draft),
    withFiles ? files : [],
  );

  const response = await api.post<ApiEnvelope<{ type?: unknown } | null>>(
    apiRoutes.bankTransaction.addTransactionMultiple,
    body,
  );

  const result = response.data;
  if (!result?.success) {
    throw new Error(result?.message || "Couldn't save the transaction.");
  }
  if (result.data && result.data.type !== undefined) {
    return {
      duplicate: true,
      message: result.message || "This transaction looks like a duplicate.",
    };
  }
  return { duplicate: false, message: result.message || "Transaction added" };
}

/* ------------------------------------------------------------------ *
 * Match categories — the bank row's "Suggested category" list
 * ------------------------------------------------------------------ */

export type CategoryGroup = { label: string; options: ManualAccount[] };

/** sole-webapp's `getSpecificCategories` exclusions, per parent category. */
const MATCH_EXCLUDED_BY_CATEGORY: Record<number, string[]> = {
  4: [
    "account receivable",
    "accounts receivable",
    "service income",
    "sales revenue",
    "general income",
  ],
  6: [
    "accounts receivable",
    "account receivable",
    "accumulated depreciation",
    "gst receivable",
  ],
};

/** Refund accounts belong to the refund flow, not a plain match. */
const VENDOR_REFUND_ACCOUNT_ID = "180";
const CLIENT_REFUND_ACCOUNT_ID = "181";
/** The one Capital account each side may use: owner input in, drawings out. */
const CAPITAL_INCOME_ACCOUNT_ID = "118";
const CAPITAL_EXPENSE_ACCOUNT_ID = "46";

/**
 * The categories sole-webapp's Match modal offers a bank line, grouped as its
 * `CategoryDropdown` groups them — so the row's dropdown and the modal agree.
 *
 * Money in: Income, then Capital Account (owner capital input only).
 * Money out: Expenses, then Assets, then Capital Account (drawings only).
 * The chart's own order is kept, as sole-webapp keeps it.
 */
export function matchCategoryGroups(
  accounts: ManualAccount[],
  direction: "Credit" | "Debit",
): CategoryGroup[] {
  const ofCategory = (categoryId: number, excludeId: string) => {
    const excluded = MATCH_EXCLUDED_BY_CATEGORY[categoryId] ?? [];
    return accounts.filter(
      (account) =>
        account.categoryId === categoryId &&
        account.id !== excludeId &&
        !!account.name &&
        !excluded.includes(account.name.toLowerCase()),
    );
  };
  const capital = (id: string) =>
    accounts.filter((account) => account.categoryId === 3 && account.id === id);

  const groups: CategoryGroup[] =
    direction === "Credit"
      ? [
          { label: "Income", options: ofCategory(4, VENDOR_REFUND_ACCOUNT_ID) },
          { label: "Capital Account", options: capital(CAPITAL_INCOME_ACCOUNT_ID) },
        ]
      : [
          { label: "Expenses", options: ofCategory(1, CLIENT_REFUND_ACCOUNT_ID) },
          { label: "Assets", options: ofCategory(6, CLIENT_REFUND_ACCOUNT_ID) },
          { label: "Capital Account", options: capital(CAPITAL_EXPENSE_ACCOUNT_ID) },
        ];

  return groups.filter((group) => group.options.length > 0);
}
