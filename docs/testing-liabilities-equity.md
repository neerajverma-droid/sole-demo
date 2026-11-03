# Testing: Liabilities & Equity

Reference for test coverage across the two sibling balance-sheet modules
that sit under one nav group: **Liabilities** (wages payable, loans, and
anything else owed that isn't a supplier bill) and **Equity** (the owner's
own money going in as capital or coming back out as drawings). Both are
ports of sole-webapp's `components/Liability.js/` and `components/Equity/`,
and both reconcile against the bank feed through the same shared match
dialog Super Contributions uses.

Both test files are **pre-existing** team work on `feat/api-integration`
(landed in `ffa99b2`, "test and bug fixed for equity and libality module") —
described here for completeness, not claimed as new work. No test file was
added for this doc.

All files are Vitest unit tests — no browser, no rendering, a plain `node`
environment — using the same convention as every other `lib/*.test.ts` in
this repo: `vi.mock("@/utils/axiosInstance")` with a hand-rolled
`{get, post, put, delete}` mock, the module under test imported *after* the
mock via top-level `await import(...)`, and every encrypted body decrypted
back with `decryptPayload` from `@/utils/encrypt` before asserting on it.
For copy-pasteable templates, see "Writing a new test in this codebase" in
[`testing-coverage.md`](./testing-coverage.md) — not duplicated here.

## Running them

```bash
npx vitest run lib/liabilities.test.ts lib/equity.test.ts   # this module
npx vitest run lib/bank-match.test.ts                       # the shared match logic both use
npx vitest run                                              # everything in the repo
```

Current as of this doc: **1285 tests pass repo-wide**; the two files this
doc describes account for 74 of them.

| File | Tests | Covers |
|---|---|---|
| `lib/liabilities.test.ts` | 41 | List/detail/subcategory fetch + mapping, create/update/delete, attachment upload/delete, undo-match payload, `liabilityCanUndoMatch`, figures, validation, draft seeding |
| `lib/equity.test.ts` | 33 | List/detail/subcategory fetch + mapping, create/update/delete, undo-match payload, `equityDirection`, figures, validation, draft seeding |
| *(related)* `lib/bank-match.test.ts` | 30 | The shared matching lib — includes the liability/equity branches of `fetchPossibleMatches`, `matchSingleTransaction` and `matchMultipleTransactions` (see "Shared match dialog" below) |

---

## Liabilities

### `lib/liabilities.test.ts` (pre-existing, 41 tests)

A mocked `api` with all four verbs; a `liability(overrides)` factory for a
full `Liability`, and a `BASE_DRAFT` (`categoryId: "12"`, `supplierId:
"101"`, `amount: 42000`, `gst: true`). A local `decryptedFieldsFromBody`
helper decrypts either a bare `{data}` envelope or the `data` field of a
`FormData`, and throws if the body is neither — so an unencrypted body fails
loudly rather than passing vacuously.

- **`fetchLiabilitiesPage`** (6) — `page`/`limit` sent as *strings*, and
  `searchQuery` omitted entirely when blank, trimmed when present
  (`"  van  "` → `"van"`). A full raw row mapped field-by-field, including
  `paidAmount` **derived** as `price - remainingAmount` (42000 − 28000 =
  14000) and `date` sliced from the ISO `created_at`. Flag parsing in its
  various raw forms: `is_reconciled: "1"` → Matched, `gst: "0"` → false,
  numeric `journal_entry_id: 55` → `"55"`. **A row with no
  `remainingAmount` at all reads as nothing paid** (falls back to the full
  amount, so `paidAmount: 0`, not `price`). `total` falls back to
  `rows.length` without `paginationData`; `{success:false}` with no `data`
  resolves to an empty page rather than throwing.
- **`fetchLiabilitySubcategories`** (3) — the
  `account_subcategory_id`/`account_subcategory_name` pair, with
  `subcategory_name` as the name fallback; a payload nested under
  `data.rows` (the `toSubcategoryRows` defensiveness); rows missing an id or
  a name are dropped.
- **`fetchLiabilityDetail`** (4) — URL is `viewDetail` + id with **no
  slash inserted** (the route constant already ends in `/`); category id
  read from a nested `account_subcategory.account_subcategory_id`; amount
  falls back from `sub_total` to `price`, supplier name from `contact_name`
  to a nested `client.name`; the first document becomes the dropzone
  preview with the real file URL in `dataUrl` and `size: 0`; throws
  `"Liability not found"` when `data` is missing.
