/**
 * Business planner API layer — goals, budgets, expense plans, the cash wallet
 * and the portfolio overview.
 *
 * The API speaks snake_case and stores money as numbers; lib/planner speaks the
 * domain shape the screens are built on, where money fields hold typed text.
 * Everything that translates between the two lives here, so no component ever
 * sees an API row and no request is assembled from one.
 *
 * Where the API returns a figure it computed — a goal's status, a budget's
 * spend, a plan's status — that figure is carried onto the domain record and
 * lib/planner prefers it. The local calculations stay as the answer for a record
 * being edited, which has no saved counterpart to ask yet.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  BUDGET_LINE_STATUSES,
  BUDGET_PERIOD_TO_API,
  DEFAULT_ALERT_THRESHOLD,
  GOAL_TYPE_TO_API,
  PLAN_FUNDING_SOURCES,
  PLAN_TYPES,
  budgetAmount,
  budgetPeriodFromApi,
  goalTarget,
  goalTypeFromApi,
  type BankAccountBalance,
  type Budget,
  type BudgetDraft,
  type BudgetLineStatus,
  type BudgetStatus,
  type ExpensePlan,
  type ExpensePlanDraft,
  type FundingSource,
  type Goal,
  type GoalAllocation,
  type GoalDraft,
  type GoalStatus,
  type PlanBudgetLine,
  type PlanFundingSource,
  type PlanStatus,
  type PlanType,
  type WalletMovement,
} from "@/lib/planner";

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

/* ------------------------------------------------------------------ *
 * Shared coercion
 * ------------------------------------------------------------------ */

/** A money field as the form holds it: typed text, blank when there's nothing. */
function money(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Null unless the API actually sent a number — absent is not zero. */
function optionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The date part of whatever the API returned — it sends both dates and stamps. */
function isoDay(value: unknown): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** Today, in the viewer's own timezone rather than UTC. */
export function plannerToday(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * An encrypted request body, with empty fields dropped rather than sent.
 *
 * `encryptPayload` turns `null` into `""` before it ciphers, and the API reads
 * those two differently on a create: `expected_revenue: null` means "no figure,
 * so ROI is unanswerable", while `expected_revenue: ""` parses to 0 — which
 * would report a plan as returning nothing rather than as not yet saying. Every
 * create field treats an absent key as null, so omitting is the faithful
 * translation.
 *
 * Only for creates. An update sends every key it knows, including the empty
 * ones, so that clearing a field actually clears it — those go through
 * `buildEncryptedRequestBody` directly, and the API reads the `""` encryption
 * leaves behind as the blank it stands for.
 */
function encryptedCreateBody(fields: Record<string, unknown>) {
  const present = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined),
  );
  return buildEncryptedRequestBody(present);
}

/**
 * The rows out of a list response, whichever shape it arrived in. The API
 * returns a bare array for some of these collections and an envelope for
 * others, and both are in use today.
 */
function rows<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const data = (payload as ApiEnvelope<unknown>)?.data;
  if (Array.isArray(data)) return data as T[];
  return [];
}

/* ------------------------------------------------------------------ *
 * Goals — /planner-goal
 * ------------------------------------------------------------------ */

type ApiGoalAllocation = {
  id?: number | string;
  amount?: number | string;
  note?: string | null;
  allocated_date?: string | null;
  source_type?: string | null;
  bank_account_id?: number | string | null;
  bank_account_name?: string | null;
};

export type ApiPlannerGoal = {
  id?: number | string;
  name?: string;
  goal_type?: string;
  target_amount?: number | string;
  target_date?: string | null;
  allocated_amount?: number | string;
  remaining?: number | string;
  percent?: number | string;
  required_weekly?: number | string;
  computed_status?: string | null;
  created_at?: string | null;
  allocations?: ApiGoalAllocation[];
};

/** The API's `computed_status` as the badge the planner shows. */
function goalStatusFromApi(value: unknown): GoalStatus | null {
  if (value === "completed") return "Complete";
  if (value === "on_track") return "On track";
  if (value === "behind") return "Behind";
  return null;
}

/**
 * An allocation's source as one line of text — the account it was earmarked
 * from. A bank allocation names the bank; anything else came out of the wallet.
 */
function allocationSource(row: ApiGoalAllocation): string {
  if (row.source_type === "bank") return text(row.bank_account_name) || "Bank";
  return "Cash wallet";
}

