# Testing: Reporting Suite

Reference for test coverage across the eleven reports under **Reporting
suite**: Profit & Loss, Balance Sheet, Cash Flows, Trial Balance, Transaction
Listing, BAS Report, Asset Listing, Customer/Supplier Report, Chart of
Accounts, Audit Trail, and Depreciation Reports. Same convention as
`docs/testing-coverage.md`: each section is marked either **added by this
engagement** (the file didn't exist before) or **pre-existing** (already on
this branch — described here for completeness, not claimed as new work).

This doc exists for two audiences at once: a tester deciding what to click
and check by hand, and an engineer deciding what a new test needs to assert.
Wherever a report's real behaviour is easy to guess wrong — a control that
looks live but does nothing, a response shape that differs from its closest
sibling, an endpoint that lies about its own page count — it's called out
explicitly under **Backend quirks worth checking by hand**, because these are
exactly the things an automated test can pin down but a quick glance at the
screen won't reveal.

**Scope note**: this doc covers the Reporting suite only. For every other
module (Matching Rules, Payments, Expenses, Super Contributions,
Multi-Business, SolePay onboarding), see `docs/testing-coverage.md` — that
doc's "Writing a new test in this codebase" and "What this repo doesn't have"
sections apply here unchanged and aren't repeated below.

All files are Vitest unit tests — no browser, no rendering, the same
mocked-`axios` convention already used across `lib/*.test.ts` in this repo.
There is **no dedicated component/screen test** for any report — this repo
has no React-rendering test setup at all (see the main doc); every report
screen is a thin, mostly-presentational wrapper around the `lib/*.ts` file
that owns its real logic, which is what's actually under test here.

## Running them

```bash
npx vitest run                                              # everything in the repo
npx vitest run lib/report-table.test.ts                     # the shared tabular-report engine
npx vitest run lib/bas-report.test.ts lib/balance-sheet.test.ts lib/trial-balance.test.ts
```

Current as of this doc: **1200 tests pass repo-wide**. The table below is
just the reporting-suite slice of that.

| Report | Test file | New this engagement | Pre-existing |
|---|---|---|---|
| Profit & Loss | `lib/reports.test.ts` (8 tests) | — | ✓ |
| Transaction Listing | `lib/transaction-listing.test.ts` (9 tests) | — | ✓ |
| BAS Report | `lib/bas-report.test.ts` (11 tests) | ✓ | — |
| Balance Sheet | `lib/balance-sheet.test.ts` (7 tests) | ✓ | — |
| Trial Balance | `lib/trial-balance.test.ts` (5 tests) | ✓ | — |
| Asset Listing, Customer/Supplier, Chart of Accounts, Audit Trail, Cash Flows | `lib/report-table.test.ts` (39 tests, shared engine) | ✓ | — |
| Depreciation Reports | `lib/asset-depreciation-report.test.ts` (6 tests) | — | ✓ (screen wiring fixed this engagement, see below) |

62 of the 85 reporting-suite tests above are new this engagement, across four
files; 23 (P&L, Transaction Listing, Depreciation) were already on the branch.

---

## The shared tabular-report engine

Five of the eleven reports — **Asset Listing, Customer/Supplier, Chart of
Accounts, Audit Trail, Cash Flows** — are the same thing wearing different
columns: a paginated grid of rows for a period, with a download and a send.
Rather than five near-identical screens, there's one engine
(`lib/report-table.ts`) and five configs (`lib/report-configs.ts`), covered
together by `lib/report-table.test.ts` (39 tests). This section documents the
engine once; each report's own sub-section below covers only what's specific
to it.

### Real contract — `lib/report-table.ts`

**Types** (verbatim, the shape every fixture is built from):

