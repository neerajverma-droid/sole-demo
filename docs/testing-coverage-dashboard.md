# Testing: Dashboard

Reference for test coverage on the **Dashboard** module: `/dashboard` and its
"View all" sub-page, `/dashboard/geographic-insights`. Same convention as
`docs/testing-coverage.md` and `docs/testing-coverage-reporting-suite.md`:
this doc exists for two audiences at once — a tester deciding what to click
and check by hand, and an engineer deciding what a new test needs to assert.
Every "Backend quirk" below was confirmed by reading the actual `sole-ocr`
controller/service code directly (and, for two of them, by running the exact
query against the real dev database) — not inferred from the frontend's
behaviour.

**Scope note**: this doc covers the Dashboard module only. For every other
module see `docs/testing-coverage.md` (Matching Rules, Payments, Expenses,
Super Contributions, Multi-Business, SolePay onboarding) or
`docs/testing-coverage-reporting-suite.md` (the eleven reports) — both docs'
"Writing a new test in this codebase" and "What this repo doesn't have"
sections apply here unchanged and aren't repeated below.

## Test status — read this before trusting a green checkmark anywhere else

**There are no dedicated Vitest files for this module yet** —
`lib/dashboard.ts`, `lib/bank-connection.ts`, `lib/goal-tracker.ts`, and the
dashboard-only additions to `lib/contacts-api.ts` (`fetchAllContacts`) have
zero automated coverage as of this doc. `npx vitest run` passing (967 tests)
says nothing about this module — none of those tests touch it. Everything
below is the **real, verified contract** these functions should be tested
against, written so that adding `lib/dashboard.test.ts` following Template A
in `docs/testing-coverage.md` is a transcription job, not a research one. Until
that file exists, the "Manual check" callouts under each card are the only
coverage this module actually has.

Four of the cards (Business Snapshot, Revenue Goal's progress figures,
Invoice Summary, Attention Card) have **no dashboard-specific backend calls
at all** — they read `useInvoicesStore`/`useExpensesStore`/`useAssetsStore`/
`useQuotesStore`, which are covered by their own modules' existing tests
(`lib/invoices.test.ts` etc.) — nothing new to write for those four beyond
what's below under "Store-derived cards".