function toAllocation(row: ApiGoalAllocation): GoalAllocation {
  return {
    id: String(row.id ?? ""),
    date: isoDay(row.allocated_date),
    amount: num(row.amount),
    source: allocationSource(row),
    note: text(row.note),
  };
}

export function toGoal(row: ApiPlannerGoal): Goal {
  return {
    id: String(row.id ?? ""),
    name: text(row.name),
    type: goalTypeFromApi(row.goal_type),
    targetAmount: money(row.target_amount),
    targetDate: isoDay(row.target_date),
    // The creation date is the baseline the local pacing calculation measures
    // from. Falling back to the target date rather than to today keeps a goal
    // the API didn't stamp from reading as instantly behind.
    created: isoDay(row.created_at) || isoDay(row.target_date),
    allocations: (row.allocations ?? []).map(toAllocation),
    computedStatus: goalStatusFromApi(row.computed_status),
  };
}

/** What a goal form sends. The API derives everything else from these four. */
function goalPayload(draft: GoalDraft) {
  return {
    name: draft.name.trim(),
    goal_type: GOAL_TYPE_TO_API[draft.type],
    target_amount: Number(draft.targetAmount),
    target_date: draft.targetDate,
  };
}

export async function fetchGoals(): Promise<Goal[]> {
  const response = await api.get<ApiEnvelope<ApiPlannerGoal[]>>(
    apiRoutes.plannerGoal.list,
  );
  return rows<ApiPlannerGoal>(response.data).map(toGoal);
}

export async function createGoal(draft: GoalDraft): Promise<Goal> {
  const response = await api.post<ApiEnvelope<ApiPlannerGoal>>(
    apiRoutes.plannerGoal.add,
    encryptedCreateBody(goalPayload(draft)),
  );
  track(EVENTS.GOAL_CREATED, { amount: goalTarget(draft) });
  return toGoal(response.data?.data ?? {});
}

export async function updateGoal(id: string, draft: GoalDraft): Promise<Goal> {
  const response = await api.put<ApiEnvelope<ApiPlannerGoal>>(
    apiRoutes.plannerGoal.update(id),
    buildEncryptedRequestBody(goalPayload(draft)),
  );
  return toGoal(response.data?.data ?? {});
}

export async function deleteGoal(id: string): Promise<void> {
  await api.delete(apiRoutes.plannerGoal.delete(id));
}

/**
 * Earmarks cash against a goal. The API answers with the whole goal, so the
 * caller gets the recomputed allocated amount and status rather than having to
 * work out what changed.
 */
export async function addGoalAllocation(
  goalId: string,
  allocation: {
    amount: number;
    note: string;
    /** `cash` for the wallet, or a bank account to draw from. */
    sourceType: "cash" | "bank";
    bankAccountId?: number | null;
    bankAccountName?: string;
  },
): Promise<Goal> {
  const response = await api.post<ApiEnvelope<ApiPlannerGoal>>(
    apiRoutes.plannerGoal.addAllocation(goalId),
    encryptedCreateBody({
      amount: allocation.amount,
      note: allocation.note || null,
      allocated_date: plannerToday(),
      ...(allocation.sourceType === "bank"
        ? {
            source_type: "bank",
            bank_account_id: allocation.bankAccountId,
            bank_account_name: allocation.bankAccountName || "",
          }
        : { source_type: "cash" }),
    }),
  );
  return toGoal(response.data?.data ?? {});
}

export async function removeGoalAllocation(
  goalId: string,
  allocationId: string,
): Promise<Goal> {
  const response = await api.delete<ApiEnvelope<ApiPlannerGoal>>(
    apiRoutes.plannerGoal.deleteAllocation(goalId, allocationId),
  );
  return toGoal(response.data?.data ?? {});
}

/* ------------------------------------------------------------------ *
 * Budgets — /budget
 * ------------------------------------------------------------------ */

export type ApiBudget = {
  id?: number | string;
  name?: string;
  amount?: number | string;
  period_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  repeat_enabled?: boolean;
  repeat_frequency?: string | null;
  alert_threshold_percent?: number | string | null;
  notes?: string | null;
  category_ids?: (number | string)[];
  account_subcategory_ids?: (number | string)[];
  categories?: { id?: number | string; name?: string }[];
  spent?: number | string;
  remaining?: number | string;
  percent_used?: number | string;
  computed_status?: string | null;
};

