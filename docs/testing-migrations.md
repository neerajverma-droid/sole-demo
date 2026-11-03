# Testing: Migrations (Data Migration Center / bulk import)

Reference for test coverage of the Data Migration Center at `/migrations`
(`app/(app)/migrations/page.tsx` → `components/migrations/migrations-screen.tsx`)
and the five importers it launches. The page itself owns no import logic: it
is a hub that lists `MIGRATION_STEPS` (`lib/migrations.ts`), shows each step's
cumulative "N imported" count from `stores/migrations.ts`, and opens either
a route or an atom-driven dialog:

| Step | Opens | Engine | Write |
|---|---|---|---|
| 1 Bank Transactions | route `/transactions/bulk` → `BulkUploadWizard` | `lib/transaction-import.ts` | `lib/bulk-transactions.ts` (validate, then upload) |
| 2 Clients & Suppliers | `BulkUploadDialog` (`bulkUploadOpenAtom`) | `lib/bulk-import.ts` + `CONTACT_IMPORT_SPEC` | `bulkCreateContactsApi` (`lib/contacts-api.ts`) |
| 3 Invoices | `InvoiceBulkUploadDialog` (`invoiceBulkOpenAtom`) | `lib/bulk-import.ts` + `INVOICE_IMPORT_SPEC` | `createBulkInvoices` (`lib/bulk-records.ts`) |
| 4 Expenses | `ExpenseBulkUploadDialog` (`expenseBulkOpenAtom`) | `lib/bulk-import.ts` + `expenseImportSpec(categories)` | `createBulkExpenses` |
| 5 Assets | `AssetBulkUploadDialog` (`assetBulkOpenAtom`) | `lib/bulk-import.ts` + `assetImportSpec(categories)` | `createBulkAssets` |

Steps 2–5 all render the one shared `components/bulk/bulk-import-dialog.tsx`
(Import → Map → Review → Done), parameterised by a `BulkImportSpec`. Step 1 is
its own six-step wizard (Import → Map data → Review → Matching rules → Sole
fields → Done). Both read the file through `lib/file-parser.ts` and both call
`recordImport` on the migrations store when they finish, which is what turns
a step green on the hub.

All six test files below are **pre-existing** team work on
`feat/api-integration` (commits `20a9463`/`1b391db`), described here for
completeness, not claimed as new. They are Vitest unit tests in the plain
`node` environment — no DOM, no rendering. Only `lib/bulk-transactions.test.ts`
touches the network layer, using the repo's usual mocked
`@/utils/axiosInstance` + dynamic-import convention and decrypting the sent
body with `decryptPayload`. For copy-pasteable test templates see
"Writing a new test in this codebase" in
[`testing-coverage.md`](./testing-coverage.md) — not duplicated here.

**Working-tree note**: this doc reflects the code on disk, including
uncommitted changes. `lib/transaction-import.ts`,
`components/bulk/bulk-import-dialog.tsx`,
`components/transactions/bulk-upload-wizard.tsx` and `config/api-routes.ts`
are modified, and `lib/ai-format.ts` + `components/bulk/use-import-file-reader.ts`
are new and untracked. Together they route every importer's file read through
a new AI-format endpoint with a local-parse fallback (see `lib/ai-format.ts`
below). None of the six test files was changed by that work.

## Running them

```bash
npx vitest run lib/bulk-import.test.ts lib/module-imports.test.ts \
  lib/file-parser.test.ts lib/transaction-import.test.ts \
  lib/bulk-transactions.test.ts hooks/use-bulk-transaction-parties.test.ts
```

Today's full run: **1285 tests pass repo-wide**. The six files here come to
**123** tests. The contacts step's write, `bulkCreateContactsApi`, is covered
separately by 10 tests in `lib/contacts-api.test.ts` (Contacts module, not
counted here).

| File | Tests | Covers |
|---|---|---|
| `lib/bulk-import.test.ts` | 28 | The shared engine: mapping, row building, issue grouping, CSV export, value coercions, `matchCategory` |
| `lib/module-imports.test.ts` | 36 | The four specs (contacts/invoices/expenses/assets): template self-consistency, per-module rules, payload builders |
| `lib/file-parser.test.ts` | 12 | File-type check, CSV/XLSX parsing, prototype-pollution guard, header auto-mapping, `csvRow` quoting |
| `lib/transaction-import.test.ts` | 25 | The transaction wizard's parsing/validation, which mirrors the backend's batch-level checks |
| `lib/bulk-transactions.test.ts` | 16 | The validate → Sole Fields → upload API pair and its client-side completeness check |
| `hooks/use-bulk-transaction-parties.test.ts` | 6 | `partyOptions`: client/supplier pickers for the Sole Fields step |

---

## The shared engine

### `lib/bulk-import.test.ts` (28 tests)

