# Testing: Invoices

Reference for test coverage of the Invoices module: the list and its
server-side filters, the single-invoice detail mapping, row actions
(delete/mark sent/cash payment/reminder/receipt/stop recurring), attachments,
the PDF, the money maths and validation, the create/edit payload, draft
invoices, the history timeline and the line-item lookup. Every test file
described here is **pre-existing** team work on `feat/api-integration`, built
across earlier commits on this branch. It is described here for reference and
is not claimed as new work.

All files are Vitest unit tests. None of them uses a browser or renders
anything. They run in the plain `node` environment and follow the same
convention as the rest of `lib/*.test.ts`: `@/utils/axiosInstance` is replaced
with a `vi.mock` of `{ get, post, put, patch, delete }`, and the module under
test is loaded afterwards with a dynamic `await import(...)`. For the shared
templates (API module / Zustand store) see "Writing a new test in this
codebase" in [`testing-coverage.md`](./testing-coverage.md). They are not
repeated here.

**Scope note**: two test files that look related are *not* invoice code:
- `lib/service-autocomplete.test.ts` (3 tests) is used only by
  `components/assets/asset-form.tsx`.
- `lib/products.test.ts` (6 tests, `paginate`) is used only by
  `components/refunds/refunds-table.tsx` and `lib/refunds.test.ts`.

Both are left out of this doc. `lib/invoice-import.ts` (the bulk importer's
invoice spec and payload) belongs to the Migrations module and is covered there
through `lib/module-imports.test.ts`.

## Running them

```bash
npx vitest run                                    # everything in the repo
npx vitest run lib/invoices.test.ts               # one file
npx vitest run lib/invoices.test.ts lib/invoice-submit.test.ts \
  lib/invoice-drafts.test.ts lib/invoice-history.test.ts \
  lib/invoice-item-search.test.ts                 # this module (130 tests)
```

Current as of this doc: **1285 tests pass repo-wide**. The five files below
contribute 130 of them (counts verified with a per-file JSON reporter run).

