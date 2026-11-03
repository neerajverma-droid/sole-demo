# Testing: Business Planner

Reference for test coverage of the Business Planner: savings goals and their
allocations, category budgets and the expenses linked to them, expense plans
with their budget lines, the cash wallet, and the Overview roll-up. The
screens live under `app/(app)/expenses/business-planner/` and render
`components/planner/*`. Those components read `stores/planner.ts`, which
`hooks/use-planner-query.ts` fills from `lib/planner-api.ts`. The domain maths
and validation live in `lib/planner.ts`.

The one test file described here, `lib/planner-api.test.ts`, is
**pre-existing** team work on `feat/api-integration` (added in `e2ac139`
"implemented business planner apis and test files" and touched again in
`f330699` "Security commit for business planner"). This doc describes that
file. It does not claim the file as new work.

It is a Vitest unit test file: no browser, no rendering, a plain `node`
environment, and the repo's usual mocked `@/utils/axiosInstance` convention.
For the shared copy-paste templates (API module, Zustand store), see
[`testing-coverage.md` → "Writing a new test in this
codebase"](./testing-coverage.md#writing-a-new-test-in-this-codebase). They
are not repeated here.

## Running them

```bash
npx vitest run lib/planner-api.test.ts     # this module (82 tests)
npx vitest run                             # everything in the repo
```

As of this doc, **1285 tests pass repo-wide**. The Business Planner accounts
for 82 of them:

| File | Tests | Covers |
|---|---|---|
| `lib/planner-api.test.ts` | 82 | API→domain mappers (`toGoal`/`toBudget`/`toPlan`), request payloads (decrypted and asserted), every tested endpoint's URL/params, and the `lib/planner` status/maths/validation rules those mappers feed |

---

## `lib/planner-api.test.ts` (pre-existing, 82 tests)

### How it's wired (worth copying)

- `apiMock` is created with **`vi.hoisted`**, not a plain `const`. The file
  also *statically* imports `@/lib/planner`, and that import pulls
  `axiosInstance` in before a plain `const` would exist. `vi.mock`'s factory
  is hoisted above the imports, so it has to reach a hoisted value. The API
  module itself is still loaded with `await import("@/lib/planner-api")`
  after the mock.
- The mock has `get`/`post`/`put`/`delete`. There is no `patch`: the planner
  uses **PUT** for every update.
- **`sentFields(body)`** decrypts the `{ data: "<cipher>" }` envelope with
  `decryptPayload` from `@/utils/encrypt`. It throws if the body isn't that
  shape, so assertions run on real fields rather than ciphertext. This works
  because `vitest.setup.ts` sets `NEXT_PUBLIC_SECRET_KEY` and
  `NEXT_PUBLIC_DISABLE_ENCRYPTION=false`. Any planner write test should reuse
  this helper.

### Tests by `describe` block

**Goals**

- `toGoal` (7) — maps `goal_type` to its label (`tax_set_aside` →
  `"Tax set-aside"`). An unknown type becomes `"Other"`. Money stays as typed
  text (`"6400.00"` → `"6400"`). Stamps become plain days (`"2026-10-28T…Z"` →
  `"2026-10-28"`). A bank allocation's `source` is `bank_account_name`, and a
  `source_type: "cash"` row becomes `"Cash wallet"`. **Server status wins**:
  `computed_status: "behind"` makes `goalStatus` return `"Behind"`, even
  though local pacing a week in would say `"On track"`. The test exists to
  prove the server answer takes priority. With `computed_status: null`, the
  local calculation answers.
- `fetchGoals` (3) — reads rows from a `{ data: [...] }` envelope, **and**
  from a bare array. An envelope with no array gives `[]`, not a throw.
- `addGoalAllocation` (3) — a bank source sends `source_type: "bank"`,
  `bank_account_id`, and `bank_account_name`. A cash source sends
  `source_type: "cash"` and **no bank keys at all**. **A blank note is
  omitted, not sent as `""`.** Encryption would turn `null` into `""`, and
  the API reads an empty string differently from a missing key.

**Budgets**

- `toBudget` (9):
  - `period_type` maps to its label (`six_monthly` → `"6 months"`).
  - Category ids resolve to names, and **unresolvable ids are dropped from
    `categories` but kept in `categoryIds`**, so saving the budget back can't
    detach them.
  - `account_subcategory_ids` is accepted as the id field.
  - **Server `spent` wins over the ledger.** `budgetActual` returns 310.5
    even with a 9999 expense in range.
  - **Server `computed_status` wins.** `near_limit` → `"Nearly spent"`.
  - With no `spent`, the ledger is read inside the budget's own window, and
    an out-of-window expense doesn't count.
  - A null threshold falls back to `"80"`.
  - A life-stage status (`upcoming`) gives `computedStatus: null`, meaning no
    spend badge.
- `budgetPayload` (5):
  - Sends `period_type`, trims `name`, and sends `amount` as a number.
  - `repeat_frequency` equals the period, or `"none"` for Custom.
  - Category names resolve to ids.
  - **When nothing resolves (catalogue not loaded), the draft's own
    `categoryIds` are kept.**
  - A blank `endDate` is sent as `null`.

**Expense plans**

- `toPlan` (6):
  - `plan_type`/`funding_source` are kept verbatim, and unknown values fall
    back to the first option (`"Expansion"`/`"Cash"`).
  - A line with `id: null` gets the stable key `"new-{index}"`.
  - An unknown `line_status` becomes `"Planned"`.
  - **Server `funding_gap` wins over `planStatus`**, even though local maths
    would say on track.
  - `planGap` is planned minus actual (16000).
- `plan maths` (6) — `planRoi` is annualised over the plan's window (20%
  over 6 months → 40%). `planPaybackMonths` is 5 for $10k cost against
  $2k/month. Both are `null` with blank revenue. Payback is `null` with no
  end date. `planStatus` returns `"Funding gap"` when revenue is below cost,
  **and also when revenue is blank**.
