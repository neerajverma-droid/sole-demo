# Testing: Custom Product & Services and Inventory

Reference for the Products & Services module (General / NDIS / Custom tabs,
plus bulk import) and the Inventory module — the two modules `docs/testing-
coverage.md` explicitly excludes from its own scope note. **Unlike that
file, there are currently zero automated test files for anything documented
here** (`lib/products.ts`, `lib/general-catalogue.ts`,
`lib/ndis-support-items.ts`, the Inventory-relevant parts of
`lib/inventory.ts`, and every component under `components/products/` and
`components/inventory/`) — confirmed by search, not assumed. This document
exists to close that gap in two ways at once: a **real contract** reference
(same style as the other file, for whoever writes the first test), and a
**manual QA checklist** (for anyone verifying the feature by hand before
that test suite exists).

**Read the "Known issues" section first.** Several bugs were found and
fixed during this work, one is still open, and one fix was applied and then
reverted by someone else outside this session — all worth knowing before you
start filing new tickets or writing tests against assumed-correct behavior.

## Running tests

```bash
npx vitest run                       # everything in the repo
npx vitest run lib/inventory.test.ts # the one existing file that touches
                                      # this module at all (Custom-tab
                                      # create/update/delete/adjust wiring —
                                      # not products.ts/general-catalogue.ts/
                                      # ndis-support-items.ts, which have no
                                      # test file yet)
```

## Summary

| Area | Automated coverage | This doc covers |
|---|---|---|
| General catalogue (`lib/general-catalogue.ts`) | none | contract, known issues, QA checklist |
| NDIS catalogue (`lib/ndis-support-items.ts`) | none | contract, known issues, QA checklist |
| Custom Products (`lib/products.ts`, `lib/inventory.ts` create/update/delete) | `lib/inventory.test.ts` covers the API-wiring functions only | contract, known issues, QA checklist |
| Bulk import (`lib/products.ts` CSV functions) | none | contract, **one open bug**, QA checklist |
| Inventory / stock tracking (`lib/inventory.ts` stock functions) | `lib/inventory.test.ts` | contract, known issues, QA checklist |

---

## Known issues — read this first

### Still open

**Bulk import's "Map data" step doesn't do anything.** [components/products/product-bulk-dialog.tsx](../components/products/product-bulk-dialog.tsx)'s
step 2 lets you assign which column in your file maps to which Sole field —
but the `mapping` state it builds is read back nowhere except the dropdown
itself. Parsing happens the moment a file is uploaded (in `onFile`), via
`parseProductsCsv()` in `lib/products.ts`, which always reads columns by
**fixed position** (0 = name, 1 = type, 2 = quantity type, …, the template's
own order) regardless of what was selected in step 2. If your file's columns
already match the template order, this is invisible. If you reorder columns
and use Map Data to compensate — exactly the scenario it exists for — your
data silently lands in the wrong fields: a shuffled row either fails
validation and gets skipped, or (worse) the shuffled values happen to look
valid in their wrong slots and import successfully with scrambled data, with
no warning either way.

**QA test for this**: build a CSV with columns in a different order than
`productImportTemplateCsv()`'s own header order, use Map Data to correctly
reassign them, and check whether the Review step shows your real data or
scrambled data. Expect scrambled — that's the bug, not a passing case.

### Fixed this engagement (verify these are still true before relying on them)

- **General tab industry scoping** — used to resolve industry from
  `user_info.industry_id` (a legacy, single-business-era field), so a
  multi-business account saw the *same* General catalogue on every business
  regardless of which was active. Now resolves from the *active business's
  own* `industry_id` (`Businesses` table). Verified with real data: a
  Finance-industry business (`industry_id=6`) correctly gets only Finance
  rows, an NDIS business only NDIS rows.
- **NDIS tab visibility** — used to show for every business regardless of
  industry. sole-webapp (the reference app) only ever shows it when
  `industry_id === 9` (NDIS/Health and Social Care) — this app now matches
  that, gated via `isNdisBusinessProfile()` from `hooks/use-active-business.ts`
  (the same gate Invoices/Quotes already use for their own NDIS routes).