Uses a miniature "widget" `BulkImportSpec` so every part of the spec the
engine reads is exercised without depending on a real module.

- **`fieldOptions` / `reviewFields`** — every field plus the
  `DO_NOT_IMPORT` opt-out; only fields with a `review` block get a Review
  column.
- **`autoMapBulkColumns`** — exact header, alias match regardless of case
  and punctuation (`"Widget-Name"`, `"TOTAL"`), unplaceable column →
  `"Do not import"`, and **one field is never claimed for two columns**
  (`["Amount", "Total"]` maps Amount once only).
- **`duplicateBulkMappings`** — names a twice-mapped field; repeated
  `DO_NOT_IMPORT` is not a duplicate.
- **`buildBulkRows`** — reads cells **through the mapping, not by
  position** (the bug the Map step exists to fix), trims values, an unmapped
  required field becomes `""` and is flagged, an empty sheet gives `[]`.
- **`withBulkIssues`** — re-derives issues from current values (a stale
  `issues` array is discarded).
- **`groupBulkIssues`** — collapses one issue into `"2 rows are missing a
  name"`, sorted commonest first.
- **`bulkTemplateCsv` / `bulkErrorRowsCsv`** — template headers round-trip
  through the auto-mapper, **every sample row passes the spec's own
  validation**, and the error export keeps only failing rows with the reason
  appended and a comma-bearing cell quoted.
- **`parseBulkDate`** — `DD/MM/YYYY`, `D.M.YYYY` and ISO; rejects
  `31/02/2025`, free text and blank.
- **`todayIso`** — pinned with fake timers to a *local* time; asserts the
  local date, not UTC.
- **`parseBulkBoolean`** — `Yes`/`1`/`no`/`FALSE`, strips a trailing `\r`
  from a CRLF file, `null` for blank or unknown so "required" stays
  detectable.
- **`isMoney` / `isPhone`** — `$1,120.00` and `0` are money, `-5`/text/blank
  aren't; phone accepts `+61 411 111 111` and `(03) 9000-1000`, rejects `123`.
- **`matchCategory`** — exact (case-insensitive), substring either way
  round, a numeric cell is an id **only if that id exists**, and **no fuzzy
  fallback** (`"Ofice suplies"` → `null`), deliberately unlike sole-webapp's
  Levenshtein pass.

### `lib/module-imports.test.ts` (36 tests)

Clock pinned to `2025-09-21` local for the future-date rules. A `values()`
helper blanks every field so each test states only what it varies.

- **Template self-consistency** (`describe.each`, 4 specs × 2 = 8 tests) —
  for contacts, invoices, expenses (with one category) and assets (with one
  category): headers auto-map back onto `templateColumns`, and every sample
  row passes `bulkRowIssues`.
- **Invoice import** (8) — valid with just Client name / Sub total / Total
  GST; **Invoice number is optional** (backend generates one); the three
  required-field messages; `Total GST: "0"` is accepted; an `Overdue` row
  needs a Due date strictly in the past; `invoicePayload` **calculates
  `total = sub_total + total_gst`** rather than reading it; dates → ISO,
  blank due date → `""`, `payment_term` defaults to `30`; `mark_as` defaults
  to `"draft"` and is lower-cased.
- **Expense import** (8) — GST included and Paid must be an explicit Yes/No;
  an unknown category is flagged, **but not while the category list is
  empty** (the loading tick — the dialog blocks import meanwhile); future
  date rejected; `splitGst(110, true)` → `{100, 10}`, not inclusive → gross
  as sub-total, `0` → zeros; `expensePayload` resolves the category id, and
  asserts `sub_total + total_gst ≈ price` to 2dp, `gst: 1`,
  `paid_with_cash: true`.
- **Asset import** (5) — GST larger than price rejected (`234.90` on
  `2349.00` passes); future purchase date rejected; `assetPayload` full
  shape via `toEqual`; a blank supplier is sent as `null`, not `""`.
- **Contact import** (7) — email required of a Client but not a Supplier;
  business name required only for a Business; sole-webapp's `"bussiness"`
  spelling tolerated; `contactPayload` sends `Type` as `1`/`2` and defaults
  `Currency: "AUD"`, a mapped Currency wins, and an empty optional
  (`Website`) is omitted rather than sent blank.

### Real contract — `lib/bulk-import.ts`

**Types** (verbatim, doc comments trimmed):