- `savePlan` (6):
  - Create is `POST expensePlan.add`, then `PUT expensePlan.upsertLines(newId)`.
    Update is `PUT expensePlan.update(id)` and never POSTs.
  - **Create omits a blank `expected_revenue`.** A `""` would parse as 0 and
    report "returns nothing".
  - **Update sends `expected_revenue` as `""`**, so clearing the field
    actually clears it.
  - Locally minted line ids (`line-*`) go up as `id: null`, and real ids go
    up as numbers. `sort_order` equals the index. The nested array survives
    encryption with its `null`s intact.
  - A blank amount is sent as `0`.
- `fetchPlans` (1) — URL only (`apiRoutes.expensePlan.list`).

**Overview, wallet and funding**

- `fetchPlannerOverview` (2) — maps every tile's roll-up
  (`cash_wallet_balance`, `goals_summary.*`, `expense_plans_summary.*`,
  per-plan `annual_return`). Absent summaries read as zeroes and `rows: []`.
- `fetchPlannerBankAccounts` (4) — maps `bank_name`,
  `masked_account_number`, and `balance`. Returns `[]` for an empty `data`
  and for the real "nothing connected" envelope, which has a nested second
  `success`. **Security regression:** `api.get` is called with exactly one
  argument, the URL. There is no params object, so no caller-supplied
  `userId` can be sent. The owner comes from the session.
- `fetchFundingSummary` (1) — maps `cash` and each `bank_accounts[]` row
  (`balance`, `available`).
- `fetchCashWallet` (1) — when `available` is missing, it is derived as
  `balance − allocated`.

**Form rules**

- `goalIssues` (4) — a complete draft passes. Name, amount, and date are all
  required. **A target below `allocated` is refused** ("already allocated").
  A target equal to `allocated` is allowed.
- `budgetAutoEndDate` (3) — adds each period's span. **31 Jan + 1 month
  clamps to 28 Feb**, not 3 March. Returns `""` for Custom or when there is
  no start date.

**Allocations and the cash wallet**

- `fundingSourcesFromSummary` (3) — banks come first, then the wallet.
  `bankAccountId` is the account id for a bank and `null` for the wallet.
  **`available` is read from the API, not recomputed.** The server nets off
  every goal in the business, while the screen only knows the goals it
  loaded.
- `cash wallet movements` (3) — withdraw posts `{amount, note}` to
  `cashWalletWithdraw`, and a blank note is dropped. Removing a movement
  DELETEs `cashWalletMovement(id)` and maps the returned wallet.
- `walletMovementIssue` (2) — cash in is never capped. **Cash out is capped
  at `available`, not the balance**, with a message mentioning "allocated to
  goals".

**Budget expenses**

- `fetchBudgetExpenses` (8):
  - **The row id is the expense's id (88), not the link id (501).** Detach
    is addressed by expense id.
  - Amount is `amount_allocated`, not the expense's own price.
  - `"yes"`/`"no"` flags become booleans.
  - Dates become plain days.
  - The amount fallback chain runs from the business share to the full
    price.
  - `total` is read from `pagination.total`.
  - The URL is `budget.expenses(id)` with `{ params: { limit: 100 } }`.
