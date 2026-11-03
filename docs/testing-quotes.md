# Testing: Quotes

Reference for test coverage of the Quotes module — the quote list, the
general and NDIS quote editors, quote templates, history, the server-rendered
PDF, and billing a quote as an invoice. Both test files described here are
**pre-existing** team work on `feat/api-integration` (added in `1f11f92`
"Added Test cases for invoice and quote module", extended in `5ddfa83`
"updated invoice,quote creation flow, added decryption payload") — described
here for completeness, not claimed as new work.

All files are Vitest unit tests — no browser, no rendering, plain `node`
environment, and the same `vi.mock("@/utils/axiosInstance", ...)` +
dynamic-`await import(...)` convention used across `lib/*.test.ts`. For the
copy-pasteable templates (API module, Zustand store) and the "no RTL / no
jsdom" notes, see **"Writing a new test in this codebase"** in
[`testing-coverage.md`](./testing-coverage.md) — not repeated here.

**Shared with invoices**: quotes deliberately reuse the invoice line-item
shape and maths (`QuoteLineItem = InvoiceLineItem`, `QuoteDeposit =
InvoiceDeposit`), the invoice submit helpers (`billableEntries`,
`documentTotals`, `audTotals`, `itemPayload`, `depositPayload`, `money`), the
shared default-template endpoint and detail fetch (`lib/invoice-templates`),
and `assertApiSuccess`/`invoiceTotals`/`depositAmount` from `lib/invoices`.
Those shared pieces are documented in
[`testing-invoices.md`](./testing-invoices.md) and only summarised here where
a quote test depends on their behaviour.

## Running them

```bash
npx vitest run lib/quotes.test.ts lib/quote-submit.test.ts   # this module
npx vitest run lib/quotes.test.ts                            # one file
npx vitest run                                               # everything
```

Current as of this doc: **1285 tests pass repo-wide**; the two files below
account for 66 of them.

| File | Tests | Covers |
|---|---|---|
| `lib/quotes.test.ts` | 41 | List mapping, display status, summary cards, detail, history, delete/send/download, convert-to-invoice, reminders, templates, PDF |
| `lib/quote-submit.test.ts` | 25 | `buildQuotePayload` field-by-field (lines, GST, NDIS, multicurrency, deposit, recipients, mode flags) and `saveQuoteApi` create/update/encryption/files |

---

## `lib/quotes.test.ts` (41 tests)

Fixtures: `API_ROW` (one realistic `GET /quote` row — `quote_id: 4501`,
`total: 704`, ISO-timestamp dates, `status: "sent"`, `client: {client_id: 42,
name: "Acme"}`), a `quote(over)` domain builder (one 100-dollar GST-free
line), and `decryptedFieldsFromBody()` which runs `decryptPayload` from
`@/utils/encrypt` over either a `{data}` envelope or a `FormData`'s `data`
field — so encrypted bodies are asserted on their *decrypted* contents, not
just their presence.