```ts
export type ReportCellFormat = "text" | "money" | "number" | "date" | "badge";
export type BadgeTone = "success" | "warning" | "secondary" | "outline";

export type ReportColumnSpec = {
  /** The backend's own key, exactly — "Account Code", not "account_code". */
  key: string;
  label?: string;
  format?: ReportCellFormat;
  align?: "left" | "right" | "center";
  emphasis?: boolean;
  secondary?: boolean;           // hidden below `sm`
  sortKey?: string;               // server-side sort key this column offers, if any
  tone?: (value: string) => BadgeTone;   // colours a `badge` cell by its value
  groupRuns?: boolean;            // repeats of this column's value are blanked (Chart of Accounts' Section)
};

export type ReportRow = { id: string; cells: Record<string, string | null> };
export type ReportSummaryFigure = { label: string; amount: number };   // Cash Flow's inflow/outflow/net

export type TabularReport = {
  rows: ReportRow[];
  total: number;
  pageCount: number;
  rangeLabel: string;
  range: { from: string; to: string };
  summary?: ReportSummaryFigure[];   // only Cash Flow's endpoint sends one
};

export type ReportSource = (args: {
  span: Span; page: number; pageSize: number; extra: Record<string, string>;
}) => Promise<{ rows: ReportRow[]; total: number; pageCount: number; summary?: ReportSummaryFigure[] }>;

export type TabularReportConfig = {
  id: string; title: string; description: string; tip: string;
  columns: ReportColumnSpec[];
  periods: readonly ReportPeriod[];
  source: ReportSource;
  itemLabel: string;
  reportTypeId?: string;   // drives download/send; absent → neither is offered (Audit Trail)
  dated?: boolean;         // false → no period control at all (Chart of Accounts, Audit Trail)
};
```

**Pure functions** (signature + the exact rule):