- `fetchAvailableBudgetExpenses` (3) — a flat row maps to the same
  `BudgetExpense` shape. **A whitespace-only search omits `search`
  entirely.** A search term is trimmed before it's sent.
- `attachBudgetExpense / detachBudgetExpense` (2) — attach POSTs
  `{expense_id: 88}` as a **number**. Detach DELETEs `budget.expense(7, 88)`.

---

## Real contract — `lib/planner-api.ts`

Module rule (from its docstring): the API speaks snake_case and stores money
as numbers, while `lib/planner` holds money as typed text. Where the API sends
a computed figure (goal status, budget spend or status, plan status), the
mapper carries it on the record and `lib/planner` prefers it. The local
calculation is only the answer for an unsaved draft.

**Key types** (verbatim, trimmed):

```ts
type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

export type BudgetMonthStat = { month: string; budgeted: number; spent: number; remaining: number };

export type BudgetExpense = {
  /** The expense's own id. What attach and detach are addressed by. */
  id: string;
  name: string;
  date: string;      // ISO YYYY-MM-DD
  amount: number;    // allocated (linked) or would-be-allocated (available)
  paidWithCash: boolean;
  reconciled: boolean;
};
export type BudgetExpenseList = { expenses: BudgetExpense[]; total: number };

export type PlannerCategory = { id: number; name: string };

export type CashWallet = { balance: number; allocated: number; available: number };
export type FundingBankAccount = { id: number; name: string; balance: number; available: number };
export type FundingSummary = { cash: CashWallet; bankAccounts: FundingBankAccount[] };

export type PlannerOverviewData = {
  cashWalletBalance: number;
  goals: { total; onTrack; behind; complete; totalAllocated };            // all number
  plans: { total; onTrack; withGap; totalFundingGaps; forecastAnnualReturn; committedToPlans;
           rows: { id: string; name: string; annualReturn: number }[] };
};
```

**Internal coercion helpers** (not exported, but every mapper uses them):

- `money(v)` — `""` for null/undefined/`""`/non-finite, else `String(Number(v))`.
- `num(v)` — `0` if not finite.
- `optionalNum(v)` — `null` unless a finite number was actually sent
  ("absent is not zero").
- `isoDay(v)` — `String(v).slice(0, 10)`.
- `text(v)` — `""` for null/undefined.
- `rows(payload)` — a bare array, else `payload.data` if it's an array, else
  `[]`.
- `flag(v)` — `true` only for `true`, `"yes"`, `1`, or `"1"`.

**The two body builders — the rule behind half the tests:**

- `encryptedCreateBody(fields)` — drops `null`/`undefined` keys, then calls
  `buildEncryptedRequestBody`. It is used for **creates** (goal, budget,
  plan, allocation, top-up, withdraw, attach). It's needed because
  `encryptPayload` (`utils/encrypt.ts`) rewrites a top-level `null` or
  `undefined` to `""`. It also rewrites top-level booleans to
  `"true"`/`"false"` strings, and passes nested arrays and objects through
  untouched.
- `buildEncryptedRequestBody(fields)` directly — used for **updates**
  (goal, budget, plan, plan lines, set-balance), so clearing a field sends
  `""`. A consequence that isn't tested: `budgetPayload.end_date: null`
  arrives as `""` on update but is absent on create, and `repeat_enabled`
  arrives as `"true"`/`"false"` either way.

**Pure / mapping functions** (signature + the one non-obvious rule):

- `plannerToday(): string` — today's date in the **viewer's local
  timezone** (it offsets by `getTimezoneOffset()`), not UTC. It is used
  internally as `allocated_date`.
- `toGoal(row: ApiPlannerGoal): Goal` — `created` falls back to the
  **target date**, not today, so an unstamped goal doesn't read as instantly
  behind. `computed_status` maps `completed/on_track/behind` →
  `Complete/On track/Behind`, and anything else → `null`.
- `toBudget(row, categoryNames: Map<number,string>): Budget` — ids come from
  `category_ids ?? account_subcategory_ids ?? categories[].id`. Names are
  resolved from `categoryNames` first, then from the row's own inline
  `categories[].name`. `computed_status` maps `overspent/near_limit/healthy`
  → `Over budget/Nearly spent/Within budget`. `upcoming`, `ended`, `paused`,
  and `archived` map to `null`. `alertThreshold` falls back to
  `DEFAULT_ALERT_THRESHOLD` (`"80"`) only when the value is `== null`.