```ts
export type BulkFieldEditor =
  | { kind: "text"; inputMode?: "text" | "tel" | "decimal" | "email" }
  | { kind: "select"; options: readonly string[]; placeholder?: string };

export type BulkField = {
  label: string;          // Map dropdown entry, template header AND row key
  apiKey?: string;
  required?: boolean;
  desc?: string;
  aliases?: readonly string[];
  review?: { heading: string; editor: BulkFieldEditor; mono?: boolean };
};

export type BulkIssue = { message: string; summary: string; test: (values: BulkValues) => boolean };
export type BulkValues = Record<string, string>;
export type BulkRow = { index: number; values: BulkValues; issues: string[] };

export type BulkImportSpec = {
  title: string; description: string; noun: string; nounPlural: string;
  migrationStep: MigrationStepId;   // which hub step a finished import ticks off
  fields: readonly BulkField[];
  templateColumns: readonly string[];
  sampleRows: readonly (readonly string[])[];
  issues: readonly BulkIssue[];
  templateFilename: string; errorsFilename: string; rowLabelField: string;
};

export const DO_NOT_IMPORT = "Do not import";

export type BulkResultRow = {
  row: number; status: "success" | "skipped" | "failed"; identifier?: string; message?: string;
};
export type BulkImportResult = { created: number; failed: number; skipped: number; rows?: BulkResultRow[] };
```

**Pure functions** (signature + the one non-obvious rule each has):

- `autoMapBulkColumns(spec, columns): Record<number, string>` — wraps
  `autoMapColumns` with the spec's aliases; first column to claim a field
  keeps it, every later claimant becomes `DO_NOT_IMPORT`.
- `duplicateBulkMappings(mapping): string[]` — skips `DO_NOT_IMPORT` only.
- `buildBulkRows(spec, columns, sheetRows, mapping): BulkRow[]` — resolves
  each field's source column once (not per row); cells are `.trim()`ed.
- `groupBulkIssues(spec, rows)` — groups in `spec.issues` order, drops empty
  groups, then sorts by row count descending.
- `bulkTemplateCsv(spec)` / `bulkErrorRowsCsv(spec, rows)` — CRLF-joined;
  the error file uses `templateColumns` + `"Error"` (issues joined `"; "`),
  so fields outside the template are **not** in the error export.
- `parseBulkDate(value): string | null` — ISO, or `D/M/YYYY` with `/`, `.`
  or `-` separators; `isRealDate` rejects impossible days via a UTC
  round-trip.
- `todayIso()` — browser-local `yyyy-MM-dd`.
- `bulkNumber(value)` — strips `$`, `,`, whitespace; `NaN` for empty.
- `isMoney(value)` — finite and `>= 0` (so `"0"` passes).
- `parseBulkBoolean(value)` — true: `true/yes/y/1/paid/included`; false:
  `false/no/n/0/unpaid/excluded`; else `null`.
