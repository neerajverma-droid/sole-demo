# Testing: Matching Rules, Payments, Expenses, Super Contributions, Multi-Business

Reference for test coverage across five modules: Matching Rules, Payments,
Expenses, Super Contributions, and Multi-Business. Each section below is
marked either **added by this engagement** (the file didn't exist before) or
**pre-existing** (built by the wider team across earlier commits on this same
branch — described here for completeness, not claimed as new work).

**Scope note**: this repo's full test suite has 50+ files spanning the whole
`feat/api-integration` branch — invoices, quotes, sales settings, the
business planner, assets, inventory, the bulk-import/migration module, the
onboarding survey, and more. Only the modules named above are covered here.

All files are Vitest unit tests — no browser, no rendering, just the same
mocked-`axios`/mocked-store convention already used across `lib/*.test.ts` in
this repo.

## Running them

```bash
npx vitest run                                    # everything in the repo
npx vitest run lib/solepay.test.ts                # one file
npx vitest run lib/expenses.test.ts lib/payments.test.ts   # a few
```

The files below, current as of this doc: **1218 tests pass repo-wide**; the
files this doc actually describes are itemised per module below.

| Module | New this engagement | Pre-existing (team) |
|---|---|---|
| Matching Rules | `stores/rules.ts` — audited, nothing to add (see below) | `lib/rules.test.ts` (65 tests) |
| Payments | `lib/payments.test.ts` (36), `components/payments/payment-gateways.test.ts` (10), `utils/authSession.test.ts` (7) | — |
| Expenses | `lib/expenses.test.ts` (54), `components/expenses/expenses-filters.test.ts` (8), `lib/company-contacts.test.ts` (4) | — |
| Super Contributions | `stores/super.test.ts` (4) | `lib/super.test.ts` (41 tests) |
| Multi-Business | `stores/businesses.test.ts` (23) | `lib/businesses.test.ts` (21), `components/businesses/business-profile-form.test.ts` (16) |

---

## Matching Rules

### `lib/rules.test.ts` (pre-existing, 65 tests)

Bank-feed auto-categorization rules. Covers rule-sentence formatting
(`conditionSentence`/`previewSentence`), numeric-comparison validation
(`isNumericComparison`/`ruleValueError`), the full `ruleIssues` validator,
list filtering (`filterRules`/`filterRuleCategories`), draft seeding
(`emptyRuleDraft`/`draftFromRule`), every real API call (`fetchRuleDetail`,
`fetchRules`, `createRuleApi`, `updateRuleApi`, `deleteRuleApi`,
`fetchRuleCategories`, `syncRuleApi`, `fetchRuleSyncStats`), and the sync
progress/amount-sign helpers (`syncProgressPercent`/`signedSyncAmount`).

### `stores/rules.ts` — audited, no dedicated test file

`useRulesStore` (rules list, `syncingRuleId`, `lastSync`) is three plain
setters with no branching logic beyond `setRules` also flipping `hydrated` —
there's nothing here that isn't already exercised by definition once a
caller sets a value. Left undocumented-by-a-test-file deliberately, rather
than adding a test that would only re-assert what Zustand's own `set` does;
compare to `stores/super.ts`/`stores/businesses.ts` below, which have real
guard logic worth pinning down. Verbatim, in full:

```ts
export type LastSyncResult = { ruleName: string; matched: number };

type RulesState = {
  rules: Rule[];
  hydrated: boolean;
  setRules: (rules: Rule[]) => void;
  syncingRuleId: string | null;
  setSyncingRuleId: (id: string | null) => void;
  lastSync: LastSyncResult | null;
  setLastSync: (result: LastSyncResult | null) => void;
};

export const useRulesStore = create<RulesState>()((set) => ({
  rules: [],
  hydrated: false,
  setRules: (rules) => set({ rules, hydrated: true }),
  syncingRuleId: null,
  setSyncingRuleId: (id) => set({ syncingRuleId: id }),
  lastSync: null,
  setLastSync: (result) => set({ lastSync: result }),
}));
```

### Real contract — `lib/rules.ts`

**Types** (verbatim):

```ts
export const RULE_TYPES = ["Credit (income)", "Debit (expense)"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const RULE_CHECKS = ["Description", "Amount", "Reference", "Counterparty"] as const;
export type RuleCheck = (typeof RULE_CHECKS)[number];

export const RULE_COMPARES = ["Contains", "Equals", "Starts with", "Greater than", "Less than"] as const;
export type RuleCompare = (typeof RULE_COMPARES)[number];

export const RULE_CATEGORIES = [
  "Sales income", "Consulting income", "Software", "Rent", "Office supplies", "Disposal of asset",
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export const RULE_FILTERS = ["All", "Income", "Expense"] as const;
export type RuleFilter = (typeof RULE_FILTERS)[number];

export type Rule = {
  id: string;
  name: string;
  type: RuleType;
  check: RuleCheck;
  compare: RuleCompare;
  /** Any one matching is enough. */
  values: string[];
  /** `account_subcategory_id` — what's actually posted to the API. */
  categoryId: string;
  /** Only the list/add/update/delete response carries it — the `get` detail
   *  endpoint doesn't — so it's blank right after a fresh detail fetch. */
  categoryName: string;
  accountCategoryName: string;
  clientId: string | null;
  clientName: string;
  /** A Debit rule's own free-text "Expense / Asset" label. Required for
   *  Debit, unused and always sent blank for Credit. */
  assignName: string;
  gst: boolean;
};

export type RuleDraft = Omit<Rule, "id" | "categoryName" | "accountCategoryName">;

export type RuleIssue = { key: string; message: string };
export type RuleCategoryOption = { id: string; name: string; parentName: string };
export const ALL_RULES_ID = "__all__";

export type SyncResult = { matched: number; totalMatched: number; totalUnmatched: number };

export type RecentlyMatchedTransaction = {
  id: string;
  description: string;
  type: "credit" | "debit";
  categoryName: string;
  clientName: string;
  amount: number;
};

export type RuleSyncStats = {
  autoMatchCount: number;
  matched: number;
  unmatched: number;
  total: number;
  /** Newest first, already capped to 10 by the backend. */
  recentlyMatched: RecentlyMatchedTransaction[];
};
```

**Pure functions** (signature + the one non-obvious rule each has):

- `emptyRuleDraft(): RuleDraft` — defaults: `type: "Credit (income)"`, `check: "Description"`, `compare: "Contains"`, `values: []`, `gst: true`.
- `draftFromRule(rule: Rule): RuleDraft` — drops `id`/`categoryName`/`accountCategoryName`, copies the rest (`values` is a new array, not the same reference).
- `conditionSentence(rule: Pick<Rule,"check"|"compare"|"values">): string` — `` `${check} ${compare.toLowerCase()} "${values.join(", ") || "…"}"` ``.
- `previewSentence(draft: Pick<Rule,"check"|"compare"|"values">): string` — `` `If transaction ${check.toLowerCase()} ${compare.toLowerCase()} "${values.join(", ") || "your value"}", then categorise it accordingly.` ``.
- `isNumericComparison(check: RuleCheck, compare: RuleCompare): boolean` — `true` if `check === "Amount"` OR `compare` is `"Greater than"`/`"Less than"`.
- `ruleValueError(value, check, compare): string | undefined` — `undefined` for a blank value; only checked when `isNumericComparison` is true; regex `/^\d+(\.\d+)?$/`, else `"Enter a valid number — no letters or negatives."`.
- `ruleIssues(draft: RuleDraft): RuleIssue[]` — `name.trim().length < 2` fails (1-char name is invalid); `values.length === 0` fails; `!categoryId` fails; `!clientId && !clientName.trim()` fails with a message that differs by `type` ("Select a client…" for Credit, "Select a supplier…" for Debit); `type === "Debit (expense)" && !assignName.trim()` fails.
- `filterRules(rules, filter, query): Rule[]` — `filter` narrows by `type` first; `query` (trimmed, lowercased) then matches against `name`, `categoryName`, `accountCategoryName`, or `conditionSentence(rule)`.
- `filterRuleCategories(categories: RuleCategoryOption[], type: RuleType): RuleCategoryOption[]` — the most intricate rule in the file:
  - Credit wants parents `["income", "liabilities"]` (case-insensitive, trimmed); Debit wants `["expenses", "assets", "liabilities"]`.
  - Within `income`, these subcategory names are excluded even though the parent matches: `"account receivable", "accounts receivable", "service income", "sales revenue", "general income"`.
  - Within `assets`, excluded: `"accounts receivable", "account receivable", "accumulated depreciation", "gst receivable"`.
  - `liabilities` has no exclusions.
  - A category whose parent is `"capital"` passes ONLY if its own subcategory name matches: `"owner capital input"` for Credit, `"drawings"` for Debit — every other Capital subcategory is dropped for both types.
- `syncProgressPercent(stats: Pick<RuleSyncStats,"matched"|"total">): number` — `Math.round((matched/total)*100)`, or `0` if `total <= 0`.
- `signedSyncAmount(detail: Pick<RecentlyMatchedTransaction,"type"|"amount">): string` — `` `+${money}` `` for `type === "credit"`, else `` `-${money}` ``, `money = invoiceMoney(Math.abs(amount))`.

**Real API calls** (`BASE_URL` = `process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`):

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchRuleDetail(id: string): Promise<Rule>` | POST | `apiRoutes.matchingRules.get` → `/v2/matching-rules/get` | `buildEncryptedRequestBody({ id })` | `{success, message?, data?: {rule: ApiRuleDetail}}` | Throws `message \|\| "Rule not found."` if `!success` or no rule. |
| `fetchRules(): Promise<Rule[]>` | GET | `apiRoutes.matchingRules.getAll` → `/v2/matching-rules` | — | `{success, data?: {rules: [...]}}` | **Deliberately never checks `success`** — the backend reports `success:false` for a genuinely empty list, so this always returns `data.rules ?? []` regardless. Internally calls `fetchRuleDetail` per row (concurrently, via `Promise.all`), swallowing individual failures with `.catch(() => null)` and falling back to the list row's own fields for any row whose detail fetch failed. |
| `createRuleApi(draft: RuleDraft): Promise<Rule[]>` | POST | `apiRoutes.matchingRules.add` → `/v2/matching-rules/add` | `buildEncryptedRequestBody({transaction_type, name, condition_type, condition, condition_val: JSON.stringify(values.map(trim).filter(Boolean)), account_subcategory_id, client_id, assign_name, gst_include: gst?1:0})` | `{success, message?, data?: {rules}}` | Throws on `!success`. `assign_name` is always sent as `""` for Credit rules. |
| `updateRuleApi(id, draft): Promise<Rule[]>` | POST (not PATCH) | `apiRoutes.matchingRules.update` → `/v2/matching-rules/update` | Same fields as create, plus `id` | Same envelope | — |
| `deleteRuleApi(id): Promise<Rule[]>` | POST | `apiRoutes.matchingRules.delete` → `/v2/matching-rules/delete` | `buildEncryptedRequestBody({ id })` | Same envelope | — |
| `fetchRuleCategories(): Promise<RuleCategoryOption[]>` | GET | `apiRoutes.accountCategory.list` → `/account-categories/list` | — | `{success, data?: {account_categories: [...]}}` | Flattens every category's `account_subcategories` into one flat list; no `success` check, defaults to `[]`. |
| `syncRuleApi(ruleId: string \| null): Promise<SyncResult>` | POST | `apiRoutes.matchingRules.matchTransSync` → `/v2/transactions-matching-rules` | `buildEncryptedRequestBody(ruleId ? {rule_id: ruleId} : {})` | `{success, message?, data?: {matched?, total_matched?, total_unmatched?}}` | Throws on `!success`; `ruleId: null` means "run every rule". |
| `fetchRuleSyncStats(): Promise<RuleSyncStats>` | GET | `apiRoutes.matchingRules.matchTransSyncStats` → `/v2/transactions-auto-match-count` | — | `{success, data?}` | Never checks `success`, always resolves with defaults. `recentlyMatched[].id` prefers `transaction_id`, falls back to `id`; `type` defaults to `"debit"` unless the raw value is exactly `"credit"`. |

**Backend quirk worth a dedicated test** — the condition/check mapping is lossy both directions:
```ts
const RULE_CHECK_TO_API = { Description: "DESCRIPTION", Reference: "DESCRIPTION", Counterparty: "DESCRIPTION", Amount: "AMOUNT" };
// (the backend only ever compares description OR amount — Reference/Counterparty both collapse to DESCRIPTION)

const RULE_COMPARE_TO_API = { Contains: "CONTAIN", "Starts with": "CONTAIN", Equals: "EQUAL", "Greater than": "GREATER", "Less than": "LESSER" };
// (no backend "starts with" condition exists, so it's sent as CONTAIN)

const API_TO_RULE_COMPARE = { CONTAIN: "Contains", EQUAL: "Equals", GREATER: "Greater than", "GREATER EQUAL": "Greater than", LESSER: "Less than", "LESSER EQUAL": "Less than" };
// (reading back: both GREATER and "GREATER EQUAL" map to "Greater than" — a round-trip test should not assume the reverse mapping is 1:1)
```
Also: `condition_val` is a JSON-stringified array on the wire; a bare non-JSON string in the response is treated as a single value. `gst` is `true` only when the raw `gst_include` numerically equals `1` (`Number(raw.gst_include) === 1`).

---

## Expenses

### `lib/expenses.test.ts`

The expense list, its real API, and its client-side fallback filtering.

- **Real API shape** — `fetchExpenses`/`fetchExpenseDetail`: invoice number
  preferred over the raw invoice id, receipt/attachments only populated from
  a *detail* response (a list row never carries `documents[]`).
- **Server-side pagination** — `fetchExpensesPage`: `page`/`page_size`,
  `filter_by[name]` (trimmed search), `filter_by[matched]` for the status
  pill, `sort_by[date|price]` (and *no* `sort_by` at all for "Supplier A–Z",
  since that sort has no server-side equivalent), the real date-range/
  price-range/paid-with-cash filter params, and the total/rows mapping.
- **Client-side fallback** (`filterExpenses`) — used only when a
  category/supplier filter or the Supplier A–Z sort is active, since
  `sole-ocr`'s own `filter_by[account_subcategory_id]`/`filter_by[client_id]`
  array filters are confirmed broken server-side (true of sole-webapp's own
  reference too, not something this app introduced). Covers status,
  category, supplier, free-text search (name/supplier/category), date range,
  price range, paid-with-cash, and all of the above combined.
- `sortExpenses` (Supplier A–Z, doesn't mutate its input) and
  `expenseCategoriesInUse`.
- Attachment upload/delete (`uploadExpenseAttachment`, `deleteExpenseAttachment`)
  — including that the delete call sends the document id as a **query
  param**, not just a URL path segment, because the real backend controller
  only ever reads `req.query`/`req.body` for that route.
- **Split-amount payload** (`createExpenseApi`/`updateExpenseApi`) — `is_split`,
  `business_amount`/`personal_amount` string formatting, and the full field
  set matching sole-webapp's real create payload (`project_id`,
  `contact_id`, `transaction_date`, `is_asset`).
- `draftFromExpense` — the split-amount seeding bug fix (Price seeded from
  `totalAmount`, Business amount from the effective `amount`).
- `fetchExpenseCategories` — excludes Super Contribution (id 140), the one
  real exclusion sole-webapp's own form applies.
- **Bulk actions** — `bulkDeleteExpensesApi` (real backend message surfaced
  verbatim, not a generic count, since a mixed selection can silently skip
  reconciled rows) and `fetchExpenseAttachmentsZip` (base64 zip payload; the
  backend answers HTTP 200 even on failure, so success is read from the body).

### `components/expenses/expenses-filters.test.ts`

`activeFilterCount` — the popover's filter-count badge. Confirms each facet
(status, date range, price range, paid-with-cash, category, supplier) counts
as exactly one active filter regardless of how many values are picked within
it, and that they sum correctly when several are active together.

### `lib/company-contacts.test.ts`

`fetchCompanyContacts` — the real per-contact picker (`GET /contact/list`)
behind both the expense form's Supplier field and the expense filter's
supplier list. Confirms `type=2` for a supplier vs `type=1` for a client
(merged with the real `filter_by[scope]=all` default), that the contact's own
id (`contact_id`) is mapped distinctly from the client it belongs to
(`client_id`) — the two are genuinely different ids, not a rename — the
business-name-or-fall-back-to-contact-name display logic, and that a row with
no `client_id` at all is dropped rather than shown as an unusable option.

### Real contract — `lib/expenses.ts` and `lib/company-contacts.ts`

**`Expense` type** (verbatim, the shape every fixture below is built from):

```ts
export type Expense = {
  id: string;
  /** ISO YYYY-MM-DD. */
  date: string;
  description: string;
  /** Null once the contact is deleted; supplierName is then the record. */
  supplierId: string | null;
  supplierName: string;
  /** A different id space than supplierId (company) — the specific contact
   *  (person) picked at the supplier. Real, server-validated. */
  contactId: string | null;
  contactName: string;
  category: string;
  /** account_subcategory_id — what's actually posted to the API. */
  categoryId: string;
  /** GST-inclusive — the figure on the receipt. */
  amount: number;
  gst: boolean;
  paymentMethod: PaymentMethod; // "Cash" | ... — see PAYMENT_METHODS
  paidAmount: number;
  status: ExpenseStatus; // "Matched" | "Pending"
  invoiceId: string | null;
  /** That invoice's own reference (e.g. "invoice12") — the real display column, never the raw id. */
  invoiceNo: string | null;
  transactionRef: string | null;
  journalEntryId: string | null;
  bankDescription?: string;
  cardLast4?: string;
  vendorNote: string;
  receipt: ExpenseReceipt | null;
  /** Only ever populated from a DETAIL response (documents[]) — a list row never carries this. */
  attachments: ExpenseAttachment[];
  possibleMatch: number;
  creditNoteId: string | null;
  creditNoteNo: string | null;
  /** amount is already just the business portion once split. */
  isSplit: boolean;
  /** The full original amount, before the personal portion was split out. */
  totalAmount: number;
};

export type ExpenseDraft = Omit<
  Expense,
  "id" | "status" | "possibleMatch" | "creditNoteId" | "creditNoteNo" | "isSplit" | "totalAmount" | "invoiceNo" | "attachments"
> & {
  /** sole-webapp's "Split Amount" toggle. Off by default. */
  splitEnabled: boolean;
  /** The business portion of `amount`, once split is on. Ignored otherwise. */
  businessAmount: number;
};

export type ExpenseListFilters = {
  search?: string;
  /** Omit for "All". */
  status?: "Matched" | "Pending";
  sort?: ExpenseSort;
  /** ISO YYYY-MM-DD, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  minPrice?: number;
  maxPrice?: number;
  paidWithCash?: boolean;
};

export type ExpensesPage = { expenses: Expense[]; total: number };
export type ExpenseCategoryOption = { id: string; name: string };
```

**`CompanyContact` type** (verbatim, from `lib/company-contacts.ts`):
```ts
export type CompanyContact = {
  contactId: string;
  clientId: string;
  name: string;   // the contact — a person
  email: string;
  clientName: string; // the company they belong to
};
```

**`draftToApiFields(draft: ExpenseDraft)`** (verbatim — the exact wire payload `createExpenseApi`/`updateExpenseApi` send):

```ts
function draftToApiFields(draft: ExpenseDraft): Record<string, unknown> {
  // `price` is always the total — the business/personal split is carved out
  // of it via these two, sent even when split is off, so an edit that turns
  // it off clears any prior split cleanly instead of leaving stale amounts.
  const businessAmount = draft.splitEnabled ? draft.businessAmount : draft.amount;
  const personalAmount = Math.max(0, draft.amount - businessAmount);

  return {
    name: draft.description.trim(),
    price: draft.amount,
    date: draft.date,
    account_subcategory_id: draft.categoryId || undefined,
    client_id: draft.supplierId ?? undefined,
    contact_id: draft.contactId ?? undefined,
    gst: draft.gst ? 1 : 0,
    paid_with_cash: draft.paymentMethod === "Cash" ? 1 : 0,
    is_split: draft.splitEnabled ? 1 : 0,
    business_amount: businessAmount.toFixed(2),
    personal_amount: personalAmount.toFixed(2),
    // Real, stored server-side (unlike the two below), but there's no
    // project picker on this form to source a real id from.
    project_id: null,
    // Confirmed inert in sole-ocr's createExpense/updateExpense — read
    // nowhere (is_asset) or read but never persisted (transaction_date).
    // Sent anyway only because sole-webapp's own form does; neither changes
    // anything if dropped.
    transaction_date: draft.date,
    is_asset: "no",
  };
}
```

**Real API calls**:

| Function | Method | Route | Body / params | Response | Notes |
|---|---|---|---|---|---|
| `fetchExpenses(): Promise<Expense[]>` | GET | `apiRoutes.expense.listOcr` → `/expense/list` | `{page: 1, page_size: <FETCH_ALL_LIMIT>}` | `{success, data?: {expense_details: [...]}}` | The "fetch everything" variant used for client-side filtering. |
| `fetchExpensesPage(page, pageSize, filters: ExpenseListFilters): Promise<ExpensesPage>` | GET | same route | `page`, `page_size`, plus conditionally: `filter_by[name]` (trimmed search), `filter_by[matched]` (1 for Matched, 0 for Pending), `filter_by[start_date]`/`filter_by[end_date]`, `filter_by[min_price]`/`filter_by[max_price]`, `filter_by[paid_with_cash]: 1`, and `sort_by[date]`/`sort_by[price]` (`"asc"`/`"desc"`) — **no `sort_by` at all for "Supplier A–Z"**, since there's no server-side equivalent | `{success, data?: {expense_details, total?}}` | `total` falls back to `rows.length` if the server omits it. |
| `fetchExpenseDetail(id): Promise<Expense>` | GET | `` `${apiRoutes.expense.info}${id}` `` (`/v2/expense/{id}`) | — | `{success, data?}` | Throws `message \|\| "Expense not found."` if `!success` or no row. This is the ONLY call that populates `receipt`/`attachments`. |
| `createExpenseApi(draft, file?): Promise<{id}>` | POST | `apiRoutes.expense.addV2` → `/v2/expense/` | `buildEncryptedRequestBody(draftToApiFields(draft), file ? [file] : [])` — see exact fields above | `{success, data?: {id}}` | Throws if `!success \|\| data.id == null`. |
| `updateExpenseApi(id, draft): Promise<void>` | POST | `apiRoutes.expense.updateV2` → `/v2/expense/edit` | `buildEncryptedRequestBody({id, ...draftToApiFields(draft)})` | `{success}` | `id` travels in the body, not the URL — the route never changes. |
| `bulkDeleteExpensesApi(ids): Promise<{message}>` | POST | `apiRoutes.expense.delete` → `/v2/expense/bulk-delete` | `buildEncryptedRequestBody({expenses: ids})` | `{success, message}` | Same endpoint for a single row (the row menu's own Delete). **The real backend message is surfaced verbatim** (e.g. `"3 expense(s) deleted. 1 reconciled expense(s) skipped."`) rather than a generic count, since a mixed selection can silently skip reconciled rows and the response carries no ids to know which. A selection that's entirely reconciled fails outright (`success:false`). |
| `fetchExpenseAttachmentsZip(ids): Promise<string>` | POST | `apiRoutes.expense.download` → `/v2/expense/download` | `buildEncryptedRequestBody({expenses: ids})` | `{success, data?: {zip?}}` | **The backend always answers HTTP 200, even on failure** — no receipts found comes back as `success:false` with a message, not an HTTP error. Throws if `!success \|\| !zip`. |
| `markExpenseInvoicedApi(expenseId, invoiceId, invoiceNo): Promise<void>` | POST | `apiRoutes.expense.markInvoiced` → `/expense/mark-invoiced` | `buildEncryptedRequestBody({expense_id, invoice_id, invoice_no})` | `{success}` | Called once the "Convert to Invoice" drawer reports a saved invoice. |
| `uploadExpenseAttachment(expenseId, file): Promise<{documentId}>` | POST | `apiRoutes.expense.uploadAttachment` → `/v2/expense/attachments` | `FormData` — plain multipart, **not encrypted** (`expense_id` field + `files[]`) | `{success, data?: {document_id?, document_ids?}}` | `documentId` prefers `document_id`, falls back to the LAST entry of `document_ids`. |
| `deleteExpenseAttachment(documentId): Promise<void>` | DELETE | `` `${apiRoutes.expense.deleteAttachment}/${documentId}` `` → `/v2/expense/attachments/{id}` | `{params: {document_id: documentId}}` | `{success}` | **Sends the id as a query param, not just the URL path** — the real backend controller never reads `req.params` for this route, only `req.query`/`req.body`, so a delete that only relies on the path segment silently no-ops server-side. |
| `fetchExpenseCategories(): Promise<ExpenseCategoryOption[]>` | GET | `apiRoutes.accountCategory.list` → `/account-categories/list` | — | `{success, data?: {account_categories}}` | Reads only the `"Expenses"` branch of the chart of accounts (case-insensitive name match) and excludes subcategory id `140` ("Super Contribution") — the one real exclusion sole-webapp's own form applies. |
| `fetchCompanyContacts(type: "Client"\|"Supplier"): Promise<CompanyContact[]>` | GET | `apiRoutes.companyContact.list` → `/contact/list` | `{type: type==="Client"?1:2, "filter_by[scope]": "all"}` | `{success, data?: ApiCompanyContactRow[]}` | `filter_by[scope]=all` merges in the global-default contacts (Amazon, Google, etc.) every account shares. Drops any row with no `client_id`. **No search param exists on this endpoint** (confirmed against sole-ocr) — narrowing by what's typed is the caller's own job. |

**Client-side fallback** — `filterExpenses(expenses, options)` (status/category/supplier/query/date range/price range/paid-with-cash) is used only when a category/supplier filter or the "Supplier A–Z" sort is active, because `sole-ocr`'s own `filter_by[account_subcategory_id]`/`filter_by[client_id]` only work as a single scalar server-side (an array is silently mishandled) — confirmed true of sole-webapp's own reference implementation too, not something this app introduced.

---

## SolePay onboarding

### `lib/solepay.test.ts`

The Entity/Director/Accounts/Documents onboarding flow that talks to the real
Worldpay merchant-boarding endpoints. This is the file to check before
touching the wire-format mapping — several of its tests exist specifically to
pin down bugs found and fixed during implementation:

- **Wire conversions** — `percentToBasisPoints`/`basisPointsToPercent`
  (ownership: `"25.3"` ↔ `"2530"`, round-trips without drift),
  `formatDobForWire`/`parseDobFromWire` (`YYYY-MM-DD` ↔ Worldpay's `YYYYMMDD`).
- `isValidAustralianAbn` (real modulus-89 checksum) and `isValidSolePayPhone`
  (Worldpay's AU-specific shape) — kept as tested utilities, but **not**
  invoked by the client-side validators below; see next point.
- **Client validation matches the real form, not a guess** —
  `entityIssues`/`directorIssues` intentionally do *not* enforce the ABN
  checksum, the AU state-code list, or the strict AU phone shape, because
  sole-webapp's own `EntitySchema`/`MemberSchema` don't either (plain digit-
  count/length checks only) — those three are backend-only checks. Tests
  confirm a 11-digit non-checksum ABN, an out-of-range state, and a "no +61
  local-zero" phone all pass client-side.
- **Backend-reported errors, surfaced after a real Save** —
  `entityInvalidIssues`/`directorInvalidIssues` map Worldpay's own
  `grouped_invalid` field paths (`entity.abn`, `member.dob`, etc.) to the
  local field keys and to sole-webapp's exact wording, so a save that
  succeeds but that Worldpay itself flags (bad checksum, bad state code)
  still shows an error instead of silently navigating away.
- **Document slots** — `requiredDocumentSlots`/`documentsDone`: confirms
  Billing Bank Statement is unconditional and Settlement Bank Statement is
  the one that drops away when accounts are mirrored — the two were
  originally swapped from sole-webapp's real `WorldpayDocuments.js`, and this
  test exists specifically to keep that fixed. Also the conditional Trust
  Agreement slot (Trustee entities only).
- **Phone defaults to +61** — a fresh entity/director, and a fetched draft
  with no phone saved yet, both open on `"+61"` rather than blank; a real
  saved number is never overridden.
- **All four real API calls**, each against a realistic mocked response:
  - `fetchSolePayDraft` — `GET /worldpay/merchant/draft/status`; maps a full
    real response, and the "no draft yet" shape, into the local state +
    meta (`isComplete`, `groupedMissing`, `groupedInvalid`).
  - `saveSolePayDraft` — `POST /worldpay/merchant/draft`; a **plain JSON**
    body (confirmed the real controller has no decrypt step, unlike most of
    this app's other POSTs), `entity.type`/`Members[0].typeofid` sent as
    real numbers (not the local string ids), accounts nested under
    `entity.accounts`, and both a mirrored and a two-distinct-accounts case.
  - `uploadSolePayDocuments` — `POST /worldpay/merchant/draft/attachments`;
    files renamed with the exact prefix (`identification_front_…`, etc.) the
    backend's `inferAttachmentKind` keys off, and the result deliberately
    carries only `documents`+`meta` — not a full state — because the real
    upload response has no `entity`/`member`/`accounts` keys, so mapping it
    through the full draft shape would wipe out what's already in the atom.
  - `submitSolePayDraft` — `POST /worldpay/merchant/draft/submit`.

---

## Payments (gateways + transactions)

### `lib/payments.test.ts`

The gateway "linking" (connection checks) and "listing" (transaction
fetching) logic behind the Payments screen.

- **Linking** — `checkWorldpayConnection` (real `POST` with `{ user_id }` —
  this endpoint has **no GET route on the backend at all**, confirmed
  against `sole-ocr`'s `payrixCompat.js`; only `merchant_status ===
  "completed"` counts as connected) and `checkStripeConnection` (real `GET`,
  gated on `onboarding_complete`). Both resolve to `false` rather than
  throwing on a request failure, since a connection check that can't reach
  the provider shouldn't crash the screen.
- **Listing** — `fetchWorldpayTransactions`/`fetchStripeTransactions`: real
  `page`/`per_page` params, raw-row → `Payment` mapping (including Stripe's
  four-way status normalization — `succeeded`/`processing`/`failed`/
  `refunded` → `Settled`/`Processing`/`Failed`/`Refunded`), and the
  pagination-envelope fallback when the server omits one. Plus
  `fetchStripeStats`.
- **Shared pure helpers** — `paymentStats` (only `Settled`/`Processing` rows
  count toward totals — a refund or a failure never took the money),
  `netAmount`'s fallback, `feeRate`, `manageableGateways` (only a connected
  gateway with its own dashboard url — Stripe today, not SolePay/NextTap,
  since this screen *is* their dashboard), `paymentStatusVariant`,
  `formatPaymentMoney` (always `$`-prefixed regardless of the `currency`
  argument — matches the real display, not a bug), `formatPaymentDate`, and
  the real `GATEWAYS` list itself (exactly `stripe`/`sole-pay`/`nexttap`, in
  that order).

### `components/payments/payment-gateways.test.ts`

The two pure status-derivation functions behind the gateway cards —
`calcStripeProgress` and `normaliseSolePayStatus` — exported from the
component file specifically for this, the same convention
`business-profile-form.tsx` already uses elsewhere in this repo (no
component-rendering test setup exists in this project, so these stay plain
function tests). Covers the 0/33/67/100% Stripe progress steps, and every
real "complete" signal SolePay's merchant record can carry
(`is_complete`, `action: "complete"`, and the `completed`/`complete`/
`approved` status strings, case-insensitively).

### `utils/authSession.test.ts`

`getUserIdFromToken()` — the helper both `checkWorldpayConnection` and
`SolePayGatewayCard` need a real `user_id` for, decoded straight out of the
access token's own JWT payload (nothing else in the app hands this back).
Exercised end-to-end through the real cookie → `getAccessToken` →
`getUserIdFromToken` path, stubbing just `document.cookie` rather than
pulling in a full jsdom environment (this repo's Vitest config runs plain
`node`, and no other test file needs a DOM). Covers a real token's `user_id`,
the `sub` fallback, no session, a malformed token, a token missing both
claims, and clearing the session.

### Real contract — `lib/payments.ts`

**Types** (verbatim):

```ts
export const PAYMENT_TABS = ["Gateways", "SolePay Payments", "Stripe Payments"] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number];

export type GatewayPagination = { current_page: number; total_pages: number; per_page: number; total: number };
export type GatewayAvailability = "available" | "coming-soon";
export type GatewayStatus = "not-started" | "onboarding" | "pending" | "connected" | "coming-soon";

export type Gateway = {
  id: string;
  name: string;
  summary: string;
  features: string[];
  pricing: string;
  /** The provider's own dashboard — absent for a provider managed inside this app (SolePay, NextTap). */
  dashboardUrl?: string;
  availability: GatewayAvailability;
  status: GatewayStatus;
  logoSrc?: string;
  actionHref?: string;
  icon: LucideIcon;
};

export const GATEWAYS: Gateway[] = [
  { id: "stripe", name: "Stripe", dashboardUrl: "https://dashboard.stripe.com/payments", status: "onboarding", /* ... */ },
  { id: "sole-pay", name: "Sole pay", status: "not-started", /* no dashboardUrl — this screen IS its dashboard */ },
  { id: "nexttap", name: "NextTap", status: "not-started", /* no dashboardUrl */ },
]; // exactly these three, in this order

export const PAYMENT_STATUSES = ["Settled", "Processing", "Refunded", "Failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentType = "Card" | "Bank transfer" | "Tap to pay" | "credit" | "debit" | string;

export type Payment = {
  id: string;
  date: string;
  category: string;
  categoryType?: string;
  invoiceNo: string;
  invoiceNumber?: string | null;
  description: string;
  type: PaymentType;
  /** What the customer paid. */
  amount: number;
  processingFee: number;
  /** Backwards-compat alias for processingFee. */
  fee: number;
  netAmount: number;
  status: PaymentStatus | string;
  currency?: string;
  feeCurrency?: string;
  settlementAmount?: number;
  settlementCurrency?: string;
  transactionId?: string;
  originalAmount?: number;
  gatewayId?: string;
};

export type PaymentStats = { total: number; fees: number; count: number; net: number };
export type StripeStats = {
  net_amount?: number | null;
  total_credits?: number | null;
  processing_fees?: number | null;
  transactions_count?: number | null;
  /* plus *_by_currency maps for multi-currency accounts */
};
export type PaymentsPage = { payments: Payment[]; pagination: GatewayPagination };
```

**Pure functions** (signature + rule):

- `netAmount(payment): number` — prefers `payment.netAmount` if it's a real number, else `amount - (processingFee ?? fee ?? 0)`.
- `paymentStats(payments): PaymentStats` — **only rows with `status === "Settled" || "Processing"` count toward totals** (a refund or failure never took the money); sums `amount`, fee, `netAmount(payment)`, and `count`.
- `feeRate(stats): string` — `"No payments yet"` if `stats.total <= 0`, else `` `${(fees/total*100).toFixed(1)}% of takings` ``.
- `manageableGateways(connectedIds: string[]): Gateway[]` — keeps only connected gateways that ALSO have a `dashboardUrl`, in the given connection order. Today that's Stripe only (SolePay/NextTap have none — this screen is their own dashboard).
- `paymentStatusVariant(status)` — `Settled→"success"`, `Processing→"warning"`, `Refunded→"secondary"`, `Failed→"danger"`.
- `formatPaymentMoney(amount, currency="USD")` — **always `$`-prefixed regardless of the `currency` argument** (that parameter is otherwise unused — this matches the real display, not a bug); `Math.abs()` of the amount; `$0.00` for zero/null/undefined.
- `formatPaymentDate(dateStr)` — accepts a UNIX timestamp (seconds or ms, disambiguated by magnitude `> 1e11`), an ISO `YYYY-MM-DD`, or an already-formatted `"DD Month, YYYY"` string (passed through unchanged); em dash `"—"` for null/undefined.

**Real API calls**:

| Function | Method | Route | Body / params | Response | Notes |
|---|---|---|---|---|---|
| `checkWorldpayConnection(userId): Promise<boolean>` | POST | `apiRoutes.payrix.getMerchantAccount` → `/v1/payrix/getMerchantAccount` | `{ user_id: userId }` | `{success, data?: {merchant_status?}}` | **This endpoint has no GET route on the real backend at all** (confirmed against sole-ocr's `payrixCompat.js` — only `router.post` is registered). Only `merchant_status === "completed"` → `true`. Resolves `false` (never throws) on any request failure. |
| `checkStripeConnection(): Promise<boolean>` | GET | `apiRoutes.stripeConnect.account` → `/stripe-connect/account` | — | `{success, data?: {account?: {onboarding_complete?}}}` | `true` only if `success` AND `account.onboarding_complete`. Resolves `false` on failure. |
| `fetchWorldpayTransactions(page=1, perPage=15): Promise<PaymentsPage>` | GET | `apiRoutes.payrix.report` → `/v1/payrix/reports` | `{params: {page, per_page: perPage}}` | `{status: boolean, data?: PayrixApiTransaction[], pagination?}` | Note the envelope flag is `status`, not `success`, for this one endpoint. Maps `amount_settled ?? amount`, `Math.abs(fees_deducted)`, `net_amount ?? amount_settled ?? amount`; `invoiceNo` defaults to `"N/A"` (and `invoiceNumber` becomes `null` when it is). `gatewayId: "sole-pay"` always. |
| `fetchStripeTransactions(page=1, perPage=15): Promise<PaymentsPage>` | GET | `apiRoutes.stripeConnect.transactions` → `/stripe-connect/transactions` | `{params: {page, per_page: perPage}}` | `{success, data?: {transactions?, pagination?}}` | Status normalization: `succeeded/paid/pending→Settled`, `processing/complete→Processing`, `failed→Failed`, `refunded/canceled/cancelled→Refunded`, anything else→`Settled`. `gatewayId: "stripe"` always. |
| `fetchStripeStats(): Promise<StripeStats \| null>` | GET | `apiRoutes.stripeConnect.transactionStats` → `/stripe-connect/transactions/stats` | — | `{success, data?}` | Returns `null` (never throws) on `success:false` or a request failure. |

Both `fetchXTransactions` functions fall back to a single-page pagination envelope (`{current_page: page, total_pages: 1, per_page: perPage, total: rows.length}`) when the server response omits `pagination`.

### Real contract — `components/payments/payment-gateways.tsx`

```ts
export type StripeAccount = {
  stripe_account_id?: string | null;
  onboarding_complete?: boolean;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
};

export function calcStripeProgress(account: StripeAccount | null): number {
  if (!account?.stripe_account_id) return 0;
  if (account?.onboarding_complete) return 100;
  const done = [account?.details_submitted, account?.charges_enabled, account?.payouts_enabled];
  return Math.round((done.filter(Boolean).length / done.length) * 100); // 0, 33, 67, or 100
}

export type SolePayMerchant = {
  merchant_status?: string;
  application_status?: string;
  merchant_id?: string;
  merchant_app_id?: string;
  is_complete?: boolean;
  action?: string;
};

export function normaliseSolePayStatus(merchant: SolePayMerchant | null): {
  isComplete: boolean; isDraft: boolean; progress: number; progressLabel: string;
} {
  if (!merchant) return { isComplete: false, isDraft: false, progress: 0, progressLabel: "Not started" };
  const raw = String(merchant.merchant_status || merchant.application_status || "").toLowerCase();
  const isComplete = merchant.is_complete === true || merchant.action === "complete"
    || ["completed", "complete", "approved"].includes(raw);
  const isDraft = !isComplete; // note: always the exact negation — see below
  const progress = isComplete ? 85 : isDraft ? 30 : 0;
  const progressLabel = isComplete ? "Submitted" : isDraft ? "Draft saved" : "Not started";
  return { isComplete, isDraft, progress, progressLabel };
}
```
Note: because `isDraft = !isComplete`, any non-null merchant that isn't complete is always `isDraft: true` — the `progress: 0 / "Not started"` branch is reachable only for `merchant === null`. A test asserting the full return shape for a non-null, non-complete merchant should expect `{isComplete: false, isDraft: true, progress: 30, progressLabel: "Draft saved"}`, never the "Not started" variant.

### Real contract — `utils/authSession.ts`

```ts
export const getUserIdFromToken = (): string | number => {
  const token = getAccessToken(); // reads the "token" cookie, falls back to legacy localStorage keys
  if (!token) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.user_id ?? payload?.sub ?? "";
  } catch {
    return "";
  }
};
```
Reads the JWT's middle (payload) segment, base64-decodes it, prefers `user_id`, falls back to `sub`, and is `""` for no token/a malformed token/neither claim present.

---

## Super Contributions

### `lib/super.test.ts` (pre-existing, 41 tests)

Contributions and funds. Covers listing (`fetchContributionsPage`,
`fetchContributionDetail`), the real create/edit/delete API calls,
`fetchContributionMatrix`/`mapContributionMatrix`, fund handling, the
figures/period/stats helpers (`contributionsInPeriod`, `superStats`), form
validation, and draft seeding.

### `stores/super.test.ts` (new this engagement, 4 tests)

`useSuperStore` — the one piece of real logic here is `addFund`'s dedupe:
adding a fund whose id is already in the list is a no-op (the *existing*
entry wins, not the incoming one — the API can hand back a fund that's
already on screen), while a genuinely new id prepends. Also
`setContributions` marking the store `hydrated`, so a screen can tell
"still loading" apart from "genuinely no contributions".

### Real contract — `lib/super.ts`

Module docstring (verbatim, important context): *"A contribution is entered
once and matched afterwards, because the two happen at different times —
you record what you meant to pay, then the bank feed catches up. A single
contribution can clear as several debits (a quarterly payment split across
funds or instalments), so matching is many-to-one and a contribution can
legitimately sit part-matched. That's what `remaining` is for."*

**Types** (verbatim):

```ts
export const SUPER_PERIODS = ["This year", "This month"] as const;
export type SuperPeriod = (typeof SUPER_PERIODS)[number];

export type SuperFund = { id: string; name: string };

/** One bank transaction assigned to a contribution, and for how much. */
export type ContributionMatch = { transactionId: string; reference: string; amount: number };

export type Contribution = {
  id: string;
  fundId: string;
  /** Snapshot at entry, so deleting a fund can't blank the row. */
  fundName: string;
  /** ISO YYYY-MM-DD. */
  date: string;
  /** As typed — use `contributionAmount` for the parsed figure. */
  amount: string;
  notes: string;
  taxDeduction: boolean;
  matches: ContributionMatch[];
  /** Bank-feed candidates the server already sees — what picks "AI Match" over plain "Match". */
  possibleMatch: number;
};

export type ContributionDraft = Omit<Contribution, "id" | "matches" | "possibleMatch">;
export type ContributionStatus = "Unmatched" | "Partly matched" | "Matched";
export type ContributionsPage = { contributions: Contribution[]; total: number };
export type SuperIssue = { key: string; message: string };

export type SuperStats = {
  total: { value: string; delta: string; count: number };
  matched: { value: string; delta: string; count: number };
  pending: { value: string; delta: string; count: number };
  deductible: { value: string; delta: string; count: number };
};

export type SuperMatrixPeriod = "year" | "month";
export type SuperMatrixStats = {
  total: { value: string; delta: string };
  matched: { value: string; delta: string };
  pending: { value: string; delta: string };
};
```

**Pure functions** (signature + the exact rule/edge case):

- `contributionAmount(c): number` — `Number.parseFloat(c.amount)`, `0` if not finite.
- `contributionMatched(c): number` — sum of `c.matches[].amount`.
- `contributionRemaining(c): number` — `Math.max(0, contributionAmount(c) - contributionMatched(c))` — **never negative**, even if over-matched.
- `contributionStatus(c): ContributionStatus` — `matched <= 0 → "Unmatched"`; else **`remaining < 0.005` (half a cent tolerance) → "Matched"**, otherwise `"Partly matched"`. Test the boundary explicitly: remaining `0.004` vs `0.005` vs `0.006`.
- `contributionStatusVariant(status)` — `Matched→"success"`, `"Partly matched"→"warning"`, `Unmatched→"secondary"`.
- `contributionsInPeriod(contributions, period, todayIso): Contribution[]` — filters by `date.startsWith(prefix)` where `prefix` is `YYYY` for "This year" or `YYYY-MM` for "This month", computed from `todayIso`. (`periodPrefix`/`priorPrefix` are internal, not exported, but drive this and `superStats` — the prior-period version wraps January back to December of the PRIOR year.)
- `superStats(contributions, period, todayIso): SuperStats` — contract worth testing exactly: *"'Pending' is what's still unmatched — the remaining amounts summed, not the face value of part-matched contributions, so the three figures reconcile: matched + pending equals the total."* `deductible` sums `contributionAmount` only for rows where `taxDeduction` is true. Each figure also carries a `delta` string vs. the prior period: `"No comparison for last month/year"` if the prior sum is `<= 0`, `"Level with …"` if the percent change rounds to `0`, else `` `${abs(percent)}% up/down on …` ``.
- `contributionIssues(draft): SuperIssue[]` — requires `fundId` or a typed `fundName`; requires `date`; amount: `amountFieldError` first (regex `/^\d+(\.\d{1,2})?$/`, only checked if non-blank), then SEPARATELY `!amount.trim() || contributionAmount(draft) <= 0 → "Enter a contribution amount."` — **two different messages for two different blank/invalid-amount paths**, both worth a test.
- `fundNameError(name, funds, ignoreId?)` — `< 2 chars → "Name this fund."`; else checks for a case-insensitive, trimmed name clash against `funds` (excluding `ignoreId`, so renaming a fund to its own current name doesn't clash with itself).
- `emptyContributionDraft(todayIso)` / `draftFromContribution(contribution)` — straightforward seeding, `date` defaults to `todayIso` on empty.

**Real API calls**:

| Function | Method | Route | Body / params | Response | Notes |
|---|---|---|---|---|---|
| `fetchContributionsPage(page, pageSize, search?): Promise<ContributionsPage>` | GET | `apiRoutes.superContribution.list` → `/v2/super-contribution` | `{page: String(page), limit: String(pageSize), name?: search.trim()}` | `{success, data?: ApiContribution[], pagination?: {total?}}` | **`name` is the only server-understood filter, and it matches the fund's name (a joined column), not the contribution itself.** `data` is a bare array (not `{rows: [...]}`). No `success` check performed — always maps whatever's in `data`. `total` falls back to `contributions.length`. |
| `fetchContributionDetail(id): Promise<Contribution>` | GET | `` `${apiRoutes.superContribution.details}/${id}` `` → `/v2/super-contribution/{id}` | — | `{success, data?: ApiContributionDetail}` | Throws `"Contribution not found"` if no `data`. **Date comes back as `DD-MM-YYYY` here** (unlike the list's raw ISO) — converted via a regex; an unparseable value passes through unchanged. `possibleMatch` is hardcoded to `0` (the detail endpoint never returns it). |
| `createContributionApi(draft): Promise<void>` | POST | `apiRoutes.superContribution.create` → `/v2/super-contribution` | `buildEncryptedRequestBody({fund_id, price: contributionAmount(draft), date, is_taxable: taxDeduction?1:0, notes, fund_name})` | `{success, message?}` | Throws `"Failed to record contribution"` on failure. Always plain JSON (encrypted) — contribution documents are disabled server-side, so it's never `FormData`. |
| `updateContributionApi(id, draft): Promise<void>` | **PATCH** | `` `${apiRoutes.superContribution.update}/${id}` `` → `/v2/super-contribution/{id}` | Same fields as create, **minus `fund_name`** (update only reassigns `fund_id`, never renames the fund's snapshot) | `{success, message?}` | Throws `"Failed to save contribution"` (different message text from create). |
| `deleteContributionApi(id): Promise<void>` | DELETE | `` `${apiRoutes.superContribution.delete}/${id}` `` → `/v2/super-contribution/{id}` | `{data: buildEncryptedRequestBody({})}` (empty body, `id` comes from the URL) | `{success, message?}` | Throws `"Failed to delete contribution"`. The real backend rejects deleting a reconciled contribution — worth testing that the server's own message surfaces. |
| `fetchContributionMatrix(type: "year"\|"month"): Promise<ApiMatrix>` | GET | `apiRoutes.superContribution.kpi` → `/v2/super-contribution/matrix` | `{params: {type}}` | `{success, data?}` | Falls back to `{has_previous_data: false, cards_data: []}` if `data` missing — never throws. |
| `fetchFunds(): Promise<SuperFund[]>` | GET | `apiRoutes.fund.list` → `/fund` | — | `{success, data?: ApiFund[]}` | No success check, defaults to `[]`. |
| `createFundApi(name): Promise<SuperFund>` | POST | `apiRoutes.fund.create` → `/fund` (same URL as list) | `buildEncryptedRequestBody({name})` | `{success, message?, data?}` | Throws if `!success \|\| !data`. |

**Backend quirks worth a dedicated test**:
- `parseTaxDeduction(value)` — `!!value && value !== "0"`. So `parseTaxDeduction("0")` is `false`, but `parseTaxDeduction("false")` is **`true`** (the string `"false"` is truthy and isn't literally `"0"`).
- `syntheticMatches(id, amount, remaining)` — neither the list nor detail endpoint returns individual bank transactions behind a contribution's `remaining_amount`, so this fabricates ONE synthetic match standing in for however much is reconciled: `reconciled = Math.max(0, amount - Math.max(0, remaining))`; if `reconciled > 0.005` it returns one `ContributionMatch` (`transactionId: "reconciled-{id}"`, `reference: "Bank reconciliation"`), else an **empty array** — meaning a contribution reconciled to within half a cent still reads as `"Unmatched"` via `contributionStatus`.
- `mapContributionMatrix` doc comment (verbatim): *"Total, matched and pending come straight from the matrix — the backend's own reconciled/unreconciled split, all-or-nothing per contribution, rather than this module's own partial-match-aware sums. Tax-deductible has no server equivalent, so the cards screen still computes that one from `superStats`."*

---

## Multi-Business

### `lib/businesses.test.ts` (pre-existing, 21 tests) / `components/businesses/business-profile-form.test.ts` (pre-existing, 16 tests)

Business CRUD (`lib/businesses.test.ts`: creating, editing, removing,
setting-as-default, listing, fetching one business's detail, the logo's
document id/filename handling, `hasBusinessAddress`/`hasBankDetails`) and
the profile form's own validation/draft-seeding
(`business-profile-form.test.ts`: `businessDraftIssues`, `draftFromDetail`).

### `stores/businesses.test.ts` (new this engagement, 23 tests)

`useBusinessesStore` — the switcher's real guard logic, previously
untested. This is the one store of the three with actual business rules
worth pinning down, not just setters:

- **`setBusinesses`** — keeps whichever business is currently open if it's
  still in the fresh list *and* still paid; otherwise falls back to the
  account's own default. A stale or newly-locked selection can't survive a
  refresh, but a still-valid one isn't silently switched out from under
  someone.
- **`select`** — a no-op for an unknown id or a locked (unpaid) business;
  only a real, paid business actually switches the active context and tells
  the axios client which `business_id` to send from then on
  (`setBusinessId`).
- **`setDefault`** / **`removeBusiness`** — both guarded the same way
  (unknown/unpaid is a no-op, the real API is never called for those), plus
  `removeBusiness`'s own extra guard: the account's current default can
  never be removed, even if it's unpaid — and if the removed business
  somehow *was* the open one, the active selection falls back to the
  default rather than being left dangling.
- **`renameBusiness`** — trims the name, and is a no-op on a blank one
  rather than leaving an unnamed row in the switcher.
- **`addBusiness`** — the new, unpaid, blank profile step one of the
  add-business flow creates, including that `tone` (the avatar fill index)
  is the current business count, not a fixed value.
- **`completePayment`** / **`setSubscription`** — marking a business paid
  and opening it, vs. changing an already-paid business's plan without
  touching `activeId` (and a no-op on an unknown id for the latter, so a
  stale selection can't create a phantom row).
- **`activeBusiness`** (the standalone resolver) — matches `activeId` first,
  then the first paid business, then the first business of any kind, then
  `null` for an empty list.

### Real contract — `lib/businesses.ts`

**Types** (verbatim):

```ts
export type BusinessSubscription = {
  packageId: string;
  cycle: BillingCycle; // "monthly" | "annual"
  /** Per average month, as charged — the discount already applied. */
  price: number;
  /** ISO date it next renews. */
  renews: string;
};

export type BusinessProfile = {
  id: string;
  name: string;
  email: string;
  abn: string;
  paid: boolean;
  tone: number;
  logo: string | null;
  subscription: BusinessSubscription | null;
  industryId: number | null;
  ndisNumber: string;
  accountingType: string;
  companyType: string;
  bank: { bsb: string; accountNumber: string; accountHolder: string; bankName: string };
  address: { line1: string; city: string; state: string; postcode: string; country: string };
  countryCode: string;
  mobile: string;
  firstName: string;
  middleName: string;
  lastName: string;
  companyName: string;
  documents: BusinessDocument[];
};

export type BusinessDocument = { id: string; sourceType?: string; filePath?: string; fileName?: string };
export type BusinessStatus = "Active" | "Payment required";

export type BusinessPayloadDraft = {
  email: string; businessName: string; abn: string; industry: string; accountingBasis: string;
  businessType: string; companyName: string; firstName: string; middleName: string; lastName: string;
  phone: string; ndisNumber: string; bankName: string; bsb: string; accountHolder: string;
  accountNumber: string; addressSearch: string; addressLine1: string; country: string; city: string;
  state: string; postcode: string;
};

export type ApiBusinessDetail = { /* the raw shape fetchBusinessDetail/createBusinessApi/updateBusinessApi resolve to — snake_case, e.g. business_email, business_name, industry_id, account_number, address_line1, etc. */ };
```

**Pure functions** (signature + rule):

- `businessStatus(b)` — `b.paid ? "Active" : "Payment required"`.
- `businessTone(b)` — `BUSINESS_TONES[b.tone % BUSINESS_TONES.length]` (4 entries) — **wraps via modulo**, safe for any `tone` value including ones `>= 4`.
- `hasBusinessAddress(b): boolean` — **OR** of `line1`/`city`/`state`/`country` (any one non-blank is enough — `postcode` is NOT checked).
- `hasBankDetails(b): boolean` — **AND** of all four of `bsb`/`accountNumber`/`accountHolder`/`bankName` (all-or-nothing).
- `formatBusinessAddress(b): string` — joins `city`/`state`/`postcode` with SPACES into one "locality" segment, then joins `[line1, locality, country]` with commas, filtering out empty parts.
- `businessPlanLabel`/`businessRenewalLabel`/`nextRenewal` — subscription display helpers; `nextRenewal(cycle, from)` adds 1 year for `"annual"`, else 1 month.

**The critical `paid` derivation** (in `mapApiBusiness`, verbatim):
```ts
paid: !(Boolean(raw.requires_payment) && !raw.is_default)
```
Truth table — test all four combinations:
| `requires_payment` | `is_default` | `paid` |
|---|---|---|
| `true` | `true` | `true` (the account's default business is always open, even mid-payment-setup) |
| `true` | `false` | `false` (locked) |
| `false` | (either) | `true` |

Also in the same mapper: `address.line1` prefers `address_line1`, falling back to the legacy single-line `address` column only if `address_line1` is blank. `mapSubscription` returns `null` if `sub.plan_slug` is falsy (even if other subscription fields are present), and `cycle` is **hardcoded to `"monthly"`** always (the API doesn't expose a real billing-cycle field). `profileName` fallback chain: `business_name` → `company_name` → `` `${first_name} ${last_name}`.trim() `` → `"Untitled business"`.

**Real API calls**:

| Function | Method | Route | Body / params | Response | Notes |
|---|---|---|---|---|---|
| `fetchBusinesses(): Promise<{businesses, defaultId}>` | GET | `apiRoutes.businesses.list` → `/businesses` | — | `{success, data?: ApiBusiness[]}` | No `success` check, defaults to `[]`. **Sorts client-side**: paid-first, then default-first among ties (stable otherwise) — the API doesn't sort them itself. `defaultId` is the sorted list's own default entry, else the first entry after sorting, else `null`. |
| `setBusinessDefaultApi(id): Promise<void>` | PATCH | `apiRoutes.businesses.setDefault(id)` → `/businesses/{id}/default` | `buildEncryptedRequestBody({})` (empty, encrypted) | — | **Neither this nor `deleteBusinessApi` inspects the response at all** — no `success` check, never throws on a `success:false` body. A test should verify this explicitly (it's a real gap/behavior, not an oversight to "fix" in a test). |
| `deleteBusinessApi(id): Promise<void>` | DELETE | `apiRoutes.businesses.delete(id)` → `/businesses/{id}` | `{data: buildEncryptedRequestBody({})}` | — | Same no-check behavior as above. |
| `fetchBusinessDetail(id): Promise<ApiBusinessDetail>` | GET | `apiRoutes.businesses.detail(id)` → `/businesses/{id}` | — | `{success, data?}` | Throws `"Business not found"` if `data` missing — note it checks presence of `data`, not `success` explicitly. |
| `createBusinessApi(draft: BusinessPayloadDraft, industryId, logo?): Promise<ApiBusinessDetail>` | POST | `apiRoutes.businesses.create` → `/businesses` | `buildBusinessRequestBody(draft, industryId, logo)` — encrypted; see field-mapping below | `{success, message?, data?}` | Throws if `!success \|\| !data`. |
| `updateBusinessApi(id, draft, industryId, logo?): Promise<ApiBusinessDetail>` | PATCH | `apiRoutes.businesses.update(id)` → `/businesses/{id}` | Same body-building as create | Same envelope | — |

**`buildBusinessRequestBody` field mapping** (verbatim comment: *"Blank optional fields go through as empty strings rather than being omitted, so clearing one on the form actually clears it on the record rather than leaving the old value in place."*):
- `company_type` — mapped from `businessType` via `{"Sole trader":"solo_traders", Company:"pvt_company", Partnership:"pvt_company", Trust:"pvt_company"}`, **falling back to `"solo_traders"`** (not `"pvt_company"`) for an unrecognized value. Both "Partnership" and "Trust" collapse to the same wire value — lossy on the way back.
- `accounting_type` — `"accrual"` only if `draft.accountingBasis === "Accrual"` exactly, else `"cash"`.
- `remove_profile_pic: "true"` is set ONLY when `logo.remove` is true AND there's no replacement `logo.file` — if both a removal and a new file are present, the new file wins and this field is omitted.
- Phone is split into `country_code`/`mobile_no` via `getCountryCallingAndPhoneNumber(draft.phone, "+61")`.
- Body is `buildEncryptedRequestBody(fields, {profile_pic: logo?.file})` — presence of a file switches the wire format between plain encrypted JSON and `FormData` internally; no `Content-Type` header is set deliberately (axios infers it per body type).

**Logo/document helpers** — `logoDocumentId`/`logoFileName` match the business's `logo` string against `documents[].file_path` by **exact equality**, not just `documents[0]` — a business with several documents only picks the one whose `file_path` equals `logo`.

### Real contract — `components/businesses/business-profile-form.tsx` (exported pure functions only)

```ts
export type BusinessProfileDraft = {
  email: string; businessName: string; abn: string; industry: string;
  accountingBasis: "Cash" | "Accrual"; // constrained union, not plain string
  businessType: "Sole trader" | "Company" | "Partnership" | "Trust"; // constrained union
  companyName: string; firstName: string; middleName: string; lastName: string; phone: string;
  ndisNumber: string; bankName: string; bsb: string; accountHolder: string; accountNumber: string;
  addressSearch: string; addressLine1: string; country: string; city: string; state: string; postcode: string;
};

export const EMPTY_BUSINESS_DRAFT: BusinessProfileDraft = {
  ...(/* all other fields blank */),
  accountingBasis: "Cash",
  businessType: "Sole trader",
  country: "Australia", // a third non-blank default, easy to miss
};
```

`businessDraftIssues(draft): Partial<Record<keyof BusinessProfileDraft, string>>` — the single most important function to test thoroughly:
- `email` — required; if present, must match `EMAIL_PATTERN` from `@/lib/contacts`.
- `businessName` — required, no shape check.
- `abn` — required; if present, must pass `abnError` from `@/lib/settings` (the same 11-digit rule used elsewhere, deliberately not reimplemented here).
- `industry` — required, no shape check.
- `ndisNumber` — **validated ONLY if `draft.industry === NDIS_INDUSTRY` AND the field is non-blank.** Leaving it blank on an NDIS-industry business produces NO issue at all — `ndisNumberError`'s own "blank is invalid" rule is deliberately bypassed here, unlike the Settings screen's equivalent check. This is the single edge case most likely to be missed by a naive test.

`draftFromDetail(raw: ApiBusinessDetail, industries: IndustryOption[]): BusinessProfileDraft`:
- `businessType` — `{solo_traders: "Sole trader", individual: "Sole trader", pvt_company: "Company"}`, falling back to `EMPTY_BUSINESS_DRAFT.businessType` (`"Sole trader"`) for anything else including a missing `company_type`.
- `industry` — looked up by `String(raw.industry_id)` against the **`industries` array passed in as a parameter** (not a global list) — `""` if `industry_id` is null/undefined or no match is found in that array. A test double must supply an `industries: IndustryOption[]` fixture.
- `accountingBasis` — `"Accrual"` only if `raw.accounting_type === "accrual"` exactly (case-sensitive), else `"Cash"`.
- `phone` — rebuilt via `getCountryCallingAndPhoneNumber((raw.country_code || "+61") + (raw.mobile_no || ""), "+61")`, then re-concatenated — an inline IIFE, not a straight field copy.
- `country` — `raw.country || EMPTY_BUSINESS_DRAFT.country` — uses `||` (not `??`), so an **empty string** also falls back to `"Australia"`, not just null/undefined. Every other field in this function uses `?? ""`.

---

## Route resolution quick reference

Every route constant referenced above, already resolved to its real path.
`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`
(a test never needs to know `BASE_URL`'s actual value — assert against the
`apiRoutes.x.y` constant itself, imported from `@/config/api-routes`, exactly
as every test file in this repo already does).

| Constant | Resolves to |
|---|---|
| `apiRoutes.matchingRules.getAll` | `BASE_URL + "/v2/matching-rules"` |
| `apiRoutes.matchingRules.get` | `BASE_URL + "/v2/matching-rules/get"` |
| `apiRoutes.matchingRules.add` | `BASE_URL + "/v2/matching-rules/add"` |
| `apiRoutes.matchingRules.update` | `BASE_URL + "/v2/matching-rules/update"` |
| `apiRoutes.matchingRules.delete` | `BASE_URL + "/v2/matching-rules/delete"` |
| `apiRoutes.matchingRules.matchTransSync` | `BASE_URL + "/v2/transactions-matching-rules"` |
| `apiRoutes.matchingRules.matchTransSyncStats` | `BASE_URL + "/v2/transactions-auto-match-count"` |
| `apiRoutes.accountCategory.list` | `BASE_URL + "/account-categories/list"` |
| `apiRoutes.expense.listOcr` | `BASE_URL + "/expense/list"` |
| `apiRoutes.expense.info` | `BASE_URL + "/v2/expense/"` (id appended) |
| `apiRoutes.expense.addV2` | `BASE_URL + "/v2/expense/"` |
| `apiRoutes.expense.updateV2` | `BASE_URL + "/v2/expense/edit"` |
| `apiRoutes.expense.delete` | `BASE_URL + "/v2/expense/bulk-delete"` |
| `apiRoutes.expense.download` | `BASE_URL + "/v2/expense/download"` |
| `apiRoutes.expense.markInvoiced` | `BASE_URL + "/expense/mark-invoiced"` |
| `apiRoutes.expense.uploadAttachment` | `BASE_URL + "/v2/expense/attachments"` |
| `apiRoutes.expense.deleteAttachment` | `BASE_URL + "/v2/expense/attachments"` (id appended) |
| `apiRoutes.companyContact.list` | `BASE_URL + "/contact/list"` |
| `apiRoutes.payrix.getMerchantAccount` | `BASE_URL + "/v1/payrix/getMerchantAccount"` |
| `apiRoutes.payrix.report` | `BASE_URL + "/v1/payrix/reports"` |
| `apiRoutes.stripeConnect.account` | `BASE_URL + "/stripe-connect/account"` |
| `apiRoutes.stripeConnect.transactions` | `BASE_URL + "/stripe-connect/transactions"` |
| `apiRoutes.stripeConnect.transactionStats` | `BASE_URL + "/stripe-connect/transactions/stats"` |
| `apiRoutes.superContribution.list` / `.create` / `.details` / `.update` / `.delete` | all `BASE_URL + "/v2/super-contribution"` — the distinction is purely HTTP method and, for `.details`/`.update`/`.delete`, an appended `/{id}` |
| `apiRoutes.superContribution.kpi` | `BASE_URL + "/v2/super-contribution/matrix"` |
| `apiRoutes.fund.list` / `.create` | both `BASE_URL + "/fund"` |
| `apiRoutes.businesses.list` / `.create` | both `BASE_URL + "/businesses"` |
| `apiRoutes.businesses.detail(id)` / `.update(id)` / `.delete(id)` | `` `${BASE_URL}/businesses/${id}` `` |
| `apiRoutes.businesses.setDefault(id)` | `` `${BASE_URL}/businesses/${id}/default` `` |

---

## Writing a new test in this codebase

Two copy-pasteable starting points — pick whichever matches what you're
testing. Both assume Vitest (`describe`/`it`/`expect`/`vi`) with no
additional setup; this repo's `vitest.config.ts` already points at
`./vitest.setup.ts` and runs everything under a plain `node` environment
(see the notes below for when that matters).

### Template A — a `lib/*.ts` module that calls the real API

This is the pattern every file in the tables above follows for anything
that imports `@/utils/axiosInstance`.

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

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

// Imported AFTER the mock is registered, via a dynamic import — this is
// required so the module under test's own `import api from
// "@/utils/axiosInstance"` resolves to `apiMock` above, not the real client.
const { yourFunctionUnderTest } = await import("@/lib/your-module");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("yourFunctionUnderTest", () => {
  it("calls the real endpoint with the real request shape", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { /* ...realistic response... */ } },
    });

    const result = await yourFunctionUnderTest();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.yourModule.yourRoute);
    expect(result).toEqual(/* ...expected mapped shape... */);
  });

  it("throws with the server's own message on failure, or returns a safe fallback — whichever the real function does", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "…" } });
    // await expect(yourFunctionUnderTest()).rejects.toThrow("…");
    // — or —
    // expect(await yourFunctionUnderTest()).toBeNull();
  });
});
```

Before writing the "realistic response" fixture, **confirm the real
contract rather than guessing it** — this is the difference between a test
that actually catches a regression and one that just re-asserts whatever the
code currently does. For this project that meant reading the actual
backend route/controller (`sole-ocr`) and, where one exists, the reference
frontend (`sole-webapp`) the UI is meant to match — request method, body
shape (plain JSON vs. this app's usual encrypted envelope), and response
envelope (`{success, data}` vs. some other shape) all vary per endpoint and
are worth checking directly rather than assumed from a similar-looking one.

### Template B — a Zustand store (`stores/*.ts`)

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { useYourStore } from "@/stores/your-store";

// If the store calls a real API action (like `setDefault`/`removeBusiness`
// in `stores/businesses.ts`), mock that module the same way as Template A:
// vi.mock("@/lib/your-module", () => ({ yourApiCall: vi.fn() }));

// If the store uses zustand's `persist` middleware, stub a minimal
// localStorage BEFORE importing the store — persist writes through to
// storage on every `set()`, and this repo's plain "node" test environment
// has no real localStorage. `skipHydration: true` (used by
// `stores/businesses.ts`) means nothing ever reads from it, so a no-op stub
// is enough:
// vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() });

beforeEach(() => {
  // The store is a module-level singleton — reset it directly via its own
  // setState, or state leaks between tests.
  useYourStore.setState({ /* ...the store's initial shape... */ });
});