- **NDIS legacy duplicates** — `services_ndis` keeps retired support-item
  codes around (`is_legacy: 1`) alongside their current replacement, same
  number and name. The backend now excludes them
  (`ndisProductsAndServiceList` always filters `is_legacy: 0`) — 31 of 684
  rows were legacy; the NDIS tab's real total is 653. This also fixed a
  React "duplicate key" console warning, since the table used to key rows by
  `supportItemNumber` (not unique across a legacy/current pair) — now keyed
  by the row's own `id`.
- **NDIS pagination was fake** — originally fetched up to 1000 rows in one
  request and paginated/filtered/searched client-side. Now genuinely
  server-side: `fetchNdisSupportItemsPage()` sends `search_query`, `page`,
  `limit`, `registration_group`, `support_category` and the backend actually
  filters/paginates in SQL. A separate, still fetch-all `fetchNdisSupportItems()`
  remains, but **only** to populate the filter dialog's dropdown options and
  the tab's badge count — never the visible table rows.
- **NDIS filter + stale page number** — applying a registration-group/
  support-category filter while sitting on a page number the *narrowed*
  result set no longer has (e.g. page 3 of a filter that now only has 2
  rows) used to request that same page number, get an empty result back from
  the server, and show a nonsensical "21–2 of 2 items" instead of the 2 rows
  that exist on page 1. Fixed by resetting to page 1 whenever NDIS filters
  change (`products-screen.tsx`) — General/Custom never had this bug, since
  their client-side `paginate()` clamps a stale page number back into range
  on its own; only NDIS's server-side pagination had no equivalent clamp.
- **Inventory showed untracked items** — the Inventory screen used to render
  every row from the shared Custom-product store, tracked or not. sole-webapp's
  own Inventory list explicitly requests `is_inventory=1`; this app now
  filters to `item.tracked` client-side (`inventory-screen.tsx`) to match.
- **Custom product dialog's validation lit up untouched fields** — typing
  into Name alone used to immediately show "required" errors on Quantity
  type and Transaction type too, because a single form-wide `edited` boolean
  gated every field's error display. Now per-field `touched` tracking
  (matching the pattern `components/inventory/item-form.tsx` already used) —
  a field's error only shows once *that* field has been edited. Verified
  live in-browser: typing "E2E Browser Test Item" into Name shows no error
  on the other two required fields.