- `isEmail` — `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. `isPhone` — strips
  `\s()-`, then `/^\+?\d{8,15}$/`.
- `matchCategory(value, options): string | null` — all-digit cell is an id
  (must exist); then exact name; then substring **in either direction**;
  `null` for blank or empty `options`.

### Real contract — the four specs

| Spec | Required | Rules worth knowing | Payload builder |
|---|---|---|---|
| `CONTACT_IMPORT_SPEC` (`lib/contact-import.ts`) | Contact name, Type, Business type | Contact name needs **1** char (not 2 — the backend's own rule); email only validated when present, required only for `/^client$/i`; `business\|bussiness\|individual`; phone checked only when present. 20 fields, 6 in the template/Review. | `contactPayload(values)` — each non-empty field under its `apiKey`; `Type` = `2` for `/^supplier$/i`, else **`1`** (anything unrecognised becomes a client); `Currency` defaults `"AUD"`. |
| `INVOICE_IMPORT_SPEC` (`lib/invoice-import.ts`) | Client name, Sub total, Total GST | `INVOICE_IMPORT_STATUSES = ["Draft","Paid","Overdue"]`; Overdue requires `parseBulkDate(due) < todayIso()` (**today itself fails**); email/phone checked only when present. No "Total" field exists to map. | `invoicePayload(values)` — `total` computed; `currency: "AUD"`, `total_discount: 0`, `show_bank_details: 1`, `is_payrixpay: 0`, `is_InstantPay: 0`, `template_id: 1` all hard-coded; `payment_term` = file value if `> 0` else `30`. |
| `expenseImportSpec(categories)` (`lib/expense-import.ts`) | Expense name, Supplier name, Date, Total amount, GST included, Category, Paid | Date is **required** here (unlike invoices); future date rejected (`> todayIso()`, so today passes); category-match rule only active when `categories.length > 0`; sample rows use the real category names when supplied. | `expensePayload(values, categories)` — `splitGst` at 10%; `name` falls back to `"Untitled Expense"`; unreadable date → `todayIso()`; `bulk_upload: true`; blank supplier fields → `null`. |
| `assetImportSpec(categories)` (`lib/asset-bulk-import.ts`) | Asset name, Category, Purchase date, Purchase price, Paid | GST > price rejected (only when both parse); same empty-list suppression of the category rule. `Supplier phone` and `Description` are fields with **no `apiKey` and not sent** by `assetPayload`. | `assetPayload(values, categories)` — `name` falls back to `"Unnamed Asset"`, unreadable date → `todayIso()`, `gst_amount` `0` when blank, `client_name` `null` when blank. No brand/type columns exist. |

`splitGst(total, inclusive)` (verbatim rule): if `!inclusive || !(total > 0)`
→ `{ subTotal: total.toFixed(2), totalGst: 0 }`; else `subTotal = total/1.1`,
`totalGst = total - subTotal`, each rounded to 2dp **independently** (so the
two can in principle sum to a cent off `price`; the test only asserts
`toBeCloseTo(…, 2)`).

### Real contract — `lib/bulk-records.ts`

One private `postBulk(url, key, rows)` behind three exports:

| Function | Method | Route | Body | Response envelope | Notes |
|---|---|---|---|---|---|
| `createBulkInvoices(rows: InvoiceImportPayload[])` | POST | `apiRoutes.invoice.bulkCreate` → `/invoice/bulk/create` | `buildEncryptedRequestBody({ invoices: rows })` | `{success?, message?, data?: unknown[], error?}` | Encrypted (sole-webapp posts these in the clear; the three sole-ocr controllers had `handlePayload` added for it). |
| `createBulkExpenses(rows: ExpenseImportPayload[])` | POST | `apiRoutes.expense.bulkCreate` → `/expense/bulk/create` | `buildEncryptedRequestBody({ expenses: rows })` | same | same |
| `createBulkAssets(rows: AssetImportPayload[])` | POST | `apiRoutes.asset.bulkCreate` → `/assets/bulk/create` | `buildEncryptedRequestBody({ assets: rows })` | same | same |

Shared behaviour: throws `"There are no rows to import."` for `[]` before any
request; throws `message || error || "The import failed."` on
`success === false` (a missing `success` is **not** a failure);
`created = data.length` if `data` is an array, else **`rows.length`** (a 2xx
with no echo is read as the whole batch landing); `failed = max(rows - created,
0)`; `skipped: 0` always (all-or-nothing endpoints); never returns `rows`.

### Real contract — `lib/contacts-api.ts` (`bulkCreateContactsApi` only)

| Function | Method | Route | Body | Response envelope | Notes |
|---|---|---|---|---|---|
| `bulkCreateContactsApi(rows: BulkRow[])` | POST | `apiRoutes.client.bulkInsert` → `/client/bulk/create` | `buildEncryptedRequestBody({ type: "upload", file_data: contactPayloads(rows) })` | `{success?, message?, data?: {row?, status?, identifier?, message?}[], meta?: {total?, created?, skipped?, failed?}}` | Throws `"File is empty"` for `[]`; `message \|\| "Failed to import contacts."` on `success === false`. Counts from `meta`; with no `meta`, counted from the per-row log; with neither, every row succeeded. An unknown per-row status maps to `"failed"`. Tested in `lib/contacts-api.test.ts` (10 tests). |

---

## File reading

### `lib/file-parser.test.ts` (12 tests)

- **`isSupportedImportFile`** — `.csv`, `.XLSX` (case-insensitive), `.xls`
  accepted; `.pdf` refused.
- **`parseSpreadsheet`** — CSV → headers + rows; a quoted comma stays in
  its cell; a **real in-memory `.xlsx`** built with SheetJS goes through the
  same path (number `1120` comes back as the string `"1120"`); blank header
  columns and fully empty rows dropped; an empty file returns
  `{columns: [], rows: []}` rather than throwing; a column headed
  `__proto__` is an ordinary key and **nothing leaks onto
  `Object.prototype`** (null-prototype row objects + `header: 1` mode, to
  avoid SheetJS 0.18's object-mode prototype-pollution advisory).
- **`autoMapColumns`** — exact match, alias match ignoring case/punctuation
  (`"Posted-Date"`), an unrelated column is **absent** from the result (not
  mapped to a weak guess), a blank header ignored.
- **`csvRow`** — quotes only cells containing `"`, `,`, `\r` or `\n`, and
  doubles embedded quotes.

### Real contract — `lib/file-parser.ts`

```ts
export const IMPORT_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx"] as const;
export type ParsedSheet = { columns: string[]; rows: Record<string, string>[] };
```

- `parseSpreadsheet(file): Promise<ParsedSheet>` — first sheet only; every
  cell stringified and trimmed. The private `convertExcelDate` rewrites a
  cell to ISO **only if its header matches `/date/i`** and the value is a
  5-digit serial strictly between `25000` and `50000` (≈1968–2036); anything
  else passes through.
- `autoMapColumns(fileColumns, targetFields, aliases = {})` — scoring: exact
  normalised match `100` (stops searching), alias `95`, else partial overlap
  summing the lengths of words **of 3+ letters** that overlap; a mapping is
  kept only if the best score is **`> 5`**. Columns below that are omitted.