describe("yourAction", () => {
  it("does the one real thing worth pinning down — a guard, a dedupe, a fallback", () => {
    useYourStore.setState({ /* ...arrange the state this action reads... */ });

    useYourStore.getState().yourAction(/* ...args... */);

    expect(useYourStore.getState()./* ...field... */).toBe(/* ...expected... */);
  });
});
```

Not every store needs a test file — see `stores/rules.ts` in the Matching
Rules section above. If every action is a plain setter with no branching,
a test would only re-assert what Zustand's own `set` already does. Write one
when there's a real guard, a fallback chain, or a dedupe to get wrong — that's
also the sign a reviewer should look for when judging whether a new store
needs coverage at all.

### What this repo doesn't have (yet)

No React Testing Library, no jsdom by default, no component-rendering
tests anywhere in the suite. The established substitute for UI logic is
exporting the pure function a component relies on — a validator, a status
derivation, a progress calculation — and testing that directly (see
`business-profile-form.tsx`/`payment-gateways.tsx`). If a test genuinely
needs a DOM, `// @vitest-environment jsdom` at the top of that one file is
supported without changing the project-wide config — but check whether
`vi.stubGlobal` on just the one or two globals actually needed (as
`utils/authSession.test.ts` does for `document.cookie`) covers it first.

---

## Notes for future changes

- If a fix to any of the SolePay/payment gateway files looks reverted, check
  `git status`/`git reflog` before redoing it — this branch has repeatedly
  had uncommitted local fixes overwritten by `git pull --no-rebase` merges
  from teammates pushing to the same files. Commit a fix once it's verified.
- The mocking/store-testing conventions themselves moved into the "Writing a
  new test in this codebase" section above, with copy-pasteable templates —
  this section is for anything narrower than a reusable pattern.