/** The API's budget statuses as the three the planner's badge knows. */
function budgetStatusFromApi(value: unknown): BudgetStatus | null {
  if (value === "overspent") return "Over budget";
  if (value === "near_limit") return "Nearly spent";
  if (value === "healthy") return "Within budget";
  // `upcoming`, `ended`, `paused` and `archived` describe where the budget is in
  // its life rather than how much of it is left — there's no spend badge for
  // those, so the local calculation answers instead.
  return null;
}

function budgetCategoryIds(row: ApiBudget): number[] {
  const raw =
    row.category_ids ??
    row.account_subcategory_ids ??
    row.categories?.map((category) => category.id ?? "") ??
    [];
  return raw
    .map((id) => Number(id))
    .filter((id): id is number => Number.isFinite(id));
}

/**
 * A budget, with its categories resolved to names.
 *
 * `categoryNames` maps `account_subcategory_id` to the label the form and card
 * show. An id the catalogue doesn't know is dropped from the names rather than
 * rendered as a number — but it stays in `categoryIds`, so saving the budget
 * back doesn't silently detach a category the lookup simply hadn't loaded.
 */
export function toBudget(
  row: ApiBudget,
  categoryNames: Map<number, string>,
): Budget {
  const ids = budgetCategoryIds(row);
  const inlineNames = new Map(
    (row.categories ?? [])
      .filter((category) => category.id != null && category.name)
      .map((category) => [Number(category.id), String(category.name)] as const),
  );

  return {
    id: String(row.id ?? ""),
    name: text(row.name),
    amount: money(row.amount),
    alertThreshold:
      row.alert_threshold_percent == null
        ? DEFAULT_ALERT_THRESHOLD
        : String(row.alert_threshold_percent),
    period: budgetPeriodFromApi(row.period_type),
    startDate: isoDay(row.start_date),
    endDate: isoDay(row.end_date),
    categories: ids
      .map((id) => categoryNames.get(id) ?? inlineNames.get(id) ?? "")
      .filter(Boolean),
    categoryIds: ids,
    notes: text(row.notes),
    repeatEnabled: Boolean(row.repeat_enabled),
    repeatFrequency: text(row.repeat_frequency) || undefined,
    serverSpent: optionalNum(row.spent),
    computedStatus: budgetStatusFromApi(row.computed_status),
  };
}

/**
 * What a budget form sends.
 *
 * The categories are resolved back to ids through the catalogue; a name the
 * catalogue can't place falls back to the ids the budget already carried, so
 * editing a budget whose categories loaded slowly can't drop them.
 */
export function budgetPayload(
  draft: BudgetDraft,
  categoryIdsByName: Map<string, number>,
) {
  const resolved = draft.categories
    .map((name) => categoryIdsByName.get(name))
    .filter((id): id is number => typeof id === "number");

  const periodType = BUDGET_PERIOD_TO_API[draft.period];

  return {
    name: draft.name.trim(),
    amount: Number(draft.amount),
    period_type: periodType,
    start_date: draft.startDate,
    end_date: draft.endDate || null,
    repeat_enabled: Boolean(draft.repeatEnabled),
    repeat_frequency:
      draft.repeatFrequency ?? (periodType === "custom" ? "none" : periodType),
    alert_threshold_percent: Number(
      draft.alertThreshold || DEFAULT_ALERT_THRESHOLD,
    ),
    notes: draft.notes,
    category_ids: resolved.length > 0 ? resolved : draft.categoryIds,
  };
}

/** One month's roll-up of budgeted, spent and remaining, from /budget/stats. */
export type BudgetMonthStat = {
  /** `YYYY-MM`. */
  month: string;
  budgeted: number;
  spent: number;
  remaining: number;
};

type ApiBudgetMonthStat = {
  month?: string;
  budgeted?: number | string;
  total_budgeted?: number | string;
  spent?: number | string;
  total_spent?: number | string;
  remaining?: number | string;
};

function toMonthStat(row: ApiBudgetMonthStat): BudgetMonthStat {
  const budgeted = num(row.budgeted ?? row.total_budgeted);
  const spent = num(row.spent ?? row.total_spent);
  return {
    month: text(row.month),
    budgeted,
    spent,
    remaining: optionalNum(row.remaining) ?? budgeted - spent,
  };
}

/**
 * The budget list and its per-month stats, together — the two calls the
 * reference frontend always makes as a pair, since the month headings are the
 * stats and the rows underneath them are the list.
 */