- `budgetPayload(draft, categoryIdsByName: Map<string,number>)` —
  `repeat_frequency: draft.repeatFrequency ?? (period_type === "custom" ?
  "none" : period_type)`. `alert_threshold_percent: Number(alertThreshold ||
  "80")`. `category_ids` falls back to `draft.categoryIds` when nothing
  resolves.
- `toPlan(row: ApiExpensePlan): ExpensePlan` — `plan_type`,
  `funding_source`, and `line_status` are matched verbatim against
  `PLAN_TYPES`, `PLAN_FUNDING_SOURCES`, and `BUDGET_LINE_STATUSES`, falling
  back to the first entry. `computed_status` understands only
  `on_track`/`funding_gap`.
- `linesPayload` (internal) — ids starting with `new-` **or** `line-`
  become `null`. `newBudgetLine()` mints `line-N`, and `toPlanLine` mints
  `new-N`.
- `toBudgetExpense` (internal) — amount chain: `amount_allocated` →
  `suggested_amount` → `expense.business_amount` → `num(expense.price)`.
  Id chain: `expense.id` → `expense_id` → `id`. Name falls back to
  `"Expense"`.
- `fundingSourcesFromSummary(summary): FundingSource[]` — banks, then one
  `"Cash wallet"` entry with `bankAccountId: null` and `detail: ""`.

**Real API calls** (`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ??
"http://localhost:3001/api"`).

The envelope is `ApiEnvelope` = `{success?, message?, data?}`. **No function
in this file reads `success` or `message`.** None of them throws on a
`success: false` body. Failure only surfaces when axios itself rejects
(HTTP error), and a missing `data` maps to an empty or zeroed record.

