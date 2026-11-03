# Testing: Assets Module

Reference for test coverage across the Assets module: the register itself
(create/edit/delete, GST, depreciation, insurance, disposal, lost/stolen
status), bank-transaction matching, the asset-name autocomplete, the org-wide
depreciation report, the asset registry (brands/types), and bulk CSV import.

This doc exists for two audiences at once: a tester deciding what to click
and check by hand, and an engineer deciding what a new test needs to assert.
Wherever the real behaviour is easy to guess wrong — a checkbox that quietly
flips a reconciliation flag, an edit that silently deletes a real bank
transaction, a response field the frontend assumes exists but never does —
it's called out explicitly under **Backend quirks worth checking by hand**,
because these are exactly the things an automated test can pin down but a
quick glance at the screen won't reveal.

**Scope note**: this doc covers the Assets module only. For every other
module (Matching Rules, Payments, Expenses, Super Contributions,
Multi-Business, the Reporting suite), see `docs/testing-coverage.md` and
`docs/testing-coverage-reporting-suite.md` — their "Writing a new test in
this codebase" and "What this repo doesn't have" sections apply here
unchanged and aren't repeated below. For a manual, click-through QA
walkthrough of the Assets screens with no code internals, see
`docs/assets-testing-guide.md` — this doc is the complement to that one, not
a replacement.

All files are Vitest unit tests — no browser, no rendering, the same
mocked-`axios` convention already used across `lib/*.test.ts` in this repo.
There is **no dedicated component/screen test** for anything in this module —
this repo has no React-rendering test setup at all (see the main doc); every
Assets screen and dialog is a thin, mostly-presentational wrapper around the
`lib/*.ts` file that owns its real logic, which is what's actually under
test here.

## Running them

```bash
npx vitest run                                                    # everything in the repo
npx vitest run lib/assets.test.ts                                 # the register, GST, status, depreciation API wiring
npx vitest run lib/asset-match.test.ts                             # bank-transaction matching (see the dead-code note below)
npx vitest run lib/asset-depreciation-report.test.ts               # the org-wide depreciation report
npx vitest run lib/service-autocomplete.test.ts                    # the asset-name autocomplete
```

Current as of this doc: **1280 tests pass repo-wide** (58 files). The table
below is just the Assets-module slice of that — **48 tests across 4 files**.
There is no dedicated test file for `lib/asset-bulk-import.ts` — see its own
section below for why that's a real gap, not an oversight to wave off.