export async function fetchBudgets(): Promise<{
  budgets: Budget[];
  monthStats: BudgetMonthStat[];
}> {
  const categoryNames = await fetchExpenseCategoryNames();

  const [statsResult, listResult] = await Promise.all([
    api.get<ApiEnvelope<ApiBudgetMonthStat[]>>(apiRoutes.budget.stats),
    api.get<ApiEnvelope<ApiBudget[]>>(apiRoutes.budget.list, {
      params: { limit: 100 },
    }),
  ]);

  return {
    budgets: rows<ApiBudget>(listResult.data).map((row) =>
      toBudget(row, categoryNames),
    ),
    monthStats: rows<ApiBudgetMonthStat>(statsResult.data).map(toMonthStat),
  };
}

export async function createBudget(
  draft: BudgetDraft,
  categoryIdsByName: Map<string, number>,
): Promise<void> {
  await api.post(
    apiRoutes.budget.add,
    encryptedCreateBody(budgetPayload(draft, categoryIdsByName)),
  );
  track(EVENTS.BUDGET_CREATED, { amount: budgetAmount(draft) });
}

export async function updateBudget(
  id: string,
  draft: BudgetDraft,
  categoryIdsByName: Map<string, number>,
): Promise<void> {
  await api.put(
    apiRoutes.budget.update + id,
    buildEncryptedRequestBody(budgetPayload(draft, categoryIdsByName)),
  );
}

export async function deleteBudget(id: string): Promise<void> {
  await api.delete(apiRoutes.budget.delete + id);
}

/* ------------------------------------------------------------------ *
 * Budget expenses — what actually counts against a budget
 * ------------------------------------------------------------------ */

/**
 * One expense in relation to a budget, whether already linked or still
 * available to link.
 *
 * The two endpoints return different shapes — a linked row nests the expense
 * under `expense` and carries the `amount_allocated` that counts against the
 * budget, while an available row is the expense itself with a
 * `suggested_amount` — so both are normalised to this before any component
 * sees them.
 */
export type BudgetExpense = {
  /** The expense's own id. What attach and detach are addressed by. */
  id: string;
  name: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /**
   * What counts against the budget: the allocated amount for a linked expense,
   * or what would be allocated for an available one.
   */
  amount: number;
  paidWithCash: boolean;
  reconciled: boolean;
};

type ApiExpenseRow = {
  id?: number | string;
  name?: string | null;
  date?: string | null;
  price?: number | string | null;
  business_amount?: number | string | null;
  paid_with_cash?: string | boolean | null;
  is_reconciled?: string | boolean | null;
};

type ApiBudgetExpenseRow = ApiExpenseRow & {
  expense_id?: number | string;
  amount_allocated?: number | string | null;
  suggested_amount?: number | string | null;
  expense?: ApiExpenseRow;
};

/** The API writes these flags as 'yes'/'no' as often as booleans. */
function flag(value: unknown): boolean {
  return value === true || value === "yes" || value === 1 || value === "1";
}

function toBudgetExpense(row: ApiBudgetExpenseRow): BudgetExpense {
  const expense = row.expense ?? row;

  // What counts against the budget, in the order the API offers it: the agreed
  // allocation, then what it would allocate, then the business share, then the
  // full price. The same order the reference frontend reads.
  const amount =
    optionalNum(row.amount_allocated) ??
    optionalNum(row.suggested_amount) ??
    optionalNum(expense.business_amount) ??
    num(expense.price);

  return {
    id: String(row.expense?.id ?? row.expense_id ?? row.id ?? ""),
    name: text(expense.name) || "Expense",
    date: isoDay(expense.date),
    amount,
    paidWithCash: flag(expense.paid_with_cash),
    reconciled: flag(expense.is_reconciled),
  };
}

export type BudgetExpenseList = {
  expenses: BudgetExpense[];
  /** Everything the query matched, which may exceed what one page returned. */
  total: number;
};

function toBudgetExpenseList(payload: unknown): BudgetExpenseList {
  const data =
    (payload as ApiEnvelope<{
      expenses?: ApiBudgetExpenseRow[];
      pagination?: { total?: number };
    }>)?.data ?? {};

  const expenses = Array.isArray(data.expenses)
    ? data.expenses.map(toBudgetExpense)
    : rows<ApiBudgetExpenseRow>(payload).map(toBudgetExpense);

  return {
    expenses,
    total: optionalNum(data.pagination?.total) ?? expenses.length,
  };
}

/** The API caps a page at 100, which is also what the reference frontend asks for. */
const EXPENSE_PAGE_LIMIT = 100;

