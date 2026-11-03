# sole-webapp → newfrontend_ai module migration: reusable prompt

This is the prompt template distilled from migrating the Liability and
Equity modules. Copy the **"Ready-to-paste prompt"** section at the bottom,
swap in your module's name, and hand it to Claude Code. Everything above it
is the reference material that makes the prompt work — the common
components it points at, and the pitfalls it warns about, both drawn from
real mistakes made and fixed during the Liability/Equity migration.

---

## 1. The three repos, and the standing rules

- **`newfrontend_ai`** — the new Next.js App Router frontend. This is the
  one being worked on. Its **UI must never change** — existing screens are
  the deliverable.
- **`sole-webapp`** — the old Next.js Pages-Router frontend. This is the
  **source of truth for business logic, API usage, field names and
  validation** — not the backend. Read its components/schemas directly
  rather than guessing.
- **`sole-ocr`** — the Node/Express + Sequelize backend. Read it only to
  resolve a genuine API-contract ambiguity you can't settle from
  `sole-webapp`'s frontend code (e.g. whether two fields are really
  independent, or one derives from the other) — **and always check every
  write endpoint the module will use for the decrypt bug described in
  §4 before wiring the frontend to it**, since that one isn't visible from
  the frontend at all. Extending the backend (additive routes/fields,
  keeping `sole-webapp` compatible) is authorised when the new frontend's
  UI implies something that doesn't exist yet.

Never fabricate data to fill a gap: if a field has no backend equivalent,
say so, or derive it from a record that already exists — don't invent
client-only storage that a refetch will silently erase.

---

## 2. The common-component toolbox — use these, don't rebuild them

Every one of these already exists and is already used by at least one real
(non-mock) module. Check this list before writing a new dropzone, pager,
picker, or match modal — a lookalike built from scratch is the single
biggest mistake to avoid (see §4).