- `downloadCsv(filename, content)` — prepends a UTF-8 BOM so Excel doesn't
  read the file as Latin-1; DOM-only.

### Real contract — `lib/ai-format.ts` (untracked, working tree only)

New with the uncommitted changes. Both `BulkImportDialog` and
`BulkUploadWizard` now read files via `useImportFileReader(target)` →
`readImportFile(file, target)` instead of calling `parseSpreadsheet` directly.

```ts
export type AiFormatField = { label: string; required?: boolean; description?: string; options?: readonly string[] };
export type AiFormatTarget = { type: MigrationStepId; fields: readonly AiFormatField[] };
export type ImportFileResult =
  | { ok: true; sheet: ParsedSheet; aiFormatted: boolean; notes: string[]; aiError?: string }
  | { ok: false; error: string };
```

- `aiTargetFromBulkSpec(spec)` — `type: spec.migrationStep`; each field's
  `label`/`required`/`desc`; `options` only for a `select` Review editor.
  The transaction wizard uses the hand-written `TXN_AI_TARGET` instead.
- `readImportFile(file, target)` — order of checks: unsupported extension →
  `{ok:false, "Upload a CSV or Excel file (.csv, .xls, .xlsx)."}`; over 5 MB →
  `{ok:false, "That file is over 5 MB. Split it and try again."}`; AI call; if
  the AI returns rows → `aiFormatted: true`; if it returns **zero** rows or
  throws, falls back to `parseSpreadsheet` with `aiError` set; local parse
  with no rows → `"That file has no data rows below the header."`; local
  parse throws → `"That file could not be read."`.

| Function | Method | Route | Body | Response envelope | Notes |
|---|---|---|---|---|---|
| `aiFormatFile(file, target)` (private) | POST | `apiRoutes.migration.aiFormat` → `/v2/migration/ai-format` (route added in the working tree) | `buildEncryptedRequestBody({ type, fields }, { file })` — multipart `FormData` with the encrypted `data` field plus `file` | `{success?, message?, data?: {columns?, rows?, notes?}}` | Throws `message \|\| "AI formatting failed."` on `success === false` or no `data`; `columns` defaults to the target's labels. |