- **Create** (4) — no file → a plain `{data}` body (asserted *not*
  `FormData`); the exact decrypted write payload including `paid_with_cash:
  0` (always off — sole-webapp's form has no control for it); `gst: 0` when
  the switch is off; a file → `FormData` with the file under `files[]` and
  the ciphertext beside it; the server's own `message` surfaces as the
  thrown error.
- **Update** (2) — PUT carrying the id under **both** `id` and
  `liability_id`; server message surfaced on failure.
- **Delete** (2) — DELETE to `delete + "/" + id` with an encrypted *empty*
  object carried as axios's `data` config option; server message surfaced.
- **Attachments on an existing liability** (4) —
  `uploadLiabilityAttachmentApi` sends `{liability_id}` encrypted with the
  file raw under `files[]` (deliberately encrypted, even though
  sole-webapp's own upload posts plain FormData — see the lib's comment);
  `deleteLiabilityAttachmentApi` deletes by *document* id with an encrypted
  empty body; both surface the backend's own validation messages (e.g.
  `"Only PDF, JPG, PNG, WEBP, and AVIF files are allowed"`).
- **`undoLiabilityMatchApi`** (3) — the liability's id always goes out
  under `liability_id`, `id` and `reference_id`, with `reference_type:
  "liability"`; `journal_entry_id`/`bank_transaction_id` are included
  **only when the liability actually carries them** (the first test asserts
  an exact `toEqual`, so their absence is pinned, not just their presence).
- **Figures** (3) — `liabilityRemaining` clamps an overpayment to 0;
  `formatLiabilityRemaining` reads `"—"` once settled; currency via
  `invoiceMoney` (`"$1,000.00"`).
- **`liabilityCanUndoMatch`** (4) — the rule the Unmatch menu item hangs
  off, **wider than the Matched badge**: true for Matched, for a part-paid
  row still Pending, for any journal or bank-transaction id; false only for
  an untouched Pending row.
- **`liabilityIssues`** (4) — all four keys flagged together; **an amount
  of exactly 0 is valid** (the test's own title calls out that equity
  differs); a 121-char name rejected; a complete draft is clean.
- **Drafts** (2) — `emptyLiabilityDraft` seeds the given date and
  blank/null fields with `gst: false`; `liabilitySummaryLine` is the amount
  as currency.

### Real contract — `lib/liabilities.ts`

Module docstring (condensed): a liability is deliberately close in shape to
an Expense — owed against a supplier, reconciled against a bank
transaction, carrying an attachment — but is drawn down over time, so it
keeps a paid figure and reports what remains.

**Types** (verbatim, doc comments trimmed):

```ts
export const LIABILITY_CATEGORIES = [
  "Wages Payable — Payroll",
  "Loan",
  "Other Liabilities",
] as const;
export type LiabilityCategory = (typeof LIABILITY_CATEGORIES)[number];
export const LIABILITY_CATEGORY_HINTS: Record<LiabilityCategory, string>;

export type LiabilityAttachment = ExpenseReceipt;
export const MAX_LIABILITY_BYTES = 20 * 1024 * 1024;
export type LiabilityStatus = "Matched" | "Pending";

export type Liability = {
  id: string;
  date: string;                 // ISO YYYY-MM-DD, from created_at
  name: string;
  category: string;             // subcategory display name, server-managed
  supplierId: string | null;    // client_id server-side
  supplierName: string;
  supplierEmail: string;
  amount: number;
  gst: boolean;
  paidAmount: number;
  status: LiabilityStatus;
  transactionRef: string | null;    // always null — server returns no human ref
  journalEntryId: string | null;
  bankTransactionId: string | null;
  attachment: LiabilityAttachment | null;   // always null from the list
  possibleMatch: number;            // > 0 picks "AI Match" over "Match"
};

export type LiabilityDraft = {
  date: string;   // shown on the form, NOT sent — the backend sets created_at
  name: string;
  categoryId: string;
  supplierId: string | null;
  supplierName: string;
  supplierEmail: string;
  amount: number;
  gst: boolean;
  attachment: LiabilityAttachment | null;
};

export type LiabilityIssue = { key: string; message: string };
export type LiabilitiesPage = { liabilities: Liability[]; total: number };
export type LiabilitySubcategory = { id: string; name: string };
export type LiabilityDocument = { id: string; name: string; url: string };
export type LiabilityDetail = LiabilityDraft & { documents: LiabilityDocument[] };
```

`LIABILITY_CATEGORIES` is **tooltip copy only** (the editor's
`CATEGORY_TIP`) — the real options come from `fetchLiabilitySubcategories`.