| Area | Test file | Test count | New/pre-existing |
|---|---|---|---|
| Register, GST, status, disposal, depreciation wiring | `lib/assets.test.ts` | 27 | built with the module (one continuous run of commits — see note below) |
| Bank-transaction matching | `lib/asset-match.test.ts` | 12 | built with the module; **the code it tests is now half dead** — see "Bank-transaction matching" below |
| Org-wide depreciation report | `lib/asset-depreciation-report.test.ts` | 6 | pre-existing (already flagged as such in `docs/testing-coverage-reporting-suite.md`'s Depreciation Reports section) |
| Asset-name autocomplete | `lib/service-autocomplete.test.ts` | 3 | built with the module |
| Bulk CSV import | — (no test file) | 0 | — |
| Registry (brands/types) | — (no test file; trivial CRUD, see its section) | 0 | — |
| `stores/assets.ts`, `stores/asset-registry.ts` | — (audited, no dedicated test file) | 0 | — |

Unlike the Matching Rules/Payments/Reporting-suite docs, the Assets module
doesn't show a clean "added this engagement vs. already there" split: `git
log` on `lib/assets.ts` and `lib/asset-match.ts` shows both landing across
the same short run of commits (`build the asset register` →
`Assets lifecycle pages…` → `asset integration`), i.e. the module was built
as one piece, not extended later. The one genuine exception is
`lib/asset-bulk-import.ts`, which lands in a separate, later commit
(`Api integration for migration module`) alongside the wider bulk-import
work `docs/testing-coverage.md` mentions in its scope note.

---

## The asset register — `lib/assets.ts`

The core module: what an asset is, what it costs, what's still owed on it,
its GST treatment, and the register's own filter/sort/stats logic. Every
other section below either reads fields this module defines (`isReconciled`,
`remainingAmount`) or is deliberately kept out of it (matching, insurance,
disposal, status all live in their own files — see their sections).

### Real contract — `lib/assets.ts`

**The `Asset` type** (verbatim, the shape every fixture is built from):

```ts
export type Asset = {
  id: string;
  name: string;
  category: AssetCategory;
  supplierId: string | null;
  supplierName: string;
  /** As typed. Use `assetValue` for the figure. */
  costPrice: string;
  /** ISO `YYYY-MM-DD`. */
  purchaseDate: string;
  /** Still owed on it. Empty or "0" means paid outright. */
  owing: string;
  gst: boolean;
  paidWithCash: boolean;

  /* Inventory tracking — only meaningful while category is Inventory. */
  unitType: string;
  tracked: boolean;
  openingStock: string;
  lowStockAlert: string;
  inventoryProductId: string | null;

  brand: string;
  assetType: string;
  modelNo: string;
  serialNo: string;
  identifyingMarks: string;
  warrantyExpiry: string;
  testAndTagDate: string;

  photos: Partial<Record<AssetPhotoSlot, AssetFile>>;
  documents: AssetFile[];
  depreciation: AssetDepreciation;
  insurance: AssetInsurance[];

  disposedDate: string;
  saleValue: string;
  statusReason: AssetStatusReason | null;

  /** Whether this asset's full cost has been reconciled against a bank transaction. */
  isReconciled: boolean;
  /** What's left to reconcile — 0 once fully matched. */
  remainingAmount: number;
  /** Unreconciled bank transactions within tolerance of the price — "AI Match" when > 0. */
  possibleMatchCount: number;
};
```

`owing` (financed/still-owed) has **no column on the backend's `assets`
table at all** — confirmed against both the Sequelize model and
sole-webapp's own submit payload. It's local-only: never sent on
create/update, never hydrated from a fetch, so every asset reads as fully
paid the moment it round-trips through the server. There is currently no way
to actually record and persist that an asset is still being paid off.

**Pure functions** (signature + the exact rule/edge case): **none of these
have a test in `lib/assets.test.ts`** — see the callout after the list.

- `assetValue(asset): number` — `Number(costPrice.replace(/,/g,''))`, `0` if not finite.
- `assetOwing(asset): number` — same parse on `owing`, floored at 0 (a negative typed value can't make an asset "owe" a negative amount).
- `isPaid(asset): boolean` — `assetOwing(asset) === 0`.
- `assetExGstValue(asset): number` — the price with GST divided back out (`GST_DIVISOR = 11`) when `gst` is true, else the price as-is.
- `depreciationPreview(asset, values): DepreciationPreview` — the four headline figures (depreciable cost, opening book value, rate, annual depreciation). GST comes out **first**, then the cost limit **caps** the ex-GST base (`Math.min`, never an assignment — a limit above the price changes nothing). `"Full depreciation on purchase"` → `rate: 1`, whole base depreciated in year one. No effective life entered → `rate: null` (not a guessed rate) and `annualDepreciation: 0`. `"Straight line"` → `rate: 1/life`, `(depreciableCost - residual)/life`. `"Diminishing value"` → `rate = overrideRate/100` if a positive override is typed, else `2/life` (the ATO's 200% rule); residual is **not** subtracted from the diminishing-value base (it converges towards nothing on its own — subtracting up front double-charges for it).
- `depreciationSchedule(asset, values, today?)` — the year-by-year table built **on top of** `depreciationPreview` (so the two can't disagree). Capped at `MAX_SCHEDULE_YEARS = 40` (a typed "100" instead of "10" produces a bounded schedule, not a hang). Every year is `Math.min(claimed, opening - residual)` — nothing can go below the residual, and a diminishing-value asset's loop stops itself once a year computes to `<= 0` rather than running the full cap. `elapsedYears`/`accumulated` are "so far", not "over the whole schedule" — `wholeYearsBetween` does **string** comparison on the ISO date slices, not `Date` subtraction, specifically to avoid a timezone-driven off-by-one on the anniversary.
- `gstBreakdown(costPrice, includesGst)` — `{subTotal, gst, total}`, the same `/11` divisor.
- `assetStats(assets): AssetStats` — `paidValue = totalValue - owingValue` (since `owing` is always 0 today per the note above, `paidValue` currently always equals `totalValue`).
- `filterAssets(assets, {query, filter, sort})` — `"Matched"`/`"Unmatched"` filter on `isReconciled` (not on `owing`/`isPaid` — a paid-outright asset and a bank-reconciled asset are different facts, see the quirk below); free text matches name/supplier/category only, not brand/serial/model.
- `assetIssues(draft): AssetIssue[]` — `unitType` is only required when `category === "Inventory"`; `effectiveLife` is only required/validated when `depreciation.enabled`.
- `firstIncompleteStep(issues)` — maps an issue key back to a wizard step via `ASSET_STEP_FIELDS`; `null` once nothing's outstanding.

**Nothing above has a test.** `lib/assets.test.ts`'s 27 tests cover
`registryEntryByName`, the create/update/delete/fetch API wiring, asset
status (lost/stolen), the depreciation *API* wrapper, and `filterAssets`'s
Matched/Unmatched branches only — the actual depreciation arithmetic
(`depreciationPreview`/`depreciationSchedule`, by far the most intricate
pure logic in this file, per its own doc comments on GST-first ordering,
cost-limit capping and residual clamping), `assetValue`/`assetOwing`/
`isPaid`, `gstBreakdown`, `assetStats`, the rest of `filterAssets` (query,
category filter, every sort), and `assetIssues`/`firstIncompleteStep` are
**entirely untested**. This is the single biggest coverage gap in the
Assets module — a regression in the diminishing-value rate, the cost-limit
`min`, or the residual clamp would ship silently today.

**Real API calls** (`ApiEnvelope<T> = {success, message?, data?}`, the same
envelope convention as `lib/inventory.ts`):

| Function | Method | Route | Body/params | Response | Notes |
|---|---|---|---|---|---|
| `fetchAssets(registry)` | GET | `apiRoutes.asset.list` → `/assets` | `{pagination: "off"}` | `{success, data?: {asset_details}}` | Fetches everything in one call — `filterAssets`/`assetStats` do the rest client-side. Because pagination is off, `getAssets`'s own `Math.floor(total/limit)` page-count bug (see below) never actually bites this app. |
| `fetchAssetDetails(id, registry)` | GET | `apiRoutes.asset.info` → `/assets/details/` + id | — | `{success, data?}` | Oddly, this route is implemented in `AssetDepreciationController.assetDetails`, not the main assets controller — a file-organisation quirk, not a functional one; the shape it returns is compatible with `mapApiAssetToAsset`. Throws `"Asset not found."` on a missing row. |
| `createAssetApi(draft, registry)` | POST | `apiRoutes.asset.add` → `/assets/create` | multipart `FormData` (`assetDraftToFormData`) | `{success}` | Backend returns `data: {}` — no created row comes back, so the new asset is only visible once the list refetches. |
| `updateAssetApi(id, draft, registry)` | POST | `apiRoutes.asset.update` → `/assets/update` | multipart `FormData` + `asset_id` | `{success}` | **See "the most important quirk in this doc" below** — every save has a side effect well beyond the fields on screen. |
| `deleteAssetsApi(ids)` | POST | `apiRoutes.asset.delete` → `/assets/bulk-delete` | `{assets: ids}` | `{success, data?: {deleted_asset_ids, skipped_asset_ids}}` | Same endpoint for one row or many. |
| `attachAssetDocumentApi(assetId, file)` | POST | `apiRoutes.asset.uploadAttachment` → `/assets/attach` | multipart `FormData` | `{success}` | — |
| `deleteAssetDocumentApi(documentId)` | DELETE | `apiRoutes.asset.deleteAttachment` + `/{id}` | — | `{success}` | — |
| `downloadAssetsApi(ids)` | GET | `apiRoutes.asset.download` → `/assets/download` | `{params: {"assets[]": ids}, responseType: "blob"}` | Blob, or a JSON error body still delivered as a Blob | `blobErrorMessage` re-parses the blob back to JSON to recover the real server message (e.g. "No attachments found for selected assets") instead of a generic failure. |
| `extractAssetApi(file, today)` | POST ×2 | `/upload/s3` then `apiRoutes.asset.ocr.extract` → `/assets/extract` | multipart, then JSON `{s3Url, s3Key, fileType}` | Upload: flat `{success, url, key}` (no `data` envelope). Extract: `{success, extractedData, processingInfo}` | See the quirk on `gst` below. |

### Backend quirks worth checking by hand

- **"Paid with cash" isn't a separate fact from "reconciled" — ticking it *is* a reconciliation.** Confirmed in `services/assets.js`'s `createAsset`/`updateAsset` (and again in `bulkCreateAssets`): `is_reconciled: isPaidWithCash ? 1 : existingAsset.is_reconciled` — and on create, `postAssetAccountingEntries` posts a real journal entry, a synthetic "cash payment" `Transactions` row, and a `reconciliation_records` link the moment `paid_with_cash` is true, with no bank transaction ever involved. **Manual check**: create a new asset with "Paid with cash" ticked and confirm it shows as **Matched** in the register's filter/badge immediately, with no trip through the Match dialog — this is correct backend behaviour, not a display bug, but it means "Matched" in this app's UI conflates two genuinely different facts (paid in cash vs. reconciled against a real bank feed transaction).
- **This is the most important quirk in this doc: saving *any* edit to an already bank-matched asset silently deletes its real match — and the real bank transaction row with it.** Confirmed directly in `services/assets.js`'s `updateAsset`: before calling `postAssetAccountingEntries`, it unconditionally finds **every** `journal_entries` row with `reference_type='asset', reference_id=<this asset>` — which includes the entry created by a genuine bank match (`createJournalForAsset` in `services/v2/bankTransaction.js` uses the identical `reference_type`/`reference_id` pair) — and destroys the journal entry, its `reconciliation_records`, and the underlying `Transactions` row(s) those records point at. It then rebuilds that trail **only if `paid_with_cash` is currently checked**. Since a bank-matched asset's `paidWithCash` is normally `false`, saving *any* edit through the standard Edit-asset form (renaming it, fixing a serial number — anything) deletes the real bank transaction and its reconciliation permanently, while leaving `is_reconciled` untouched — the register still shows **Matched** even though the underlying ledger link, and the actual imported bank transaction, are gone. **Manual check**: match an asset to a real bank transaction via "Match"/"AI Match", then edit and save that asset through the normal Edit form (change nothing load-bearing — just re-save). Check the bank feed for that transaction afterwards; per the backend code this should have vanished. This is a data-integrity risk, not a cosmetic one, and worth escalating rather than filing as a routine bug if confirmed live.
- **The register's `possible_match` (→ "AI Match") count is a live, per-request SQL subquery**, not a stored figure: unreconciled debit transactions within `±$1.00` (`tolerance`, a per-user-configurable default) of the asset's price, minus whatever's already claimed against them via `reconciliation_records`. Confirmed identically in both `getAssets` and `assetDetails`.
- **`getAssets`'s own pagination math is `Math.floor(total/limit)`, the same undercount bug documented for Audit Trail in `docs/testing-coverage-reporting-suite.md`** — but it's inert here today, because `fetchAssets` always requests `pagination: "off"` and fetches everything in one call. Worth flagging only so nobody "fixes" this app's pagination by turning that flag on without also fixing the server-side count.
- **OCR extraction never reports GST at all.** `mapExtractionToAssetData` in `assetOcrController.js` has no `gst`/`is_gst` field in its output under any extraction path (AI, pattern, or hybrid) — confirmed by reading the full mapper. `extractAssetApi` hardcodes `gst: true` on every capture regardless of what's actually on the receipt. **Manual check**: photograph a receipt from a supplier not registered for GST and confirm the captured draft still opens with GST ticked — that's the hardcoded default, not a real read of the document, and the person filling in the form needs to notice and correct it.
- **Bulk-deleting a single reconciled or invoice-linked asset returns a specific rejection; bulk-deleting several just skips them.** Confirmed in `assetStatus.js`'s `BulkDeleteAssets`: selecting exactly one already-reconciled asset returns `{success:false, message:"No assets deleted: reconciled assets cannot be deleted."}` (and a distinct message for an inventory item already used on an invoice); selecting several, the reconciled/invoiced ones are silently filtered into `skipped_asset_ids` while the rest still delete. Same "different behaviour for a 1-row vs. many-row selection" pattern as Expenses' own bulk-delete (`docs/testing-coverage.md`).

---

## Depreciation

Two distinct surfaces read/write depreciation: the per-asset settings
(inline on create/edit, or revisited standalone via
`fetchAssetDepreciation`/`saveAssetDepreciationApi`/`deleteAssetDepreciationApi`
in `lib/assets.ts`), and the org-wide report across every depreciating asset
(`lib/asset-depreciation-report.ts`, already documented as pre-existing in
`docs/testing-coverage-reporting-suite.md`'s Depreciation Reports section —
only summarised here for completeness).

### Real contract — depreciation settings, `lib/assets.ts`

```ts
export type AssetDepreciation = {
  enabled: boolean;
  method: DepreciationMethod; // "Straight line" | "Diminishing value" | "Full depreciation on purchase"
  effectiveLife: string;      // years, as typed
  overrideRate: string;       // per cent, as typed — overrides the method's own rate
  residualValue: string;
  costLimit: string;
  startDate: string;          // ISO YYYY-MM-DD, defaults to purchase date
};

export type AssetDepreciationRecord = AssetDepreciation & { id: string };
```

The pure math (`depreciationPreview`/`depreciationSchedule`) is documented
above, under the register, since it takes an `Asset`/`AssetDepreciation`
pair directly rather than living behind its own API — and is, per that
section, entirely untested.

**Real API calls**:

| Function | Method | Route | Notes |
|---|---|---|---|
| `fetchAssetDepreciation(assetId)` | GET | `apiRoutes.asset.depreciation.byAsset` + id | `null` on a 404 (nothing set up yet) — not an error. Rethrows any other status. |
| `saveAssetDepreciationApi(assetId, values)` | POST | `apiRoutes.asset.depreciation.create` | Upserts on `asset_id` server-side — same endpoint for first-time setup and a later edit. |
| `deleteAssetDepreciationApi(depreciationId)` | DELETE | `apiRoutes.asset.depreciation.delete` + id | — |

### Backend quirks worth checking by hand

- **Reporting an asset Lost/Damaged or Stolen pauses its depreciation server-side; marking it Returned (or deleting the report) resumes it.** Confirmed in `assetStatus.js`: `createAssetStatus` calls `pauseDepreciations` (`AssetDepreciation.is_active → 0`) before saving the status row; both `markAssetReturned` and `deleteAssetStatus` call `resumeDepreciations` (`is_active → 1`). None of this is visible in `lib/assets.ts`'s types — `AssetDepreciation` has no `is_active`/paused flag at all client-side. **Manual check**: report a depreciating asset Lost, then open the org-wide Depreciation Report for the current FY and confirm its `fyDepreciation` stops accruing from that point — there's no on-screen indicator anywhere that this happened.
- Depreciation IS scoped to a specific asset id at the DB level (`asset_depreciation.asset_id`, one active row per asset, upserted) — there's no way for two depreciation schedules to exist for one asset at once, so `fetchAssetDepreciation`'s "one record or null" shape is a genuine constraint, not just a client-side assumption.

---

## Depreciation Report (org-wide) — `lib/asset-depreciation-report.ts`

Pre-existing per `docs/testing-coverage-reporting-suite.md` — summarised here
only so an Assets-module reader doesn't have to cross-reference. `GET
/assets/depreciation/summary` doesn't recompute a schedule per request: it
sums pre-generated `asset_depreciation_entries` rows for the chosen FY window
and reports each asset's *current* opening value/accumulated
depreciation/book value alongside that — only `fyDepreciation` is actually
scoped to the selected year; the other three describe the asset as it stands
today regardless of which FY is picked, same as sole-webapp's own report.

`recentFinancialYears(today)` returns the current Australian FY (1 Jul–30
Jun) plus the four before it. `depreciationReportCsv` quotes fields per RFC
4180 — sole-webapp's own export joins raw values with bare commas and
silently corrupts a row the moment an asset name contains one (e.g. "Desk,
standing"); this port fixes that without changing which columns are
exported. 6 tests, `lib/asset-depreciation-report.test.ts`.

---

## Insurance — `lib/assets.ts` (`asset.insurance.*` routes)

### Real contract

```ts
export type AssetInsurance = {
  id: string;
  insurerName: string;
  policyNumber: string;
  insurerEmail: string;
  brokerName: string;
  brokerPhone: string;
  coverageAmount: string;   // as typed
  premiumAmount: string;    // as typed
  startDate: string;        // ISO YYYY-MM-DD
  endDate: string;          // ISO YYYY-MM-DD
  notes: string;
};
```

A list, not a single record — one asset can carry both a comprehensive
policy and a separate tools-in-transit one. There is no "replace the whole
list" endpoint; the insurance screen diffs and calls one record at a time.

**Real API calls**:

| Function | Method | Route | Notes |
|---|---|---|---|
| `fetchAssetInsurance(assetId)` | GET | `.byAsset` + id | Returns `[]` on no `data`, never throws. |
| `createAssetInsuranceApi(assetId, record)` | POST | `.create` | — |
| `updateAssetInsuranceApi(record)` | **PATCH** | `.update` + `record.id` | — |
| `deleteAssetInsuranceApi(recordId)` | DELETE | `.delete` + id | — |
| `sendAssetInsuranceReportApi(recordId)` | POST | `.send` + id + `/send` | — |

Untested — no insurance-specific test exists in `lib/assets.test.ts` beyond
what's implicitly covered by the status flow's insurance-gate check below.

### Backend quirks worth checking by hand

- **Reporting an asset Stolen without an insurance record on file is a hard 422, not a soft warning.** Confirmed in `assetStatus.js`'s `createAssetStatus`: `status_type === 'stolen'` with no matching `AssetInsurance` row returns `{success:false, message:"Cannot mark asset as Stolen: no insurance record found. Please add insurance first."}` at HTTP 422. `lib/assets.ts`'s `reportAssetStatusApi` surfaces that message verbatim via the generic `!success` throw — the status screen is meant to pre-check `useAssetInsuranceQuery` and never offer "Stolen" without cover, but this is the real server-side backstop if that client-side gate is ever bypassed or gets out of sync. **Manual check**: on an asset with zero insurance records, confirm "Stolen" either isn't offered or fails with this specific message — not a generic "something went wrong".

---

## Disposal & Status (lost/damaged/stolen) — `lib/assets.ts` (`asset.status.*`, `asset.disposal.*`)

Disposal and status share one backend row (`AssetStatus`) but are distinct
concerns client-side: a disposed asset is gone for good (`isDisposed` reads
`disposedDate`, the presence of the date **is** the disposal — no separate
boolean to disagree with it); a lost/stolen asset might still come back
(`isReturned`).

### Real contract

```ts
export type AssetDisposalRecord = { disposedDate: string; saleValue: string; suggestedSaleValue: string };

export const ASSET_STATUS_REASONS = ["Lost or damaged", "Stolen"] as const;
export type AssetStatusRecord = {
  reason: AssetStatusReason;
  referenceNo: string;
  policeReportNo: string;
  notes: string;
  isReturned: boolean;
  reportedDate: string; // ISO YYYY-MM-DD, display only
};
```

**Real API calls**:

| Function | Method | Route | Notes |
|---|---|---|---|
| `fetchAssetDisposal(assetId)` | GET | `.disposal.byAsset` + id | `null` on 404 or on a row with no `disposed_date` (a disposal-only fact, not a generic "no record" flag). |
| `recordAssetDisposalApi(assetId, values)` | POST | `.disposal.create` | — |
| `deleteAssetDisposalApi(assetId)` | DELETE | `.disposal.delete` + id | — |
| `fetchAssetStatus(assetId)` | GET | `.status.byAsset` + id | `null` on 404 — a normal, unreported state. |
| `reportAssetStatusApi(assetId, values)` | POST | `.status.create` | See the 422 quirk above. |
| `markAssetReturned(assetId)` | PATCH | `.status.markReturned(id)` | Resumes depreciation server-side — see above. |
| `deleteAssetStatusApi(assetId)` | DELETE | `.status.delete` + id | Also resumes depreciation — clearing the report entirely has the same accounting side-effect as marking it returned, even though it's a different user action. |

`lib/assets.test.ts` covers `fetchAssetStatus`'s null/mapped/active-not-returned
cases, `reportAssetStatusApi`'s enum mapping and the insurance-422 throw,
`markAssetReturned`, and `deleteAssetStatusApi` — the disposal endpoints
themselves have no dedicated tests (`fetchAssetDisposal`/
`recordAssetDisposalApi`/`deleteAssetDisposalApi` are exercised nowhere in
the suite).

---

## Bank-transaction matching — `lib/bank-match.ts` is live; `lib/asset-match.ts` is half dead code

This is a genuine finding, not a documentation nicety: **the asset
register's actual "Match"/"AI Match" flow does not go through
`lib/asset-match.ts` at all.** `components/assets/match-dialog.tsx` — the
component `AssetDialogs` actually mounts — imports `MatchTransactionDialog`
from `components/shared/match-transaction-dialog.tsx`, which is built on
`lib/bank-match.ts`'s generic `type: "asset"` handling
(`fetchPossibleMatches`, `matchSingleTransaction`,
`matchMultipleTransactions`). `lib/asset-match.ts`'s own equivalents —
`fetchPossibleAssetMatches`, `matchAssetToTransactionApi`,
`matchAssetToMultipleTransactionsApi` — and their hook wrappers in
`hooks/use-asset-match-query.ts` (`usePossibleAssetMatchesQuery`,
`useMatchAssetMutation`, `useMatchAssetToMultipleMutation`) are exported but
**not imported by any component in the repo** (confirmed by grepping every
call site). They're covered by 8 of `lib/asset-match.test.ts`'s 12 tests,
which is now dead weight — real, passing tests of code nothing calls.

The other 4 tests in that file are **not** dead: `undoAssetMatchApi` and
`bulkUndoAssetMatchesApi` are genuinely live, wired through
`useUndoAssetMatchMutation`/`useBulkUndoAssetMatchMutation` into
`AssetDialogs`' `UndoAssetMatchDialog`/`BulkUndoAssetMatchDialog`. So the
file is split cleanly in half: matching itself has moved to the shared
`lib/bank-match.ts`, but undoing a match still hasn't.

### Real contract — the live path, `lib/bank-match.ts`

```ts
export type BankMatchType = "expense" | "asset" | "liability" | "equity" | "invoice";
export type MatchCandidate = { id: string; date: string; description: string; reference: string; amount: number; availableAmount: number };
```

- `fetchPossibleMatches(type, entryId, {multiple?})` — `GET
  .../possible-matches/{type}/{entryId}`. `multiple: true` is a genuinely
  different server query (every unmatched debit in the lookback window,
  regardless of amount), not a client-side re-filter of the same list —
  switching tabs in the UI must refetch.
- `matchSingleTransaction("asset", entryId, transactionId)` → `POST
  .../v2/bank-transaction/match-asset-expense`, `{bank_transaction_id,
  assets: [entryId]}`, encrypted body. A `status` field in a 200 response
  (`writeoff_prompt`/`manual_correction_required`) is thrown as an error —
  there's no follow-up screen for either yet.
- `matchMultipleTransactions("asset", entryId, transactionIds)` → `POST
  .../v2/bank-transaction/match-multiple-asset-expense`, `{transaction_ids,
  entry_id: entryId, type: "asset"}`.
- `undoMatchTransaction(type, entryId, journalEntryId?)` — the shared
  undo endpoint every module uses, **not** what `AssetDialogs`' undo
  dialogs actually call (they use `lib/asset-match.ts`'s
  `undoAssetMatchApi`/`bulkUndoAssetMatchesApi` instead, which post to the
  same underlying route with `asset_id`/`asset_ids` rather than a resolved
  `journal_entry_id`).

### Backend quirks worth checking by hand

- **`bank_transaction_id` on the asset row is never the reconciliation signal — `is_reconciled` and `remainingAmount` are.** Confirmed directly in `services/v2/bankTransaction.js`'s `setMatchAssetsExpenses`: a successful match runs `await item.entry.update({ bank_transaction_id: null, is_reconciled: 1 })` — the id is explicitly **nulled back out** the moment a match completes; the real link lives in a `journal_entries`/`reconciliation_records` pair instead (`reference_type: 'asset'`). Anything that reads `asset.bank_transaction_id` to decide whether an asset is matched will always see it as unmatched, forever, even mid-match.
- **Undoing a match resets `paid_with_cash` back to `0` too, not just `is_reconciled`.** Confirmed in `undoMatchTransaction`: `Assets.update({ paid_with_cash: 0, is_reconciled: 0 }, ...)`. Combined with the "paid with cash *is* a reconciliation" quirk above, this means the Undo-match action is also the only way to un-tick "paid with cash" on an asset once it's been saved that way — there's no dedicated "mark not paid with cash" control anywhere in the register or edit form.
- **A "paid with cash" asset genuinely has a journal entry and reconciliation record behind it (created by `postAssetAccountingEntries`), so "Undo match" on it isn't a no-op** — it resolves via `resolveUndoMatchJournalEntryId`'s `reference_type='asset'` lookup exactly like a real bank match would, and correctly reverses the cash-payment journal entry. Worth confirming by hand precisely because it's easy to assume (wrongly) that a cash-paid asset has nothing for "Undo match" to find.
- See the register section above for the update-wipes-the-real-match quirk — it belongs conceptually here too, since it's this module's match that gets destroyed.

---

## Asset registry (brands & types) — `lib/assets.ts` (`assetRegistry.*` routes), `stores/asset-registry.ts`

List-and-create only, by design: `assetRegistry.js`'s controller exports
exactly `getAssetBrands`/`getAssetTypes`/`createAssetBrand`/`createAssetType`
— **no rename, no delete, for either.** `stores/asset-registry.ts`'s own
comment says this explicitly, and the registry dialog only ever offers
adding a make/type as a result, never renaming or removing one.

`fetchAssetRegistry()` calls both list endpoints in parallel.
`createAssetBrandApi`/`createAssetTypeApi` POST `{name: name.trim()}` and
throw if the response carries no `data`. `normaliseRegistry`/
`registryEntryByName` in `lib/assets.ts` match case-insensitively and
trimmed; the backend's own `findOrCreate` (`where: {name: name.trim()}`) is
**case-sensitive**.

### Backend quirks worth checking by hand

- **A genuine name collision the local store hasn't seen yet returns HTTP 409, not a 200 with `success:false`.** `createAssetBrand`/`createAssetType` return `res.status(409).json({success:false, message:'"..." already exists'})` when `findOrCreate`'s `created` flag is false. Since axios throws on any non-2xx status, this never reaches `createAssetBrandApi`'s own `if (!response.data?.data)` check — it surfaces through whatever generic catch/toast wraps `useCreateAssetBrandMutation`/`useCreateAssetTypeMutation`, not the function's own `"Failed to add brand."` message. In normal single-tab use this is rarely hit, since `useCreateAssetBrandMutation` already checks the locally-hydrated store first (case-insensitively) before ever calling the API — it only fires on a genuinely stale store or a same-name add racing in another tab. **Manual check**: two tabs adding the same new brand name at once — confirm the second one doesn't hang or show a blank error.

---

## Asset-name autocomplete — `lib/service-autocomplete.ts`

Live search over `GET /services/all/autocomplete` as you type an asset's
name — a hybrid of the shared `services_all` reference catalogue and the
caller's own `custom_product_service` rows, the same endpoint sole-webapp's
Expense name field also calls. **Bare-array response, not the
`{success, data}` envelope** the rest of this app's endpoints use —
confirmed against `servicesAll.js`/`customProductAndService.js`.

`AUTOCOMPLETE_MIN_LENGTH = 2` — below that, `fetchServiceAutocomplete`
returns `[]` without calling the API at all. `txnType: "Debit"` is sent on
every call but only scopes the `custom_product_service` half of the query;
`services_all`'s own reference rows are all `Credit` and ignore it —
confirmed in `servicesAll.js`. Picking a suggestion that already has a
`productId` is what lets the asset form link to an existing tracked
inventory item instead of the backend creating a second, duplicate product
behind it (see `assetDraftToFormData`'s `inventory_product_id` field in the
register section). 3 tests, `lib/service-autocomplete.test.ts` — the min-length
gate, the mapped bare-array response, and the empty-response fallback.
`costPrice` prefers `cost_price` over `price` — what it cost to buy, not
what it would sell for.

---

## Bulk CSV import — `lib/asset-bulk-import.ts`

Ported from sole-webapp's `components/Migration/BulkAssetMigration.js`,
posting `{assets: [...]}` to `/assets/bulk/create` (via
`createBulkAssets`/`lib/bulk-records.ts`, wired through
`useBulkCreateAssetsMutation` in `hooks/use-assets-query.ts` — the standard
query-key/invalidation pattern, nothing bespoke). Its own header comment
says it replaces an older, row-at-a-time `lib/asset-import.ts` whose header
warned off `/assets/bulk/create` because that endpoint used to drop
brand/type/category. **`lib/asset-import.ts` no longer exists in this
repo** — confirmed by a direct file search — so this is a completed
replacement, not a dead file left lying around alongside a live one. The
new module still drops brand and type (they're genuinely not columns this
CSV format carries) but does take Category, matched against the chart of
accounts via `matchCategory`.

**Real contract** — `assetImportSpec(categories)` builds the field
list/aliases/validation `issues[]` (required Asset name, required Category
that must match a known chart-of-accounts entry, `DD/MM/YYYY` Purchase date
that can't be in the future, a positive-money Purchase price, a Yes/No Paid
column, an optional GST amount that can't exceed the price, an optional
phone-shaped Supplier phone). `assetPayload(values, categories)` builds the
wire shape:

```ts
export type AssetImportPayload = {
  name: string;
  price: number;
  date_of_purchase: string;
  account_subcategory_id: string | null;
  client_name: string | null;
  gst_amount: number;
  paid_with_cash: boolean;
};
```

Confirmed against `bulkCreateAssets` in `services/assets.js`: `paid_with_cash`
sets `is_reconciled` to the same value here too (`row.paid_with_cash === 1
|| ... ? 1 : 0` for both fields) — the "paid with cash is a reconciliation"
quirk documented above holds for a bulk-imported row exactly as it does for
one entered by hand, and a `true` value additionally triggers
`postAccountingEntriesForBulkUpload`, the bulk-path's own version of
`postAssetAccountingEntries`.

**There is no dedicated test file for this module** — `lib/bulk-import.test.ts`
covers the shared helpers it imports (`isMoney`/`parseBulkDate`/
`matchCategory`/etc.) generically, but `assetImportSpec`'s own field list,
its ten validation `issues[]` rules, and `assetPayload`'s mapping have no
asset-specific test anywhere in the suite. Given the GST-exceeds-price and
future-dated-purchase rules are specific to this file (not inherited from
the shared helpers), this is a real gap worth closing before the bulk
importer is trusted for a large migration.

---

## Stores — `stores/assets.ts`, `stores/asset-registry.ts`

Both audited, no dedicated test file.

`useAssetsStore` (verbatim, in full):

```ts
type AssetsState = {
  assets: Asset[];
  hydrated: boolean;
  setAssets: (assets: Asset[]) => void;
};

export const useAssetsStore = create<AssetsState>()((set) => ({
  assets: [],
  hydrated: false,
  setAssets: (assets) => set({ assets, hydrated: true }),
}));
```

One setter, one derived `hydrated` flag — the same shape as `stores/rules.ts`
in `docs/testing-coverage.md`, and the same judgment applies: there's no
branching logic here beyond what Zustand's own `set` already does, so a test
file would only re-assert the framework. Fine to leave undocumented-by-a-test.

`useAssetRegistryStore` has slightly more to it — `addBrandRecord`/
`addTypeRecord` both re-sort the full list on every append
(`sorted([...state.records, entry])`, alphabetical by name) rather than just
pushing, so a freshly-added brand appears in the right place in the combobox
immediately rather than at the end until the next full refetch. It's still
simple enough (one sort, no dedupe, no guard against adding a name that's
already present — that's the API's job via the 409 above) that a dedicated
test would mostly restate `Array.prototype.sort`, but it's the one of the
two stores worth a second look if either combobox ever appears to show
brands out of order.

---

## Hooks

`hooks/use-assets-query.ts`, `use-asset-registry-query.ts`,
`use-asset-depreciation-query.ts`, `use-asset-insurance-query.ts`,
`use-asset-disposal-query.ts`, `use-asset-status-query.ts`,
`use-asset-match-query.ts`, `use-asset-mutations.ts`, and
`use-asset-depreciation-report-query.ts` all follow the same standard
TanStack Query pattern already established elsewhere in this repo:
`queryKey: ["assets"]`/`["asset", id]`, an effect that mirrors query data
into the matching Zustand store, and mutations that `invalidateQueries` on
success rather than optimistically patching local state. None of them carry
independent logic worth a dedicated test — the two exceptions already called
out above are `useAssetsQuery`'s registry-before-assets sequencing (waiting
on `useAssetRegistryQuery` before fetching, since brand/type names are
resolved at map time) and `use-asset-match-query.ts`'s dead exports.