`useImportFileReader` (`components/bulk/use-import-file-reader.ts`) adds a
`formatting` flag, a success/warning toast, and **latest-read-wins**: a file
picked while an earlier one is still formatting makes the earlier `read`
resolve to `null`; `cancel()` (called from each importer's `reset`) does the
same.

---

## Bank Transactions (step 1)

### `lib/transaction-import.test.ts` (25 tests)

Clock pinned to `2025-09-21T10:00:00Z` for the future-date rule.

- **`parseImportDate`** — `20/07/2025`, `5/7/2025`, ISO; rejects
  `31/02/2025`, `20/13/2025`, `"July 20"`, `""`.
- **`txnRowIssues`** — valid row clean; bank spellings `CR` / `Money out`
  accepted for Type, `Transfer` refused; amount `0`, `-5` and `100000000`
  (above the backend's `99,999,999.99` ceiling) refused; `$1,120.00`
  accepted; **future date flagged, today accepted**; description needs 3
  characters (`ab` fails, `abc` passes) to match the backend's
  `validateBulkTransactionRowBasic`.
- **`withTxnIssues`** / **`groupTxnIssues`** — re-derivation and the
  `"2 rows are missing a valid Amount"` headline.
- **`autoMapTxnColumns`** — real bank headers (`Transaction Date`,
  `Narrative`, `Amount`, `Type`) map correctly; unknown → `"Don't import"`;
  `["Date", "Transaction Date"]` maps Date once only.
- **`duplicateTxnMappings`** — repeats of non-backend options are ignored.
- **`buildTxnRows`** — reads through the mapping; **keeps the file's own
  wording for Type** (`"CR"` stays `"CR"` on the Review table, canonicalised
  only on the way to the backend) while still validating clean; unmapped
  Amount → `""` and `"Invalid amount"`.
- **`canonicalTxnType`** / **`importAmount`** — spellings normalised,
  `"nope"` → `0`.
- **`txnErrorRowsCsv`** / **`txnTemplateCsv`** — only failing rows, quoted
  comma; template headers round-trip and every sample row validates.

### `lib/bulk-transactions.test.ts` (16 tests)

The only test file here that mocks `@/utils/axiosInstance`; bodies are
decrypted with `decryptPayload` and asserted to be a bare `{data}` envelope.

- **`validateBulkTransactions`** — posts `type: "validate"` with
  `transaction_data` to `bulkInsert`; throws the server's own message on
  `success: false`.
- **`soleFieldIssue`** — no account → fine (plain unmatched import); fully
  matched → fine; missing party → `"Select a client…"` for a credit,
  `"Select a supplier…"` for a debit; matched debit needs a non-blank name;
  **capital rows are the mirror image** — refused for carrying a client, fine
  once client/contact/name are all cleared.
- **`firstSoleFieldError`** — `"Row 2: …"`, numbered from one; `null` when
  every row would survive.
- **`toUploadRows`** — an unmatched row is sent with exactly six keys;
  **`client_id`/`contact_id` are moved inside `client`**, because the
  backend's `normalizeBulkTransactionRow` reads `txData.client?.client_id`
  and ignores the top-level copies; capital rows sent with `client: null` and
  `name: ""`; `gst_include: false` preserved.
- **`uploadBulkTransactions`** — posts `type: "upload"`, returns the
  server's counts; with no counts, every row landed; a rejected batch throws
  with `"Row 2: Transaction date cannot be in the future"` appended.

### `hooks/use-bulk-transaction-parties.test.ts` (6 tests)

Only the exported pure `partyOptions(contacts)`, not the `useQueries` hook.

- One option per client carrying the contact id; **the primary contact wins
  regardless of arrival order**; with no primary, the first seen keeps the
  slot; name falls back `clientName` → contact `name` → `"Unnamed"`; a
  contact with no `clientId` is dropped; sorted by name with `localeCompare`;
  `undefined` → `[]`.

### Real contract — `lib/transaction-import.ts`

```ts
export const TXN_CSV_COLUMNS = ["Transaction type", "Amount", "Date", "Description"] as const;
export const TXN_FIELD_OPTIONS = [...TXN_CSV_COLUMNS, "Category", "Reference", "Don't import"] as const;
export type ParsedTxnValues = { type: string; amount: string; date: string; description: string };
export type ParsedTxnRow = ParsedTxnValues & { index: number; issues: string[] };
export const TXN_REVIEW_TABS = ["All rows", "Clean rows", "Rows with issues"] as const;
export const TXN_AI_TARGET: AiFormatTarget; // working tree only — type "transactions", the 4 template columns
```

- `ROW_ISSUES` (private) — amount must match `/^\d+(\.\d{1,2})?$/` after
  stripping `$`, `,`, whitespace, so **three decimal places are refused**;
  `> 0` and `<= 99_999_999.99`. Future date is `iso > todayIso()` (local).
- `parseImportDate(value)` — same shape as `parseBulkDate` but accepts only
  `/` or `-` separators (not `.`), and calls `value.trim()` without a null
  guard. This module keeps its own private `todayIso`/`isRealDate` copies.
- `duplicateTxnMappings(mapping)` — only counts the four
  `TXN_CSV_COLUMNS`; `"Category"`/`"Reference"` are offered in the dropdown
  but never reach the backend, so mapping two columns to them isn't a
  duplicate.
- `canonicalTxnType(value)` — Credit: `credit|cr|c|money in|deposit|in`;
  Debit: `debit|dr|d|money out|withdrawal|out`; else `""`.
- `importAmount(value)` — `Number(stripped) || 0`.
- `filterReviewRows(rows, tab)` — Clean / Rows with issues / All.

The wizard (`components/transactions/bulk-upload-wizard.tsx`) builds the
validate payload from **clean rows only**: `type` is `"credit"` iff
`canonicalTxnType === "Credit"`, else `"debit"`; `transaction_date` from
`parseImportDate`; `amount` from `importAmount`; `account_subcategory_id: 0`;
`gst_include: true`. It then runs `firstSoleFieldError` before upload and
calls `recordImport("transactions", outcome.succeeded)`.

### Real contract — `lib/bulk-transactions.ts`

```ts
export type BulkTransactionRow = {
  type: "credit" | "debit";
  transaction_date: string;         // yyyy-MM-dd
  amount: number;
  description: string;
  account_subcategory_id: number;   // 0 = no category
  account_subcategory?: { account_subcategory_id?: number; name?: string; capital?: boolean; disabled?: boolean } | null;
  gst_include: boolean;
  client?: { id?: number; name?: string; client_id?: number; contact_id?: number } | null;
  name?: string;
};
export type ValidatedTransactionRow = BulkTransactionRow & {
  client_id?: number | null; contact_id?: number | null; errors?: string[]; is_valid?: boolean;
};
export type BulkUploadResult = { succeeded: number; failed: number; total: number };
```

| Function | Method | Route | Body | Response envelope | Notes |
|---|---|---|---|---|---|
| `validateBulkTransactions(rows)` | POST | `apiRoutes.bulkTransaction.bulkInsert` → `/v2/bulk-transactions/bulk-insert` | `buildEncryptedRequestBody({ type: "validate", transaction_data: rows })` | `{success?, message?, data?: {transactions?: ValidatedTransactionRow[]}}` | Throws `message \|\| "Could not validate the import."` on `success === false`; else `data.transactions ?? []`. `is_valid` is passed through, not acted on. |
| `uploadBulkTransactions(rows)` | POST | same route | `buildEncryptedRequestBody({ type: "upload", transaction_data: rows })` | `{success?, message?, data?: {transactions?, data?: {success_transactions?, failed_transactions?, total_transactions?}}}` | On `success === false` throws `message \|\| "Failed to import transactions."` joined with up to **3** `"Row N: err1, err2"` reasons from rows with `is_valid === false`. Counts nest under `data.data`; `total`/`succeeded` default to `rows.length`, `failed` to `total - succeeded`. |

Pure: `soleFieldIssue` (rules above; a capital row counts `client`,
`client_id`, `contact_id` or a non-blank `name` as "carrying"),
`firstSoleFieldError`, `toUploadRows` (`gst_include ?? true`; unmatched rows
reset to `account_subcategory_id: 0` and drop everything else).

### Real contract — `hooks/use-bulk-transaction-parties.ts` and friends

| Function | Method | Route | Params | Response | Notes |
|---|---|---|---|---|---|
| `fetchInvoiceContacts(type: 1 \| 2)` (`lib/invoice-clients.ts`) | GET | `apiRoutes.companyContact.list` → `/contact/list` | `{ params: { type } }` | `{success, data?: ApiInvoiceContact[]}` | No `success` check. `useBulkTransactionParties` fires both (`["bulk-parties", 1]` clients, `["bulk-parties", 2]` suppliers) up front, `staleTime` 5 min; `partiesFor("credit")` → clients, else suppliers. |
| `fetchRuleCategories()` (`lib/rules.ts`, via `useAccountCategoriesQuery`) | GET | `apiRoutes.accountCategory.list` → `/account-categories/list` | — | `{data?: {account_categories}}` | Shared query key `["account-categories"]`, `staleTime: Infinity`; `select` filters to `parentName === "Expenses" \| "Assets" \| "Income"` (exact, case-sensitive) and sorts by name. Feeds the expense/asset specs and the wizard's account pickers. Tested in `lib/rules.test.ts`. |

`hooks/use-bulk-transaction-import.ts` wraps validate/upload as mutations;
upload runs `toUploadRows` first and invalidates
`["transaction-listing-report"]` and `["rule-sync-stats"]`.

---

## The hub itself

### Real contract — `lib/migrations.ts`

```ts
export const MIGRATION_HREF = "/migrations";
export type MigrationStepId = "transactions" | "contacts" | "invoices" | "expenses" | "assets";
export type MigrationDialogId = "contacts" | "invoices" | "expenses" | "assets";
export type MigrationTarget = { kind: "route"; href: string } | { kind: "dialog"; dialog: MigrationDialogId };
export type MigrationStep = {
  id: MigrationStepId; order: number; title: string; description: string;
  icon: LucideIcon; noun: string; target: MigrationTarget;
};
```

`MIGRATION_STEPS` is the five rows in the order above (only `transactions`
is a `route`). `migrationStep(id)` falls back to `MIGRATION_STEPS[0]` for an
unknown id. The screen's own logic: counts read `0` until
`useMigrationsHydrated()` is true (avoids a frame of all-grey rows), and the
"Start here" row is the **first step whose count is 0** — so finishing step 3
before step 1 still leads with step 1. Order is recommended, never enforced.

### `stores/migrations.ts` — audited, no test file

Unlike `stores/rules.ts` (plain setters), this store has real logic worth
pinning down:

- **`recordImport(step, count)`** — ignores non-finite or `<= 0` counts (an
  import of nothing must not tick a step green with "0 imported"), and is
  **cumulative** (`existing + count`).
- **`applyStoredCounts()` guard** — the store uses `persist` with
  `skipHydration: true` (key `"sole-migrations"`), and only the hub page
  rehydrates it. The importers that *write* live elsewhere (a dialog on
  `/contacts`, the wizard on `/transactions/bulk`), where memory still holds
  `{}`. Both `recordImport` and `clearImport` therefore call
  `persist.rehydrate()` first if not yet hydrated, relying on `localStorage`
  being synchronous; without it, recording `{contacts: 12}` would overwrite a
  stored `{transactions: 340}`.
- **`clearImport(step)`** — deletes the key rather than setting `0`.

A test would need an **in-memory `localStorage` stub that actually returns
stored values** (the no-op stub in Template B is not enough, since the
guard's whole point is reading back what's stored) and would reset via
`useMigrationsStore.setState({ imported: {} })` plus
`useMigrationsStore.persist.clearStorage()`.

---

## Gaps

No test coverage today for:

- **`stores/migrations.ts`** — cumulative `recordImport`, the `<= 0` /
  `NaN` guard, and above all the rehydrate-before-write guard. This is the
  mechanism that makes the hub's ticks survive navigation and the likeliest
  to regress silently.
- **`lib/bulk-records.ts`** — no test file. Untested: the empty-batch throw,
  the `message || error || "The import failed."` chain, `created` from
  `data.length` vs the `rows.length` fallback, the `failed` arithmetic, the
  envelope keys (`invoices`/`expenses`/`assets`) and encryption.
- **`lib/ai-format.ts`** (untracked) — `aiTargetFromBulkSpec`, and every
  `readImportFile` branch: bad extension, over 5 MB, AI success, AI zero rows
  → fallback, AI throw → fallback, local parse empty, local parse throws.
- **`components/bulk/use-import-file-reader.ts`** (untracked) — the
  latest-read-wins/`cancel` race (would need a hook harness; none exists in
  this repo).
- **`lib/migrations.ts`** — no test of `MIGRATION_STEPS` order/targets or
  `migrationStep`'s fallback. `migrationStep()` and `clearImport` have **no
  callers** anywhere in the app today.
- **`lib/file-parser.ts`** — Excel serial-date conversion
  (`convertExcelDate`) is never exercised: no test puts a 5-digit serial
  under a date-named header, or checks the 25000/50000 bounds and the
  "header must mention date" rule. `downloadCsv` untested (DOM).
- **`lib/transaction-import.ts`** — `filterReviewRows` never called by a
  test; `TXN_AI_TARGET` new and untested; the three-decimal amount rule and
  the `-` date separator have no explicit case.
- **Module specs** — invalid-date messages for invoices/expenses/assets,
  the `"Mark as"` unknown-status rule, invoice/expense/asset email and phone
  rules, contact `"Invalid email"` / phone rules, contact
  `Type` defaulting to `1` for an unrecognised value, and the
  `todayIso()`/`"Untitled Expense"`/`"Unnamed Asset"` payload fallbacks.
  The batch mappers `contactPayloads`/`invoicePayloads`/`expensePayloads`/
  `assetPayloads` are not called by any test. `bulkNumber` and `isEmail` are
  only reached indirectly.
- **Hooks** — `useBulkTransactionParties` itself (query keys,
  `partiesFor`), `hooks/use-bulk-transaction-import.ts` (the `toUploadRows`
  step and the two invalidated keys), `useAccountCategoriesQuery`'s `select`
  filter, and `lib/use-migrations-hydrated.ts`. `fetchInvoiceContacts` has no
  test anywhere (`lib/invoice-clients.test.ts` does not exist).
- **Components** — `BulkImportDialog`, `BulkUploadWizard`,
  `BulkResultsDialog` (`resultTone`/`bannerCopy` are private) and
  `wizard-parts.tsx`'s exported `formatBytes` are untested; per the repo
  convention, exporting those pure helpers would be the route in.
- **Dead code** — `useBulkCreateInvoicesMutation` (`hooks/use-invoices-query.ts`)
  has no callers; `InvoiceBulkUploadDialog` builds its own inline mutation
  (which also invalidates `["invoice-status-counts"]`, the hook does not).

**Behaviour worth a test before anyone relies on it** — the lib functions
above throw plain `Error`s with the server's message on a 2xx
`success: false`, but every importer's catch uses `apiErrorMessage`, which
returns the server message **only for an `AxiosError`**. So on that path the
toast shows the generic fallback (`"Failed to import <nounPlural>."`,
`"Could not check those rows."`, `"Failed to import transactions."`), and
`uploadBulkTransactions`'s `"Row N: …"` reasons never reach the screen. The
same applies to `aiFormatFile`'s message inside `readImportFile`, whose
`aiError` falls back to `"AI formatting failed."`.

**Timezone note** — `transaction-import.test.ts` pins a UTC instant
(`10:00Z`) while `todayIso()` reads local time; the "today itself is fine"
case would fail on a machine at UTC−11 or further west. `bulk-import.test.ts`
and `module-imports.test.ts` pin a local time and are unaffected.

---

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`.
Assert against the `apiRoutes.x.y` constant from `@/config/api-routes`, as
`lib/bulk-transactions.test.ts` already does.

| Constant | Resolves to |
|---|---|
| `apiRoutes.bulkTransaction.bulkInsert` | `BASE_URL + "/v2/bulk-transactions/bulk-insert"` (both validate and upload) |
| `apiRoutes.client.bulkInsert` | `BASE_URL + "/client/bulk/create"` |
| `apiRoutes.invoice.bulkCreate` | `BASE_URL + "/invoice/bulk/create"` |
| `apiRoutes.expense.bulkCreate` | `BASE_URL + "/expense/bulk/create"` |
| `apiRoutes.asset.bulkCreate` | `BASE_URL + "/assets/bulk/create"` |
| `apiRoutes.migration.aiFormat` | `BASE_URL + "/v2/migration/ai-format"` (working tree only) |
| `apiRoutes.companyContact.list` | `BASE_URL + "/contact/list"` |
| `apiRoutes.accountCategory.list` | `BASE_URL + "/account-categories/list"` |