/** The expenses already counting against this budget. */
export async function fetchBudgetExpenses(
  budgetId: string,
): Promise<BudgetExpenseList> {
  const response = await api.get(apiRoutes.budget.expenses(budgetId), {
    params: { limit: EXPENSE_PAGE_LIMIT },
  });
  return toBudgetExpenseList(response.data);
}

/**
 * The expenses that could still be linked.
 *
 * The server does the narrowing: it returns only expenses inside the budget's
 * current cycle, in one of its categories, and not already linked. So an empty
 * result means there's genuinely nothing eligible — not that the search failed.
 */
export async function fetchAvailableBudgetExpenses(
  budgetId: string,
  search: string,
): Promise<BudgetExpenseList> {
  const response = await api.get(apiRoutes.budget.availableExpenses(budgetId), {
    params: {
      limit: EXPENSE_PAGE_LIMIT,
      ...(search.trim() ? { search: search.trim() } : {}),
    },
  });
  return toBudgetExpenseList(response.data);
}

/**
 * Counts an expense against this budget. The API allocates the business share
 * (or the full price where there isn't one) unless told otherwise, so no amount
 * is sent — the same call the reference frontend makes.
 */
export async function attachBudgetExpense(
  budgetId: string,
  expenseId: string,
): Promise<void> {
  await api.post(
    apiRoutes.budget.expenses(budgetId),
    encryptedCreateBody({ expense_id: Number(expenseId) }),
  );
}

/** Stops an expense counting against this budget. The expense itself is untouched. */
export async function detachBudgetExpense(
  budgetId: string,
  expenseId: string,
): Promise<void> {
  await api.delete(apiRoutes.budget.expense(budgetId, expenseId));
}

/* ------------------------------------------------------------------ *
 * Expense categories — the account subcategories a budget covers
 * ------------------------------------------------------------------ */

/** The account category the expense subcategories hang off. */
const EXPENSE_ACCOUNT_CATEGORY_ID = 1;

export type PlannerCategory = { id: number; name: string };

type ApiAccountSubcategory = {
  account_subcategory_id?: number | string;
  id?: number | string;
  account_subcategory_name?: string;
  name?: string;
};

type ApiAccountCategory = {
  account_category_id?: number | string;
  name?: string;
  account_subcategories?: ApiAccountSubcategory[];
};

/**
 * The expense categories a budget can cover.
 *
 * Cached for the session: the list is a chart of accounts that doesn't move
 * while someone is filling in a form, and both the budget list and the budget
 * form need it.
 */
let categoryCache: Promise<PlannerCategory[]> | null = null;

export function fetchExpenseCategories(): Promise<PlannerCategory[]> {
  categoryCache ??= (async () => {
    try {
      const response = await api.get<
        ApiEnvelope<{ account_categories?: ApiAccountCategory[] }>
      >(apiRoutes.accountCategory.list);

      const categories = response.data?.data?.account_categories ?? [];
      return categories
        .filter(
          (category) =>
            Number(category.account_category_id) ===
            EXPENSE_ACCOUNT_CATEGORY_ID,
        )
        .flatMap((category) => category.account_subcategories ?? [])
        .map((sub) => ({
          id: Number(sub.account_subcategory_id ?? sub.id),
          name: text(sub.account_subcategory_name ?? sub.name),
        }))
        .filter((category) => Number.isFinite(category.id) && category.name);
    } catch {
      // A chart of accounts that didn't load shouldn't take the budget list
      // down with it — the budgets still render, with their category names
      // resolved from whatever the rows carried inline.
      categoryCache = null;
      return [];
    }
  })();

  return categoryCache;
}

async function fetchExpenseCategoryNames(): Promise<Map<number, string>> {
  const categories = await fetchExpenseCategories();
  return new Map(categories.map((category) => [category.id, category.name]));
}

/* ------------------------------------------------------------------ *
 * Expense plans — /expense-plan
 * ------------------------------------------------------------------ */

type ApiPlanLine = {
  id?: number | string | null;
  name?: string;
  planned_amount?: number | string;
  actual_amount?: number | string;
  ledger_source?: string | null;
  line_status?: string | null;
  sort_order?: number;
};

export type ApiExpensePlan = {
  id?: number | string;
  name?: string;
  plan_type?: string | null;
  funding_source?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  expected_revenue?: number | string | null;
  total_planned?: number | string;
  total_actual?: number | string;
  variance?: number | string;
  funding_required?: number | string;
  roi?: number | string | null;
  payback_months?: number | string | null;
  computed_status?: string | null;
  lines?: ApiPlanLine[];
};