| Need | Component / file | Notes |
|---|---|---|
| Numbered pagination | `components/ui/numbered-pagination.tsx` → `NumberedPagination` | Takes a `PageInfo` (from `lib/products.ts`), `pageSize`, `onPageChange`, `onPageSizeChange`, `itemLabel`, `navLabel`. Server-driven — the caller computes `PageInfo` from a `total` the API returns. Used by Super Contributions, Liabilities, Equity. |
| Loading skeleton | `components/ui/shimmer.tsx` → `Shimmer` | A `<div>` with a sweep animation; wrap it in the exact shape of the real content (skeleton table rows, skeleton title bar). |
| File / document upload | `components/shared/attachment-upload.tsx` → `AttachmentUpload`, `MAX_ATTACHMENT_BYTES`, `AttachmentUploadStatus` | Single-file dropzone + preview + Replace/Remove. Takes `receipt` (preview object `{dataUrl, name, size}`), `onChange`, optional `onFileSelected(file: File)` for the *raw* file a real upload needs, optional `status: "idle" \| "uploading" \| "deleting"` + `pendingName` to show a real upload/delete in progress. Used by Expenses, Liabilities, Equity. |
| Client/supplier picker | `components/documents/business-contact-select.tsx` → `BusinessContactSelect` | Real `/client` list + inline "create new" dialog (`NewBusinessContactDialog`). Backed by `lib/clients.ts`'s `fetchBusinessContacts(type)` / `createBusinessContactApi(type, values)` / `BusinessContact` type. The caller fetches the list itself (`useQuery`) and passes it in — the component doesn't fetch. Returns `{contactId, contactName}` — **only one id**, not a client/contact pair (see §4 if your module's schema wants both). Used by Matching Rules and Liabilities. **Don't** use the older `components/documents/client-combobox.tsx` (`ClientCombobox`) for a new module — it reads from a mock Zustand store, not the real API; it's legacy, kept only for screens not yet migrated. |
| Match / AI Match modal | `components/shared/match-transaction-dialog.tsx` → `MatchTransactionDialog`, `MatchableEntity` | The one shared modal for "Match"/"AI Match" against the bank feed — tabs for "Potential transactions" and "Assign to multiple". Takes `type` (a `BankMatchType`), `noun` (lowercase singular, e.g. `"liability"`), `open`, `entity: MatchableEntity \| null` (`{id, title, subtitle, amount, remainingAmount}`), `onClose`, `invalidateQueryKeys`, and an optional `remainingFromFetch` flag (only Super Contributions sets this — see §4). Backed by `lib/bank-match.ts`. Used by Super Contributions, Liabilities, Equity. |
| Bank-match API layer | `lib/bank-match.ts` → `fetchPossibleMatches`, `matchSingleTransaction`, `matchMultipleTransactions`, `filterMatchCandidates`, `matchSelectionTotals`, type `BankMatchType` | **Extend** `BankMatchType` and the endpoint/field-name branches inside `matchSingleTransaction`/`matchMultipleTransactions` for your new module's type — don't build a parallel matching function. Check `sole-webapp`'s `components/Common/PossibleMatchTransactionNew.js` for your type's exact branch (endpoint + field names — they genuinely differ per type, it's not just a wider union). |
| Debounced search | `hooks/use-debounced-value.ts` → `useDebouncedValue(value, delayMs?)` | Used to debounce the search box before it hits the API. |
| API error → message | `lib/api-error.ts` → `apiErrorMessage(error, fallback)` | Reads the server's own message off an Axios error; use this in every mutation's `onError`. |
| Encrypted request body | `lib/encrypted-request.ts` → `buildEncryptedRequestBody(fields, files?)` | **Every non-GET request in this app goes through this** — no exceptions, even where `sole-webapp` itself sent plain unencrypted FormData for that same endpoint. Returns `{data: "<ciphertext>"}` (no files) or a `FormData` with `data` + `files[]` (some files). See §4 for the backend half of this contract. |
| Axios instance | `utils/axiosInstance.ts` → default export `api` | Auth header, `business_id` query param, 401 refresh — already wired, just `import api from "@/utils/axiosInstance"`. |
| Route constants | `config/api-routes.ts` → `apiRoutes` | Check whether your module's routes already exist here (most do, even if unused) before adding new ones. |
| Query-mirror store | e.g. `stores/liabilities.ts`, `stores/equity.ts`, `stores/super.ts` | Pattern: a Zustand store holding only `{items: T[], hydrated: boolean, setItems}` — mirrors whichever page of the list is on screen, purely so row-action dialogs can look an item up by id. No local mutators (add/update/delete/match) — every mutation goes through the real API + a query invalidation. |
| Query/mutation hooks | e.g. `hooks/use-liabilities-query.ts`, `hooks/use-equity-query.ts`, `hooks/use-super-contributions-query.ts` | Pattern: one `use<Module>Query(page, pageSize, search)` that fetches + mirrors into the store, plus one `useMutation`-wrapped hook per write action, each invalidating the list's query key on success. |
| Date picker | `components/documents/date-picker.tsx` → `DatePicker` | |
| Form field wrapper | `components/documents/field.tsx` → `Field`, `Required` | `label`, `required`, `error`, `labelTip`, `hint`. |
| Form section wrapper | `components/ui/form-section.tsx` → `FormSection` | `icon`, `title`, `description`, wraps a card. |
| Money input | `components/planner/money-input.tsx` → `MoneyInput` | |
| Empty state | `components/ui/empty.tsx` → `Empty`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyCue`, `EmptyActions` | Also the right shell for an **error** state (see §4) — same components, different icon/copy/action. |
| Table primitives | `components/ui/table.tsx` → `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`, `HUG_COLUMN` | |
| Row actions menu | `components/ui/menu-action.tsx` → `MenuAction` | Used inside a `DropdownMenu` for View/Edit/Delete/Unmatch etc. |
| Search-term highlighting | `components/contacts/highlight.tsx` → `Highlight` | |
| Page header | `components/layout/page-header.tsx` → `PageHeader` | |
| Pagination types | `lib/products.ts` → `PageInfo`, `PAGE_SIZES`, `PageSize`, `paginate` | `paginate` is for the handful of screens still doing client-side pagination over mock data — a real API migration should use server pagination (`NumberedPagination` + a `total` from the response), not this. |

---

## 3. The process, in order

1. **Explore `sole-webapp`** — the module's index/list component, its
   add/edit component, its detail dialog, its `schemas/*.js` zod/yup
   schema, and `config/apiRoutes.js`'s entry for it. Note: exact field
   names sent on create/update, exact response field names read on the
   list and on the detail endpoint, the pagination params, the delete call
   shape, and — if it has one — the Match modal's `type` branch in
   `components/Common/PossibleMatchTransactionNew.js` (single-match and
   multi-match field names, which can differ from every other type).
2. **Explore `newfrontend_ai`'s current version** — its page(s) under
   `app/(app)/**`, its components under `components/<module>/`, its
   `lib/<module>.ts` (types, mock-data helpers, validation), its
   `stores/<module>.ts` (mock mutators to be replaced), and its atoms in
   `lib/atoms.ts` (often already scaffolded — reuse them, don't add
   parallel ones).
3. **Check `sole-ocr` decrypt-awareness proactively** — for every write
   endpoint (add, update, delete, match, attach, undo-match) the module
   will call, open its controller and confirm it reads the body through a
   decrypt-aware helper (`req.body?.data ? decryptPayload(...) : req.body`
   — often already defined lower in the same file as `getRequestPayload`,
   just not wired into every handler). See §4 — this exact gap broke both
   Liability and Equity's create/update on the first pass.
4. **Give a short plan before writing code**: which `sole-webapp` files
   were the reference, which `newfrontend_ai` files will change, and
   flag anything genuinely ambiguous (a UI control with no backend field,
   a schema needing an id `BusinessContactSelect` can't supply — see §4).
   Ask rather than guess on those.
5. **Build listing first**: real `fetch<Module>Page(page, pageSize,
   search)`, mapped from the real response fields, wired into the table
   with `NumberedPagination` + `Shimmer`. Confirm it before moving on.
6. **Then Match/AI Match** (if the module has bank-feed matching): extend
   `BankMatchType` and `lib/bank-match.ts`'s endpoint branches, wire the
   row's Match/AI Match button straight to `MatchTransactionDialog` — do
   **not** build a module-specific match dialog first and refactor later.
7. **Then create/edit**: real subcategory/category list if the module has
   one (don't keep a hardcoded enum once a real managed list exists
   server-side), `BusinessContactSelect` if it has a supplier/client,
   real detail fetch for the edit path (the list row rarely carries every
   id the edit form needs), validation ported exactly from the
   `sole-webapp` schema (including the boundary cases — `>= 0` vs `> 0`,
   2–120 chars, etc.), per-field touch-tracking for showing errors (§4).
8. **Then delete / attach / undo-match**, whichever the module actually
   has — check `sole-webapp` for whether an attach dialog and an
   undo-match action really exist for this module before building them;
   don't assume every module has the full set (Equity, for instance, has
   no attach endpoint at all).
9. **Write tests** for every new `lib/<module>.ts` function — see §5.
10. **Test it running**, not just typechecked — see §6.

---

## 4. Pitfalls hit for real on Liability/Equity — check for these every time

- **A decrypt-unaware backend controller.** `sole-ocr`'s
  `addLiability`/`updateLiability` (and the same pair in `equity.js`) read
  `req.body?.data || req.body` — since `data` is an AES ciphertext string
  when the frontend sends it, every field came through as `undefined`,
  surfacing as a confusing "Valid account_subcategory_id is required"
  error that had nothing to do with that field. The fix was routing
  through the `getRequestPayload(req)` helper already defined later in
  the same file (used correctly elsewhere) instead of inventing a new one.
  **Check every write handler your module will hit, before wiring the
  frontend to it** — don't wait for the error.

- **Building a parallel Match dialog instead of the shared one.** The
  first pass built a Liability-specific match dialog with its own local
  transaction search. The fix was extracting Super Contributions' dialog
  into `components/shared/match-transaction-dialog.tsx` and pointing every
  module at it. Go straight to the shared component from the start.

- **A single global "edited" flag for validation.** `liability-editor.tsx`
  and `equity-editor.tsx` originally used one `edited` boolean gating
  every field's error — so picking the supplier lit up the category, name
  and amount errors too, even though only the supplier had been touched.
  The fix: track touched fields individually (`Record<string, boolean>`),
  and only mark *all* of them touched on a Save-click (so submitting an
  empty form still reveals everything at once — that part was correct).

- **A failed fetch reads as an honest empty state.** `total ?? 0` on a
  failed query looks identical to a genuinely empty list, so the table
  said "No liabilities yet" for a 401 instead of "Couldn't load
  liabilities". Check `query.isError` explicitly in the empty-state
  branch and show a distinct error state (same `Empty`/`EmptyMedia`/
  `EmptyTitle` shell, a `TriangleAlert` icon, and a "Try again" button
  calling `query.refetch()`) — this same gap likely still exists in any
  older module (e.g. Super Contributions) that hasn't had it checked.

- **`BusinessContactSelect` only returns one id.** Some `sole-webapp`
  schemas (Liability's) want two ids from one supplier pick (`client_id`
  *and* `contact_id`, two different foreign keys onto two different
  tables — confirmed by reading `sole-ocr`'s models, not guessed). Since
  the real `/client` API only surfaces one id, the fix was **extending the
  backend service** to derive the second id server-side (`contact_id`
  from the client's primary contact) rather than bolting a second,
  legacy-shaped picker onto the frontend. If your module's schema wants
  two ids from one pick, check whether the second is genuinely derivable
  server-side before assuming the frontend needs two pickers.

- **A UI field with nothing to submit it to.** Liability's create/edit
  form has a Date field, but `sole-ocr`'s `addLiabilityService`/
  `updateLiabilityService` accept no date at all — a liability's date is
  its server-set `created_at`. Don't fabricate a payload field the backend
  ignores; leave the control in place (since the UI can't change) but
  don't wire it into the write call, and say so plainly rather than
  pretending the edit persists.

- **A category/subcategory hardcoded as a closed enum.** `sole-webapp`
  fetches these from a managed backend list (`/liability/subcategory-list`,
  `/equity/category-list`, etc.) — a frontend union of 2–3 strings is a
  first pass, not the real thing. Fetch the real list and feed it into
  whatever picker is already in the UI (a `Select`, a searchable
  `Command` popover) rather than changing the picker's shape.

- **Attachments that can't actually delete.** Not every module's
  attachment story is symmetric. Liability has a real
  `uploadAttachment`/`deleteAttachment` pair; Equity has neither — only
  `files[]` on create/update, append-only. Check the actual `sole-ocr`
  routes file for the module before assuming a delete-attachment
  capability exists.

---

## 5. Test coverage to write

Follow the pattern in `lib/bank-match.test.ts`, `lib/super.test.ts`,
`lib/liabilities.test.ts`, `lib/equity.test.ts` (Vitest, run via
`npm test` / `npx vitest run`):

- Mock `@/utils/axiosInstance` with `vi.fn()` for `get`/`post`/`put`/
  `delete`.
- Decrypt whatever body a call sent with a small helper that handles both
  a bare `{data}` object and a `FormData` (see any of the four files
  above for the exact helper — it's copy-pasteable).
- One `describe` block per exported function: the list fetch (params,
  field mapping, every raw boolean/number/string form the backend might
  send, the pagination-total fallback), the detail fetch (nested-field
  fallbacks, the not-found throw), create/update (every field in the
  encrypted body, the file-attached FormData path, the failure-message
  throw), delete, any attach/detach, any undo-match, every validation
  rule (including the exact boundary — zero allowed or not, character
  limits), and every formatting helper.
- Run the **whole** suite (`npx vitest run`), not just the new files —
  confirm the count of previously-passing tests didn't drop.

---

## 6. Actually running it, not just typechecking it

- `npx tsc --noEmit -p tsconfig.json` and `npx eslint .` after every
  significant change — both must stay clean (0 errors; pre-existing
  unrelated warnings elsewhere are fine to leave).
- If a headless browser isn't already available, installing Playwright
  (`npm install --no-save playwright && npx playwright install
  chromium`) is worth asking the user about before doing it — it's a
  real download, and worth checking whether they'd rather you stick to
  static verification (tsc/eslint/curl) instead.
- Expect to hit a 401 wall without real credentials — that's fine and
  still worth doing: it proves every route renders without crashing, the
  empty/error states behave (see §4's fetch-failure pitfall), and forms
  don't throw when their category/supplier lists come back empty. Ask
  for test credentials or a session token only if you need to verify an
  actual create/edit/match/delete round-trip against real data.
- A `curl -s -o /dev/null -w "%{http_code}"` sweep of every route the
  module touches (list, new, edit, edit-with-a-nonexistent-id) is a fast,
  no-install fallback that at least proves the pages don't 500.

---

## Ready-to-paste prompt

Copy this, replace every `Asset`/`asset`/`assets` with your module's name,
and adjust the two bracketed notes.

> Migrate the **Asset** module from `sole-webapp` into `newfrontend_ai`.
> `newfrontend_ai` currently has the Asset screens built with dummy/mock
> data only — the UI must not change at all. `sole-webapp` is the source
> of truth for business logic, field names, validation and API usage; only
> read `sole-ocr` to resolve a genuine contract ambiguity or to check that
> every write endpoint this module will use actually decrypts its request
> body (`sole-ocr` controllers should route through a
> `getRequestPayload`-style helper — some existing ones don't, and that's
> broken a migration before without being visible from the frontend side).
>
> Reuse the app's existing common components instead of building
> lookalikes — check `newfrontend_ai/docs/module-migration-prompt.md`
> (§2) for the exact file paths, especially: `NumberedPagination` for
> pagination, `Shimmer` for loading states, `AttachmentUpload` for any
> file/document upload, `BusinessContactSelect` (backed by `lib/clients.ts`)
> if this module has a supplier/client field, and `MatchTransactionDialog`
> (backed by `lib/bank-match.ts`) if it has a "Match"/"AI Match" against
> the bank feed — extend `BankMatchType` and that file's endpoint branches
> rather than writing a new modal.
>
> [Note whether Asset has bank-feed matching in sole-webapp — if it
> doesn't, say so and skip that piece rather than assuming every module
> has it.]
>
> [Note whether Asset's attachment story is symmetric — real upload *and*
> delete endpoints — or append-only/create-time-only like Equity's, by
> checking `sole-ocr`'s actual routes file for this module rather than
> assuming.]
>
> Work module-by-module in this order, confirming each before moving on:
> listing (server pagination + real field mapping, matching sole-webapp's
> exact list-endpoint response shape) → Match/AI Match if it exists →
> create/edit (real category/subcategory list if there is one, not a
> hardcoded enum; validation ported exactly from sole-webapp's schema,
> including its exact boundary conditions; per-field touch-tracking for
> showing validation errors, not one global flag that reveals every
> field's error the moment any one field is touched) → delete/attach/
> undo-match, whichever of those this module actually has.
>
> Give a short plan first — which sole-webapp files you're using as the
> reference and which newfrontend_ai files you'll touch — before writing
> any code, and flag anything genuinely ambiguous (a UI field with no
> backend equivalent, a schema wanting two ids from one picker that only
> returns one) rather than guessing.
>
> Write Vitest tests for every new `lib/asset.ts` function, following the
> pattern in `lib/liabilities.test.ts`/`lib/equity.test.ts`, and run the
> whole suite afterwards, not just the new file. Keep `tsc` and `eslint`
> clean throughout. Once it's wired, actually run it — typechecking isn't
> testing — and tell me up front if you don't have a way to get an
> authenticated session, rather than only testing the logged-out/error
> paths silently.