| Card | Backing lib | Endpoint(s) | Test status |
|---|---|---|---|
| Cash on hand (hero) | `lib/dashboard.ts` → `fetchDashboardBalance` | `GET /dashboard/balance` | none |
| Connected accounts | `lib/dashboard.ts` → `fetchDashboardBankAccounts` | `GET /dashboard/bank/accounts/balance` | none |
| Cash flow chart | `lib/dashboard.ts` → `fetchDashboardCashFlow`, `lib/cash-flow.ts` | `GET /dashboard/income/expense` | none |
| Money position (owed to me / owed by me / net) | `lib/dashboard.ts` (GST + balance) + invoice/expense/account stores | `GET /dashboard/gst/summary` + above | none |
| Top income / Top expenses | `lib/dashboard.ts` → `fetchDashboardTopIncomes`/`fetchDashboardTopExpenses` | `GET /dashboard/top/incomes`, `GET /dashboard/top/expenses` | none |
| Revenue goal (target only) | `lib/goal-tracker.ts` | `GET`/`POST /goal/tracker` | none |
| Bank connect flow | `lib/bank-connection.ts` | `GET /bank/connect` | none |
| Where your customers are / Geographic Insights | `lib/contacts-api.ts` → `fetchAllContacts` | `GET /client/v2` | none (shares a file with the tested `fetchContactsPage`, but this function itself isn't) |
| Business Snapshot, Invoice Summary, Attention Card, Revenue Goal's progress stats | invoice/expense/asset/quote stores only | — | covered by those modules' own tests |

---

## Cash on hand (hero card)

### Real contract — `fetchDashboardBalance` in `lib/dashboard.ts`

`GET apiRoutes.dashboard.balance` → `/dashboard/balance`, no query params sent
by this app (the backend defaults to "every month up to now" when none are
given — see quirk below).

**Response** (verbatim, from `sole-ocr/src/controllers/dashboard.js`'s
`balanceController` + `services/dashboard.js`'s `getCurrentBalance`):
```ts
{ success: true, data: { current_balance: number, total: Array<{ year: number; month: number; net_flow: number; current_balance: number }> } }
```
`total` is a **cumulative running balance per calendar month**, oldest
first, up to and including the target month — not a delta series. Mapped to
`{ month: "Jan"|…, balance: number }[]`; the component (`balance-hero.tsx`)
takes the last 6 entries for the chart.

### Backend quirks worth checking by hand

- **This endpoint is genuinely safe** — `getCurrentBalance`'s query filters
  on `t.tenant_id`/`t.business_id` (the `transactions` table), and both
  columns really exist there (`SHOW COLUMNS FROM transactions` confirmed
  this directly against the dev DB). Contrast with Connected accounts below,
  whose near-identical-looking sibling function was not safe.
- Without `start_date`/`end_date`, `balanceController` defaults to the
  **current calendar month** as the target, not the current financial year
  — but `total` still comes back with the *entire* history up to that
  point, so the hero's "last 6 months" slice is unaffected either way.

---

## Connected accounts

### Real contract — `fetchDashboardBankAccounts` in `lib/dashboard.ts`

`GET apiRoutes.dashboard.bankAccountsBalance` → `/dashboard/bank/accounts/balance`.

**Response**: `{ success: true, data: { accounts: Array<{ id, bank_name, account_name, balance }>, total_balance: number } }`, from
`getBankAccountsBalance` in `sole-ocr/src/services/dashboard.js`. Mapped to
`ConnectedAccount[]` (`stores/accounts.ts`'s shape) via a loose, case-
insensitive substring match against `lib/banks.ts`'s `BANKS` list for the
row's logo (`bankIdFor`) — a bank name that doesn't match anything in that
list (or matches ambiguously, e.g. a short name like "Up" against an
unrelated longer one) falls back to a generic icon; this is cosmetic only,
never a data-correctness issue.

### Backend quirks worth checking by hand — the most important ones in this doc

- **This endpoint threw a 500 on every single call until this engagement.**
  `getBankAccountsBalance`'s query filtered on `bc.tenant_id`/`bc.business_id`
  (`bank_connections` table) — confirmed via `SHOW COLUMNS FROM
  bank_connections` against the dev DB that **neither column exists on that
  table at all** (it's scoped by `user_id` only). Every call threw `Unknown
  column 'bc.business_id' in 'field list'`. Fixed by dropping both filter
  clauses; `bank_accounts`/`bank_connections` have no equivalent column to
  filter on regardless of what the frontend sends.
- **Confirmed this bug is unrelated to request params.** `requireContext`
  middleware (`sole-ocr/src/routes/dashboard.js:20-29`) 400s the request
  before the controller ever runs if `tenantId`/`businessId` aren't already
  resolved from the auth token — so by the time the buggy query ran, both
  were always present, regardless of what query string the caller sent. A
  fix on the frontend side was never possible; this had to be a backend
  change.
- **Why this was never caught before**: `sole-webapp` (production) never
  calls this route at all — confirmed by an exhaustive grep of that repo for
  `bank/accounts/balance`/`bankAccountsBalance`, zero matches. Production's
  own bank-accounts list uses a *different* route (`GET /bank/accounts`, a
  live proxy to the Fiskil microservice — see the Bank connect section
  below), so this backend function sat unreachable and untested until this
  engagement started calling it.
- **Manual check**: an account with real `bank_connections` rows but every
  linked `bank_accounts` row soft-deleted (`deleted_at` set) should show the
  empty state, not an error — confirmed directly against the dev DB for a
  real test account (20 connections, 3 accounts, all 3 deleted) that this is
  a legitimate empty result, not a bug.
- `bank_name`/`account_name` can be blank server-side; the mapper falls back
  to `"Bank account"` and `""` respectively rather than showing `undefined`.

---

## Cash flow chart

### Real contract — `fetchDashboardCashFlow` in `lib/dashboard.ts`

`GET apiRoutes.dashboard.incomeExpense` → `/dashboard/income/expense`,
`{ period: "year", start, end }` where `start`/`end` are always an explicit
24-calendar-month window ending this month (`CASH_FLOW_MONTHS = 24`) — wide
enough that every in-card comparison mode (up to a full year back) always
has real history behind it, independent of the card's own period selector.

**Response**: `{ success: true, data: Array<{ month: "YYYY-MM-01", income: number, expense: number, net_profit?: number, forecast?: boolean }> }`.
Rows with `forecast: true` are filtered out entirely before mapping — the
backend computes a forward-looking forecast series, but nothing in this
UI renders it (see the Forecast note below). `row.month` is parsed by
string-slicing (`slice(0,4)`/`slice(5,7)`), not `new Date(row.month)` —
the latter parses as UTC midnight, and reading it back with local-time
accessors rolls the month back a day in any timezone behind UTC.

### Backend quirks worth checking by hand

- **No "Forecast" figure is shown anywhere on this dashboard**, even though
  the backend computes one two different ways (`forecast: true` rows here,
  and `forecast_30d`/`weighted_monthly_forecast` on the separate,
  **unwired** `/dashboard/profit/loss` endpoint). The old platform had a
  standalone "Forecast (Next 6 months)" card; this is a deliberate, pending
  design decision, not a bug to file.
- The card's own period selector (This month / This quarter / Last 6
  months / This year / Custom) and comparison mode are entirely client-side
  index math over the 24-month window (`lib/cash-flow.ts`) — the backend
  call itself never changes shape when you switch these controls. If
  switching periods triggers a new network request, that's a regression.

---

## Money position (Money owed to me / Money I owe / Net position)

Three tiles beside the Cash on hand hero. Two of the three figures are
store-derived (owed to me from `useInvoicesStore`, owed by me's bill portion
from `useExpensesStore` — see Store-derived cards below); only the BAS
figure and the cash total are dashboard-specific.

### Real contract — `fetchDashboardGstSetAside` in `lib/dashboard.ts`

`GET apiRoutes.dashboard.gstSummary` → `/dashboard/gst/summary`,
`{ period: "year", start, end }` = the current financial-year-to-date range.

**Response**: `{ success: true, data: { gst_collected, gst_paid, net_gst_payable, taxable_sales } }`. Only `net_gst_payable` is used, as the tile's
`amount`.

**The due date is computed client-side, not fetched** — no endpoint returns
one. `nextBasDueDate()` walks a 3-financial-year window of the four fixed AU
BAS due dates (28 Oct / 28 Feb / 28 Apr / 28 Jul) and picks the earliest one
`>= today`, comparing **calendar dates, not raw timestamps** (both sides
normalized to midnight — an earlier version compared raw `Date.now()`
against a midnight due-date and could round "10 hours away" down to "0 days
away" a full day early; fixed, worth a regression test on the day-boundary).

### Backend quirks worth checking by hand

- Cash-on-hand for this section sums `useAccountsStore`'s accounts (i.e.
  reuses Connected accounts' own data, not a second network call) — if
  Connected accounts is empty for a test account, Net position's cash
  component will correctly be `$0` too; that's consistent, not a second bug.
- Money owed to me / Money I owe show **no percentage-change arrow** (their
  baseline is hardcoded to `0`, which the tile reads as "nothing to compare
  against") — there is no backend endpoint for a historical AR/AP snapshot.
  Net position's baseline **is** real (the balance series' second-to-last
  month), so only that tile ever shows a real delta arrow. Don't file the
  other two's missing arrows as a bug.

---

## Top income / Top expenses

### Real contract — `fetchDashboardTopIncomes`/`fetchDashboardTopExpenses` in `lib/dashboard.ts`

`GET apiRoutes.dashboard.topIncomes` / `.topExpenses` →
`/dashboard/top/incomes` / `/dashboard/top/expenses`, both
`{ period: "year", start, end }` = current financial-year-to-date.

**Response**: `{ success: true, data: Array<{ label: string, client_name?: string, entry_date?: string, amount: number }> }` (top 5, pre-sorted
descending by the backend). `formatTopMoverLabel` builds the row's display
text: client + category when both are meaningful (`"{client} — {category}"`),
just the client name alone when the category is one of the generic buckets
(`/^(sales\s+income|income|expenses?|general\s+expenses?)$/i`), falling back
to whichever of the two is present, or `"Uncategorised"` if neither is.

### Backend quirks worth checking by hand

- **Both endpoints only count *reconciled* transactions** — a transaction
  that exists but hasn't been matched/categorized against an account
  category contributes nothing here, even within the financial year window.
  Confirmed directly against a real test account: 44 transactions in-range,
  zero reconciled, `data: []` from both endpoints — a correct empty result,
  not a bug. **Manual check**: before reporting "Top movers is empty",
  confirm at least one transaction has actually been reconciled this
  financial year for the test account in use.
- `client_name`/`label` can come back as the **literal strings** `"N/A"` /
  `"Uncategorised"` / `"null"` from the backend — `formatTopMoverLabel`
  treats all three (case-insensitively) as "not really there", not as real
  values to display verbatim.

---

## Revenue goal

Only the **target** is dashboard-specific; the progress figures (earned,
average invoice value, invoices needed) are computed client-side from
`useInvoicesStore` — see Store-derived cards below for why that's
deliberate, not an oversight.

### Real contract — `lib/goal-tracker.ts`

`GET`/`POST apiRoutes.goalTracker.get`/`.save` → both `/goal/tracker`.

- `fetchRevenueGoalTarget(): Promise<number | null>` — `GET`, no params.
  Response: `{ success, data: { exists: boolean, goal?: { income_goal: number|string, ...(server-computed progress fields, unused) } } }`. Returns `null`
  (meaning "no goal saved yet", not "still loading" — the query's own
  `isLoading` is the loading signal) when `exists` is `false`.
- `saveRevenueGoalTarget(incomeGoal: number): Promise<void>` — `POST`, body
  `{ income_goal: incomeGoal }`.

### Backend quirks worth checking by hand

- **The backend has no delete.** `income_goal <= 0` is rejected with a 400
  (`"Income goal must be greater than 0"`), so once a goal is saved, it can
  be *replaced* but never truly cleared server-side. The card's "Reset goal"
  button only clears the value in the local browser store — **manual check**:
  reset the goal, then reload the page; the previously-saved target comes
  back, because the next real fetch re-syncs it. This is expected, not a
  regression, but worth a tester knowing about before filing "reset doesn't
  work".
- **The backend's own progress figures (`total_income`, `average_invoice_size`,
  etc.) are deliberately never read.** They're derived from *reconciled bank
  transactions*, not invoices — a different basis than
  `financialYearRevenue()` in `lib/invoices.ts`, which the header, this
  card, and Business Snapshot all already agree on. Wiring the backend's
  version in for just this card would reintroduce the exact "two cards
  disagree about the same number" bug this codebase's own `REVENUE_GOAL`
  doc comment (`lib/dashboard-data.ts`) says was already found and fixed
  once. **Manual check worth doing after any change here**: the amount
  billed shown in the dashboard header, the "earned" figure on this card,
  and Business Snapshot's Net profit + Total expenses should always be
  mutually consistent (the same invoices/expenses feeding all three) — if a
  future change makes any of the three disagree, that's the regression to
  watch for specifically.
- **Manual check**: set a goal, refresh — target persists (real backend
  round-trip, not just `localStorage`).

---

## Bank connect flow ("Add account")

Real Fiskil (Consumer Data Right) integration — not part of the read-side
dashboard cards above, but lives in the same `lib/dashboard.ts` neighbourhood
and backs the Connected accounts card's "Add account" button.

### Real contract — `lib/bank-connection.ts`

`startBankConnection(): Promise<string>` — `GET apiRoutes.bankConnection.connect`
→ `/bank/connect`, params `{ userId, email, name }` read off
`useSessionStore`'s `user.id ?? user.user_id`, `user.email`, `user.full_name`
(**not** `user.name` — confirmed against `sole-webapp`'s equivalent call,
which reads `user_id`/`full_name`; the session mirrors the backend's raw
field names verbatim). Response `{ data: { authUrl } }`; throws if `authUrl`
is missing or doesn't start with `https://`. This specific endpoint has
**no auth middleware** — it reads identity from query params, not the
Bearer token, confirmed against `sole-ocr/src/routes/addBank.js`.

The returned `authUrl` is Fiskil's own hosted flow (handles bank search and
consent itself) shown in a fullscreen iframe
(`connect-bank-dialog.tsx`). On completion, Fiskil redirects the iframe to
this app's own `/fiskil-success`/`/fiskil-cancel` pages, which `postMessage`
`{ type: "FISKIL_NAVIGATE", target }` to the parent window (exact same
contract as `sole-webapp/pages/fiskil-success.js` — verified field-for-field
against that file, including the same-origin check and the
`window.parent === window` top-level-redirect fallback).

### Backend quirks / scope worth checking by hand

- **After the flow completes, the account list refetch goes through
  `/dashboard/bank/accounts/balance`** (the endpoint documented above), not
  the live Fiskil-proxied `GET /bank/accounts` production actually uses —
  deliberate, since `/bank/accounts`'s exact response shape lives in an
  external microservice not in this workspace. **Manual check**: a newly
  connected account can take a short, real delay to appear (the sync into
  `bank_accounts` happens async via a webhook) — the dialog invalidates the
  query twice (immediately, and again a few seconds later) to catch this,
  but don't expect it to be instant.
- **Not yet wired to a real endpoint** (buttons exist, work locally only):
  disconnecting an account, refreshing a single account's balance, and the
  subscription plan-limit check that should stop you connecting more
  accounts than your plan allows (`sole-webapp`'s equivalent calls
  `blockAction("manage_banks", "add")` before even starting a connection —
  no equivalent exists anywhere in this app yet, for any feature, not just
  this one).

---

## Where your customers are / Geographic Insights

### Real contract — `fetchAllContacts` in `lib/contacts-api.ts`

`GET apiRoutes.contact.list` → `/client/v2`, `{ type: "1", page: "1", limit: "1000" }` (Client tab only — Suppliers and the global Default directory are
excluded; invoices bill clients, not either of those). Reuses
`mapApiContactRow`, the same mapper `fetchContactsPage` (the paginated
Contacts-screen query) already uses and already has partial coverage for —
this function itself has none, since it's new this engagement.

### Backend quirks worth checking by hand

- **The list endpoint's SQL did not select address fields at all**
  (`getClientsListV2` in `sole-ocr/src/services/client.js`: `attributes: ['business_name', 'email', 'id', 'type', 'notes', 'created_at']` — no
  `city`/`country`). Every contact would have shown under "Unknown"
  regardless of how completely `fetchAllContacts` loaded the list. Fixed by
  adding one bulk `Address.findAll` lookup (keyed by the page's client ids)
  merged into the response — additive only, confirmed safe for
  `sole-webapp` (which reads this same `/client/v2` endpoint and only
  destructures the fields it already knows about).
- **A real, pre-existing data-quality bug, found while verifying the fix**:
  roughly 18% of client address rows in the dev DB have their `city`/
  `country`/`state`/`postcode` values saved as the **literal string**
  `Optional("Queensland")` rather than `"Queensland"` — looks like an iOS
  client bug that stringified a Swift optional instead of unwrapping it
  before saving. `cleanAddressField()` in `lib/contacts-api.ts` strips this
  pattern (`/^Optional\("(.*)"\)$/`) defensively before display. **Manual
  check**: if you see a literal `Optional(...)` string rendered anywhere on
  Geographic Insights, that's this cleanup failing to match some other
  variant of the same underlying bug, not a new issue — worth reporting
  with the exact string shown.
- A contact with a genuinely blank address (not the `Optional(...)` bug,
  just never filled in) correctly groups under "Unknown" — this is the
  contact record missing data, not something the dashboard can infer; don't
  file it as a dashboard bug.

---

## Store-derived cards (Business Snapshot, Invoice Summary, Attention Card, Revenue Goal's progress figures)

No dashboard-specific backend calls — all four read `useInvoicesStore`/
`useExpensesStore`/`useAssetsStore`/`useQuotesStore` directly, the same
stores Invoices/Expenses/Assets/Quotes populate on their own screens.
`components/dashboard/dashboard-data-bootstrap.tsx` exists specifically so
landing on `/dashboard` first — before ever visiting one of those four
screens in the same session — still triggers `useInvoicesQuery()`/
`useExpensesQuery()`/`useAssetsQuery()`/`useQuotesQuery()` and populates
them; if any of these four cards show empty on a fresh `/dashboard` load,
check whether that bootstrap component is still mounted on the page before
assuming the store's own query is broken.

### Backend quirks worth checking by hand

- **Every figure here is scoped to the current financial year (1 Jul – 30
  Jun)** — an invoice or expense dated in a *previous* financial year
  contributes nothing to Business Snapshot, Invoice Summary, or the Revenue
  Goal card, even though the record genuinely exists. **Manual check**:
  confirmed directly against a real test account whose only invoices
  (three, real, not deleted) were dated in the *previous* financial year —
  every FY-scoped figure correctly read `"—"`/`$0`, which is the accurate
  answer for "this financial year", not a bug.
- Attention Card's `AllClear` ("You're all caught up") must never render
  before invoices/expenses/quotes have actually loaded — it's gated on all
  three stores' `hydrated` flag plus the GST query's own loading state,
  specifically because a false "all caught up" reads as active reassurance,
  which is worse than a bare `$0` would be. **Manual check**: this is the
  single highest-value loading-state check on the whole page for exactly
  that reason.

---

## Loading and first-paint behaviour

Every card above shows a `Shimmer` skeleton (`components/ui/shimmer.tsx`)
while its query is in flight, and the header's own subline ("You've billed
$X this year — N things need your attention") shows a shimmer bar rather
than the sentence with `$0`/`0` substituted in — this was previously not
the case (every card showed a confident-looking `$0` or an empty-state
message during load, indistinguishable from genuinely-zero data). Every
numeric figure that had one of these gaps also animates in from `0` on
first paint via the shared `CountUp` component (`components/ui/count-up.tsx`,
already used elsewhere in the app — Expenses, Contacts, Quotes, Reports,
Super Contributions) — **manual check**: this should happen once per page
load only; re-hovering the Cash-on-hand chart or switching the Cash-flow
period afterwards should update figures instantly, never re-trigger the
count-up animation.

`StatCards` (Business Snapshot, Invoice Summary's bucket tiles) and
`RankedRow` (Top movers, Customer Areas) are **shared components used by
other modules** (Reports, Super Contributions, the Business planner) — they
were deliberately left out of the `CountUp` rollout in this engagement,
since both currently take a pre-formatted string rather than a raw number,
and widening either to support the animation is a bigger, app-wide change
that needs its own sign-off.

---

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`.

| Constant | Resolves to | Used by |
|---|---|---|
| `apiRoutes.dashboard.balance` | `BASE_URL + "/dashboard/balance"` | Cash on hand hero |
| `apiRoutes.dashboard.bankAccountsBalance` | `BASE_URL + "/dashboard/bank/accounts/balance"` | Connected accounts, Money position's cash total |
| `apiRoutes.dashboard.incomeExpense` | `BASE_URL + "/dashboard/income/expense"` | Cash flow chart |
| `apiRoutes.dashboard.gstSummary` | `BASE_URL + "/dashboard/gst/summary"` | Money position's BAS tile |
| `apiRoutes.dashboard.topIncomes` / `.topExpenses` | `BASE_URL + "/dashboard/top/incomes"` / `"/dashboard/top/expenses"` | Top income / Top expenses |
| `apiRoutes.goalTracker.get` / `.save` | both `BASE_URL + "/goal/tracker"` | Revenue goal target |
| `apiRoutes.bankConnection.connect` | `BASE_URL + "/bank/connect"` | "Add account" flow |
| `apiRoutes.contact.list` | `BASE_URL + "/client/v2"` | Customer areas / Geographic insights (`fetchAllContacts`) |
| `apiRoutes.dashboard.profitLoss`, `.recentInvoices`, `.incomeStatement`, `.invoicesSummary` | ported into `config/api-routes.ts` for completeness | **not called by any card** — the equivalent figures come from the real invoice/expense stores instead |