function planStatusFromApi(value: unknown): PlanStatus | null {
  if (value === "on_track") return "On track";
  if (value === "funding_gap") return "Funding gap";
  return null;
}

/** An unrecognised stored value falls back to the first option, as the form does. */
function planTypeFromApi(value: unknown): PlanType {
  const match = PLAN_TYPES.find((option) => option === value);
  return match ?? "Expansion";
}

function fundingSourceFromApi(value: unknown): PlanFundingSource {
  const match = PLAN_FUNDING_SOURCES.find((option) => option === value);
  return match ?? "Cash";
}

function lineStatusFromApi(value: unknown): BudgetLineStatus {
  const match = BUDGET_LINE_STATUSES.find((option) => option === value);
  return match ?? "Planned";
}

function toPlanLine(row: ApiPlanLine, index: number): PlanBudgetLine {
  return {
    // A line the API hasn't given an id to yet still needs a stable React key,
    // and its position is the only thing that identifies it.
    id: row.id == null ? `new-${index}` : String(row.id),
    name: text(row.name),
    planned: money(row.planned_amount),
    actual: money(row.actual_amount),
    ledgerSource: text(row.ledger_source),
    status: lineStatusFromApi(row.line_status),
  };
}

export function toPlan(row: ApiExpensePlan): ExpensePlan {
  return {
    id: String(row.id ?? ""),
    name: text(row.name),
    type: planTypeFromApi(row.plan_type),
    fundingSource: fundingSourceFromApi(row.funding_source),
    startDate: isoDay(row.planned_start_date),
    endDate: isoDay(row.planned_end_date),
    expectedRevenue: money(row.expected_revenue),
    lines: (row.lines ?? []).map(toPlanLine),
    computedStatus: planStatusFromApi(row.computed_status),
  };
}

/** The plan itself. Its lines are saved separately, through `upsertLines`. */
function planPayload(draft: ExpensePlanDraft) {
  return {
    name: draft.name.trim(),
    plan_type: draft.type || null,
    funding_source: draft.fundingSource || null,
    planned_start_date: draft.startDate || null,
    planned_end_date: draft.endDate || null,
    expected_revenue:
      draft.expectedRevenue === "" ? null : Number(draft.expectedRevenue),
  };
}

/**
 * The lines, in the order they're shown — `sort_order` is what preserves that
 * order, since the API returns them as a plain list.
 *
 * A line whose id was minted locally goes up as a new line rather than as an
 * edit to something that doesn't exist.
 */
function linesPayload(lines: PlanBudgetLine[]) {
  return {
    lines: lines.map((line, index) => ({
      id: line.id.startsWith("new-") || line.id.startsWith("line-")
        ? null
        : Number(line.id),
      name: line.name,
      planned_amount: line.planned === "" ? 0 : Number(line.planned),
      actual_amount: line.actual === "" ? 0 : Number(line.actual),
      ledger_source: line.ledgerSource || "",
      line_status: line.status,
      sort_order: index,
    })),
  };
}

export async function fetchPlans(): Promise<ExpensePlan[]> {
  const response = await api.get<ApiEnvelope<ApiExpensePlan[]>>(
    apiRoutes.expensePlan.list,
  );
  return rows<ApiExpensePlan>(response.data).map(toPlan);
}

/**
 * Saves a plan and its lines, in that order — a new plan has to exist before
 * there's anything to hang lines off. The lines call answers with the whole
 * plan, recomputed, which is what the caller keeps.
 */
export async function savePlan(
  id: string | null,
  draft: ExpensePlanDraft,
): Promise<ExpensePlan> {
  let planId = id;

  if (planId) {
    await api.put(
      apiRoutes.expensePlan.update(planId),
      buildEncryptedRequestBody(planPayload(draft)),
    );
  } else {
    const created = await api.post<ApiEnvelope<ApiExpensePlan>>(
      apiRoutes.expensePlan.add,
      encryptedCreateBody(planPayload(draft)),
    );
    planId = String(created.data?.data?.id ?? "");
  }

  const response = await api.put<ApiEnvelope<ApiExpensePlan>>(
    apiRoutes.expensePlan.upsertLines(planId),
    // The lines travel as a nested array, which the encryption passes through
    // untouched — so a new line's `id: null` still arrives as null.
    buildEncryptedRequestBody(linesPayload(draft.lines)),
  );
  return toPlan(response.data?.data ?? {});
}