| Function | Method | Route | Body / params | Response | Notes |
|---|---|---|---|---|---|
| `fetchGoals(): Promise<Goal[]>` | GET | `apiRoutes.plannerGoal.list` → `/planner-goal` | — | `{data: ApiPlannerGoal[]}` or a bare array | `rows()`; `[]` on an unexpected shape. |
| `createGoal(draft)` | POST | `apiRoutes.plannerGoal.add` → `/planner-goal` | `encryptedCreateBody({name: trim, goal_type: GOAL_TYPE_TO_API[type], target_amount: Number, target_date})` | `{data: ApiPlannerGoal}` | `toGoal(data ?? {})`. With no `data` it resolves to a goal with `id: ""`, with no throw. |
| `updateGoal(id, draft)` | PUT | `apiRoutes.plannerGoal.update(id)` → `/planner-goal/{id}` | `buildEncryptedRequestBody(goalPayload)` | same | — |
| `deleteGoal(id)` | DELETE | `apiRoutes.plannerGoal.delete(id)` → `/planner-goal/{id}` | — | ignored | — |
| `addGoalAllocation(goalId, {amount, note, sourceType, bankAccountId?, bankAccountName?})` | POST | `apiRoutes.plannerGoal.addAllocation(id)` → `/planner-goal/{id}/allocations` | `encryptedCreateBody({amount, note: note \|\| null, allocated_date: plannerToday(), ...bank ? {source_type:"bank", bank_account_id, bank_account_name: name \|\| ""} : {source_type:"cash"}})` | `{data: ApiPlannerGoal}` (the whole goal, recomputed) | A blank note is dropped. A `bankAccountId` of null/undefined is also silently dropped. |
| `removeGoalAllocation(goalId, allocationId)` | DELETE | `apiRoutes.plannerGoal.deleteAllocation(id, aid)` → `/planner-goal/{id}/allocations/{aid}` | — | `{data: ApiPlannerGoal}` | Returns the recomputed goal. |
| `fetchBudgets(): Promise<{budgets, monthStats}>` | GET ×2 (+1) | `apiRoutes.budget.stats` → `/budget/stats` and `apiRoutes.budget.list` → `/budget` | list: `{params: {limit: 100}}` | `rows()` on each | Awaits `fetchExpenseCategories()` **first**, then fetches stats and list together with `Promise.all`. `toMonthStat`: `budgeted ?? total_budgeted`, `spent ?? total_spent`, and `remaining` falls back to `budgeted − spent`. |
| `createBudget(draft, idsByName)` | POST | `apiRoutes.budget.add` → `/budget` | `encryptedCreateBody(budgetPayload(...))` | ignored (`void`) | — |
| `updateBudget(id, draft, idsByName)` | PUT | `apiRoutes.budget.update + id` → `/budget/{id}` | `buildEncryptedRequestBody(budgetPayload(...))` | ignored | The route is a string ending in `/`, and the id is concatenated onto it. |
| `deleteBudget(id)` | DELETE | `apiRoutes.budget.delete + id` → `/budget/{id}` | — | ignored | Same concatenation. |
| `fetchBudgetExpenses(budgetId)` | GET | `apiRoutes.budget.expenses(id)` → `/budget/{id}/expenses` | `{params: {limit: 100}}` | `{data: {expenses: [...], pagination?: {total}}}` | Linked rows nest the expense under `expense`. `total` falls back to `expenses.length`. If `data.expenses` isn't an array, falls back to `rows(payload)`. |
| `fetchAvailableBudgetExpenses(budgetId, search)` | GET | `apiRoutes.budget.availableExpenses(id)` → `/budget/{id}/available-expenses` | `{params: {limit: 100, search?: trimmed}}` | same as above | Rows are flat and carry `suggested_amount`. The server does all the narrowing (cycle, category, not already linked). |
| `attachBudgetExpense(budgetId, expenseId)` | POST | `apiRoutes.budget.expenses(id)` → `/budget/{id}/expenses` | `encryptedCreateBody({expense_id: Number(expenseId)})` | ignored | No amount is sent, so the API allocates the business share or full price. |
| `detachBudgetExpense(budgetId, expenseId)` | DELETE | `apiRoutes.budget.expense(id, eid)` → `/budget/{id}/expenses/{eid}` | — | ignored | The expense itself is untouched. |
| `fetchExpenseCategories(): Promise<PlannerCategory[]>` | GET | `apiRoutes.accountCategory.list` → `/account-categories/list` | — | `{data: {account_categories: [...]}}` | Keeps only `account_category_id === 1` (Expenses) and flattens its subcategories. The result is **cached as a module-level promise for the session**. On error the cache resets to `null` and the call resolves `[]`, never throwing. |
| `fetchPlans(): Promise<ExpensePlan[]>` | GET | `apiRoutes.expensePlan.list` → `/expense-plan` | — | `rows()` | — |
| `savePlan(id \| null, draft): Promise<ExpensePlan>` | PUT or POST, then PUT | update: `apiRoutes.expensePlan.update(id)` → `/expense-plan/{id}`; create: `apiRoutes.expensePlan.add` → `/expense-plan`; then `apiRoutes.expensePlan.upsertLines(id)` → `/expense-plan/{id}/lines` | plan: `{name: trim, plan_type, funding_source, planned_start_date, planned_end_date, expected_revenue}` (`\|\| null`; revenue `""`→`null`) via create/update builder; lines: `buildEncryptedRequestBody({lines: [{id, name, planned_amount, actual_amount, ledger_source, line_status, sort_order}]})` | lines call: `{data: ApiExpensePlan}` | Returns `toPlan` of the **lines** response. If a create response has no `data.id`, `planId` becomes `""`. The lines PUT then goes to `/expense-plan//lines` with no guard (untested). |
| `deletePlan(id)` | DELETE | `apiRoutes.expensePlan.delete(id)` → `/expense-plan/{id}` | — | ignored | — |
| `fetchCashWallet()` | GET | `apiRoutes.goalFunding.cashWallet` → `/goal-funding/cash-wallet` | — | `{data: {balance, allocated, available?}}` | `available` falls back to `balance − allocated`. |
| `fetchCashWalletHistory(): Promise<WalletMovement[]>` | GET | `apiRoutes.goalFunding.cashWalletHistory` → `/goal-funding/cash-wallet/history` | — | `rows()` | `date` is `movement_date ?? created_at`. |
| `topUpCashWallet(amount, note)` | POST | `apiRoutes.goalFunding.cashWalletTopup` → `/goal-funding/cash-wallet/topup` | `encryptedCreateBody({amount, note: note \|\| null})` | `{data: wallet}` | — |
| `withdrawFromCashWallet(amount, note)` | POST | `apiRoutes.goalFunding.cashWalletWithdraw` → `/goal-funding/cash-wallet/withdraw` | same shape; amount is **positive** | `{data: wallet}` | `useWalletMovementMutation` sends `amount ≥ 0` to top-up, and otherwise sends `Math.abs(amount)` here. |
| `removeCashWalletMovement(id)` | DELETE | `apiRoutes.goalFunding.cashWalletMovement(id)` → `/goal-funding/cash-wallet/history/{id}` | — | `{data: wallet}` | — |
| `setCashWalletBalance(balance)` | PUT | `apiRoutes.goalFunding.cashWallet` → `/goal-funding/cash-wallet` | `buildEncryptedRequestBody({balance})` | `{data: wallet}` | **Not called anywhere** in the app. |
| `fetchFundingSummary()` | GET | `apiRoutes.goalFunding.summary` → `/goal-funding/summary` | — | `{data: {cash, bank_accounts[]}}` | — |
| `fetchPlannerOverview()` | GET | `apiRoutes.plannerOverview.get` → `/planner-overview` | — | `{data: {cash_wallet_balance, goals_summary, expense_plans_summary}}` | `rows[].annualReturn` is `annual_return ?? expected_revenue`. |
| `fetchPlannerBankAccounts(): Promise<BankAccountBalance[]>` | GET | `apiRoutes.bankAccounts.list` → `/bank/accounts` | **none — the URL is the only argument** | `{data: {accounts: [...]}}` | Owner comes from the session. `name` is `bank_name ?? name`, and `detail` is `masked_account_number ?? account_number`. |