- `parseReportMoney(value): number` — reads the backend's `"$1,234.56"` (or a bare number); `0` for anything unreadable.
- `parseReportDate(value): string` — `"31/03/2026"` → ISO `"2026-03-31"`; also takes the audit log's `"31/03/2026 at 03:45 PM"` (date half only); `""` for anything else.
- `isBlankCell(value): boolean` — `true` for `null`, `""`, **and the literal string `"NULL"`** (the generic branch's own way of writing a missing value) — a naive `value == null` check would miss that third case.
- `formatReportCell(value, spec): string` — `"—"` for a blank cell; otherwise formats by `spec.format`.
- `cellAlignment(spec): "left"|"right"|"center"` — right for `money`/`number`, left otherwise, unless `spec.align` overrides it.
- `isGroupedRepeat(rows, index, column): boolean` — `false` for row 0 or a column without `groupRuns`; otherwise `true` when this row's value for that column equals the row above's. **Not** the same as blanking the value and formatting it — see the Chart of Accounts section below for why that distinction is a real, previously-shipped bug.
- `pageCountOf(reported, total, pageSize): number` — derives `Math.ceil(total/pageSize)` and only trusts the backend's own `total_pages` when it's **not smaller** than that. See the Audit Trail section for the real backend bug this exists to route around.
- `rowFromCells(cells): Record<string,string|null>` — turns the backend's `{key,value}[]` row shape into a plain object keyed by the backend's own column names.

**`reportEndpointSource(reportTypeId): ReportSource`** — the source behind Asset Listing, Customer/Supplier, Chart of Accounts, Cash Flow (everything except Audit Trail): `POST /report`, plain multipart `FormData` (never the encrypted-body helper — `handleReports` reads `req.body` directly behind `upload.none()`), fields `report_type_id` (**string** — the backend's switch is a strict `===` against string constants, so a numeric `report_type_id` 400s), `action=view`, `start_date`/`end_date`, `page`/`page_size`, plus whatever's in `extra` (a section filter, a `recordType`, a sort key). Reads `body.summary` into `TabularReport.summary` when present.

**`auditTrailSource: ReportSource`** — the one exception: `POST /v2/settings/audit-logs`, **encrypted body** (`buildEncryptedRequestBody`) — this endpoint genuinely is decrypt-aware (`req.body?.data ? decryptPayload(...)` in `controllers/projectSettings.js`), unlike every `/report` call. Takes only `page`/`page_size` — no dates.

**Real API calls**:

| Function | Method | Route | Body | Notes |
|---|---|---|---|---|
| `reportEndpointSource(id)` | POST | `apiRoutes.reporting.reports` → `/report` | multipart, plain | Shared by 4 of the 5 configs below. |
| `auditTrailSource` | POST | `apiRoutes.settings.auditLogs` → `/v2/settings/audit-logs` | encrypted JSON | Audit Trail only. |
| `downloadTabularReport(reportTypeId, range, format, title, extra?)` | POST | `apiRoutes.reporting.reports` | multipart, `action=download` | `format` ∈ `"pdf"\|"csv"\|"xlsx"`; omitting it (never done by any screen's UI) defaults to xlsx server-side. Response is a blob, saved via `Content-Disposition`'s filename if the header carries one. |
| `fetchAccountDetail(subcategoryId)` | GET | `apiRoutes.reporting.account` → `/report/account/{id}` | — | Chart of Accounts' drill-down only; see its section below. |

### Backend quirks worth checking by hand — shared engine

- **`report_type_id` must be a string.** `sole-ocr`'s switch compares with `===` against literal string constants (`'3'`, `'9'`, `'10'`, `'11'`). Every call in this app sends it as a `FormData` field, which arrives at the server as a string already — this is safe today, but a regression test (or a tester poking the network tab) should confirm it's never sent as a JSON number, which would silently 400 "Invalid Report Type".
- **Download/Send is exactly PDF + CSV, never Excel**, on every report in the suite, even though the server defaults to `.xlsx` when no `format` is sent. Worth a tester's eye specifically because this was inconsistent mid-build (BAS briefly had a third "Download Excel" item) before being corrected for parity with the two pre-existing reports (P&L, Transaction Listing).

---

## Asset Listing

`report_type_id: '3'` (`assetListingConfig` in `lib/report-configs.ts`).

**Columns** (exact backend keys, from `getAssetsLog`): `Asset Number`, `Asset Name`, `Date of Purchase`, `Asset Value (excl. GST)`, `GST Value`, `Asset Total Value (incl. GST)`, `Matched` (badge: `"Yes"` → success, else warning).

### Backend quirks worth checking by hand

- **`sole-webapp`'s own Asset Listing is broken.** Its `getReportTypeId()` has `case "asset": return 3`, but the route/reportType string is actually `"assets"` (plural) — so the reference app sends no `report_type_id` at all and the backend 400s "Invalid Report Type". A tester comparing this app against `sole-webapp` side by side will see the *reference* app fail here, not this one — this app always sends `'3'` correctly.
- No totals row, no aggregate anywhere — matches the reference app; don't expect a "total asset value" footer.

---

## Customer / Supplier Report

`report_type_id: '9'`, five tabs (`customerSupplierConfig(tab)`), each a **separate config** with its own columns, sharing one `recordType`-filtered source.

**Tab → `recordType`**: Contacts→`Client`, Invoices→`Invoice`, Quotes→`Quote`, Expenses→`Expense`, Assets→`Asset` (`RECORD_TYPE_OF`).

**Columns per tab** cover every field the backend's `sectionHeaders` sends for that section (all 6–8 columns each, including `Contact Address`, `Contact Website`, and every `Description` field) — the full set, not a trimmed subset, since the report's whole point is the export someone hands to an accountant.

### Backend quirks worth checking by hand

- **A section with zero real rows still returns one row** — `getClientReport` answers an empty section with a single `{key,value}[]` row built from `buildHeaderRow(recordType)`: every column present, every value `""`. `isHeaderOnlyRow()` filters this out client-side. **Manual check**: open a tab for a business with genuinely nothing in it (e.g. Quotes on a business that's never sent one) and confirm the real empty state shows, not a single all-blank row claiming "1 result".
- **Omitting `recordType` returns an unpaginated 5-way UNION of everything.** Confirmed directly against `getClientReport`: the `LIMIT`/`OFFSET` only applies when `action==='view' AND recordType` is set; without it, the query is a `UNION ALL` across Client/Invoice/Quote/Expense/Asset with no limit at all, while `pagination.total_pages` is still computed as if it were paginated. This app's `customerSupplierConfig` always sends the active tab's `recordType` — a regression here (someone removing it "to simplify") would silently return every record across all five tables on one page while the pager keeps claiming there's more.

---

## Chart of Accounts

`report_type_id: '10'`, `dated: false` (see why below).

**Columns**: `Section` (`groupRuns: true`), `Account Code`, `Account Name` (emphasis), `GST Treatment` (badge, toned by `gstTreatmentTone`), `Transactions`. `Category`/`Category Id`/`Subcategory Id` come back from the backend but aren't shown as columns — `Subcategory Id` drives the drill-down instead.

**Server-side controls** (sent via `extra`, not query params on the URL): `section` (one of `Assets/Liabilities/Equity/Income/Cost of Sales/Expenses`, omitted for "All accounts"), `sort_by` (`code`/`name`/`section` — the exact three-value whitelist `getChartsAccountData` accepts; anything else silently falls back to `code`), `sort_dir` (`asc`/`desc`).

**Drill-down** — clicking a row opens `AccountDetailPanel`, `GET /report/account/{Subcategory Id}`, showing the account's derived GST treatment (never a per-account setting — Sole records GST per transaction, not per account) and its activity (transaction count, net amount, first/last posted).

### Backend quirks worth checking by hand

- **Dates are accepted and silently ignored.** `getChartsAccountData` takes `start_date`/`end_date` for signature parity with every other report but never uses them in its query — the whole ledger is counted regardless. This is why the screen has **no period control at all** rather than one that quietly does nothing; a tester should not expect a date filter here.
- **Sorting by Code or Name still groups by Section first**, confirmed directly in the SQL's `ORDER BY` — `sole-ocr` deliberately orders by section, then the chosen column, even when `sort_by=name`. **Manual check**: sort by Account Name and confirm accounts are still grouped under their Section headings (Assets, then Liabilities, …), sub-sorted alphabetically within each group — never one flat alphabetical list spanning sections.
- **The "same Section as above" blank must render as nothing, not a dash.** A shipped bug (fixed this engagement, now covered by `isGroupedRepeat`'s tests): naively blanking a repeated cell's *value* to `""` and running it through the same formatter as every other cell drew an em dash (`"—"`, the formatter's own symbol for "genuinely missing") on every row after a section's first — reading as the data having disappeared rather than "same as above". **Manual check**: scroll a section with more than one account and confirm the repeated rows show a truly empty Section cell, never a dash.
- **The GST Treatment badge is derived, never stored** — `"No transactions"` / `"GST"` / `"GST Free / Excluded"` / `` `Mixed (NN% GST)` `` all come from counting *posted* journal lines against the account, recomputed on every request. There is no "set this account's default GST treatment" setting anywhere to find.

---

## Audit Trail

**Not part of `sole-ocr`'s `reportTypes` at all** — no `report_type_id`, no case in `handleReports`'s switch, no download/send support. It's a separate feature on a separate endpoint (`POST /v2/settings/audit-logs`) that this app's config wires into the same shared table engine for visual consistency, not because it's structurally a report of the same kind.

**Columns**: `Date` (kept as the backend's own `"29/09/2026 at 03:41 PM"` string — the time is the point of an audit entry, so it's never reformatted down to a bare date), `Performed by`, `Module` (badge), `Action performed` (emphasis — this is the backend's `description` field), `Event` (secondary — the backend's raw `action`/event-name field, added *beside* description rather than in place of it, since `sole-webapp`'s own screen headed a column "Action Performed" but rendered `description` into it, silently dropping the real event name).

### Backend quirks worth checking by hand

- **`total_pages` is computed with `Math.floor`, not `Math.ceil`.** `services/auditLog.js`: `Math.floor(count/pageSize)` — 25 rows at 20/page reports "1 page" when page 2 genuinely exists and is reachable by the pager's own next-page math, just not by the count the server claims. `pageCountOf` derives the real count client-side instead of trusting the server's. **Manual check**: on a business with 21–39 logged events at the default page size, confirm page 2 is reachable.
- **No period control, no download, no send** — the endpoint offers none of the three, so none render. Don't file a bug for their absence here; it would be the bug if they *did* appear and did nothing.
- **This is the one endpoint in the entire suite that's decrypt-aware.** Every `/report` call is plain multipart; this one is `buildEncryptedRequestBody`. Worth knowing if you're inspecting network traffic and wondering why this request looks different from the other nine.

---

## Cash Flows

`report_type_id: '11'` (`cashFlowConfig`).

**Columns**: `Date`, `Transaction Type` (secondary), `Account Code` (secondary), `Account Name` (emphasis), `Cash Flow Type` (badge — `Inflow`→success, `Outflow`→outline, `Non-Cash`→secondary), `Debit`, `Credit`, `Net Movement`.

**Summary cards** — the one report in the shared engine with `summary` figures: `Total Cash Inflows`, `Total Cash Outflows`, `Net Cash Movement`, read from the backend's `[{Label, Amount}]` array (present only for this report) and rendered through the same `ReportStatCard` every other report's headline uses.

### Backend quirks worth checking by hand

- **This is liquidity, not profit.** Rows come only from lines that hit a cash-equivalent asset account (`account_category_id = 6`, name matching `%Bank%`/`%Cash%`/`%Clearing%`) — an invoice raised on credit doesn't appear here until it's actually banked. **Manual check**: an invoice sent but unpaid should show nothing on Cash Flow for that period even though it appears on the P&L; that's the report working correctly, not a discrepancy to chase.
- Summary totals are computed over the **whole period in SQL**, not just the page on screen — paging through the transaction list must never change the three summary cards above it.

---

## BAS Report

`lib/bas-report.ts` + `lib/bas-report.test.ts` (11 tests) — new this engagement, its own file rather than the shared engine, because its endpoint and response shape are genuinely different from every other report.

**Endpoint**: `POST /report/gst-extract` — **not** `/report`, and takes no `report_type_id` at all (GST's id, `'7'`, is commented out of `sole-ocr`'s `reportTypes` constant). Same plain-multipart, non-decrypt-aware pattern as the rest.

**Shape**: `data.quarters[]` (the GST worksheet per BAS quarter the chosen range touches — G1/G3/G6/G9 for sales, G10/G11/G14/G20 for purchases, G9/G20 relabelled 1A/1B) + `data.transactions` (a paginated `{key,value}[]` listing of the rows behind those figures).

### Backend quirks worth checking by hand

- **No "This month" period, ever.** The backend always widens a requested range to whichever whole BAS quarters it touches — a month preset would show a full quarter's figures mislabelled as one month's, so the period list simply doesn't offer one.
- **No W1/W2 (PAYG) figures** — the endpoint has none, so none are shown; don't expect them.
- **The net figure is unsigned with a word, not a signed number** — `"$700.00 (Refund)"` / `"$700.00 (Payable)"`, parsed via a `/refund/i` match against the literal word, never derived by re-subtracting G9−G20 for a single quarter (the single-quarter view trusts the backend's own net figure directly; only the "All quarters" combined view re-derives a signed total by summing each quarter's own signed net).
- **Sends through a different Send-dialog endpoint than every other report** (`/report/gst-extract` rather than `/report`) — worth a specific network-tab check if you're verifying the Send flow generically across reports.

---

## Balance Sheet

`lib/balance-sheet.ts` + `lib/balance-sheet.test.ts` (7 tests) — new this engagement. `report_type_id: '2'`.

**Stated as at a date, not a range.** `getBalanceSheet` accepts `start_date` for call-signature parity with every other report but never reads it — every balance is computed `entry_date <= end_date`. The screen's only input is which financial year's end to report "as at" (the same FY list `recentFinancialYears` already offers Depreciation Reports), not a date-range picker.

**Shape**: `columns: ['Account Name', ...financialYears]`, `sections: [{section, rows, total}]` — the identical `{section, rows, total}` shape P&L's own ladder reads, just with a financial year per column instead of a month. Rendered by the shared `LadderTable` component (also used by Trial Balance).

**Balance check** — `validation: {isBalanced, rows: [{financial_year, assets, liabilities, equity, difference}]}`, a real "Assets = Liabilities + Equity" check computed server-side per financial year. `sole-webapp`'s own screen never renders this even though it's already computed; this app surfaces it as a banner (`BalanceCheckBanner`).

### Backend quirks worth checking by hand — the most important one in this doc

- **A brand-new business (or any FY with nothing posted) answers with `success: false`, not `success: true` and empty data.** Confirmed directly against `controllers/reports.js`: the `balance_sheet` branch specifically returns `{success: false, message: 'No data available for this report', columns: [], sections: []}` (still HTTP 200) when nothing's been posted — the **only** report in the entire suite that signals "empty" this way; every other report, including Trial Balance (its closest sibling), answers the identical situation with `success: true`. `fetchBalanceSheet` special-cases exactly this response shape (empty `columns` **and** empty `sections`, both present as real arrays — a genuine server error has neither field at all, which is how the two are told apart) and treats it as an empty report rather than throwing. **Manual check**: open Balance Sheet on a fresh test business with zero transactions and confirm it shows "No accounts to show", never an error toast — this is the single highest-value manual check in the whole reporting suite, because the failure mode (a false error on a perfectly normal new-business state) is exactly the kind of thing a scripted smoke test would miss if it only ever runs against a business with real data.

---

## Trial Balance

`lib/trial-balance.ts` + `lib/trial-balance.test.ts` (5 tests) — new this engagement. `report_type_id: '8'`.

Point-in-time like Balance Sheet, and for the identical reason: `getTrialBalanceReport` takes a single `asOfDate` and filters `entry_date <= asOfDate`. Uses the same "as at" financial-year picker as Balance Sheet.

**Columns**: always exactly `Account Code, Account Name, Total Debit, Total Credit` — never a variable list of periods (this is Trial Balance's real structural difference from Balance Sheet/P&L, both of which have a dynamic column-per-period shape).

**Balance check** — `validation: {total_debit, total_credit, difference, balanced}` (a *global* debits-equal-credits check, not per-section like Balance Sheet's per-year check) — `sole-webapp` does render this one, so it's kept here too.

### Backend quirks worth checking by hand

- **`sole-webapp`'s own Trial Balance screen shows a full date-range picker that does nothing** — confirmed directly: the controller discards `start_date` for this report exactly as it does for Balance Sheet (same `entry_date <= asOfDate` point-in-time filter), and the print header already special-cases this report to read "As at …" rather than a range, confirming the intent. This app deliberately does **not** replicate that misleading control — it shows the same single "as at" picker Balance Sheet uses. **A tester comparing screens side by side against `sole-webapp` will see two different controls here on purpose** — this app's version is the corrected one, not a regression.
- **The section total is a row, not a separate object.** `getTrialBalanceReport`'s response has no `section.total` field at all — the total is the *last row* of `section.rows`, flagged `isTotal: true`. `lib/trial-balance.ts`'s `toBlock()` pulls that row back out into the same `LadderBlock.summary` shape Balance Sheet uses, so the two render identically on screen — but a tester diffing the two reports' raw JSON responses will see genuinely different shapes for what looks like the same kind of total row.
- **Account codes render inline, not as a separate column** — Chart of Accounts gives a code its own column; Trial Balance shows it as a small `font-mono` prefix inside the Account Name cell instead, because adding a third sticky column to the shared ladder table (on top of Section and Account Name) would need its own pinned offset and a rule for every total row to skip it, for a value only this one ladder report carries.

---

## Profit & Loss (pre-existing)

`lib/reports.test.ts` (8 tests). Not built this engagement — described here for completeness and as the reference shape both Balance Sheet's and Trial Balance's ladders were built to match.

Covers: `fetchPlReport`'s two-call pattern (once for the selected period, once for `periodShape`'s own `previous` span, since the backend has no "previous period" concept of its own), parsing `$`-formatted figures into the ladder, that a result block (e.g. Gross Profit) keeps its `rows` empty because `ProfitLossTable` merges a result's Section and Account name cells on that assumption, error surfacing, a genuinely empty report reporting every headline figure as zero rather than throwing, `plSplit` (the P&L bar's segment maths), and `plDelta` (favourable/unfavourable colouring).

---

## Transaction Listing (pre-existing)

`lib/transaction-listing.test.ts` (9 tests). Not built this engagement.

Covers `fetchTransactionListing`, `listingDate`, `transactionCount` — the category-grouped ledger with real per-category subtotals, `report_type_id: '4'`.

**Worth knowing when comparing against Chart of Accounts' Section grouping**: Transaction Listing's category grouping is a fundamentally richer pattern — a real collapsible header row (shaded, chevron, category badge, transaction count) followed by a genuine per-category subtotal row, because it's grouping real transactions that have a meaningful sum. Chart of Accounts' Section column, by contrast, just blanks a repeated value (see its section above) — it groups accounts, which have nothing to subtotal. These were deliberately built differently; making them look the same would either fabricate a Chart-of-Accounts subtotal the backend never computes, or throw away Transaction Listing's real one.

---

## Depreciation Reports (pre-existing lib, screen fixed this engagement)

`lib/asset-depreciation-report.test.ts` (6 tests) — the data layer (`fetchDepreciationReport`, `recentFinancialYears`, `depreciationReportCsv`) was already real-API-backed and tested before this engagement; only its **screen** (`components/assets/depreciation-report-screen.tsx`) needed fixing, and wasn't previously reachable from the Reporting suite nav at all.

### What changed on the screen (not covered by an automated test — this repo has no rendering tests; verify these by hand)

- **Loading state was a spinner** (`Loader2` + `animate-spin`); now a `Shimmer` skeleton matching the rest of the suite's loading convention.
- **Empty state was a plain `<div>`** with bare text; now the shared `Empty`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription` shell every other report uses.
- **There was no error state at all.** The query's `isError`/`error` were never read — a failed fetch fell through to the exact same UI as "no depreciating assets this year", meaning a real network failure was indistinguishable from a perfectly normal empty result. **Manual check**: simulate a failed request (throttle/offline, or a 500 from the endpoint) and confirm a genuine error banner with a "Try again" button appears — not the empty-state copy.
- Now linked into the Reporting suite nav (`/assets/depreciation-report`) — previously built but unreachable from that menu.

---

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`.

| Constant | Resolves to | Used by |
|---|---|---|
| `apiRoutes.reporting.reports` | `BASE_URL + "/report"` | P&L, Balance Sheet, Trial Balance, Transaction Listing, Asset Listing, Customer/Supplier, Chart of Accounts, Cash Flows — everything except BAS and Audit Trail |
| `apiRoutes.reporting.gst` | `BASE_URL + "/report/gst-extract"` | BAS Report — view, download, send, all three |
| `apiRoutes.reporting.account` | `BASE_URL + "/report/account"` (id appended) | Chart of Accounts' drill-down panel |
| `apiRoutes.settings.auditLogs` | `BASE_URL + "/v2/settings/audit-logs"` | Audit Trail — the one report not on the `/report` family at all |

`report_type_id` per report (all strings, per the shared-engine note above): P&L `'1'` · Balance Sheet `'2'` · Asset Listing `'3'` · Transaction Listing `'4'` · Trial Balance `'8'` · Customer/Supplier `'9'` · Chart of Accounts `'10'` · Cash Flows `'11'` · BAS Report — none (own endpoint) · Audit Trail — none (not a report type at all).