export async function deletePlan(id: string): Promise<void> {
  await api.delete(apiRoutes.expensePlan.delete(id));
}

/* ------------------------------------------------------------------ *
 * Cash wallet and funding — /goal-funding
 * ------------------------------------------------------------------ */

export type CashWallet = {
  balance: number;
  /** Already earmarked against goals. */
  allocated: number;
  /** What's left to earmark: balance less allocated. */
  available: number;
};

type ApiCashWallet = {
  balance?: number | string;
  allocated?: number | string;
  available?: number | string;
};

function toWallet(row: ApiCashWallet | null | undefined): CashWallet {
  const balance = num(row?.balance);
  const allocated = num(row?.allocated);
  return {
    balance,
    allocated,
    available: optionalNum(row?.available) ?? balance - allocated,
  };
}

type ApiWalletMovement = {
  id?: number | string;
  amount?: number | string;
  note?: string | null;
  created_at?: string | null;
  movement_date?: string | null;
};

function toMovement(row: ApiWalletMovement): WalletMovement {
  return {
    id: String(row.id ?? ""),
    date: isoDay(row.movement_date ?? row.created_at),
    amount: num(row.amount),
    note: text(row.note),
  };
}

export async function fetchCashWallet(): Promise<CashWallet> {
  const response = await api.get<ApiEnvelope<ApiCashWallet>>(
    apiRoutes.goalFunding.cashWallet,
  );
  return toWallet(response.data?.data);
}

export async function fetchCashWalletHistory(): Promise<WalletMovement[]> {
  const response = await api.get<ApiEnvelope<ApiWalletMovement[]>>(
    apiRoutes.goalFunding.cashWalletHistory,
  );
  return rows<ApiWalletMovement>(response.data).map(toMovement);
}

/** Adds cash to the wallet. The API answers with the new wallet figures. */
export async function topUpCashWallet(
  amount: number,
  note: string,
): Promise<CashWallet> {
  const response = await api.post<ApiEnvelope<ApiCashWallet>>(
    apiRoutes.goalFunding.cashWalletTopup,
    encryptedCreateBody({ amount, note: note || null }),
  );
  return toWallet(response.data?.data);
}

/**
 * Takes cash back out of the wallet. Recorded as a negative movement, so the
 * history reads as one ordered ledger rather than two lists to merge.
 *
 * The API refuses to take the balance below what goals have already earmarked;
 * that cash is spoken for.
 */
export async function withdrawFromCashWallet(
  amount: number,
  note: string,
): Promise<CashWallet> {
  const response = await api.post<ApiEnvelope<ApiCashWallet>>(
    apiRoutes.goalFunding.cashWalletWithdraw,
    encryptedCreateBody({ amount, note: note || null }),
  );
  return toWallet(response.data?.data);
}

/** Removes one movement and reverses its effect on the balance. */
export async function removeCashWalletMovement(
  id: string,
): Promise<CashWallet> {
  const response = await api.delete<ApiEnvelope<ApiCashWallet>>(
    apiRoutes.goalFunding.cashWalletMovement(id),
  );
  return toWallet(response.data?.data);
}

/** Sets the wallet balance outright, rather than moving it by an amount. */
export async function setCashWalletBalance(
  balance: number,
): Promise<CashWallet> {
  const response = await api.put<ApiEnvelope<ApiCashWallet>>(
    apiRoutes.goalFunding.cashWallet,
    buildEncryptedRequestBody({ balance }),
  );
  return toWallet(response.data?.data);
}

/** A bank account a goal can be funded from, with what's left to earmark. */
export type FundingBankAccount = {
  id: number;
  name: string;
  balance: number;
  available: number;
};

export type FundingSummary = {
  cash: CashWallet;
  bankAccounts: FundingBankAccount[];
};

type ApiFundingSummary = {
  cash?: ApiCashWallet;
  bank_accounts?: {
    id?: number | string;
    bank_name?: string;
    balance?: number | string;
    available?: number | string;
  }[];
};

/**
 * Every account a goal allocation can draw on, and how much of each is still
 * unspoken for. This is what stops the same dollar being earmarked twice.
 */