---

## Real contract — `lib/planner.ts` (domain; no test file of its own)

The test file imports ten of this file's exports directly (`goalStatus`,
`budgetActual`, `budgetStatus`, `planGap`, `planRoi`, `planPaybackMonths`,
`planStatus`, `goalIssues`, `budgetAutoEndDate`, `walletMovementIssue`), and
others are reached through the mappers. Rules for the ones it touches:

- `goalStatus(goal, todayIso): GoalStatus | null`:
  - `null` unless `goalIsMeasurable` (target > 0 and a date is set).
  - Otherwise `computedStatus` wins.
  - Otherwise allocated ≥ target → `"Complete"`.
  - Otherwise past the date (or a zero-week window) → `"Behind"`.
  - Otherwise `progress + 0.001 >= elapsedWeeks / totalWeeks` →
    `"On track"`. Weeks are `Math.ceil(days / 7)`, measured from `created`.
- `budgetActual(budget, expenses, todayIso)` — `serverSpent != null` wins.
  Otherwise it sums expenses in `budget.categories` within
  `[startDate, endDate || budgetAutoEndDate(...) || "9999-12-31"]`. With no
  start date, the window falls back to the current calendar month, quarter,
  or year.
- `budgetStatus(...)` — `computedStatus` wins. `amount <= 0` → `null`.
  `ratio > 1` → Over budget. `ratio >= budgetThreshold` → Nearly spent.
  `budgetThreshold` treats a percentage `<= 0` or `> 100` as the default
  80%.
- `planStatus(plan)` — `computedStatus` wins. Otherwise
  `cost > 0 && (revenue === null || revenue < cost)` → `"Funding gap"`,
  else `"On track"`. **`"Review"` is in the `PlanStatus` union but is never
  produced**, locally or by `planStatusFromApi`. That makes
  `planStatusCounts().review` always 0 and the `"warning"` branch of
  `planStatusVariant` unreachable.
- `planGap` — `max(0, planned − actual)`. An overspend is not a gap.
- `planRoi` — `null` if revenue is `null` or cost `<= 0`. Otherwise
  `((rev − cost) / cost) × 100 × (12 / months)`, or `× 1` with no window.
- `planPaybackMonths` — `null` if revenue is `null` or `<= 0`, or if there
  is no window. Otherwise `cost / (revenue / months)`.
- `planDurationMonths` — `null` if `end <= start`, and never less than 1
  otherwise.
- `goalIssues(draft, allocated = 0)` — name needs `>= 2` chars (after
  trim). `amountFieldError` is checked first (regex `/^\d+(\.\d{1,2})?$/`,
  only when the field is non-blank). Then `<= 0` gives "Enter a target
  amount.". Then `< allocated` gives "Target can't be less than the $X
  already allocated.". The date is required.
- `budgetAutoEndDate(start, period)` — Weekly adds 7 days. The other
  periods add months, and the day is clamped to the target month's last
  day. Returns `""` for Custom or an unparseable start.
- `walletMovementIssue(value, direction, available)` — the format error
  comes first. A blank or `<= 0` value → `undefined`. `out` with
  `amount > available` → "Only $X is available — the rest is allocated to
  goals.".

---

## `stores/planner.ts` — audited, no test file

`usePlannerStore` holds `goals`, `budgets`, `plans`, `wallet`,
`walletOpening`, and `walletMovements`. Unlike `stores/rules.ts`, it is
**not** just plain setters. It has three pieces of real logic that are
worth a `stores/planner.test.ts` in the `stores/super.test.ts` style:

- **`upsertGoal` / `upsertPlan`** replace a record in place when its `id`
  exists, and otherwise **prepend** it. Order and replace-vs-prepend are
  both easy to regress.
- **`walletOpening`** is derived by `openingFrom(wallet, movements)`, which
  computes `wallet.balance − Σ movement.amount`, or `0` when there is no
  wallet yet. It is recomputed by **both** `setWallet` and
  `setWalletMovements` against the other field's current value. The final
  figure is correct after both calls in either order, and
  `useCashWalletQuery` sets movements first.
- `removeGoal` / `removeBudget` / `removePlan` filter by id. There is
  deliberately no local add or update action.

`useWalletBalance()` returns `wallet.balance` when a wallet exists,
otherwise `walletBalance(walletOpening, movements)`. It is a React hook, so
it can't be exercised directly in the `node` environment. Its selector
logic would need extracting to test it.

Other planner state is two jotai atoms in `lib/atoms.ts`:
`plannerTabAtom` (defaults to `"Overview"`) and `plannerHintSeenAtom`
(`atomWithStorage("sole.planner.hint-seen", …)`). They are trivial and have
no tests.

---

## Gaps

No test file covers `lib/planner.ts`, `stores/planner.ts`,
`hooks/use-planner-query.ts`, `lib/goal-tracker.ts`, or any of the 14
`components/planner/*.tsx` files. The components export no pure functions
to test. Their only non-component exports are `PLANNER_ROOT`, the `Crumb`
type, and the `usePlannerSection` hook in `planner-detail.tsx`.

**`lib/planner-api.ts` exports never exercised by any test:**

- `createGoal`, `updateGoal`, `deleteGoal`, `removeGoalAllocation`. Only
  `addGoalAllocation` of the goal writes is tested.
- `fetchBudgets`, including `toMonthStat`'s `total_budgeted`/`total_spent`
  fallbacks and the derived `remaining`.
- `createBudget`, `updateBudget`, `deleteBudget`. Nothing checks the
  `route + id` concatenation, or that create omits `end_date: null` while
  update sends it as `""`.
- `fetchExpenseCategories`: the `account_category_id === 1` filter, the
  session cache, and the reset-on-failure path. The cache is module-level,
  so a test would need `vi.resetModules()` between cases.