**Pure functions**:

- `liabilityCanUndoMatch(liability): boolean` — `status === "Matched" ||
  paidAmount > 0 || !!journalEntryId || !!bankTransactionId`
  (sole-webapp's `canUndoLiabilityMatch`).
- `emptyLiabilityDraft(todayIso): LiabilityDraft` — `gst: false`,
  `supplierId: null`, `amount: 0`.
- `liabilityRemaining(liability): number` — `Math.max(0, amount -
  paidAmount)`.
- `formatLiabilityAmount` / `formatLiabilityRemaining` — `invoiceMoney`;
  remaining reads `"—"` when it is 0.
- `formatLiabilityDate(iso)` — delegates to `formatInvoiceDate`.
- `liabilityIssues(draft): LiabilityIssue[]` — field order `supplier` →
  `category` → `name` → `amount`. Messages: `"Choose a supplier."`,
  `"Choose a category."`, `"Liability name must be 2–120 characters."`
  (trimmed length), `"Sub total must be 0 or greater."` — written as
  `!(amount >= 0)`, so `NaN` also fails. Mirrors sole-webapp's
  `LiabilityDataSchema`.
- `liabilitySummaryLine(draft)` — `invoiceMoney(draft.amount)`, the toast
  description after save.
- Internal `parseFlag(value)` — `!!value && value !== "0"`. Handles
  `1`/`"1"`/`true` and `0`/`"0"`/`false`; note the string `"false"` would
  read as **true** (untested — see Gaps).

**Write payload** — `liabilityWriteFields(draft)` (verbatim):

```ts
{
  client_id: draft.supplierId,
  account_subcategory_id: draft.categoryId,
  name: draft.name.trim(),
  sub_total: draft.amount,
  gst: draft.gst ? 1 : 0,
  paid_with_cash: 0,
}
```

**Real API calls** (`BASE_URL` = `process.env.NEXT_PUBLIC_SOLE_OCR_URL ??
"http://localhost:3001/api"`):

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchLiabilitiesPage(page, pageSize, search?): Promise<LiabilitiesPage>` | GET | `apiRoutes.liability.list` → `/liability/list` | `{params: {page: String(page), limit: String(pageSize), searchQuery?: search.trim()}}` | `{success, data?: {rows?, paginationData?: {total?}}}` | Never checks `success`. `page` is 1-based (sole-webapp's UI state is 0-based). `paidAmount = max(0, price - (remainingAmount ?? price))`. `total` falls back to `rows.length`. |
| `fetchLiabilitySubcategories(): Promise<LiabilitySubcategory[]>` | GET | `apiRoutes.liability.subcategoryList` → `/liability/subcategory-list` | — | `{success, data?: unknown}` | Reads `data.data ?? data`, then a bare array or one under `rows`/`data`. id: `account_subcategory_id ?? id`; name: `account_subcategory_name \|\| subcategory_name \|\| name`. Drops rows with an empty id or name. No `success` check. |
| `fetchLiabilityDetail(id): Promise<LiabilityDetail>` | GET | `` `${apiRoutes.liability.viewDetail}${id}` `` → `/liability/{id}` | — | `{success, data?: ApiLiabilityDetail}` | Throws `"Liability not found"` if `data` is missing (presence check, not `success`). `date` is always `""`. Category id: flat → `account_subcategory.account_subcategory_id` → `account_subcategory.id`. Name/email fall back through `contact_*` → `contact.*` → `client.name`. Documents: id `document_id ?? id` (id-less dropped), name defaults `"Attachment"`, url `file_path \|\| file_url \|\| url`; first one becomes `attachment` with `size: 0`. |
| `createLiabilityApi(draft, file): Promise<{id}>` | POST | `apiRoutes.liability.add` → `/liability/add` | `buildEncryptedRequestBody(liabilityWriteFields(draft), file ? [file] : [])` — `{data}` JSON with no file, `FormData` (`data` + `files[]`) with one | `{success, message?, data?: {id?}}` | Throws `message \|\| "Failed to create liability."`. Missing `data.id` resolves `{id: ""}` rather than throwing. |
| `updateLiabilityApi(id, draft, file): Promise<void>` | **PUT** | `apiRoutes.liability.update` → `/liability/update` | `buildEncryptedRequestBody({id, liability_id: id, ...liabilityWriteFields(draft)}, file ? [file] : [])` | `{success, message?}` | Id in the body under two keys, not the URL. Throws `message \|\| "Failed to save liability."`. |
| `deleteLiabilityApi(id): Promise<void>` | DELETE | `` `${apiRoutes.liability.delete}/${id}` `` → `/liability/{id}` | `{data: buildEncryptedRequestBody({})}` | `{success, message?}` | Throws `message \|\| "Failed to delete liability."`. |
| `uploadLiabilityAttachmentApi(liabilityId, file): Promise<void>` | POST | `apiRoutes.liability.uploadAttachment` → `/liability/attach` | `buildEncryptedRequestBody({liability_id}, [file])` — always `FormData` | `{success, message?}` | Encrypted, unlike sole-webapp's plain FormData. Throws `message \|\| "Failed to upload attachment."`. |
| `deleteLiabilityAttachmentApi(documentId): Promise<void>` | DELETE | `` `${apiRoutes.liability.deleteAttachment}/${documentId}` `` → `/liability/attach/{documentId}` | `{data: buildEncryptedRequestBody({})}` | `{success, message?}` | Same base path as upload; the verb distinguishes them. Throws `message \|\| "Failed to delete attachment."`. |
| `undoLiabilityMatchApi(liability): Promise<void>` | POST | `apiRoutes.liability.undoMatch` → `/liability/undo-match` | `buildEncryptedRequestBody({liability_id, id, reference_type: "liability", reference_id, journal_entry_id?, bank_transaction_id?})` | `{success, message?}` | The two optional ids are added only when truthy on the liability. Throws `message \|\| "Failed to undo the match."`. Liabilities do **not** use the generic `undoMatchTransaction` from `lib/bank-match.ts`. |

### `stores/liabilities.ts` — audited, no dedicated test file

`useLiabilitiesStore` mirrors whichever page `useLiabilitiesQuery`
(`hooks/use-liabilities-query.ts`) last fetched, so the row-action dialogs
can look a row up by id. It is one setter that also flips `hydrated` — no
dedupe, no guard, no fallback. Same verdict as `stores/rules.ts` in the
reference doc: a test would only re-assert Zustand's own `set`. Verbatim:

```ts
type LiabilitiesState = {
  liabilities: Liability[];
  hydrated: boolean;
  setLiabilities: (liabilities: Liability[]) => void;
};

export const useLiabilitiesStore = create<LiabilitiesState>()((set) => ({
  liabilities: [],
  hydrated: false,
  setLiabilities: (liabilities) => set({ liabilities, hydrated: true }),
}));
```

### UI wiring (no tests — for orientation)

- Routes: `app/(app)/liabilities/page.tsx` → `LiabilitiesScreen`;
  `new/page.tsx` → `LiabilityEditor`; `[id]/edit/page.tsx` →
  `LiabilityEditor liabilityId={id}` (awaits the `params` promise).
- `components/liabilities/liabilities-table.tsx` — debounced search
  (`useDebouncedValue`) that resets to page 1 on change; the row menu shows
  **Unmatch only when `liabilityCanUndoMatch`**, and hides Edit/Delete once
  `status === "Matched"`. A local `MatchCell` renders Matched / AI Match
  (`possibleMatch > 0`) / Match.
- `components/liabilities/liability-editor.tsx` — supplier list from
  `fetchBusinessContacts("Supplier")` (`lib/clients.ts`, `GET
  apiRoutes.client.listV2` → `/client`, covered by `lib/clients.test.ts`);
  subcategories from `fetchLiabilitySubcategories`. Save touches all four
  fields and re-runs `liabilityIssues`. Picking or removing a file while
  editing calls `deleteLiabilityAttachmentApi` on the existing document
  first, so the record never keeps an orphan.
- `components/liabilities/liability-dialogs.tsx` — View, Attach, Delete,
  Match, Unmatch. `AttachLiabilityDialog` fetches the detail fresh (the list
  never carries documents); replacing a document deletes the old one, then
  uploads — **the upload runs on the delete's `onError` too**.

---

## Equity

### `lib/equity.test.ts` (pre-existing, 33 tests)

Same harness as the liabilities file — mocked `api`, an `equity(overrides)`
factory, a `BASE_DRAFT` (`categoryId: "14"`, `amount: 15000`,
`paidWithCash: false`, `date: "2026-09-10"`), and the same strict
`decryptedFieldsFromBody` helper.

- **`fetchEquityPage`** (6) — `page`/`limit` as strings, `searchQuery`
  omitted when blank and trimmed when present; a full row mapped
  field-by-field (`remainingAmount === price` → `paidAmount: 0`); **`date`
  prefers `transaction_date` and falls back to a sliced `created_at`** for
  legacy rows; `is_reconciled: "1"`/`paid_with_cash: "1"` read as true and
  `0`/`false` as false; `total` falls back to `rows.length`.
- **`fetchEquitySubcategories`** (2) — the id/name pairs with the
  `subcategory_name` fallback; id-less and name-less rows dropped.
- **`fetchEquityDetail`** (4) — `viewDetail` + id, `transaction_date`
  mapped into `date` (unlike liability detail, which always returns `""`);
  category id from a nested `account_subcategory` when the flat field is
  absent; first document → preview; throws `"Equity entry not found"`.
- **Create** (4) — no file → plain `{data}`; exact payload including
  `transaction_date` and `paid_with_cash: 0`; `paid_with_cash: 1` when the
  switch is on; a file → `FormData` + `files[]`; server message surfaced.
- **Update** (2) — PUT carrying the id under **both** `id` and `equity_id`
  (not `liability_id`); server message surfaced.
- **Delete** (2) — DELETE `delete + "/" + id` with an encrypted empty body
  as the `data` config option; server message surfaced.
- **`undoEquityMatchApi`** (2) — the body is **exactly** `{type: "equity",
  id}` — one endpoint for undoing a cash settlement or a real bank match;
  server message surfaced.
- **`equityDirection`** (2) — `"Drawings"` → `"Debit"` case- and
  whitespace-insensitively; `"Owner Capital Input"` **and any unknown
  subcategory** → `"Credit"`.
- **Figures** (3) — same clamp/em-dash/currency rules as liabilities.
- **`equityIssues`** (4) — all four keys (`category`, `name`, `amount`,
  `date`) flagged on a blank-dated draft; **an amount of exactly 0 is
  rejected** (the mirror image of the liabilities test); 121-char name
  rejected; a complete draft is clean.
- **Drafts** (2) — `emptyEquityDraft` seeds the date with `paidWithCash:
  false`; `equitySummaryLine` is the amount as currency.

### Real contract — `lib/equity.ts`

Module docstring (condensed): a sibling to a liability, not a variant of
it. Equity isn't owed to anybody, so there's **no supplier** on the record,
and its date (`transaction_date`) is a real, required, user-set field
rather than a server timestamp. The one undo endpoint
(`/equity/undo-match`, sole-webapp's `undoPaidWithCash`) serves both cash
and bank-match undo, keyed off the entry's id alone.

**Types** (verbatim, doc comments trimmed):

```ts
export const EQUITY_CATEGORIES = ["Drawings", "Owner Capital Input"] as const;
export type EquityCategory = (typeof EQUITY_CATEGORIES)[number];
export const EQUITY_CATEGORY_HINTS: Record<EquityCategory, string>;

export type EquityAttachment = ExpenseReceipt;
export const MAX_EQUITY_BYTES = 20 * 1024 * 1024;
export type EquityStatus = "Matched" | "Pending";

export type Equity = {
  id: string;
  date: string;             // transaction_date, else created_at
  name: string;
  category: string;         // subcategory display name, server-managed
  amount: number;
  paidWithCash: boolean;
  paidAmount: number;
  status: EquityStatus;
  transactionRef: string | null;   // always null
  attachment: EquityAttachment | null;   // always null from the list
  possibleMatch: number;
};

export type EquityDraft = {
  date: string;   // transaction_date — real and required
  name: string;
  categoryId: string;
  amount: number;
  paidWithCash: boolean;
  attachment: EquityAttachment | null;
};

export type EquityIssue = { key: string; message: string };
export type EquityPage = { equity: Equity[]; total: number };
export type EquitySubcategory = { id: string; name: string };
export type EquityDocument = { id: string; name: string; url: string };
export type EquityDetail = EquityDraft & { documents: EquityDocument[] };
```

Unlike `Liability`, `Equity` has no `journalEntryId`/`bankTransactionId` —
the undo call never needs them.

**Pure functions**:

- `emptyEquityDraft(todayIso)` — `paidWithCash: false`, `amount: 0`.
- `equityDirection(category: string): TransactionType` — `"Debit"` only
  when `category.trim().toLowerCase() === "drawings"`; everything else is
  `"Credit"`. **Exported and tested, but not called anywhere in the app**
  (see Gaps).
- `equityRemaining` / `formatEquityAmount` / `formatEquityRemaining` /
  `formatEquityDate` — identical rules to the liability versions.
- `equityIssues(draft)` — field order `category` → `name` → `amount` →
  `date`. Messages: `"Choose a category."`, `"Equity name must be 2–120
  characters."`, `"Enter an amount over $0."` (written `!(amount > 0)`, so
  0 and `NaN` fail), `"Choose a date."`. Mirrors sole-webapp's
  `EquityDataSchema`.