| File | Tests | Covers |
|---|---|---|
| `lib/invoices.test.ts` | 74 | List/page fetch + filter params, status mapping, multicurrency, detail mapping, row actions, attachments, PDF, totals/deposit/validation, summaries, numbering |
| `lib/invoice-submit.test.ts` | 38 | `buildInvoicePayload` field-by-field, blank-row dropping, deposits, rails, reminders, recurrence, `saveInvoiceApi` encryption/FormData, `objectToFormData` |
| `lib/invoice-drafts.test.ts` | 7 | `fetchDraftInvoices` route choice and row mapping, `draftInvoicesQueryKey` |
| `lib/invoice-history.test.ts` | 6 | `fetchInvoiceHistory` mapping (standard vs deposit), `formatTimelineDateTime` |
| `lib/invoice-item-search.test.ts` | 5 | `searchExpenseDescriptions` only (the expense form's lookup), not the invoice lookup |

---

## Test files

### `lib/invoices.test.ts` (74 tests)

The test file uses fixtures `API_ROW` (one raw `GET /invoice/invoices` row),
`line()` and `invoice()`.

- **Listing — `fetchInvoices`/`fetchInvoicesPage`** (13):
  - `fetchInvoices` asks for `page: 1, page_size: 200,
    "sort_by[invoice_id]": "desc"`. Timestamps are trimmed to `YYYY-MM-DD`.
    The list row has no lines, so the list's `total` stands in as one
    placeholder line, and `invoiceAmount()` still reports the real figure.
  - `is_recurring_invoice`/`paid_with_cash` map to `isRecurring`/
    `paidWithCash`, and both default to `false` when absent.
  - An empty `data: {}` gives `[]`.
  - `fetchInvoicesPage(2, 25, {...all filters})` asserts the **exact** param
    object with `toEqual`, including `filter_by[sent_status]: 0` for
    `"not_sent"` and 1-indexed `filter_by[client_id][1]`/`[2]`. It also maps
    `total`/`max_price`/`max_due_balance`.
  - Status `"All"` and a whitespace-only search both leave their params off.
  - `total` falls back to the row count, and `maxTotal` to `0`.
  - Status vocabulary: `paid`/`draft`/`partially_paid`/`overdue` map
    one-to-one, and `due`/`sent`/`recurring` all map to `Outstanding`. A row
    that sends `mark_as` instead of `status` is also handled.
  - **The due-date fallback applies only when neither `status` nor `mark_as`
    came back.** A past due date gives `Overdue` and a future one gives
    `Outstanding`.
  - **Multicurrency**: `total` (AUD) and `exchange_total` (client currency)
    are read as two independent server figures. Neither is derived from the
    other through `exchange_rate`. The outstanding amount in the document's
    currency holds the same *proportion* as the AUD balance (600/1000 of
    1090 gives 654). With no `exchange_total`, the figures fall back to AUD.
    A `currency_code` on a non-multicurrency row is ignored.
- **Detail — `fetchInvoiceDetail`** (9):
  - Real `invoice_item[]` rows replace the placeholder line.
    `notes`/`extra_discount` are mapped.
  - **Flat-discount regression**: `disc_criteria: "currency"` with
    `discount_amount: 25` reads back as `discountType: "amount",
    discountPercent: "25"`, not as the equivalent 12.5%. Before the fix, the
    value was converted to a percentage, so it drifted whenever quantity or
    price changed.
  - `ndis` is inferred only from a line carrying `item_support_no`. No
    record-level flag exists.
  - `selected_contacts` rows with no id are dropped.
  - `showBankDetails` defaults to `true` and is `false` only for an explicit
    `0`.
  - `acceptCardPayments` is true if either `is_payrixpay` or
    `is_stripe_enabled` is set.
  - `notify_future_work_date` converts back to days before due (15 Mar due
    with a 12 Mar reminder gives `"3"`).
  - Throws `"Invoice not found"`.
- **Row actions** (10): URL and **exact plain-JSON body** for
  `deleteInvoicesApi` (numeric `invoice_ids`), `markInvoiceSentApi`,
  `markInvoicePaidWithCashApi` (today by default, or a chosen date),
  `undoInvoicePaidWithCashApi` (`undo: 1`, no date),
  `sendInvoicePaidReceiptApi`, `stopRecurringInvoiceApi` and
  `sendInvoiceReminderApi` (`type: "invoice"`).
  - `success: false` surfaces the server's message.
  - **A missing `success` field counts as success.**
- **Attachments** (3):
  - Upload sends multipart `files`/`source_type: "invoice"`/`source_id`, and
    the server's `document_id` is kept as the id.
  - When no id comes back, the upload still returns an attachment.
  - Delete uses the path `/documents/{id}`.
- **PDF — `fetchInvoicePdfBlob`** (3):
  - Uses `templates.preview(templateId)` with `responseType: "blob"` and the
    params `invoiceId`/`type: "invoice"`/`render_type: "pdf"`.
  - `receipt = true` sends `type: "invoice-receipt"`.
  - With no `templateId` it **rejects without calling the API**.
- **Totals** (6): `invoiceTotals`.
  - Per-line GST (4×95 + 260, both with GST, gives 640/64/704).
  - A percentage discount is applied before GST.
  - A whole-document discount can never push the total below zero.
  - **A flat-amount discount is subtracted as dollars**: 200 − 25, then GST,
    gives 192.5.
  - A line with no `discountType` (legacy data) is still read as a
    percentage.
  - `invoiceOutstanding` never goes below zero.
- **`statusAfterPayment`** (3): covering or exceeding the balance gives
  `Paid`, and so does `99.999` (half-cent tolerance). Anything less gives
  `Partially paid`.
- **`depositAmount`** (4):
  - `null` when no deposit is set.
  - Percent mode takes a percentage of the total.
  - A fixed amount is clamped between 0 and the total.
  - Items mode sums only the chosen line indexes.
- **Validation** (12):
  - `documentIssues` returns the `client`/`number`/`item-…-description`
    keys, and **the messages name the document** (`"invoice"` vs
    `"quote"`).
  - `lineItemErrors`:
    - A blank field is not an error.
    - Letters and negative numbers are rejected.
    - Quantities must be whole numbers, but NDIS lines allow `1.5` hours.
    - A percentage discount is capped at 100.
    - **A flat-amount discount is not capped at 100.** It is capped at the
      line's gross instead (`"Discount can't exceed the line amount."`).
  - `ndisIssues` requires a support item number only on billable lines. A
    blank spare row is left alone.
- **Summaries** (4):
  - `invoiceSummary` uses largest-remainder rounding, so six rows across five
    statuses still sum to exactly 100. A status with no rows gets a share of
    0, and an empty list gives zeroes.
  - `overdueSummary` counts only `Overdue` invoices and reports the oldest
    age in days.
- **Dates, numbering and currency** (7):
  - `addDays` works across a month boundary.
  - `daysBetween` is signed.
  - `nextInvoiceNumber`: the configured start acts as a **floor, not an
    override**. The result is zero-padded to 4 digits, and a blank prefix
    falls back to `INV`.
  - `normaliseCurrency`.
  - `formatDocumentMoney`: AUD shows a bare `$`, and NZD does not.

### `lib/invoice-submit.test.ts` (38 tests)

This file decrypts real request bodies with `decryptPayload` from
`@/utils/encrypt`, so its encryption assertions check the actual ciphertext
round-trip. They are not just checks of the body's shape. The fixture `draft()`
has two real lines plus a **trailing blank row**, which is the editor's state
when Save is pressed. `CONTEXT` has neither payment rail connected.

- **Document fields** (5):
  - The exact field names `invoice_no`/`client_id`/`invoice_date`/
    `due_date`/`template_id`/`currency_code: "AUD"`/`is_multicurrency: 0`/
    `gst_percentage`.
  - `payment_term` is derived from the two dates (14), and a reversed pair
    gives `0`, never a negative number.
  - `gst_percentage` is **omitted** when `gstEnabled: false`.
  - `id` is sent only when `invoiceId` is set.
- **Line items** (5):
  - The trailing blank row is dropped. If every row is blank, one row is
    still kept.
  - Each item carries `gst_amount: 38` and `disc_criteria: "percent"`, and
    the totals are 640/64/704.
  - `extra_discount` is subtracted from the total.
  - **A flat discount is sent as `disc_criteria: "currency"`**, which is the
    column's own enum spelling (not `"amount"`).
- **NDIS** (2): `item_support_no`/`claim_type`/`date` are sent on NDIS lines
  only.
- **Multicurrency** (3):
  - NZD at a rate of 1.09 sends `exchange_total: 704` and an AUD `total` of
    about 645.87 (the rate is *divided*).
  - A leftover `currency` with `convertCurrency: false` sends AUD and no rate.
  - **Regression**: a foreign-currency draft with a rate of `null` or `0`
    **throws** `/exchange rate/i`. Before the fix, `audTotals` passed the NZD
    figures through as if they were AUD while still sending
    `is_multicurrency: 1`.
- **Deposit** (4):
  - A full-payment invoice still sends explicit values: `payment_structure:
    "full"`, `is_deposit: 0`, `deposit_type: "fixed"`, `deposit_value:
    null`, `deposit_selected_items: []`. The server's columns are NOT NULL.
  - A percentage deposit is sent as `deposit_type: "percentage"`.
  - An items deposit is sent as `fixed` + `select_items` with its computed
    value (418).
  - **Index remapping regression**: when the blank row sits in the middle,
    editor index 2 becomes payload index `1`.
- **Payment rails** (3):
  - An unconnected rail never sets its pay-link flag.
  - Stripe gets `1` once it is connected and card payments are requested.
  - `show_bank_details` defaults to 1.
- **Follow-up** (3):
  - Days-before is converted to an absolute `notify_future_work_date`.
  - No fields are sent when the reminder is on but no days are given.
  - The `both`/`me_only` flags are mutually exclusive.
- **Recurrence** (3):
  - `frequency` is sent as the stored id, not the label.
  - `on_occurance` is 1 when review-before-send is on, otherwise 2.
  - No recurrence fields are sent when the invoice doesn't repeat.
- **Mode** (1): `draft` gives `save: 0`, `send` gives `send: 1`, and `print`
  gives `send: 2`.
- **`saveInvoiceApi`** (6):
  - With no files, the body is a bare `{data}` envelope whose ciphertext does
    not contain the invoice number in readable form.
  - After decryption, `item` is an array of real nested objects.
  - An update posts to `invoice.update` and **carries `id` in the payload**.
    The test notes this is unlike a quote.
  - With files, the body is `FormData` with raw `files[]` next to `data`.
  - The server's message is thrown on `success: false`.
  - A save that returns no id throws `/returned no id/`.
- **`objectToFormData`** (3):
  - Nested keys are flattened to `item[0][description]`.
  - `null` becomes `""`, not `"null"`.
  - A `File` is passed through untouched.

### `lib/invoice-drafts.test.ts` (7 tests)

- With no client, `fetchDraftInvoices()` hits `invoice.allDrafts` with
  **no config argument at all** (`undefined`). With a client it hits
  `invoice.drafts` with `{params: {client_id}}`.
- Row mapping: the date is trimmed, `"240.50"` becomes `240.5`, and
  `template_id` is stringified.
- Description fallback order: `notes` (a whitespace-only note is skipped),
  then `invoiceItem[0].description`, then `""`.
- A row with no `invoice_no` shows `#id`. With no template, `templateId` is
  `undefined` (not `null`) and `total` is `0`.
- **Throws on `success: false`** (`"Nope"`) instead of returning `[]`.
- `draftInvoicesQueryKey(null | undefined | "42")` gives
  `["invoice-drafts", "all" | "42"]`.

### `lib/invoice-history.test.ts` (6 tests)

- `fetchInvoiceHistory` fetches `invoice.history(id)`.
- A standard timeline maps its totals, the first `selected_contacts` entry as
  the recipient, event status, and `meta.payments[]`, whose
  `transaction_date` becomes `date`. A pending step has `occurredAt: null`.
- `historyType: "deposit"` also comes from `payment_structure:
  "deposit_balance"`, not only from `history_type`. `depositPaidAmount` is
  mapped.
- Missing `data` throws `"Couldn't load that invoice's history."`.
- `formatTimelineDateTime` produces the `10 Mar 26, 2:30 pm` shape (checked
  with a regex that tolerates the `0?2` difference between ICU versions), and
  `null` gives `"—"`.

### `lib/invoice-item-search.test.ts` (5 tests)

**Only `searchExpenseDescriptions`** (the expense form's lookup) is tested:

- It calls `servicesAll.autocomplete` with exactly `{query, category:
  "Expense", txnType: "Debit"}`.
- A catalogue row maps `description` to `detail` and `price_tooltip` to
  `priceHint`, with `price: ""` and `gst: undefined`.
- **It reads `price`, not `cost_price`/`unit_price`.** sole-webapp reads
  those two fields, but this endpoint never returns them.
- It accepts both a bare array and a `{data: []}` envelope.
- Nameless rows are dropped.

The invoice side of the same file (`searchInvoiceItems`,
`lineItemPatchFromSuggestion`) is untested. See Gaps.

---

### Real contract — `lib/invoices.ts`

**Types** (verbatim, doc comments trimmed):

```ts
export const INVOICE_STATUSES = ["Draft", "Outstanding", "Overdue", "Partially paid", "Paid"] as const;
export const INVOICE_TABS = ["All", ...INVOICE_STATUSES] as const;
export const OUTSTANDING_STATUSES: InvoiceStatus[] = ["Outstanding", "Overdue", "Partially paid"];

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: string;        // as typed
  price: string;
  discountPercent: string; // a percentage OR dollars, per discountType
  discountType?: DiscountType; // "percent" | "amount"; absent means "percent"
  gst: boolean;
  qtyType?: QtyType;       // "items" | "hours" | "days" | "km"
  productId?: string;
  priceHint?: string;
  supportItemNumber?: string; // NDIS only
  claimType?: NdisClaimType;  // NDIS only — its presence is what isNdisLineItem checks
  date?: string;              // NDIS only, ISO
};

export type InvoiceDeposit = {
  mode: "percent" | "amount" | "items";
  value: string;
  selectedItems?: number[]; // items mode — editor indexes
  dueDate?: string;
};

export type InvoiceAttachment = { id: string; name: string; size: number; url?: string };
export type InvoiceRecipient = { id: string; name: string; email: string };

export type Invoice = {
  id: string; number: string; clientId: string | null; clientName: string;
  issued: string; due: string; status: InvoiceStatus; description: string;
  items: InvoiceLineItem[]; extraDiscount: string; notes: string;
  followUpReminder: boolean; overdueReminder: boolean; repeating: boolean;
  repeatFrequency: RepeatFrequency; reviewBeforeSending: boolean;
  deposit: InvoiceDeposit | null; attachments: InvoiceAttachment[];
  // optional — absent on a list-mapped invoice:
  recipients?; invoiceEmail?; convertCurrency?; exchangeRate?: number | null; rateEdited?;
  followUpDays?; followUpNote?; followUpNotifyClient?;
  repeatStart?; repeatOccurrences?; repeatTagLine?;
  showBankDetails?; acceptCardPayments?;
  currency?: DocumentCurrency;  // any ISO code; absent = AUD
  exchangeTotal?: number;       // server's own exchange_total, never derived
  paidAmount: number; sentAt: string | null; matchedTransactionId?: string | null;
  possibleMatch: number; templateId?: string;
  isRecurring: boolean; paidWithCash: boolean; ndis: boolean;
};

export type InvoiceDraft = Omit<Invoice,
  "id" | "status" | "paidAmount" | "sentAt" | "matchedTransactionId"
  | "possibleMatch" | "isRecurring" | "paidWithCash">;

export type InvoiceListFilters = {
  status?: InvoiceTab; search?: string; issuedFrom?: string; issuedTo?: string;
  minTotal?: number; maxTotal?: number; balanceMin?: number; balanceMax?: number;
  sent?: "sent" | "not_sent"; matchedOnly?: boolean; paidWithCashOnly?: boolean;
  clientIds?: string[];
};
export type InvoiceListPage = { invoices: Invoice[]; total: number; maxTotal: number; maxBalance: number };
export type InvoiceStatusCounts = Record<InvoiceTab, number>;
export type InvoiceIssue = { key: string; message: string };
export const REPEAT_FREQUENCY_IDS = { "Once off": "day", Weekly: "weekly", Fortnightly: "fortnightly",
  Monthly: "monthly", Quarterly: "quarterly", "Half yearly": "halfyearly", Yearly: "yearly" };
```

**Pure functions** (signature + the one non-obvious rule each has):

- `lineTotals(item, gstPercent = 10)`: gives `{gross, discount, net, gst,
  amount}`. `discount` is dollars when `discountType === "amount"` and
  `gross × pct/100` otherwise. **No rounding at all.**
- `invoiceTotals(items, extraDiscount, gstPercent = 10)`: sums the
  *unrounded* per-line figures, then computes `total = max(0, subtotal −
  discount − extra + gst)`. The test named "rounds GST per line" only uses
  whole-cent GST, so it can't tell rounded from unrounded.
- `invoiceAmount(inv)`: `invoiceTotals(inv.items, inv.extraDiscount).total`.
  It **always uses the default 10%** and ignores the business rate. That is
  fine for list rows (one placeholder line with GST off). For a
  detail-mapped invoice at a non-10% rate it gives a different figure.
- `invoiceDocumentAmount(inv)`: `exchangeTotal ?? invoiceAmount(inv)`.
- `invoiceOutstanding(inv)`: `max(0, amount − paidAmount)`.
- `invoiceDocumentOutstanding(inv)`: the AUD outstanding share × the
  document total, or `0` if the AUD total is `<= 0`.
- `statusAfterPayment(inv, received)`: `received >= amount − 0.005 ? "Paid"
  : "Partially paid"`. A payment can never produce `Overdue`.
- `depositAmount(deposit, total, items?, gstPercent = 10)`: returns `null`
  for no deposit and is clamped to `[0, total]`. Items mode sums
  `lineTotals(...).amount`, which includes GST.
- `isLineItemFilled(item)`: description and qty > 0 and price > 0.
- `lineItemErrors(item)`: whole quantities are required unless
  `isNdisLineItem`. The three discount messages are `"Enter a valid
  amount…"`/`"Enter a valid percentage."`, then `"Discount can't exceed
  100%."` (percent only), then `"Discount can't exceed the line amount."`
  (amount only, when gross > 0).
- `documentIssues(draft, noun = "invoice")`: returns the keys `client`,
  `number`, `item-{firstId}-description` and `item-{id}-{field}`.
- `ndisIssues(items)`: returns the key `item-{id}-supportItemNumber`, for
  filled lines only.
- `percentShares(counts)`: largest-remainder rounding. A leftover point never
  goes to a zero-count entry.
- `invoiceSummary`, `overdueSummary(invoices, todayIso)`: `oldestDays` uses
  `Math.floor`.
- `invoiceOverview`: `outstanding` includes `Overdue`. The mid-flight
  buckets use the balance still owed, so **the buckets deliberately don't sum
  to `total`**.
- `currentFinancialYear(today)` runs from July to June and is labelled by its
  start year. `financialYearRevenue` excludes `Draft` and compares ISO date
  strings.
- `nextInvoiceNumber(invoices, {prefix, next})`: `max(highest + 1,
  configured)`, padded to 4 digits. Only the trailing digits of `number` are
  read.
- `toDiscountType`/`toQtyType` fall back to `percent`/`items`.
  `toNdisClaimType` matches on letters and digits only (so `"Travel -
  Time"` matches `"Travel – Time"`) and falls back to `"Standard Service"`.
  `repeatFrequencyFromId` falls back to `"Monthly"`.
- `formatDocumentMoney(v, cur = "AUD")`: `$`, `US$`, `NZ$`, `£` and `€` have
  fixed prefixes. Other codes use `Intl`, and an unknown code renders as
  `"XYZ 1.00"`.
- `formatInvoiceDate(iso)` gives `DD/MM/YYYY` or `"—"`.
  `formatDateLabel(iso)` gives `DD Mon YYYY` or `"Select date"`.
- `emptyInvoiceDraft(number, today)`: due is `today + 7`, `repeatStart` is
  `today + 1` (**never today**), `overdueReminder: true` and
  `showBankDetails: true`. `emptyNdisDraft` uses one `newNdisLineItem()` (GST
  off) and sets `ndis: true`.
- `draftFromInvoice(inv)`: deep-copies items, deposit, attachments and
  recipients. Optional fields fall back to blank-draft defaults.
- `lineItemFromCatalogue(item)`: `gst` is true only when `saleTax === "GST
  (10%)"` exactly.

**Mapping rules inside `mapApiInvoice`/`fetchInvoiceDetail`** (not
exported):
- `clientId` prefers `client_id` and falls back to `client.client_id`.
- `paidAmount = max(0, total − remainingAmount)`.
- `sentAt` is trimmed to a date.
- `exchangeTotal` and `exchangeRate` are set only when `is_multicurrency`
  (`|| undefined` / `|| null`, so a `0` becomes absent).
- Deposit: `deposit_selection_type === "select_items"` gives items mode.
  Otherwise `percentage` gives percent mode, and anything else gives amount
  mode.
- In the detail, `followUpDays` is `max(1, daysBetween(reminderDate, due))`.
- `followUpNotifyClient` is true unless `notify_future_work === "only"`.
- `reviewBeforeSending` is `on_occurance !== 2`.
- `mapApiDocument` always sets `size: 0`, because the API returns none.

**Real API calls** (`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ??
"http://localhost:3001/api"`). **All of the POSTs below send plain,
unencrypted JSON**, and the tests assert those exact plain bodies:

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchInvoices(): Promise<Invoice[]>` | GET | `apiRoutes.invoice.list` → `/invoice/invoices` | `{params: {page: 1, page_size: 200, "sort_by[invoice_id]": "desc"}}` | `{success, data?: {invoice_details?}}` | No `success` check. Defaults to `[]`. Capped at 200 rows. This feeds `useInvoicesStore` and the Dashboard. |
| `fetchInvoicesPage(page, pageSize, filters)` | GET | same | `page`, `page_size`, `sort_by[invoice_id]=desc`, plus `filter_by[status\|search\|start_date\|end_date\|min_price\|max_price\|balance_min\|balance_max\|sent_status\|matched\|paid_with_cash]` and `filter_by[client_id][n]` (1-indexed) | `{success, data?: {invoice_details, total?, max_price?, max_due_balance?}}` | Status values sent: `draft/due/overdue/partially_paid/paid` (`Outstanding` goes as `due`). `total` falls back to the row count. |
| `fetchInvoiceStatusCounts(clientIds?)` | GET | `apiRoutes.invoice.statusCounts` → `/invoice/invoices/status-counts` | `filter_by[client_id][n]` only | `{success, data?: {all, draft, due, overdue, partially_paid, paid}}` | Each count defaults to 0. **Untested.** |
| `fetchInvoiceDetail(id)` | GET | `apiRoutes.invoice.detail(id)` → `/invoice/invoices/{id}` | — | `{success, data?: ApiInvoiceDetail}` | Throws `"Invoice not found"` when `data` is missing. It checks that `data` is present and does not look at `success`. |
| `deleteInvoicesApi(ids)` | POST | `apiRoutes.invoice.bulkDelete` → `/invoice/bulk-delete` | `{invoice_ids: number[]}` | `{success, message?}` | Uses `assertApiSuccess` with the fallback message `"Couldn't delete that invoice."`. Paid and partially-paid invoices are skipped server-side. |
| `markInvoiceSentApi(id)` | POST | `apiRoutes.invoice.markSent(id)` → `/invoice/invoices/{id}/mark-sent` | no body | same | `"Couldn't mark that invoice as sent."` |
| `markInvoicePaidWithCashApi(id, date = today)` | POST | `apiRoutes.invoice.paidWithCash` → `/invoice/paid/cash` | `{invoice_id: number, payment_date}` | same | `today` is the local date (`toIsoDate(new Date())`). |
| `undoInvoicePaidWithCashApi(id)` | POST | same route | `{invoice_id: number, undo: 1}` | same | `"Couldn't undo that payment."` |
| `sendInvoiceReminderApi(id)` | POST | `apiRoutes.communicationPreference.sendReminder` → `/reminder/send-reminder` | `{id: number, type: "invoice"}` | same | Shared with quotes (`type: "quote"`). **The quote version is encrypted** (`quotes.test.ts` decrypts it); the invoice version is not. |
| `sendInvoicePaidReceiptApi(id)` | POST | `apiRoutes.invoice.sendPaidReceipt` → `/invoice/send-paid-receipt` | `{invoice_id: number}` | same | — |
| `stopRecurringInvoiceApi(id)` | POST | `apiRoutes.invoice.updateRecurringStatus` → `/invoice/recurring/status` | `{id: number, is_recurring_invoice: 0}` | same | One-way only. |
| `uploadInvoiceAttachmentApi(id, file)` | POST | `apiRoutes.fileUpload.document` → `/documents` | `FormData`: `files`, `source_type: "invoice"`, `source_id` | `{document_id?}` | No success check. **When `document_id` is missing, the id falls back to a local `attachment-N`**, so a later delete of that attachment would hit a non-existent server id. |
| `deleteInvoiceAttachmentApi(docId)` | DELETE | `` `${apiRoutes.fileUpload.document}/${docId}` `` → `/documents/{id}` | — | ignored | The response is never inspected. |
| `fetchInvoicePdfBlob({id, templateId}, receipt = false)` | GET | `apiRoutes.templates.preview(tid)` → `/template/{tid}/preview` | `{params: {invoiceId, useDemo: "false", type: "invoice" \| "invoice-receipt", render_type: "pdf"}, responseType: "blob"}` | raw bytes | Throws `"This invoice has no template to render a PDF from."` before making any call. The test uses `toMatchObject`, so it does not check `useDemo`. |

`assertApiSuccess(data, fallback)` throws only when `data?.success === false`.
A missing field passes. Quotes reuse this helper.

### Real contract — `lib/invoice-submit.ts`

```ts
export type InvoiceSubmitMode = "draft" | "send" | "print";
export type InvoiceSubmitContext = {
  gstPercent: number; gstEnabled: boolean; templateId: string;
  rails: InvoicePaymentRails;       // from lib/invoice-context
  exchangeRate: number | null;      // units of doc currency per 1 AUD
  files: File[]; invoiceId?: string;
};
export type SubmitTotals = { subTotal: number; discount: number; extraDiscount: number; gst: number; total: number };
export type SavedInvoice = { id: string };
```

**Pure functions**. Quotes (`lib/quote-submit.ts`) and templates
(`lib/invoice-templates.ts`) reuse most of them:

- `money(v)`: `Math.round(v × 100) / 100`, and `NaN` becomes 0.
- `documentTotals({items, extraDiscount}, gstPercent)`: `invoiceTotals`
  with each **sum** rounded once. `gst` is `money(Σ unrounded line gst)`.
- `audTotals(totals, rate)`: divides each figure by `rate`. **A `rate` that
  is `null` or `<= 0` returns the totals unchanged.** `buildInvoicePayload`
  guards against that case, but `quote-submit.ts` calls `audTotals` without
  the same guard.
- `itemPayload(item, gstPercent, ndis)`: `gst_amount = money(line.gst)`, so
  **each line is rounded separately**. `discount` is `0` for `""`, and
  `disc_criteria` is `"currency" | "percent"`. `amount = money(net + gst)`
  and `product_id` is `?? null`. NDIS lines also get `item_support_no`/
  `claim_type`/`date`. Note that the per-line `gst_amount` values and the
  top-level `total_gst` (rounded once, over the sum) **can differ by a cent**
  when a line's GST has a fraction of a cent. No test fixture has that case.
- `billableEntries(items)`: keeps rows that have a description, qty > 0 or
  price > 0, and records each one's editor index. If none qualify, the first
  row is kept.
- `depositPayload(draft, totals, gstPercent, rate, indexMap)`: with no
  deposit it returns the explicit "full" shape. Otherwise it returns
  `deposit_type` `"percentage" | "fixed"`, `deposit_selection_type`
  `"select_items" | null`, a `deposit_value` that stays in percentage points
  for percent mode and is converted to AUD for the other modes,
  `exchange_deposit_value` (only when a rate is set),
  `deposit_value_currency: "AUD"`, and a **remapped
  `deposit_selected_items`** in which dropped lines are filtered out.
- `objectToFormData(data)`: produces `parent[child][0][leaf]` keys. `null`
  and `undefined` become `""`, and File/Blob values are passed through.
- `buildInvoicePayload(draft, mode, context)`:
  - Currency conversion applies only when `convertCurrency` is set and
    `currency` is not `"AUD"`. If it applies and there is no rate, the
    function **throws** `"This invoice is billed in a foreign currency but has
    no exchange rate. Enter one before saving."`.
  - Always sends `project_id: null`, `is_outstanding_balance_flow: 0` and
    `is_InstantPay: 1`.
  - `is_payrixpay` also requires `rails.paymentType !== "direct_payment"`.
  - When converting, it adds `exchange_rate`, `total_after_exchange` and
    `is_exchange_rate_edited`.
  - `start_date` is sent only when `repeatStart` is set.

**Real API calls** (both use **`buildEncryptedRequestBody(payload,
context.files)`**, which gives `{data}` JSON with no files, or `FormData`
with `data` + raw `files[]`):

| Function | Method | Route | Body | Response envelope | Notes |
|---|---|---|---|---|---|
| `saveInvoiceApi(draft, mode, ctx): Promise<SavedInvoice>` | POST | `apiRoutes.invoice.add` → `/invoice/add`, or `apiRoutes.invoice.update` → `/invoice/edit` when `ctx.invoiceId` is set | encrypted `buildInvoicePayload(...)` | `{success, message?, data?: {invoice_id?}}` | Throws `message \|\| "Couldn't save that invoice."` on `success === false`. The id is `ctx.invoiceId ?? data.invoice_id`, and a missing id throws `"The invoice saved but the server returned no id."`. Per the source comment, the backend also still accepts sole-webapp's plain multipart. |
| `fetchInvoiceRuntimePreviewBlob(draft, ctx): Promise<Blob>` | POST | `apiRoutes.templates.runtimePreview` → `/template/runtime-preview` | encrypted `{...buildInvoicePayload(draft, "draft", ctx), render_type: "pdf", invoiceId?}` | raw bytes (`responseType: "blob"`) | **Untested.** `invoiceId` is a separate field from `id`, used only to read the saved record. |

### Real contract — `lib/invoice-drafts.ts`

```ts
export type DraftInvoiceSummary = {
  id: string; number: string; clientName: string; date: string;
  description: string; total: number; templateId?: string;
};
```

| Function | Method | Route | Params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchDraftInvoices(clientId?)` | GET | `apiRoutes.invoice.drafts` → `/invoice/drafts` with a client, otherwise `apiRoutes.invoice.allDrafts` → `/invoice/drafts/all` | `{params: {client_id}}` (with a client only) | `{success, message?, data?: ApiDraftInvoice[]}` | **Throws on `!success`** (`message \|\| "Couldn't load your draft invoices."`). Used by `components/shared/draft-invoices-dialog.tsx` and `components/expenses/convert-to-invoice-dialog.tsx`. |

`draftInvoicesQueryKey(clientId?)` returns `["invoice-drafts", clientId ??
"all"]`.

### Real contract — `lib/invoice-history.ts`

```ts
export type InvoiceHistoryStatus = "completed" | "pending" | "upcoming";
export type InvoiceHistoryEvent = {
  key: string; title: string; status: InvoiceHistoryStatus; occurredAt: string | null;
  amount: number | null; paidAmount: number | null; remainingAmount: number | null;
  paymentCount: number | null; payments: InvoiceHistoryPayment[]; sentTo: string[];
};
export type InvoiceHistory = {
  invoiceNo: string; historyType: "standard" | "deposit"; currencyCode: string;
  totalAmount: number; totalAllocatedAmount: number; remainingAmount: number;
  depositPaidAmount: number | null; recipientName?: string; recipientEmail?: string;
  timeline: InvoiceHistoryEvent[];
};
```

- Any event status other than `completed`/`pending` becomes `"upcoming"`.
- A missing `key` becomes `event-{index}`.
- `currencyCode` falls back to `"AUD"` through `normaliseCurrency`.

| Function | Method | Route | Response envelope | Notes |
|---|---|---|---|---|
| `fetchInvoiceHistory(id)` | GET | `apiRoutes.invoice.history(id)` → `/invoice/invoices/{id}/history` | `{success, data?}` | Throws `"Couldn't load that invoice's history."` when `data` is missing. It does not check `success`. |

`formatTimelineDateTime(value)` returns `"—"` for null and **returns the raw
string unchanged** when it can't be parsed. That last branch has no test.

### Real contract — `lib/invoice-item-search.ts`

```ts
export type ItemSuggestion = {
  key: string; name: string; detail: string; price: string; gst?: boolean;
  qtyType?: string; supportItemNumber?: string; productId?: string; priceHint?: string;
};
```

| Function | Method | Route | Params | Notes |
|---|---|---|---|---|
| `searchInvoiceItems(query, ndis)` | GET | `apiRoutes.services.autocomplete` → `/services/autocomplete` when `ndis`, otherwise `apiRoutes.servicesAll.autocomplete` → `/services/all/autocomplete` | `{query, page: 1, limit: 10, txnType: "Credit"}` | Used by `components/documents/line-items.tsx`, `ndis-line-items.tsx` and `item-lookup-input.tsx`. An empty query is **sent through** (not short-circuited). For NDIS, the name order is `support_item_name → item_name → description`. `detail` becomes `"Support item {n}"` when there is a support number. **Untested.** |
| `searchExpenseDescriptions(query)` | GET | `apiRoutes.servicesAll.autocomplete` | `{query, category: "Expense", txnType: "Debit"}` | Tested (see above). |

Both endpoints return a **bare array**, and the `{data: []}` wrapper is also
accepted. `suggestionPrice` returns `""` for a price that is non-positive or
non-finite.

`lineItemPatchFromSuggestion(s, item, {ndis, gstDefault})` has two rules:
**NDIS lines are always GST-free**, and a missing quantity is set to
`"1"`. It never changes `claimType`/`date`, and it sets `supportItemNumber`
only on NDIS lines. **Untested.**

### Real contract — untested supporting modules

None of these has a `.test.ts`.

**`lib/invoice-clients.ts`**: `InvoiceContact = {id, clientId, name, email,
isPrimary, ndisNumber, clientName, clientCurrency, clientAbn,
clientAddress}`, `ClientNdisDetails = {clientId, participantName,
participantNumber, planManagerName, planManagerNumber}`.

| Function | Method | Route | Body / params | Notes |
|---|---|---|---|---|
| `fetchInvoiceContacts(type: 1\|2 = 1)` | GET | `apiRoutes.companyContact.list` → `/contact/list` | `{params: {type}}` | No `success` check, and no `filter_by[scope]` (unlike `lib/company-contacts.ts`). |
| `fetchClientNdisDetails(clientId)` | GET | `` `${apiRoutes.contact.getDetails}/${clientId}` `` → `/client/{id}` | — | Uses the primary contact (`is_primary == 1`), falling back to `contacts[0]`. No throw. |
| `createInvoiceClientApi({name, email, ndisNumber?})` | POST | `apiRoutes.client.add` → `/client/` (trailing slash) | **Plain JSON** `{name, email, type: 1, currency: "AUD", contacts: [{name, email, is_primary: 1, ndis_no?}]}` | Throws `message \|\| "Couldn't add that client."` on `success === false` **or** when `data` is missing. Throws `"The client saved but the server returned no id."`. A missing contact id becomes `""`. |

Pure functions:
- `contactsForClient` sorts primary contacts first.
- `primaryContactFor` falls back to the first contact in the group.
- `ndisClientIssue(details, clientId)` returns `undefined` when the
  `details` belong to a **different client**, so a stale result can't flag
  the wrong client. The message includes the participant's name when there is
  one.

**`lib/invoice-context.ts`**: the editor's on-mount lookups. The fallback
template ids are `"1"` (invoice), `"2"` (NDIS), `"13"` (quote) and `"25"`
(NDIS quote). `DEFAULT_TAX_SETTINGS = {gstPercent: 10, gstEnabled: false}`.
`DEFAULT_PAYMENT_RAILS = {stripeConnected: false, payrixConnected: false,
paymentType: "direct_payment", showBankDetails: true}`.

| Function | Method | Route | Notes |
|---|---|---|---|
| `fetchInvoiceBranding()` | GET | `apiRoutes.settings.getBranding` → `/v2/settings/get-branding` | Any falsy template id falls back to the defaults. |
| `fetchInvoiceTaxSettings()` | GET | `apiRoutes.tax.getDetails` → `/v2/settings/tax-settings` | `tax_settings` can be an object **or an array**; the array case takes `[0]`. A percentage of `0` falls back to 10. |
| `fetchNextInvoiceNumber()` | GET | `apiRoutes.invoice.getNo` → `/invoice/invoice-no` | Returns `{number: data.no ?? "", note: data.note ?? ""}`. |
| `fetchInvoiceEmail()` | GET | `apiRoutes.settings.getSeqNumber` → `/v2/settings/get-seq-numbers` | Reads `data.invoice_email`. |
| `fetchExchangeRates()` | GET | `apiRoutes.exchangeRates.getAll` → `/exchange-rates` | Drops rows with an invalid code or a rate `<= 0`. |
| `fetchInvoicePaymentRails(userId)` | GET + POST | `apiRoutes.stripeConnect.account` → `/stripe-connect/account`; `apiRoutes.payrix.getAccountMap` → `/v1/payrix/getAccountMap` with **plain JSON** `{user_id}` | Each rail fails soft (`.catch`). The Payrix call is skipped when there is no `userId`. **`payrixConnected` is `Number(account.test_payrix) === 1`**, gated on `payrix_status`. That field name is surprising and worth pinning in a test. |

Pure functions: `templateIdFor(branding, ndis)` and
`quoteTemplateIdFor(branding, ndis)` use the default ids when `branding` is
undefined.

**`lib/invoice-templates.ts`**: the gallery of saved starting points
("default invoices"). `NDIS_INDUSTRY_ID = 9`.

| Function | Method | Route | Body / params | Notes |
|---|---|---|---|---|
| `fetchInvoiceDefaults(industryId)` | GET | `apiRoutes.invoice.default` → `/invoice/default` | `{module: "invoice", page_size: 100, industry_id?}` | `favouriteIds` comes from `is_favourite`. The item lines are blank placeholders sized by `item_count`. |
| `toggleInvoiceDefaultFavouriteApi(id)` | POST | `apiRoutes.invoice.defaultFavourite(id)` → `/invoice/default/{id}/favourite` | no body | Returns `!!data.is_favourite`. No success check. |
| `fetchInvoiceDefaultDetail(id)` | GET | `apiRoutes.invoice.defaultDetail(id)` → `/invoice/default/{id}` | — | Throws `"Template not found"`. |
| `createInvoiceDefaultApi(input)` | POST | `apiRoutes.invoice.default` | **Plain JSON** `buildInvoiceDefaultPayload` (`category`, `industry_id`, `template_id`, totals, `module: "invoice"`, `type: "ndis"\|"general"`, the deposit fields, `items`) | Throws `"Couldn't save that template."` and `"The template saved but the server returned no id."` (the id comes from `data.invoice.id`). |
| `updateInvoiceDefaultApi(id, input)` | **PUT** | `apiRoutes.invoice.defaultDetail(id)` | same | Throws `"Couldn't update that template."`. |

Pure functions:
- `accentForId` is a stable hash.
- `filterTemplates` and `filtersForTemplates` only show pills for the
  categories actually present.
- `isNdisTemplate` and `templateHref` build
  `/invoices/new/{ndis|general}?template=`.
- `templateSaveIssue` checks one thing: a filled line exists.
- `draftFromInvoiceDefault(detail, ndis, number, today)`:
  - Due is `today + (payment_term || 7)`.
  - NDIS lines are always GST-free and get today's date.
  - General lines get GST when `gst_percentage > 0`.

`lib/quotes.test.ts` exercises `accentForId` and the list mapping only
indirectly, through `fetchQuoteTemplates`.

**`lib/preview-doc.ts`**:
- `footerParts(settings)` lists the enabled phone, then the links.
- `invoicePreviewDoc(...)` drops lines with `net <= 0`. It folds each line's
  discount into the unit price (`net / qty`, so GST is not charged twice).
  It always uses the default 10% GST.
- `samplePreviewDoc(kind, ...)`: the invoice number is padded to 4 digits
  and the quote number is not.

Its only consumer is `components/sales-settings/fields-tab.tsx`.

### `stores/invoices.ts`: no test file, and it has real logic

`useInvoicesStore` holds `invoices`, `hydrated` and `favouriteTemplates`.
Unlike `stores/rules.ts` in the reference doc, it is **not** just setters.
Several actions have branching or preservation rules worth testing:

- **`toggleFavouriteTemplate(id)`** flips the star optimistically, calls
  `toggleInvoiceDefaultFavouriteApi`, and then *reconciles* with the
  server's answer, adding the id without duplicating it or removing it. If
  the call fails it **rolls back** to the previous set. This is the store's
  most test-worthy action. It needs a `vi.mock("@/lib/invoice-templates")`.
- **`updateInvoice(id, draft)`** rebuilds the invoice through `toInvoice`.
  It preserves `paidAmount`/`sentAt`/`matchedTransactionId`/`possibleMatch`
  but **resets `isRecurring` and `paidWithCash` to `false`**, because
  `toInvoice` always sets both. Its only caller,
  `components/invoices/invoice-quick-edit-dialog.tsx` (mounted in
  `quotes-screen.tsx`), saves to this store **only**. It makes no API call,
  yet shows `"… updated"`, so the next `useInvoicesQuery` refetch silently
  discards the edit.
- **`duplicateInvoice(id)`** takes its number from `nextInvoiceNumber` over
  the store plus `useSalesSettingsStore`, and resets paid, sent and match
  state. However, it **keeps `isRecurring`/`paidWithCash` from the source**.
  It has no callers today.
- `markSent` keeps an existing `sentAt` (idempotent). `recordPayment` sets
  `paidAmount = received`, which replaces the old value rather than adding to
  it, and derives the status through `statusAfterPayment`.
- `setInvoices` also sets `hydrated: true`. It is fed by
  `hooks/use-invoices-query.ts`.
- `addInvoice`, `removeInvoice(s)`, `markPaid`, `matchTransaction`,
  `recordPayment` and `add`/`removeAttachment` have **no callers** in
  `components/`, `app/`, `hooks/` or `lib/`. `components/invoices/invoices-table.tsx`
  has its own local `markSent` function, which is not the store action.
  `unmatchTransaction` is used by both unmatch dialogs.

---

## Gaps

No test file exists for:

- **`stores/invoices.ts`**: see the audit above. Start with the
  `toggleFavouriteTemplate` rollback and reconcile, the `updateInvoice`
  preserved/reset fields, and `duplicateInvoice`.
- **`lib/invoice-context.ts`**: all seven fetchers. The payment rails are the
  riskiest: the soft failure per rail, the `test_payrix` mapping, and
  skipping the Payrix call without a `userId`. The array-or-object
  `tax_settings` is another case.
- **`lib/invoice-clients.ts`**: `fetchInvoiceContacts`,
  `fetchClientNdisDetails`, `createInvoiceClientApi` (the two throw paths,
  the `client_id ?? id` fallback, the contact id defaulting to `""`), and
  `ndisClientIssue`'s stale-client guard. `contactsForClient` and
  `primaryContactFor` are also untested.
- **`lib/invoice-templates.ts`**: every function. It is only partly
  exercised, through `fetchQuoteTemplates` in `lib/quotes.test.ts`. The
  uncovered parts that matter most are `draftFromInvoiceDefault` (the NDIS
  GST/date rules and the `payment_term || 7` fallback), the template
  create/update payloads and the PUT method.
- **`lib/preview-doc.ts`**: `footerParts`, `invoicePreviewDoc` (the
  discount folded into the unit price, dropping zero-net lines) and
  `samplePreviewDoc`.
- `hooks/use-invoices-query.ts`, `hooks/use-invoice-pdf.ts`.
- `components/invoices/invoices-filters.tsx`: `activeFilterCount` and
  `resolveInvoiceFilters` are exported pure functions, like
  `components/expenses/expenses-filters.tsx`. `resolveInvoiceFilters` treats
  `""` and non-numeric input as `undefined`, and `"any"` means no `sent`
  value.

Exported functions with no test, inside files that do have tests:

- `lib/invoices.ts`:
  - `fetchInvoiceStatusCounts`.
  - `invoiceOverview`, `financialYearRevenue` and `currentFinancialYear`,
    which the Dashboard uses. The July boundary and draft exclusion are
    untested.
  - `percentShares`, tested only indirectly through `invoiceSummary`.
  - `draftFromInvoice`, `lineItemFromCatalogue`, `invoiceDepositAmount`.
  - `toDiscountType`, `toQtyType`, `toNdisClaimType` (its en-dash-insensitive
    matching) and `repeatFrequencyFromId`.
  - `currencySymbol`, `isForeignCurrency`, `formatInvoiceDate`,
    `formatDateLabel`, `statusVariant`, `dueDateClass`, `invoiceMoney`,
    `isLineItemFilled`, `savePdfBlob` (needs a DOM).
  - Detail mapping that no test checks: `invoice_recurring` →
    `repeatFrequency`/`repeatStart`/`repeatOccurrences`/`repeatTagLine`/
    `reviewBeforeSending`, `mapInvoiceDeposit` (the list tests never send
    deposit fields), `documents[]` → `attachments`, and
    `sentAt`/`matchedTransactionId`/`possibleMatch`/`templateId`.
- `lib/invoice-submit.ts`: `fetchInvoiceRuntimePreviewBlob`. Also missing:
  - the Payrix pay-link flag, including its `paymentType !==
    "direct_payment"` gate;
  - `exchange_deposit_value`;
  - `deposit_due_date`;
  - the case where the rounded per-line `gst_amount` values don't add up to
    `total_gst` (no fixture has GST with a fraction of a cent);
  - direct unit tests of `audTotals`, `itemPayload`, `billableEntries`,
    `depositPayload` and `money`. These are exercised only through
    `buildInvoicePayload`, and `quote-submit.ts` also depends on them.
- `lib/invoice-item-search.ts`: **`searchInvoiceItems`** (the invoice and
  NDIS line-item lookup: its route choice, its `txnType: "Credit"`/`page`/
  `limit` params and the NDIS name order) and
  **`lineItemPatchFromSuggestion`** (NDIS lines always GST-free, quantity
  defaulting to 1). The test file named after invoice item search tests
  only the expense-form function.
- `lib/invoice-history.ts`: `formatTimelineDateTime`'s pass-through for
  unparseable input, the `"upcoming"` fallback, and `sentTo`.

**Worth knowing when writing new tests.** Two things in this module differ
from the "every non-GET body is encrypted" convention:

- The `lib/invoices.ts` row actions, `createInvoiceClientApi`, the template
  create/update calls and the Payrix `getAccountMap` POST all send **plain
  JSON**.
- `lib/invoices.test.ts` asserts those plain bodies with `toEqual`.

So encrypting the row actions would require updating those 10 tests. It is
the same kind of change as the quote reminder, which is already encrypted.

---

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`.
Tests assert against the `apiRoutes.x.y` constant imported from
`@/config/api-routes` rather than against a literal URL.

| Constant | Resolves to |
|---|---|
| `apiRoutes.invoice.list` | `BASE_URL + "/invoice/invoices"` |
| `apiRoutes.invoice.statusCounts` | `BASE_URL + "/invoice/invoices/status-counts"` |
| `apiRoutes.invoice.detail(id)` | `` `${BASE_URL}/invoice/invoices/${id}` `` |
| `apiRoutes.invoice.history(id)` | `` `${BASE_URL}/invoice/invoices/${id}/history` `` |
| `apiRoutes.invoice.markSent(id)` | `` `${BASE_URL}/invoice/invoices/${id}/mark-sent` `` |
| `apiRoutes.invoice.drafts` | `BASE_URL + "/invoice/drafts"` |
| `apiRoutes.invoice.allDrafts` | `BASE_URL + "/invoice/drafts/all"` |
| `apiRoutes.invoice.add` | `BASE_URL + "/invoice/add"` |
| `apiRoutes.invoice.update` | `BASE_URL + "/invoice/edit"` |
| `apiRoutes.invoice.bulkDelete` | `BASE_URL + "/invoice/bulk-delete"` |
| `apiRoutes.invoice.updateRecurringStatus` | `BASE_URL + "/invoice/recurring/status"` |
| `apiRoutes.invoice.paidWithCash` | `BASE_URL + "/invoice/paid/cash"` |
| `apiRoutes.invoice.sendPaidReceipt` | `BASE_URL + "/invoice/send-paid-receipt"` |
| `apiRoutes.invoice.getNo` | `BASE_URL + "/invoice/invoice-no"` |
| `apiRoutes.invoice.default` | `BASE_URL + "/invoice/default"` |
| `apiRoutes.invoice.defaultDetail(id)` | `` `${BASE_URL}/invoice/default/${id}` `` |
| `apiRoutes.invoice.defaultFavourite(id)` | `` `${BASE_URL}/invoice/default/${id}/favourite` `` |
| `apiRoutes.communicationPreference.sendReminder` | `BASE_URL + "/reminder/send-reminder"` |
| `apiRoutes.fileUpload.document` | `BASE_URL + "/documents"` (id appended for delete) |
| `apiRoutes.templates.preview(id)` | `` `${BASE_URL}/template/${id}/preview` `` |
| `apiRoutes.templates.runtimePreview` | `BASE_URL + "/template/runtime-preview"` |
| `apiRoutes.services.autocomplete` | `BASE_URL + "/services/autocomplete"` |
| `apiRoutes.servicesAll.autocomplete` | `BASE_URL + "/services/all/autocomplete"` |
| `apiRoutes.companyContact.list` | `BASE_URL + "/contact/list"` |
| `apiRoutes.contact.getDetails` | `BASE_URL + "/client"` (id appended) |
| `apiRoutes.client.add` | `BASE_URL + "/client/"` |
| `apiRoutes.settings.getBranding` | `BASE_URL + "/v2/settings/get-branding"` |
| `apiRoutes.settings.getSeqNumber` | `BASE_URL + "/v2/settings/get-seq-numbers"` |
| `apiRoutes.tax.getDetails` | `BASE_URL + "/v2/settings/tax-settings"` |
| `apiRoutes.exchangeRates.getAll` | `BASE_URL + "/exchange-rates"` |
| `apiRoutes.stripeConnect.account` | `BASE_URL + "/stripe-connect/account"` |
| `apiRoutes.payrix.getAccountMap` | `BASE_URL + "/v1/payrix/getAccountMap"` |