- `deletePlan`, `fetchCashWalletHistory` (`toMovement`'s `movement_date ??
  created_at`), `topUpCashWallet`, `setCashWalletBalance`, `plannerToday`.

**Partially covered:**

- `fetchPlans` asserts the URL only.
- `toBudget`'s inline `categories[].name` fallback is untested, as is
  `toBudgetExpenseList`'s bare-array fallback.
- `savePlan`'s missing-id path (`/expense-plan//lines`) is untested.
- `addGoalAllocation`'s `bank_account_name: ""` default is untested.
- There are no `success: false` tests, because no function checks
  `success`. That behaviour is itself undocumented by a test.

**`lib/planner.ts` exports with no test at all, direct or indirect:**

- Cash: `walletBalance`, `walletTotals`, `cashAccounts`, `cashOnHand`,
  `fundingSources`. `fundingSources` is also **unused**, superseded by
  `fundingSourcesFromSummary`.
- Goals: `requiredWeekly`, `goalRemaining`,
  `goalFullyAllocated`, `allocationMessage`, `pacingLine`,
  `contributionRule`, `goalStatusVariant`.
- Budgets: `budgetAmount` and `budgetThreshold` (the only `budgetStatus`
  test returns early on `computedStatus`, so the threshold path never
  runs), `budgetRemaining`, `budgetProgress`, `budgetCategoryLabel`,
  `budgetSummaryLine`, `budgetStatusVariant`, `budgetIssues` (the
  Custom-only date rules and the 1–100 whole-number threshold).
- Plans: `newBudgetLine`, `lineVariance`, `planRemaining`,
  `planCommitted`, `planReturn`, `formatPayback`, `planStatusVariant`,
  `ledgerActual`, `planIssues` (per-line `planned-{id}`/`actual-{id}`/
  `name-{id}` keys).
- Portfolio: `totalGoalAllocations`, `totalCommitted`, `totalPlannedCost`
  (unused), `totalFundingGap`, `forecastAnnualReturn`, `availableCash`,
  `isOverAllocated`, `goalStatusCounts`, `planStatusCounts`.
- Formatting: `signedMoney` (the U+2212 minus), `formatOrDash`,
  `formatGoalDate`, `goalSummaryLine`, `formatPercent`.
- Validation: `allocationIssue`. `amountFieldError` is never fed an invalid
  string.
- Drafts: `emptyGoalDraft`, `draftFromGoal`, `emptyBudgetDraft`,
  `draftFromBudget`, `emptyPlanDraft`, `draftFromPlan`.

**Dead or unused code found while auditing** (not bugs to fix in a test):

- The `"Review"` plan status is never produced.
- `setCashWalletBalance`, `fundingSources`, `totalPlannedCost`, and
  `PLAN_FUNDING_PRODUCT` have no callers.
- `fetchBudgets().monthStats` is returned but never read.

**`hooks/use-planner-query.ts`** has one real branch in
`useWalletMovementMutation` (sign → top-up vs `Math.abs` withdraw) and the
`["planner"]`-wide invalidation. Both are untested, since there is no React
test setup.

**`lib/goal-tracker.ts`** is adjacent and out of scope. It is the
dashboard's revenue goal (`/goal/tracker`), used by
`hooks/use-goal-tracker-query.ts` and `revenue-goal-card.tsx`, not a planner
goal. It has no test:

- `fetchRevenueGoalTarget` returns `null` when `!exists` or there is no
  `goal`, and `Number(income_goal) || null` otherwise, so a stored `0` also
  reads as `null`.
- `saveRevenueGoalTarget` POSTs a **plain, unencrypted** `{income_goal}`,
  unlike the planner's encrypted writes.

---

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`.
Assert against the `apiRoutes.x.y` constant, not the string, as the test file
does.

| Constant | Resolves to |
|---|---|
| `apiRoutes.plannerGoal.list` / `.add` | both `BASE_URL + "/planner-goal"` |
| `apiRoutes.plannerGoal.update(id)` / `.delete(id)` / `.info(id)` | `` `${BASE_URL}/planner-goal/${id}` `` |
| `apiRoutes.plannerGoal.addAllocation(id)` | `` `${BASE_URL}/planner-goal/${id}/allocations` `` |
| `apiRoutes.plannerGoal.deleteAllocation(id, allocationId)` | `` `${BASE_URL}/planner-goal/${id}/allocations/${allocationId}` `` |
| `apiRoutes.budget.list` / `.add` | both `BASE_URL + "/budget"` |
| `apiRoutes.budget.stats` | `BASE_URL + "/budget/stats"` |
| `apiRoutes.budget.update` / `.delete` | `BASE_URL + "/budget/"` (id concatenated) |
| `apiRoutes.budget.expenses(id)` | `` `${BASE_URL}/budget/${id}/expenses` `` (GET list, POST attach) |
| `apiRoutes.budget.expense(id, expenseId)` | `` `${BASE_URL}/budget/${id}/expenses/${expenseId}` `` |
| `apiRoutes.budget.availableExpenses(id)` | `` `${BASE_URL}/budget/${id}/available-expenses` `` |
| `apiRoutes.accountCategory.list` | `BASE_URL + "/account-categories/list"` |
| `apiRoutes.expensePlan.list` / `.add` | both `BASE_URL + "/expense-plan"` |
| `apiRoutes.expensePlan.update(id)` / `.delete(id)` / `.info(id)` | `` `${BASE_URL}/expense-plan/${id}` `` |
| `apiRoutes.expensePlan.upsertLines(id)` | `` `${BASE_URL}/expense-plan/${id}/lines` `` |
| `apiRoutes.goalFunding.summary` | `BASE_URL + "/goal-funding/summary"` |
| `apiRoutes.goalFunding.cashWallet` | `BASE_URL + "/goal-funding/cash-wallet"` (GET read, PUT set balance) |
| `apiRoutes.goalFunding.cashWalletTopup` | `BASE_URL + "/goal-funding/cash-wallet/topup"` |
| `apiRoutes.goalFunding.cashWalletWithdraw` | `BASE_URL + "/goal-funding/cash-wallet/withdraw"` |
| `apiRoutes.goalFunding.cashWalletHistory` | `BASE_URL + "/goal-funding/cash-wallet/history"` |
| `apiRoutes.goalFunding.cashWalletMovement(id)` | `` `${BASE_URL}/goal-funding/cash-wallet/history/${id}` `` |
| `apiRoutes.plannerOverview.get` | `BASE_URL + "/planner-overview"` |
| `apiRoutes.bankAccounts.list` | `BASE_URL + "/bank/accounts"` |
| `apiRoutes.goalTracker.get` / `.save` | both `BASE_URL + "/goal/tracker"` (adjacent, see Gaps) |