export async function fetchFundingSummary(): Promise<FundingSummary> {
  const response = await api.get<ApiEnvelope<ApiFundingSummary>>(
    apiRoutes.goalFunding.summary,
  );
  const data = response.data?.data ?? {};

  return {
    cash: toWallet(data.cash),
    bankAccounts: (data.bank_accounts ?? []).map((account) => ({
      id: Number(account.id),
      name: text(account.bank_name),
      balance: num(account.balance),
      available: num(account.available),
    })),
  };
}

/**
 * The funding summary as the goal form's source list.
 *
 * The API has already taken off what's earmarked from each account, so
 * `available` is read straight from it rather than recomputed here — the server
 * counts every goal, while this screen only knows about the ones it loaded.
 */
export function fundingSourcesFromSummary(
  summary: FundingSummary,
): FundingSource[] {
  return [
    ...summary.bankAccounts.map((account) => ({
      name: account.name,
      detail: "",
      balance: account.balance,
      available: account.available,
      kind: "bank" as const,
      bankAccountId: account.id,
    })),
    {
      name: "Cash wallet",
      detail: "",
      balance: summary.cash.balance,
      available: summary.cash.available,
      kind: "wallet" as const,
      bankAccountId: null,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Overview — /planner-overview
 * ------------------------------------------------------------------ */

export type PlannerOverviewData = {
  cashWalletBalance: number;
  goals: {
    total: number;
    onTrack: number;
    behind: number;
    complete: number;
    totalAllocated: number;
  };
  plans: {
    total: number;
    onTrack: number;
    withGap: number;
    totalFundingGaps: number;
    forecastAnnualReturn: number;
    committedToPlans: number;
    /** Per-plan returns, for the forecast chart. */
    rows: { id: string; name: string; annualReturn: number }[];
  };
};

type ApiPlannerOverview = {
  cash_wallet_balance?: number | string;
  goals_summary?: {
    total?: number;
    on_track?: number;
    behind?: number;
    complete?: number;
    total_allocated?: number | string;
  };
  expense_plans_summary?: {
    total?: number;
    on_track?: number;
    with_gap?: number;
    total_funding_gaps?: number | string;
    forecast_annual_return?: number | string;
    committed_to_plans?: number | string;
    plans?: {
      id?: number | string;
      name?: string;
      annual_return?: number | string;
      expected_revenue?: number | string;
    }[];
  };
};

export async function fetchPlannerOverview(): Promise<PlannerOverviewData> {
  const response = await api.get<ApiEnvelope<ApiPlannerOverview>>(
    apiRoutes.plannerOverview.get,
  );
  const data = response.data?.data ?? {};
  const goals = data.goals_summary ?? {};
  const plans = data.expense_plans_summary ?? {};

  return {
    cashWalletBalance: num(data.cash_wallet_balance),
    goals: {
      total: num(goals.total),
      onTrack: num(goals.on_track),
      behind: num(goals.behind),
      complete: num(goals.complete),
      totalAllocated: num(goals.total_allocated),
    },
    plans: {
      total: num(plans.total),
      onTrack: num(plans.on_track),
      withGap: num(plans.with_gap),
      totalFundingGaps: num(plans.total_funding_gaps),
      forecastAnnualReturn: num(plans.forecast_annual_return),
      committedToPlans: num(plans.committed_to_plans),
      rows: (plans.plans ?? []).map((plan) => ({
        id: String(plan.id ?? ""),
        name: text(plan.name),
        annualReturn: num(plan.annual_return ?? plan.expected_revenue),
      })),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Bank accounts — the balances the Overview counts as cash
 * ------------------------------------------------------------------ */

type ApiBankAccount = {
  id?: number | string;
  bank_name?: string;
  name?: string;
  account_number?: string | null;
  masked_account_number?: string | null;
  balance?: number | string;
};

/**
 * The connected bank accounts, as the signed-in user.
 *
 * No `userId` is sent: the endpoint identifies the owner from the session, so
 * passing one would be both redundant and a claim the server is right to
 * ignore. An accountant acting for a client gets that client's accounts,
 * because the session already resolves to them.
 */
export async function fetchPlannerBankAccounts(): Promise<BankAccountBalance[]> {
  const response = await api.get<
    ApiEnvelope<{ accounts?: ApiBankAccount[] }>
  >(apiRoutes.bankAccounts.list);

  return (response.data?.data?.accounts ?? []).map((account) => ({
    id: String(account.id ?? ""),
    name: text(account.bank_name ?? account.name),
    detail: text(account.masked_account_number ?? account.account_number),
    balance: num(account.balance),
  }));
}