- **Fetching the list** (8) — `fetchQuotes`:
  - asks for one large page, newest first: `page: 1`, `page_size: 200`,
    `"sort_by[quote_id]": "desc"`;
  - maps a row, trimming `2026-03-01T00:00:00.000Z` to `2026-03-01`, and —
    because the list sends no line items — `quoteAmount(mapped)` still reports
    the real `704` via the single stand-in line;
  - `data: {}` → `[]` rather than a throw;
  - status table: `draft`/`accepted`/`rejected`/`declined` map to their
    stored status; **`expired` maps to `Sent`** (lapsed is derived for
    display, not stored); `mark_as` is read when `status` is absent; no status
    at all defaults to `Sent` (the reference's own default);
  - `quote_type: "ndis"` → `ndis: true`;
  - `convertedInvoice` is carried **only** when `converted === 1` — the same
    `invoice.invoice_no` on a `converted: 0` row is ignored;
  - a foreign quote (`is_multicurrency: 1`, `NZD`, `exchange_rate: 1.09`,
    `exchange_total: 1090`, `total: 1000`) reports `quoteAmount ≈ 1090` in its
    own currency and `quoteAmountAud ≈ 1000`;
  - `currency_code: "NZD"` with `is_multicurrency: 0` → `currency` undefined.
- **`quoteDisplayStatus`** (3) — `convertedInvoice` beats every stored
  status (even `Draft`); expiry never overturns `Accepted`/`Declined`/`Draft`;
  a `Sent` quote lapses on the server's `expired` flag *even with a future
  expiry*, or on a past expiry date, and stays `Sent` otherwise.
- **`quoteSummary`** (2) — the regression the cards exist for: a lapsed sent
  quote drops out of `sent`, but a converted accepted quote **stays in
  `acceptedValue`** (billing doesn't "un-win" work); empty list → all zeroes.
- **Fetching one quote** (8) — `fetchQuoteDetail`:
  - hits `${apiRoutes.quote.info}${id}`; real `quote_item[]` replace the
    stand-in line; `gst: 1` → `true`, `gst: 0` → `false`; `extra_discount: 50`
    → `"50"`;
  - **the string `"null"` for `notes` becomes `""`** (what the server
    actually sends);
  - a flat per-line discount (`disc_criteria: "amount"`, 25 off a 100 gross)
    becomes `discountPercent: "25"`;
  - NDIS lines get `supportItemNumber`, `claimType` and a trimmed `date`;
  - **attachment/recipient key regression** — reads `selected_contacts`
    (plural) and `documents[].document_id`, the keys the endpoint really
    sends; reading `selected_contact`/`id` previously dropped every recipient
    and made saved attachments vanish on edit. A second test confirms the
    singular/`id` spellings are still accepted as a fallback;
  - a document with no id at all is dropped (nothing to remove server-side);
  - `success: false` with no `data` throws the server's message.
- **History** (4) — `fetchQuoteHistory` hits `apiRoutes.quote.history(id)`,
  keeps not-yet-happened steps (`pending`/`upcoming`, `at: ""`), trims
  `occurred_at` to `YYYY-MM-DDTHH:MM`, flattens `meta` into one `detail`
  (`"$704.00"`, `"jo@…, bo@…"`, `"Invoice INV-20"`, `undefined` for `meta:
  null`), **drops the `quote_converted` step when the quote's `status` is
  `rejected`**, and returns `[]` when there's no timeline.
- **Deleting** (3) — `deleteQuotesApi(["4501"])` uses the single-row `DELETE
  ${apiRoutes.quote.delete}/4501` and never posts; two ids go to
  `apiRoutes.quote.bulkDelete` as `{quote_ids: [4501, 4502]}` (numbers);
  `success: false` throws the server's message.
- **Sending** (1) — `sendQuoteApi` posts to `apiRoutes.unibox.sendQuote(id)`.
- **Downloading** (2) — `downloadQuotesApi` posts `{data: ids}` with
  `responseType: "blob"`; filename from `x-filename`, then
  `content-disposition`'s `Filename=` (quotes stripped), then `"quotes.zip"`.
- **Converting to an invoice** (3) — `convertQuoteToInvoiceApi` posts to
  `apiRoutes.invoice.convertToInvoice` with a body that is **not FormData,
  has only a `data` key, and does not contain the plaintext date** — then
  decrypts to exactly `{id, due_date}`. Empty expiry falls back to today's
  ISO date; `success: false` surfaces the server's message. (The regression:
  plain FormData here is answered with "Failed to decrypt payload".)
- **Chasing** (1) — `sendQuoteReminderApi` → encrypted `{id, type: "quote"}`
  to `apiRoutes.communicationPreference.sendReminder`.
- **Templates** (4) — `fetchQuoteTemplates` calls **`apiRoutes.invoice.default`**
  (not `quote.default`) with `module: "quote"`, `is_quote: true`,
  `industry_id` only when non-null; an `type: "ndis"` row maps to
  `ndis: true, industry: "NDIS"` with `items.length === item_count`;
  `template_scope_label` becomes `industry`. `quoteTemplateHref` routes NDIS
  templates to `/quotes/new/ndis?template=…`, others to `/quotes/new/manual?…`;
  `quoteTemplateIndustryTag` is `"NDIS"` for NDIS and `undefined` for
  `"General"`.
- **PDF** (2) — `fetchQuotePdfBlob` hits `apiRoutes.quote.preview(templateId)`
  with `{quoteId, useDemo: "false", type: "quote", render_type: "pdf"}` and
  `responseType: "blob"`; no `templateId` falls back to
  `DEFAULT_QUOTE_PREVIEW_TEMPLATE_ID` (`"11"`).

## `lib/quote-submit.test.ts` (25 tests)

Fixtures: `CONTEXT` (`gstPercent: 10`, `gstEnabled: true`, `templateId:
"13"`, no rate, no files) and `draft(over)` built on
`emptyQuoteDraft("QUO-9", "2026-03-01")` with two real GST lines (4 × 95,
1 × 260) **plus one trailing blank editing row** — the state the editor is
really in when Save is pressed.

- **Document fields** (3) — `quote_no`, `quote_type: "general"`, `client_id`,
  `quote_date`, `valid_till: "2026-03-08"` (the 7-day
  `DEFAULT_QUOTE_VALIDITY`), `template_id`, `currency_code: "AUD"`,
  `is_multicurrency: 0`, `gst_percentage: 10`; `gst_percentage` is **absent**
  (not 0) when `gstEnabled` is false; `id` present only with `quoteId`.
- **Line items** (4) — the trailing blank row is dropped (2 items sent); an
  all-blank draft still sends one line; GST is **rounded per line and
  summed** (`gst_amount: 38` on line one, `sub_total: 640`, `total_gst: 64`,
  `total: 704`); `extraDiscount: "40"` → `extra_discount: 40`, `total: 664`.
- **NDIS** (2) — `quote_type: "ndis"` with `item_support_no`, `claim_type`,
  `date` on the line; an ordinary quote's lines carry no `item_support_no`.
- **Multicurrency** (2) — 1.09 NZD/AUD: `currency_code: "NZD"`,
  `is_multicurrency: 1`, `exchange_total: 704` (client-facing),
  `exchange_rate: 1.09`, `is_exchange_rate_edited: 1`, and top-level
  `total ≈ 645.87` AUD. **A leftover `currency: "NZD"` with
  `convertCurrency: false` sends AUD and no `exchange_rate`** — a rate from a
  swapped-out client must not apply.
- **Deposit** (3) — no deposit still states the shape (`payment_structure:
  "full"`, `is_deposit: 0`, `deposit_type: "fixed"`, `deposit_value: null`)
  because the columns are NOT NULL; `percent` 30 → `deposit_balance`/
  `percentage`/`30`; `amount` 200 → `fixed`/`200`.
- **Recipients and notes** (2) — `selected_contact[]` (singular on write),
  `invoice_email`, `notes`, `display_note: 1`, `custom_note`; no recipients
  sends `[]`, not an omitted field.
- **Mode flags** (1) — `draft` → `save: 0, send: 0`; `send` → `save: 1,
  send: 1`; `print` → `save: 1, send: 2`.
- **Saving** (8) — `saveQuoteApi`:
  - create: `POST apiRoutes.quote.add`, never `put`; body is a bare `{data}`
    envelope with no readable `QUO-9`; returns `{id: "4502"}` from
    `data.quote_id`;
  - the decrypted payload keeps `item` as **real nested objects** (not
    flattened `item[0][description]` keys);
  - update: `PUT ${apiRoutes.quote.update}77`, never `post`; decrypted `id`
    is `"77"`; returns the context's id;
  - with files: body becomes `FormData`, the file is under `files[]` (even a
    single file — `getAll("files[]")` has length 1), and `data` still decrypts;
  - **an update never sends files** (body is not FormData even when
    `files` is non-empty) — the update route takes none;
  - `success: false` throws the server's message; `success: true` with no
    `quote_id` throws `/returned no id/` rather than pretending to have saved.

---

### Real contract — `lib/quotes.ts`

**Types** (verbatim, doc comments trimmed):

```ts
export const QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_DISPLAY_STATUSES = [
  "Draft", "Sent", "Accepted", "Converted", "Declined", "Expired",
] as const;
export type QuoteDisplayStatus = (typeof QUOTE_DISPLAY_STATUSES)[number];

export const QUOTE_FILTERS = ["All", ...QUOTE_DISPLAY_STATUSES] as const;
export type QuoteFilter = (typeof QUOTE_FILTERS)[number];

export type QuoteLineItem = InvoiceLineItem;
export type QuoteDeposit = InvoiceDeposit;

export type Quote = {
  id: string;
  number: string;
  clientId: string | null;      // null once the contact is deleted
  clientName: string;
  issued: string;               // ISO YYYY-MM-DD
  expiry: string;
  status: QuoteStatus;
  description: string;
  items: QuoteLineItem[];
  extraDiscount: string;
  notes: string;
  deposit?: QuoteDeposit | null;
  expired?: boolean;            // server's lapsed flag, read before the date
  ndis: boolean;                // stored outright as quote_type
  // Optional: the list endpoint carries none of these; the detail does.
  recipients?: InvoiceRecipient[];
  quoteEmail?: string;
  attachments?: InvoiceAttachment[];
  convertCurrency?: boolean;
  exchangeRate?: number | null; // units of `currency` per one AUD
  rateEdited?: boolean;
  displayNote?: boolean;
  customNote?: string;
  templateId?: string;
  currency?: DocumentCurrency;  // absent means AUD
  audRate?: number;             // AUD per one unit of `currency`
  convertedInvoice?: string;    // invoice number once billed
};

export type QuoteDraft = Omit<Quote, "id" | "status">;
export const DEFAULT_QUOTE_VALIDITY = 7;

export type QuoteEventKind =
  | "created" | "sent" | "viewed" | "accepted" | "rejected" | "converted" | "expired";
export type QuoteEventStatus = "completed" | "pending" | "upcoming";
export type QuoteEvent = {
  kind: QuoteEventKind; label: string; status: QuoteEventStatus;
  at: string;       // YYYY-MM-DDTHH:MM, or "" for a step not yet reached
  detail?: string;
};

export type QuoteTemplateAccent = "indigo" | "orange" | "teal";
export type QuoteTemplate = {
  id: string; name: string; summary: string; accent: QuoteTemplateAccent;
  description: string; industry: string; ndis: boolean;
  items: { description: string; quantity: string; price: string; gst: boolean }[];
};

export type NextQuoteNumber = { number: string; note: string };
export const DEFAULT_QUOTE_NUMBERING: DocumentNumbering = { prefix: "QUO", next: "1" };
export const DEFAULT_QUOTE_PREVIEW_TEMPLATE_ID = "11";
```

Note the two rate directions: `exchangeRate` (detail/editor) is foreign
units **per AUD**, as stored; `audRate` (list) is its reciprocal, AUD **per
foreign unit**, computed by `reciprocalQuoteRate` (`undefined` for a zero or
missing rate so a total can't become `Infinity`).

**Pure functions** (signature + the one non-obvious rule each has):

- `quoteDisplayStatus(quote, today = todayIso()): QuoteDisplayStatus` —
  `convertedInvoice` → `"Converted"` first; any stored status other than
  `Sent` is returned as-is; a `Sent` quote is `"Expired"` if `expired` is set
  **or** `expiry && expiry < today` (string compare on ISO dates).
- `quoteStatusVariant(status)` — `Accepted→"success"`,
  **`Converted→"default"`** (not a second green), `Sent→"warning"`,
  `Declined`/`Expired→"danger"`, else `"secondary"`.
- `quoteAmount(quote)` — `invoiceTotals(items, extraDiscount).total`, in the
  quote's own currency.
- `quoteAmountAud(quote)` — `quoteAmount(quote) * (audRate ?? 1)`.
- `isForeignQuote(quote)` — `isForeignCurrency(quote.currency)`.
- `quoteDepositAmount(quote)` — `depositAmount(deposit ?? null,
  quoteAmount(quote))`.
- `quoteSummary(quotes)` — `{total, drafts, sent, acceptedValue}`; `sent`
  counts by **display** status (lapsed drop out), `acceptedValue` sums by
  **stored** status (converted stay in).
- `nextQuoteNumber(quotes, numbering = DEFAULT_QUOTE_NUMBERING)` — highest
  trailing digits + 1, floored by the configured `next` (digits only);
  blank prefix → `"QUO"`. Returns `${prefix}-${n}` with no zero padding.
- `emptyQuoteDraft(number, today)` — one `newLineItem()`, `expiry =
  addDays(today, 7)`, `deposit: null`, `exchangeRate: null`, every optional
  editor field filled with its blank. `emptyNdisQuoteDraft` is the same with
  one `newNdisLineItem()` and `ndis: true`.
- `draftFromQuote(quote)` — copies items as **new objects** (`{...item}`,
  same ids) and backfills every optional field with its blank.
- `formatQuoteEventTime(at)` — `"22 Jul 2026 · 9:12 am"`; `12` for both
  midnight and noon hours; a bare date (no finite hour) returns only
  `formatDateLabel(date)`.
- `quoteTemplateIndustryTag(t)` — `"NDIS"` if `t.ndis`; else `t.industry`
  unless blank or `"General"`.
- `quoteTemplateHref(t)` — `/quotes/new/${ndis ? "ndis" : "manual"}?template=${id}`.
- `invoiceDraftFromQuote(quote, blank: InvoiceDraft)` — **the quote → invoice
  prefill**: keeps the blank's number/dates/terms/notes, copies client,
  description, `extraDiscount`, and items **with fresh line ids**
  (`newLineItem().id`); the quote's `notes` deliberately don't cross over.
- `draftFromQuoteDefault(detail: ApiDefaultInvoiceDetail, blank: QuoteDraft)`
  — template prefill keeping the blank's number/issue/expiry;
  `payment_term` is ignored; NDIS lines are forced GST-free and an undated
  support takes `blank.issued`; general lines' `gst` is `gst_percentage > 0`.
  Template line discounts are not carried (no `discountPercent` mapping).
  Empty `invoice_item` keeps `blank.items`; blank `description` keeps the
  blank's.

**Internal mappers worth knowing** (not exported, exercised only through
`fetchQuotes`/`fetchQuoteDetail`):

- `isMultiCurrencyQuote(raw)` — `is_multicurrency == 1` **and** a
  `currency_code` that is present and not `"AUD"`.
- `quoteDisplayTotal(raw)` — `total` (always AUD) for a domestic quote; for a
  foreign one `exchange_total` if `> 0`, else `total * exchange_rate`, rounded
  to cents.
- `mapQuoteStatus(raw)` — `String(status ?? mark_as ?? "sent").toLowerCase()`;
  `rejected`/`declined` → `Declined`; anything unrecognised → `Sent`.
- `mapQuoteDeposit(raw)` — `null` unless `is_deposit == 1` and
  `deposit_value > 0`; `deposit_type === "percentage"` → `mode: "percent"`,
  anything else → `"amount"`.
- `mapApiQuote(raw)` — `clientId` prefers `client_id`, then
  `client.client_id`; the stand-in line is `quantity "1"`, `price =
  quoteDisplayTotal`, **`gst: false`** (so `quoteAmount` equals the row total);
  `convertedInvoice` = `invoice.invoice_no ?? String(invoice_id)` only when
  `converted == 1`.
- `itemDiscountPercent(raw)` (detail) — `disc_criteria === "percent"` reads
  `discount_percentage`; **any other value (including absent)** treats
  `discount_amount` as flat and converts it to a percentage of `qty * price`,
  rounded to 2 dp; `""` for zero gross or zero amount.
- `apiBool` — `true`, `1`, `"1"`, `"true"` only.
- Detail `convertCurrency` is `is_multicurrency == 1` alone — it does **not**
  apply `isMultiCurrencyQuote`'s non-AUD check, so an `is_multicurrency: 1,
  currency_code: "AUD"` row gets `convertCurrency: true` but no `currency`.
- `mapEventKind(key)` — substring match in this order: `sent`/`email`,
  `view`/`open`, `accept`/`approve`, `reject`/`declin`, `convert`/`invoice`,
  `expire`/`lapse`, else `created`. `eventStatus` — anything not
  `completed`/`pending` is `upcoming`. Blank `title` → `"Quote updated"`.

**Real API calls** (`BASE_URL` = `process.env.NEXT_PUBLIC_SOLE_OCR_URL ??
"http://localhost:3001/api"`):

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchQuotes(): Promise<Quote[]>` | GET | `apiRoutes.quote.list` → `/quote` | `{params: {page: 1, page_size: 200, "sort_by[quote_id]": "desc"}}` | `{success, data?: {quote_details?: ApiQuote[]}}` | **No `success` check**; defaults to `[]`. Search/filter/paging are client-side over this one page. |
| `fetchQuoteDetail(id): Promise<Quote>` | GET | `` `${apiRoutes.quote.info}${id}` `` → `/v2/quote/{id}` | — | `{success, message?, data?: ApiQuoteDetail}` | Throws `message \|\| "Quote not found"` if `data` is missing (checks presence of `data`, not `success`). |
| `fetchNextQuoteNumber(): Promise<NextQuoteNumber>` | GET | `apiRoutes.quote.getNo` → `/v2/quote-no` | — | `{success, data?: {no?, note?}}` | No `success` check; `""` fallbacks. The server owns the sequence (skips taken numbers). |
| `fetchQuoteHistory(id): Promise<QuoteEvent[]>` | GET | `apiRoutes.quote.history(id)` → `/v2/quote/{id}/history` | — | `{success, data?: {status?, currency_code?, timeline?}}` | No `success` check; `[]` without a timeline. Filters `key === "quote_converted"` when `data.status` is `rejected`. |
| `deleteQuoteApi(id): Promise<void>` | DELETE | `` `${apiRoutes.quote.delete}/${id}` `` → `/v2/quote/{id}` | — | `{success, message?}` | `assertApiSuccess(…, "Couldn't delete that quote.")`. No body at all. |
| `deleteQuotesApi(ids): Promise<void>` | POST (or DELETE for one id) | `apiRoutes.quote.bulkDelete` → `/quote/bulk-delete` | `{quote_ids: ids.map(Number)}` — **plain JSON, not `buildEncryptedRequestBody`** | `{success, message?}` | A single id delegates to `deleteQuoteApi`. Fallback `"Couldn't delete those quotes."`. |
| `downloadQuotesApi(ids): Promise<{blob, filename}>` | POST | `apiRoutes.quote.download` → `/quote/download` | `{data: ids}` (string ids, **plain, not encrypted**), `{responseType: "blob"}` | raw blob + headers | No success check. Filename: `x-filename` → `content-disposition` `Filename=` → `"quotes.zip"`. |
| `sendQuoteApi(id): Promise<void>` | POST | `apiRoutes.unibox.sendQuote(id)` → `/unibox/quotes/{id}/send` | none | `{success, message?}` | `assertApiSuccess(…, "Couldn't send that quote.")`. Distinct from the `send: 1` save flag. |
| `fetchQuoteTemplates(industryId): Promise<QuoteTemplate[]>` | GET | `apiRoutes.invoice.default` → `/invoice/default` | `{params: {module: "quote", is_quote: true, page_size: 100, industry_id?}}` | `{success, data?: {invoices?: ApiDefaultInvoice[]}}` | No `success` check. `name`: `category` → `"Untitled template"`; `summary`: `description` → `` `${label} template` ``; `accent` from `accentForId`. |
| `fetchQuotePdfBlob(quote): Promise<Blob>` | GET | `apiRoutes.quote.preview(templateId \|\| "11")` → `/quote/preview/{templateId}` | `{params: {quoteId, useDemo: "false", type: "quote", render_type: "pdf"}, responseType: "blob"}` | raw bytes | Wraps in `new Blob([...], {type: "application/pdf"})`; no success check. |
| `convertQuoteToInvoiceApi(quote): Promise<void>` | POST | `apiRoutes.invoice.convertToInvoice` → `/invoice/convert-quote` | `buildEncryptedRequestBody({id, due_date: quote.expiry \|\| toIsoDate(new Date())})` | `{success, message?}` | Encrypted (plain FormData → "Failed to decrypt payload"). `assertApiSuccess(…, "Couldn't convert that quote.")`. Server raises and links the invoice. |
| `sendQuoteReminderApi(id): Promise<void>` | POST | `apiRoutes.communicationPreference.sendReminder` → `/reminder/send-reminder` | `buildEncryptedRequestBody({id, type: "quote"})` | `{success, message?}` | `assertApiSuccess(…, "Couldn't send that reminder.")`. |

`assertApiSuccess` (from `lib/invoices`) only throws on `success === false`
exactly — an absent `success` is treated as success.

Docstring vs code: `convertQuoteToInvoiceApi`'s comment describes a
fallback chain "expiry, then its due date, then when it was sent, and today",
but the code only does `quote.expiry || toIsoDate(new Date())` — `Quote` has
no due-date or sent-date field to fall back to.

### Real contract — `lib/quote-submit.ts`

```ts
export type QuoteSubmitMode = "draft" | "send" | "print";

export type QuoteSubmitContext = {
  gstPercent: number;
  gstEnabled: boolean;
  templateId: string;          // the quote layout, not the invoice one
  exchangeRate: number | null; // units of document currency per one AUD
  files: File[];
  quoteId?: string;            // set when editing
};

export type SavedQuote = { id: string };
```

- `buildQuotePayload(draft, mode, context): Record<string, unknown>` —
  lines go through `billableEntries` (drops blank rows, keeps one if all are
  blank) with an editor-index → sent-index map for the deposit;
  **`converting = convertCurrency && currency && currency !== "AUD"`**, and
  only then is `context.exchangeRate` used. Top-level `sub_total`/
  `total_discount`/`total_gst`/`total`/`extra_discount` are always AUD
  (`audTotals`); `exchange_*` fields carry the document-currency figures, or
  `0` when not converting. `exchange_rate` (via `money`),
  `total_after_exchange` and `is_exchange_rate_edited` are added only when
  converting **and** the rate is truthy. `gst_percentage` only when
  `gstEnabled`. Mode → `save`/`send` as tested above. Deposit fields come
  from the shared `depositPayload` (also emits `deposit_selection_type`,
  `exchange_deposit_value`, `deposit_value_currency: "AUD"`,
  `deposit_selected_items`, `deposit_due_date` — see testing-invoices.md).
  Per-line fields come from the shared `itemPayload(item, gstPercent,
  draft.ndis)`.
- There is no payment-rail, recurrence or follow-up-reminder block — the
  invoice-only parts of `buildInvoicePayload`.

| Function | Method | Route | Body | Response envelope | Notes |
|---|---|---|---|---|---|
| `saveQuoteApi(draft, mode, context)` — create | POST | `apiRoutes.quote.add` → `/v2/quote` | `buildEncryptedRequestBody(payload, context.files)` — `{data}` without files, `FormData` (`data` + `files[]`) with | `{success, message?, data?: {quote_id?}}` | Throws `message \|\| "Couldn't save that quote."` on `success === false`; throws `"The quote saved but the server returned no id."` when `quote_id` is missing. |
| `saveQuoteApi(…)` — update (`context.quoteId` set) | PUT | `` `${apiRoutes.quote.update}${quoteId}` `` → `/v2/quote/{id}` | `buildEncryptedRequestBody(payload)` — **files never sent** | same | Returns `{id: context.quoteId}` without reading the response id. |

### `stores/quotes.ts` — audited, no dedicated test file

`useQuotesStore` is `{quotes, hydrated, setQuotes}` — one setter that also
flips `hydrated: true`, filled only by `hooks/use-quotes-query.ts`
(React Query `["quotes"]` → `setQuotes`). There are deliberately no local
mutators: every change goes to the server and returns through a refetch. No
guard, dedupe or fallback logic exists, so it's in the same category as
`stores/rules.ts` in the reference doc — a test would only re-assert
Zustand's `set`. (Minor: the `hydrated` doc comment reads "True until the
first real fetch lands", but it is `false` until then — the code is right,
the comment is inverted.)

---

## Gaps

No test covers any of the following. Listed, not written.

**`lib/quotes.ts` exported functions never exercised by a test:**

- `quoteStatusVariant` — including the `Converted → "default"` choice.
- `isForeignQuote`, `quoteDepositAmount` (used by `quotes-table.tsx`).
- `nextQuoteNumber` and `DEFAULT_QUOTE_NUMBERING` — also **unused anywhere in
  the app** (the editor calls `fetchNextQuoteNumber`; the
  `nextQuoteNumber` hits in `lib/sales-settings*.ts`/`lib/preview-doc.ts` are
  a same-named settings field, not this function). Either dead code or a
  test target — worth deciding.
- `emptyQuoteDraft`/`emptyNdisQuoteDraft` — only used as fixtures in
  `quote-submit.test.ts`; their own defaults (7-day expiry, blank fields) are
  asserted only indirectly via `valid_till`.
- `draftFromQuote` (edit/duplicate seeding — item copies share ids with the
  source quote, unlike `invoiceDraftFromQuote`).
- `formatQuoteEventTime` (12 am/pm edge, bare-date branch).
- `invoiceDraftFromQuote` — **the quote → invoice prefill has no test** (fresh
  line ids, notes not copied, blank's number/dates kept). Note it now only
  runs from `/invoices/new/general?quote=<id>`; nothing in `components/`
  links there any more since Convert moved to the server-side
  `convertQuoteToInvoiceApi`.
- `draftFromQuoteDefault` — template prefill (NDIS GST-forcing, undated
  support → `blank.issued`, discounts not carried).
- `fetchNextQuoteNumber` — route and `""` fallbacks.
- `deleteQuoteApi` directly — covered only via `deleteQuotesApi` with one id.

**Branches inside tested functions that have no case:**

- `fetchQuotes`: `mapQuoteDeposit` (list deposits), `expired` flag and
  `template_id` mapping, the `exchange_total`-missing fallback
  (`total * exchange_rate`), a zero/absent `exchange_rate` (`audRate`
  undefined), `invoice_id` fallback when `invoice.invoice_no` is absent.
- `fetchQuoteDetail`: `convertCurrency`/`exchangeRate`, `displayNote`,
  `customNote`, `productId`, `qtyType`, the `disc_criteria: "percent"` path,
  and the `quote_item: []` → keep stand-in line branch.
- `fetchQuoteHistory`: `mapEventKind`'s `viewed`/`rejected`/`expired`
  branches and the `"Quote updated"` blank-title fallback.
- Failure paths for `deleteQuotesApi` (bulk), `sendQuoteApi`,
  `sendQuoteReminderApi`; `fetchQuoteTemplates`' `"Untitled template"` /
  `` `${label} template` `` fallbacks.
- `buildQuotePayload`: an `items`-mode deposit (index remapping after a blank
  row is dropped), a converting draft with a `null` rate, the `print`/`send`
  modes combined with `quoteId`.

**Files with no test at all:**

- `stores/quotes.ts` — audited above, not worth one.
- `hooks/use-quotes-query.ts`, `hooks/use-quote-pdf.ts` — React hooks; no
  hook-testing setup exists in the repo.
- `components/quotes/*.tsx` (11 files) — none export a pure function to test
  in the `business-profile-form.tsx` style; list filtering/search,
  convert-confirmation (`startConvert` skips the prompt only for
  `Accepted`) and duplicate routing (`?duplicate=` to the NDIS vs manual
  editor) live inside components.
- `lib/invoice-templates.ts` (shared: `accentForId`,
  `fetchInvoiceDefaultDetail`) has no `.test.ts` — see testing-invoices.md.

**Observations, not coverage gaps:**

- `deleteQuotesApi` (bulk) and `downloadQuotesApi` send **plain JSON**, not
  `buildEncryptedRequestBody` — they diverge from the repo's convention that
  non-GET bodies are encrypted. Tests assert the plain shape as it is today.
- `apiRoutes.quote.summary` (`/quote/statistics`) and `apiRoutes.quote.default`
  (`/quote/default`) are defined but unused: the summary cards are derived by
  `quoteSummary`, and templates use `apiRoutes.invoice.default`.

---

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`.
Assert against the `apiRoutes.x.y` constant from `@/config/api-routes`, as
both test files do.

| Constant | Resolves to |
|---|---|
| `apiRoutes.quote.list` | `BASE_URL + "/quote"` |
| `apiRoutes.quote.add` | `BASE_URL + "/v2/quote"` |
| `apiRoutes.quote.delete` | `BASE_URL + "/v2/quote"` (`/{id}` appended) |
| `apiRoutes.quote.bulkDelete` | `BASE_URL + "/quote/bulk-delete"` |
| `apiRoutes.quote.update` | `BASE_URL + "/v2/quote/"` (id appended, trailing slash included) |
| `apiRoutes.quote.info` | `BASE_URL + "/v2/quote/"` (id appended) |
| `apiRoutes.quote.history(id)` | `` `${BASE_URL}/v2/quote/${id}/history` `` |
| `apiRoutes.quote.getNo` | `BASE_URL + "/v2/quote-no"` |
| `apiRoutes.quote.download` | `BASE_URL + "/quote/download"` |
| `apiRoutes.quote.preview(templateId)` | `` `${BASE_URL}/quote/preview/${templateId}` `` |
| `apiRoutes.quote.summary` (unused) | `BASE_URL + "/quote/statistics"` |
| `apiRoutes.quote.default` (unused) | `BASE_URL + "/quote/default"` |
| `apiRoutes.invoice.default` | `BASE_URL + "/invoice/default"` |
| `apiRoutes.invoice.defaultDetail(id)` | `` `${BASE_URL}/invoice/default/${id}` `` |
| `apiRoutes.invoice.convertToInvoice` | `BASE_URL + "/invoice/convert-quote"` |
| `apiRoutes.unibox.sendQuote(id)` | `` `${BASE_URL}/unibox/quotes/${id}/send` `` |
| `apiRoutes.communicationPreference.sendReminder` | `BASE_URL + "/reminder/send-reminder"` |