- **`services_all` (General's backing table) was missing `type`/`qty_type`/
  `gst` entirely** — added via migrations `0131`/`0132`, backfilled with
  real values (`type` copied 1:1 from the pre-existing `category` column;
  `qty_type`/`gst` filled by hand per row — see
  `docs/faq/services-all-qty-type-gst-review.csv` for the reviewed values
  and the handful flagged as judgment calls, e.g. NDIS-industry
  medicines/devices where GST-free status can't be determined from the item
  name alone).

### Reverted — status uncertain, re-check before assuming either way

**Business-switch / logout not clearing the React Query cache.** A real bug
was found and fixed here: switching the active business (or logging out)
never invalidated cached query results, so a previous business's — or a
previous account's — Products/Inventory data could keep showing after the
switch (query keys like `["general-catalogue"]`/`["inventory-items"]` don't
include the business id, and `QueryClient` survives a soft client-side
navigation). The fix (`queryClient.invalidateQueries()` in
`business-switcher.tsx`/`businesses-screen.tsx`, `queryClient.clear()` in
`logout-dialog.tsx`) was applied, then found reverted back to the original
(unfixed) state later in the same session by something outside this work —
confirmed absent as of this writing (`grep` for `invalidateQueries`/
`queryClient.clear` in those three files returns nothing). **If you're
verifying stale-data-after-switching-business, this is very likely still
reproducible** — check `git log`/`git blame` on those three files before
assuming it's fixed, and re-apply if it's genuinely gone.

---

## General catalogue

Read-only reference data — `services_all` seeded per industry, scoped to
the active business's own industry, never billed from directly. "Add to my
catalogue" copies a row into a new Custom product; the General row itself
never changes.

### Real contract — `lib/general-catalogue.ts`

```ts
export type GeneralCatalogueEntry = {
  code: string;          // display-only synthetic code — services_all has no sku column
  name: string;
  industry: string;      // resolved server-side, from the joined Industries row
  type: ItemType;        // "Product" | "Service" — a REAL column (unlike Custom, this isn't derived from qty_type)
  transactionType: ItemTransactionType; // "Income" | "Expense", from txn_type
  quantityType: QuantityType;           // "Items" | "Hours" | "Days" | "Km"
  salePrice: string;     // from selling_price — see note below, currently always "0.00" in real data
  taxRate: TaxRate;      // "GST (10%)" | "GST Free", from the gst column
};
```

`fetchGeneralCatalogue(): Promise<GeneralCatalogueEntry[]>` — `GET
/custom-product?active_tab=general&limit=500`. No industry/business param
sent — the backend resolves it from `req.businessId` (already attached to
every request by the axios interceptor). `catalogueCode(industry, name,
index)` builds a readable code like `FIN-FIN01` purely for display/copy —
not a real identifier.

**Known data gap, not a code bug**: every row's `selling_price` is
currently `0.00` in the real database — no real prices were ever seeded
into `services_all`. The "Typical price" column will show "—" for every
General row until that's populated. Confirmed via direct query against the
dev DB, not a frontend rendering issue.

### Manual QA checklist

- [ ] Log in as a business in an industry with seeded General items (e.g.
      Finance, industry_id 6) — header reads `"<Industry name> catalogue ·
      N items"`, table shows the real rows for that industry only.
- [ ] Switch to a business in a *different* industry (or a business with no
      seeded General items) — the list changes to match, or shows the "No
      general catalogue for your industry yet" empty state.
- [ ] Search by name and by the synthetic code (e.g. `FIN-FIN01`) — both
      match.
- [ ] Filter by GST, transaction type, quantity type (individually and
      combined) — narrows correctly; the Filter button's badge count matches
      how many facets are active.
- [ ] "Add to my catalogue" on a row → opens the new item in the edit dialog
      with the price field blank (not the indicative "0"), prompting you to
      set a real price; the item now also appears in the Custom tab.
- [ ] Attempting to add the *same* General row twice for the same business →
      second attempt fails with "Product already exists for this user with
      same name, industry and transaction type."

---

## NDIS catalogue

The official NDIS Support Catalogue (`services_ndis`), only ever shown to
NDIS-industry businesses (`industry_id === 9`). Fully server-paginated,
unlike General/Custom.

### Real contract — `lib/ndis-support-items.ts`

```ts
export type NdisSupportItem = {
  id: string;
  supportItemNumber: string;   // e.g. "01_011_0107_1_1"
  supportItemName: string;
  registrationGroupNumber: string; // zero-padded to 4 digits — DB stores plain int
  registrationGroupName: string;
  supportCategoryNumber: string;   // zero-padded to 2 digits — DB stores plain int
  pricingType: string; // "Price Limited Supports" | "Quotable Supports" | "Unit Price = $1" | ""
                        // — the only real per-row billing signal this catalogue carries
};

export function quantityTypeFromPricingType(pricingType: string): QuantityType;
// "Price Limited Supports" -> "Hours" (overwhelmingly hourly labour);
// everything else (including blank) -> "Items" — blank rows are, in practice,
// almost all physical equipment (wheelchairs, beds, orthotics), not
// open-ended hourly billing.

export type NdisPageParams = {
  search: string; page: number; limit: number;
  registrationGroup: string; // "All" = not sent
  supportCategory: string;   // "All" = not sent
};
export type NdisPage = { items: NdisSupportItem[]; total: number; totalPages: number };
```

- `fetchNdisSupportItems(): Promise<NdisSupportItem[]>` — fetch-all
  (`limit=1000`), **used only** for the filter dialog's option lists and the
  tab badge's total count. Never feeds the visible table.
- `fetchNdisSupportItemsPage(params): Promise<NdisPage>` — the real,
  server-paginated fetch that feeds the table: `GET
  /custom-product?active_tab=ndis&search_query&page&limit&registration_group&support_category`.
  `registration_group` is filtered by **name** server-side (not number);
  `support_category` is filtered by number.

`draftFromSupportItem(item, industry)` (in `lib/products.ts`) uses
`quantityTypeFromPricingType` to decide the copied item's `quantityType`,
then derives `type` from that via `typeFromQuantityLabel` — so a
"Wheelchair" or "Bed" copies in as a Product/Items, not a Service/Hours.
`transactionType` is always `"Income"` and `saleTax` always `"GST Free"` —
both are stable NDIS domain facts, not per-row signals.

### Backend contract — `ndisProductsAndServiceList`

Always filters `is_legacy: 0`. `registration_group` param: comma-split,
`Op.in` on `registration_group_name`. `support_category`: comma-split,
`Number.parseInt`'d, `Op.in` on `support_category_number` — non-numeric
input is silently dropped (no filter applied) rather than erroring.

### Manual QA checklist

- [ ] Log in as an NDIS-industry business — NDIS tab visible; log in as any
      other industry — NDIS tab **absent from the tab bar entirely** (not
      just empty).
- [ ] Badge count reads exactly **653** (684 total minus 31 legacy) once
      loaded — it resolves slightly after the table itself (separate query),
      so don't judge it from the very first frame.
- [ ] Search for something with many matches (e.g. "wheelchair") — results
      are real, server-filtered, and paginate correctly (check the "X of Y
      support items" label matches what's shown).
- [ ] Filter by registration group, by support category, and both together —
      table narrows correctly each time.
- [ ] **Click to page 2** with no filter active — confirm the actual first
      row *changes* (don't just check the page number changed — compare row
      content, since a broken pagination can silently re-show page 1's data
      under a "page 2" label).
- [ ] Apply a narrow filter (few matching rows) while sitting on a page
      number beyond what the filtered result has — should land back on page
      1 with the real matching rows, not an empty table with a broken
      "21–2 of 2" style label (this was the bug fixed this engagement —
      confirm it stays fixed).
- [ ] "Add to my catalogue" on an equipment-type row (blank `pricingType`,
      e.g. a wheelchair/bed) — copies in as Product/Items, not
      Service/Hours.

---

## Custom Products

The only editable tab — `custom_product_service`, scoped by
user/tenant/business. Shared by both the Products & Services screen's
Custom tab and the Inventory screen (same store, different filter — see
Inventory section).

### Real contract — `lib/inventory.ts` (the API-facing half) + `lib/products.ts` (the dialog/validation half)

```ts
export type InventoryItem = {
  id: string; name: string; sku: string;
  type: ItemType;                 // derived from qty_type: "Items" -> Product, else -> Service (NOT a real column here, unlike General)
  quantityType: QuantityType | "";
  transactionType: ItemTransactionType;
  industry: string;
  costPrice: string; salePrice: string;
  purchaseTax: TaxRate; saleTax: TaxRate;
  assetCategory: "Inventory";
  incomeAccount: IncomeAccount;
  purchaseDescription: string; saleDescription: string;
  tracked: boolean;                // maps to inventory_flag (and is_inventory — see Inventory section)
  openingStock: string; lowStockAlert: string;
};
export type ItemDraft = Omit<InventoryItem, "id">;
```

`productIssues(draft): ProductIssue[]` (in `lib/products.ts`) — the Custom
dialog's own, deliberately **narrower** validator than Inventory's
`itemIssues`: name (≥2 chars), quantity type required, transaction type
required, cost/sale price format — no stock-related checks, since this
dialog has no field to fix a stock error with.

`emptyCustomItemDraft(industry)` — starts **untracked**
(`tracked:false`), unlike Inventory's own `emptyItemDraft()` which starts
tracked. Creating from the Custom dialog never turns stock tracking on by
default.

**Real API** (`lib/inventory.ts`, shared with Inventory):

| Function | Method | Route | Notes |
|---|---|---|---|
| `fetchInventoryItems()` | GET | `/custom-product?limit=500` | No `active_tab` — this is the plain Custom-tab/Inventory list, everything for this business regardless of tracked status. |
| `createInventoryItemApi(draft)` | POST | `/custom-product` | Backend rejects an exact duplicate (same user+tenant+business+industry+txn_type+item_name) with a 400. |
| `updateInventoryItemApi(id, draft)` | PATCH | `/custom-product/:id` | Toggling `tracked` on mid-edit records an opening-stock adjustment and creates a linked Asset; toggling off soft-deletes the linked Asset (blocked if that asset is already bank-reconciled). |
| `deleteInventoryItemApi(id)` | DELETE | `/custom-product/:id` | Soft delete (`is_deleted=1`). Backend blocks deletion if the item's been used on any invoice, or if its linked Asset is reconciled. |

### Manual QA checklist

- [ ] Open "Create custom product", type into **Name only** — confirm
      Quantity type / Transaction type do **not** show red errors until you
      actually interact with them (per-field touched state, not global).
- [ ] Try creating a product with the exact same name+industry+transaction
      type as an existing one — blocked with the duplicate-name message.
- [ ] Create an untracked item, then edit it to enable "Track inventory"
      with an opening stock figure — the item now shows up in Inventory too
      (see next section), with that opening stock recorded in its history.
- [ ] Delete a product currently used on an invoice — blocked, with a message
      naming the reason (not a generic failure).
- [ ] Bulk import a template-order CSV (see Bulk import section) — items
      land in Custom, correctly parsed.

---

## Bulk import

### Real contract — `lib/products.ts`

```ts
export const PRODUCT_IMPORT_FIELDS = [
  "Item name", "Type", "Quantity type", "Description",
  "Cost price", "Selling price", "GST", "Track inventory", "Inventory count",
] /* as {name, desc, required}[] — this exact order is also parseProductsCsv's fixed column order */;

export function productImportTemplateCsv(): string;      // the downloadable template — 2 sample rows, headers matching PRODUCT_IMPORT_FIELDS order
export function parseProductsCsv(text: string): ParsedProductRow[]; // FIXED column order 0..8 — see "Known issues" above
export function productRowIssues(row): string[];          // name required; type must be product/service; quantity type must be items/hours/days/km; cost/sale price format
export function draftFromImportRow(row, industry): ItemDraft;
```

Each valid row is submitted individually via `createInventoryItemApi`
**sequentially**, not batched — deliberately, so each row's duplicate-name
check runs against rows already saved earlier in the same batch, and one
bad/slow row doesn't sour the whole import. A dedicated `POST
/custom-product/bulk/create` backend endpoint exists but is **not** used by
this flow.

### Manual QA checklist

- [ ] Download the template, fill in a few rows unchanged, import — all
      rows succeed.
- [ ] Upload a file with an invalid quantity type / missing name — Review
      step shows it as "Skipped" with the specific reason, and it's excluded
      from the import count.
- [ ] **Known bug**: reorder your file's columns and use Map Data to
      reassign them correctly — data still lands in the wrong fields (see
      "Known issues" above). Don't report this as new; it's tracked.
- [ ] Import a row whose name+industry+transaction-type already exists —
      skipped with the duplicate reason, rest of the batch still imports.

---

## Inventory (stock tracking)

Same underlying `custom_product_service` rows as Custom, filtered to
`tracked === true` only (mirrors `is_inventory=1` server-side filtering in
sole-webapp's own Inventory list — this app does the filter client-side over
the same shared fetch).

### Real contract — `lib/inventory.ts`

```ts
export type StockStatus = "In stock" | "Low stock" | "Out of stock" | "Service";
export function stockStatus(item): StockStatus;
// !tracked || type==="Service" -> "Service"; stock<=0 -> "Out of stock";
// stock<=lowStockAlert -> "Low stock"; else "In stock"

export type StockAdjustReason = "opening" | "received" | "damaged" | "returned" | "correction" | "other";
export const ADJUST_REASONS = [...]; // excludes "opening" — that's system-set only, never a manual choice
```

**Real API**:

| Function | Method | Route | Notes |
|---|---|---|---|
| `adjustStockApi(id, quantityChange, reason, {unitCost?, note?})` | POST | `/custom-product/:id/adjust` | Signed delta (+in, -out). Backend blocks any adjustment that would take stock below zero. **WAC (Weighted Average Cost)** only recalculates when `quantityChange > 0` AND `unitCost` is provided: `newCost = (currentStock×currentCost + qty×unitCost) / newTotalStock`. Never touches a linked Asset's price (an asset's purchase value is fixed at acquisition). |
| `fetchInventoryHistory(id, {page, limit})` | GET | `/custom-product/:id/history` | Full adjustment ledger for one item, newest first. |

### Manual QA checklist

- [ ] Create a plain (untracked) Custom product — confirm it does **not**
      appear in Inventory.
- [ ] Enable tracking on an item with opening stock 20 — confirm it now
      shows in Inventory with stock 20, and history shows one "Opening
      stock" entry.
- [ ] Adjust stock: receive 5 units at a different unit cost than the
      current one — confirm the item's cost price updates to the correct
      weighted average (verified this engagement: 20 units @ $10 + 5 units
      @ $12 → $10.40, not a simple average of $11).
- [ ] Try to remove more stock than is on hand — blocked with a clear
      message stating current stock and the requested change.
- [ ] Check the item's history — every adjustment shows date, quantity,
      reason, note, and the resulting balance; the list is read-only (no
      edit/delete on a history row).
- [ ] Turn tracking **off** on an item whose linked Asset is already
      bank-reconciled — blocked, not silently allowed.

---

## Shared building blocks

Used across all three tabs — worth testing once, not three times:

```ts
export type Page<T> = { rows: T[]; page: number; pageCount: number; total: number; from: number; to: number };
export function paginate<T>(rows: T[], page: number, pageSize: number): Page<T>;
// Clamps `page` into [1, pageCount] automatically — this is WHY General/
// Custom never had the stale-page bug NDIS had: NDIS is server-paginated
// and has no equivalent clamp of its own (fixed separately, see above).

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type CatalogueStat = { label: string; value: string; hint?: string };
export function generalStats(entries): CatalogueStat[];
export function ndisStats(items): CatalogueStat[];
export function customStats(items): CatalogueStat[];
```

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`

| Constant | Resolves to |
|---|---|
| `apiRoutes.customProduct.list` | `BASE_URL + "/custom-product"` — same route for Custom (no params), General (`active_tab=general`), NDIS (`active_tab=ndis`) |
| `apiRoutes.customProduct.create` | `BASE_URL + "/custom-product"` (POST) |
| `apiRoutes.customProduct.update` | `` `${BASE_URL}/custom-product/${id}` `` (PATCH) |
| `apiRoutes.customProduct.delete` | `` `${BASE_URL}/custom-product/${id}` `` (DELETE) |
| `apiRoutes.customProduct.adjust(id)` | `` `${BASE_URL}/custom-product/${id}/adjust` `` |
| `apiRoutes.customProduct.history(id)` | `` `${BASE_URL}/custom-product/${id}/history` `` |
| `apiRoutes.customProduct.bulkCreate` | `BASE_URL + "/custom-product/bulk/create"` — exists, unused by this app's bulk-import UI |
| `apiRoutes.customProduct.stats` | `BASE_URL + "/custom-product/stats"` |
| `apiRoutes.industry.list` | `BASE_URL + "/industry"` |

---

## Writing a new test in this codebase

No existing test file to point to for `lib/products.ts`/`lib/general-
catalogue.ts`/`lib/ndis-support-items.ts` — the first one written here sets
the precedent. Follow **Template A** from `docs/testing-coverage.md`
("a `lib/*.ts` module that calls the real API") verbatim — the
mock-`axios`/dynamic-import convention is identical. A few things specific
to this module worth getting right in that first test file:

- **General and NDIS both need a mocked `Businesses`/`Industries` response
  shape on the backend side if you're testing the service layer directly**
  (not just the frontend `lib/*.ts` functions) — the industry-scoping fix
  this engagement depends on `req.businessId` resolving to a real
  `Businesses.industry_id`, not `user_id` alone.
- **NDIS's two query functions need separate test coverage** —
  `fetchNdisSupportItems` (fetch-all, used for options/count) and
  `fetchNdisSupportItemsPage` (the real paginated one) hit the same route
  with different params and serve very different purposes; a test asserting
  one covers the other would miss the exact bug this engagement found and
  fixed (stale page + a filter change).
- **`quantityTypeFromPricingType`** is a pure function with exactly three
  meaningful inputs to test: `"Price Limited Supports"` → Hours, any other
  non-empty string → Items, and `""` → Items (the "no signal, don't assume
  hourly" case) — all three are worth a test case, since the middle one is
  easy to conflate with the third.

## Notes for future changes

- Before touching `business-switcher.tsx`, `businesses-screen.tsx`, or
  `logout-dialog.tsx` for the query-cache-clear fix noted above as
  "reverted, status uncertain" — check `git log`/`git blame` first, per the
  same advice `docs/testing-coverage.md` already gives for the
  SolePay/payment gateway files: this branch has a history of local fixes
  being overwritten by merges from teammates touching the same files.
- If `services_all` prices ever get real data seeded (see the General
  catalogue section's "Known data gap"), the "Typical price" column and
  `generalStats`' average-price figure should be re-verified — both were
  built/tested against an all-zero dataset and may behave differently once
  real numbers are present.