- `equitySummaryLine(draft)` — `invoiceMoney(draft.amount)`.
- Internal `parseFlag` — same implementation, same `"false"` caveat.

**Write payload** — `equityWriteFields(draft)` (verbatim):

```ts
{
  account_subcategory_id: draft.categoryId,
  name: draft.name.trim(),
  price: draft.amount,
  paid_with_cash: draft.paidWithCash ? 1 : 0,
  transaction_date: draft.date,
}
```

Note the field is `price` here, `sub_total` for a liability.

**Real API calls**:

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchEquityPage(page, pageSize, search?): Promise<EquityPage>` | GET | `apiRoutes.equity.list` → `/equity/list` | `{params: {page: String(page), limit: String(pageSize), searchQuery?: search.trim()}}` | `{success, data?: {rows?, paginationData?: {total?}}}` | Never checks `success`. Same derived-`paidAmount` rule. `total` falls back to `rows.length`. |
| `fetchEquitySubcategories(): Promise<EquitySubcategory[]>` | GET | `apiRoutes.equity.subcategoryList` → `/equity/category-list` | — | `{success, data?: unknown}` | Note the path is `category-list`, not `subcategory-list` like liability. Same unwrapping/filtering as the liability version. |
| `fetchEquityDetail(id): Promise<EquityDetail>` | GET | `` `${apiRoutes.equity.viewDetail}${id}` `` → `/equity/{id}` | — | `{success, data?: ApiEquityDetail}` | Throws `"Equity entry not found"` if `data` missing. `date` from `transaction_date.slice(0,10)` or `""`; `amount` from `price` only (no `sub_total` fallback). Same document mapping. |
| `createEquityApi(draft, file): Promise<{id}>` | POST | `apiRoutes.equity.add` → `/equity/add` | `buildEncryptedRequestBody(equityWriteFields(draft), file ? [file] : [])` | `{success, message?, data?: {id?}}` | Throws `message \|\| "Failed to create equity entry."`. Missing id → `{id: ""}`. |
| `updateEquityApi(id, draft, file): Promise<void>` | **PUT** | `apiRoutes.equity.update` → `/equity/update` | `buildEncryptedRequestBody({id, equity_id: id, ...equityWriteFields(draft)}, file ? [file] : [])` | `{success, message?}` | Throws `message \|\| "Failed to save equity entry."`. |
| `deleteEquityApi(id): Promise<void>` | DELETE | `` `${apiRoutes.equity.delete}/${id}` `` → `/equity/{id}` | `{data: buildEncryptedRequestBody({})}` | `{success, message?}` | Throws `message \|\| "Failed to delete equity entry."`. |
| `undoEquityMatchApi(equity): Promise<void>` | POST | `apiRoutes.equity.undoPaidWithCash` → `/equity/undo-match` | `buildEncryptedRequestBody({type: "equity", id})` | `{success, message?}` | The constant is named `undoPaidWithCash` but resolves to `/equity/undo-match`. Throws `message \|\| "Failed to undo the match."`. |

**There is no equity attachment upload/delete API** in this lib (and no
Attach dialog on the Equity screen). The editor's own comment says so: a new
file picked while editing is sent with the update and lands *alongside* any
existing document, because there is no endpoint to remove the old one.

### `stores/equity.ts` — audited, no dedicated test file

`useEquityStore` is a structural copy of `useLiabilitiesStore` — `equity:
Equity[]`, `hydrated`, and `setEquity` that sets both — mirrored from
`useEquityQuery` (`hooks/use-equity-query.ts`). No dedupe, guard or
fallback logic; nothing to pin down beyond what Zustand's `set` already
guarantees.

### UI wiring (no tests — for orientation)

- Routes: `app/(app)/equity/page.tsx` → `EquityScreen`; `new/page.tsx` →
  `EquityEditor`; `[id]/edit/page.tsx` → `EquityEditor equityId={id}`.
- `components/equity/equity-table.tsx` — same search/pagination pattern;
  a "Paid with cash" sub-line when `paidWithCash`. **Unmatch appears only
  when `status === "Matched"`** — sole-webapp's rule for equity is exactly
  `is_reconciled`, narrower than `liabilityCanUndoMatch`. Edit/Delete are
  hidden once Matched. Its own local copy of `MatchCell`.
- `components/equity/equity-editor.tsx` — subcategories from
  `fetchEquitySubcategories`; no supplier field; a Paid-with-cash switch.
- `components/equity/equity-dialogs.tsx` — View, Delete, Match, Unmatch
  (no Attach).

---

## Shared match dialog — `components/shared/match-transaction-dialog.tsx`

Verified: Liabilities and Equity both render the **same**
`MatchTransactionDialog` Super Contributions uses — not a lookalike. The
shared component is sole-webapp's `PossibleMatchTransactionNew`,
parameterized by `type: BankMatchType`. Every caller in the repo:

| Caller | `type` | `noun` | `invalidateQueryKeys` | `remainingFromFetch` |
|---|---|---|---|---|
| `components/super/match-dialog.tsx` (`MatchDialog`) | `"expense"` | `"contribution"` | `["super-contributions"]`, `["super-contribution-matrix"]` | **`true`** |
| `components/liabilities/liability-dialogs.tsx` (`MatchLiabilityDialog`) | `"liability"` | `"liability"` | `["liabilities"]` | `false` (default) |
| `components/equity/equity-dialogs.tsx` (`MatchEquityDialog`) | `"equity"` | `"equity entry"` | `["equity"]` | `false` (default) |
| `components/assets/match-dialog.tsx` | `"asset"` | `"asset"` | `["assets"]` | `false` |
| `components/invoices/match-transaction-dialog.tsx` (wrapper) | `"invoice"` | `"invoice"` | `["invoices"]` | `false` |

Why `remainingFromFetch` is `false` for these two: `fetchPossibleMatches`
only reads `expense_remaining_amount ?? asset_remaining_amount` from the
response, so for a liability or equity entry the fetched figure would be
`0`. The row's own `liabilityRemaining`/`equityRemaining` is passed as
`entity.remainingAmount` instead — matching sole-webapp's liability/equity
modal, which never reads a remaining figure from that endpoint either.

The dialog itself has **no test** (no component rendering in this repo),
but everything it calls lives in `lib/bank-match.ts`, which is covered by
`lib/bank-match.test.ts` — including these liability/equity-specific cases:

- `fetchPossibleMatches` builds `/possible-matches/liability/{id}` and
  `/possible-matches/equity/{id}`; `multiple_match_mode=true` only for the
  "Assign to multiple" tab.
- `matchSingleTransaction("liability", …)` → `setMatchLiability` with
  `{bank_transaction_id, liabilities: [id]}`; `("equity", …)` →
  `setMatchEquity` with `{bank_transaction_id, equities: [id]}`. A
  `status` in an otherwise successful response (shortfall/overpayment)
  throws.
- `matchMultipleTransactions("liability", …)` → `setMultipleLiability`
  with `{transaction_ids, liability_id}`; `("equity", …)` →
  `setMultipleEquity` with `{transaction_ids, equity_id}` — **not** the
  `entry_id`/`type` shape expense and asset use.
- `matchSelectionTotals` / `filterMatchCandidates` — the running totals and
  the tab's client-side search.

The generic `undoMatchTransaction` in the same lib is **not** used by
either module; each has its own undo endpoint (see the tables above).

---

## Gaps

No tests at all:

- **`stores/liabilities.ts`, `stores/equity.ts`** — deliberately, per the
  audits above (plain setters).
- **`hooks/use-liabilities-query.ts`, `hooks/use-equity-query.ts`** — the
  store mirroring (`setLiabilities`/`setEquity` on every `query.data`) and
  the "every mutation invalidates `["liabilities"]`/`["equity"]`" rule.
  Only `hooks/use-bulk-transaction-parties.test.ts` exists under `hooks/`.
- **`components/liabilities/*`, `components/equity/*`,
  `components/shared/match-transaction-dialog.tsx`** — no component tests
  in the repo. Logic that lives only inside them and is therefore untested:
  the equity-vs-liability Unmatch visibility rule (`status === "Matched"`
  vs `liabilityCanUndoMatch`), hiding Edit/Delete once Matched, the
  duplicated `MatchCell` three-state logic in both tables, the editors'
  submit-time `touched` reveal, the liability editor's detach-on-replace,
  `AttachLiabilityDialog`'s delete-then-upload (which uploads even when the
  delete fails), and the dialog's `limitReached` checkbox cap and
  `alreadyMatched = amount - remainingAmount` header figure.

Exported functions / branches never exercised:

- **`equityDirection`** is tested but has **no caller** anywhere in `app/`,
  `components/`, `hooks/` or `lib/` — dead export, or a feature not yet
  wired.
- **`apiRoutes.liability.undoPaidWithCash`** (`/liability/undo-paid-with-cash`)
  is defined but unused by any code (liabilities have no paid-with-cash
  control).
- `parseFlag("false")` (either lib) returns `true` — no test covers a
  string `"false"`/`"true"` flag.
- `liabilityIssues`/`equityIssues` message text and field order are never
  asserted — tests check `key`s only.
- `updateLiabilityApi`/`updateEquityApi` with a `file` (the `FormData`
  branch) — only create is tested with a file.
- The fallback error messages (`"Failed to create liability."`, `"Failed
  to save equity entry."`, etc.) when the server sends no `message` —
  every failure test supplies one.
- `createLiabilityApi`/`createEquityApi` resolving `{id: ""}` when
  `data.id` is missing.
- `fetchLiabilityDetail`: the `contact.email`/`contact.name` fallbacks, the
  `account_subcategory.id` fallback, the `"Attachment"` default name, the
  `file_url`/`url` fallbacks, and dropping id-less documents.
- `fetchEquityDetail`: the `transaction_date`-missing → `""` branch and the
  `account_subcategory.id` fallback.
- `fetchEquityPage` with no `rows` at all (liability has this test; equity
  doesn't), and `fetchEquitySubcategories` with a `rows`/`data`-nested
  payload (liability has this test; equity doesn't).
- `fetchLiabilitiesPage` asserting `gst` from a list row as `true` via a
  string `"1"`, and `possible_match` defaulting to 0 when absent.

---

## Route resolution quick reference

Every route constant referenced above, resolved from
`config/api-routes.ts`. `BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ??
"http://localhost:3001/api"`; assert against the `apiRoutes.x.y` constant
itself in tests, as both files already do.

| Constant | Resolves to |
|---|---|
| `apiRoutes.liability.list` | `BASE_URL + "/liability/list"` |
| `apiRoutes.liability.subcategoryList` | `BASE_URL + "/liability/subcategory-list"` |
| `apiRoutes.liability.viewDetail` | `BASE_URL + "/liability/"` (id appended, no extra slash) |
| `apiRoutes.liability.add` | `BASE_URL + "/liability/add"` |
| `apiRoutes.liability.update` | `BASE_URL + "/liability/update"` |
| `apiRoutes.liability.delete` | `BASE_URL + "/liability"` (`/{id}` appended) |
| `apiRoutes.liability.uploadAttachment` / `.deleteAttachment` | both `BASE_URL + "/liability/attach"` — POST vs DELETE `/{documentId}` |
| `apiRoutes.liability.undoMatch` | `BASE_URL + "/liability/undo-match"` |
| `apiRoutes.liability.undoPaidWithCash` | `BASE_URL + "/liability/undo-paid-with-cash"` (unused) |
| `apiRoutes.equity.list` | `BASE_URL + "/equity/list"` |
| `apiRoutes.equity.subcategoryList` | `BASE_URL + "/equity/category-list"` |
| `apiRoutes.equity.viewDetail` | `BASE_URL + "/equity/"` (id appended, no extra slash) |
| `apiRoutes.equity.add` | `BASE_URL + "/equity/add"` |
| `apiRoutes.equity.update` | `BASE_URL + "/equity/update"` |
| `apiRoutes.equity.delete` | `BASE_URL + "/equity"` (`/{id}` appended) |
| `apiRoutes.equity.undoPaidWithCash` | `BASE_URL + "/equity/undo-match"` |
| `apiRoutes.bankTransaction.fetchPossibleMatchTransaction` | `BASE_URL + "/possible-matches"` (`/{type}/{id}` appended) |
| `apiRoutes.bankTransaction.setMatchLiability` | `BASE_URL + "/v2/bank-transaction/match-liability"` |
| `apiRoutes.bankTransaction.setMatchEquity` | `BASE_URL + "/v2/bank-transaction/match-equity"` |
| `apiRoutes.bankTransaction.setMultipleLiability` | `BASE_URL + "/v2/bank-transaction/match-multiple-liability"` |
| `apiRoutes.bankTransaction.setMultipleEquity` | `BASE_URL + "/v2/bank-transaction/match-multiple-equity"` |
| `apiRoutes.client.listV2` | `BASE_URL + "/client"` (liability supplier picker, via `fetchBusinessContacts`) |
