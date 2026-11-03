/**
 * Business planner domain: savings goals, category budgets and expense plans.
 *
 * Every figure here is derived rather than stored — a goal keeps its target and
 * its allocations, and everything else (progress, required weekly, status) is
 * computed. That's what lets the forms update live as you type, and it's why
 * there's no way for a stored percentage to disagree with the amounts.
 *
 * Money fields hold typed text, per the platform rule that a numeric input
 * accepts what you type and shows a live error rather than blocking keystrokes.
 */
import { EXPENSE_CATEGORIES, type Expense } from "@/lib/expenses";
import { invoiceMoney, formatInvoiceDate, parseIsoDate } from "@/lib/invoices";

export const PLANNER_TABS = [
  "Overview",
  "Goals",
  "Budget",
  "Business planner",
] as const;
export type PlannerTab = (typeof PLANNER_TABS)[number];

/* ------------------------------------------------------------------ *
 * Cash accounts
 * ------------------------------------------------------------------ */

export type CashAccount = {
  name: string;
  /** Masked digits for a bank account; empty for the cash wallet. */
  detail: string;
  balance: number;
  kind: "bank" | "wallet";
};

/**
 * A connected bank account, as the planner needs it: what it's called, how it's
 * recognised, and what it holds.
 *
 * Declared here rather than in the API layer so the domain functions below
 * don't have to reach into it — lib/planner-api produces this shape from
 * `/bank/accounts`.
 */
export type BankAccountBalance = {
  id: string;
  name: string;
  /** The masked digits the account is recognised by. */
  detail: string;
  balance: number;
};

/**
 * A movement in or out of the cash wallet. Negative takes money out.
 *
 * The wallet keeps its movements rather than just a balance, so the wallet page
 * can show a history — and so the balance is the sum of things that happened
 * rather than a figure typed over the last one.
 */
export type WalletMovement = {
  id: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Positive is cash in, negative is cash out. */
  amount: number;
  note: string;
};

/** The wallet balance: what it opened with, plus every movement since. */
export function walletBalance(
  opening: number,
  movements: WalletMovement[],
): number {
  return movements.reduce((sum, movement) => sum + movement.amount, opening);
}

/** Cash in and cash out, for the wallet page's summary. */
export function walletTotals(movements: WalletMovement[]) {
  return movements.reduce(
    (acc, movement) => {
      if (movement.amount >= 0) acc.in += movement.amount;
      else acc.out += Math.abs(movement.amount);
      return acc;
    },
    { in: 0, out: 0 },
  );
}

/**
 * Every account the planner counts as cash: the connected bank accounts, and
 * the wallet, which is the planner's own because nothing else on the platform
 * holds it.
 *
 * The bank accounts are passed in rather than read from anywhere here — they
 * come from the bank feed, and a function that fetched them couldn't be used by
 * a form recomputing as you type.
 */
export function cashAccounts(
  wallet: number,
  banks: BankAccountBalance[] = [],
): CashAccount[] {
  return [
    ...banks.map((account) => ({
      name: account.name,
      detail: account.detail,
      balance: account.balance,
      kind: "bank" as const,
    })),
    {
      name: "Cash wallet",
      detail: "",
      balance: wallet,
      kind: "wallet" as const,
    },
  ];
}

/**
 * A cash account with what's left of it after everything already earmarked
 * against it.
 *
 * `balance` is what the account holds; `available` is what you could still
 * earmark. They differ once anything has been allocated from it, and the gap is
 * the whole point — allocating twice from the same dollar is the mistake this
 * screen exists to prevent.
 */
export type FundingSource = CashAccount & {
  available: number;
  /**
   * The bank account this draws on, when it's a bank. Null for the wallet.
   * It's what the allocation request identifies the source by, so it travels
   * with the option the form shows rather than being looked up again by name.
   */
  bankAccountId?: number | null;
};

/** Every account, with what's already earmarked from each taken off. */
export function fundingSources(
  wallet: number,
  goals: Goal[],
  banks: BankAccountBalance[] = [],
): FundingSource[] {
  return cashAccounts(wallet, banks).map((account) => {
    const claimed = goals.reduce(
      (sum, goal) =>
        sum +
        goal.allocations
          .filter((allocation) => allocation.source === account.name)
          .reduce((inner, allocation) => inner + allocation.amount, 0),
      0,
    );
    return {
      ...account,
      // Floored: an account earmarked past its balance has nothing available,
      // not a negative amount to offer.
      available: Math.max(0, account.balance - claimed),
    };
  });
}

/** Cash on hand across every account — banks and the wallet together. */
export function cashOnHand(
  wallet: number,
  banks: BankAccountBalance[] = [],
): number {
  return cashAccounts(wallet, banks).reduce(
    (sum, account) => sum + account.balance,
    0,
  );
}

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

/**
 * The goal types the API stores, in the reference frontend's own order.
 *
 * These are display labels; `GOAL_TYPE_TO_API` maps each to the `goal_type`
 * enum the backend persists (`tax_set_aside`, `insurance`, …). Keeping the two
 * sides in one place is what stops a goal saved as "Insurance" coming back as
 * something else.
 */
export const GOAL_TYPES = [
  "Tax set-aside",
  "Insurance",
  "Equipment",
  "Buffer",
  "Other",
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

/** Display label → the `goal_type` value the API stores. */
export const GOAL_TYPE_TO_API: Record<GoalType, string> = {
  "Tax set-aside": "tax_set_aside",
  Insurance: "insurance",
  Equipment: "equipment",
  Buffer: "buffer",
  Other: "other",
};

/** The reverse, for reading a goal back. Unknown values fall back to Other. */
export function goalTypeFromApi(value: string | null | undefined): GoalType {
  const match = GOAL_TYPES.find((type) => GOAL_TYPE_TO_API[type] === value);
  return match ?? "Other";
}

/** What each type is for, shown under the selector. */
export const GOAL_TYPE_HINTS: Record<GoalType, string> = {
  "Tax set-aside":
    "The GST and tax you've collected, held back so it's there when the BAS falls due. Detailed tax and BAS logic stays in the Tax section — this goal only tracks the set-aside.",
  Insurance: "Saving towards a policy renewal, so it isn't a lump you didn't plan for.",
  Equipment: "Saving towards a purchase — a van, a laptop, a machine.",
  Buffer: "A cushion for quiet months, so a slow invoice isn't a crisis.",
  Other: "Anything else you're putting money aside for.",
};

export type GoalAllocation = {
  id: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  amount: number;
  /** Which cash account it was earmarked from. */
  source: string;
  note: string;
};

export type Goal = {
  id: string;
  name: string;
  type: GoalType;
  /** Typed text; parsed by `goalTarget`. */
  targetAmount: string;
  /**
   * ISO `YYYY-MM-DD`, empty until chosen. Deliberately not defaulted to today:
   * a target date of "today" would make a brand-new goal instantly overdue.
   */
  targetDate: string;
  /** ISO. When the goal was created — the baseline for judging pace. */
  created: string;
  allocations: GoalAllocation[];
  /**
   * The status the API settled on, present only on a saved goal. It wins over
   * the local calculation so the list can't disagree with the server about a
   * record it just read; an unsaved draft has none and is judged locally.
   */
  computedStatus?: GoalStatus | null;
};

export type GoalDraft = Omit<
  Goal,
  "id" | "created" | "allocations" | "computedStatus"
>;

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function goalTarget(goal: Pick<Goal, "targetAmount">): number {
  return toNumber(goal.targetAmount);
}

export function goalAllocated(goal: Pick<Goal, "allocations">): number {
  return goal.allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );
}

export function goalRemaining(
  goal: Pick<Goal, "targetAmount" | "allocations">,
): number {
  return Math.max(0, goalTarget(goal) - goalAllocated(goal));
}

/** 0–1. Zero while there's no target, rather than dividing by nothing. */
export function goalProgress(
  goal: Pick<Goal, "targetAmount" | "allocations">,
): number {
  const target = goalTarget(goal);
  if (target <= 0) return 0;
  return Math.min(1, goalAllocated(goal) / target);
}

/** Whole weeks between two ISO dates; never negative. */
export function weeksBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return 0;
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(days / 7));
}

/**
 * What to set aside each week to arrive on time.
 *
 * Null — not zero — when the goal can't answer the question yet: no target, no
 * date, or a date that has passed. A number here would be a guess presented as
 * advice, which is the bug this planner is replacing.
 */
export function requiredWeekly(
  goal: Pick<Goal, "targetAmount" | "targetDate" | "allocations">,
  todayIso: string,
): number | null {
  if (!goalIsMeasurable(goal)) return null;
  const remaining = goalRemaining(goal);
  if (remaining <= 0) return 0;
  const weeks = weeksBetween(todayIso, goal.targetDate);
  if (weeks <= 0) return null;
  return remaining / weeks;
}

/**
 * Whether the goal has enough on it to say anything about progress at all.
 *
 * A goal with no target amount or no target date isn't behind — it's unfinished.
 * Everything status-shaped is gated on this.
 */
export function goalIsMeasurable(
  goal: Pick<Goal, "targetAmount" | "targetDate">,
): boolean {
  return goalTarget(goal) > 0 && !!goal.targetDate;
}

export type GoalStatus = "Complete" | "On track" | "Behind";

/** Null while the goal isn't measurable — no badge at all, not a neutral one. */
export function goalStatus(
  goal: Pick<
    Goal,
    "targetAmount" | "targetDate" | "created" | "allocations"
  > & { computedStatus?: GoalStatus | null },
  todayIso: string,
): GoalStatus | null {
  if (!goalIsMeasurable(goal)) return null;
  if (goal.computedStatus) return goal.computedStatus;
  if (goalAllocated(goal) >= goalTarget(goal)) return "Complete";

  const total = weeksBetween(goal.created, goal.targetDate);
  const elapsed = weeksBetween(goal.created, todayIso);
  // Past its date and not complete: behind, whatever the pace was.
  if (total === 0 || elapsed >= total) return "Behind";

  const expected = elapsed / total;
  return goalProgress(goal) + 0.001 >= expected ? "On track" : "Behind";
}

export function goalStatusVariant(
  status: GoalStatus,
): "success" | "warning" | "secondary" {
  if (status === "Complete") return "success";
  return status === "On track" ? "success" : "warning";
}

/** True only when there's a real target and it's been met. */
export function goalFullyAllocated(
  goal: Pick<Goal, "targetAmount" | "allocations">,
): boolean {
  return goalTarget(goal) > 0 && goalRemaining(goal) <= 0;
}

/**
 * The line above the allocation block. A $0 target can't be "fully allocated",
 * so it says what to do instead.
 */
export function allocationMessage(
  goal: Pick<Goal, "targetAmount" | "allocations">,
): { text: string; tone: "success" | "muted" } {
  if (goalTarget(goal) <= 0) {
    return {
      text: "Set a target amount to start allocating.",
      tone: "muted",
    };
  }
  if (goalFullyAllocated(goal)) {
    return { text: "Goal is fully allocated.", tone: "success" };
  }
  return {
    text: `${invoiceMoney(goalRemaining(goal))} left to allocate.`,
    tone: "muted",
  };
}

/**
 * What to put aside each week, and until when.
 *
 * Null wherever the advice would be a guess: an unmeasurable goal, a target
 * already met, or a date that has passed — the last of which needs a different
 * sentence, not a bigger number.
 */
export function pacingLine(
  goal: Pick<Goal, "targetAmount" | "targetDate" | "allocations">,
  todayIso: string,
): string | null {
  const weekly = requiredWeekly(goal, todayIso);
  if (weekly === null || weekly <= 0) return null;
  return `Set aside ${invoiceMoney(weekly)}/wk until ${formatInvoiceDate(goal.targetDate)} to stay on track.`;
}

/** How the goal's contribution rule reads in the sidebar. */
export function contributionRule(
  goal: Pick<Goal, "targetAmount" | "targetDate" | "allocations">,
  todayIso: string,
): string {
  if (!goalIsMeasurable(goal)) {
    return "Set a target amount and date, and Sole works out what to put aside each week.";
  }
  const weekly = requiredWeekly(goal, todayIso);
  if (weekly === null) {
    return `The target date has passed. ${invoiceMoney(goalRemaining(goal))} is still unallocated.`;
  }
  if (weekly === 0) {
    return "The target is fully allocated — nothing more needs to go aside.";
  }
  const weeks = weeksBetween(todayIso, goal.targetDate);
  return `${invoiceMoney(goalRemaining(goal))} over ${weeks} ${weeks === 1 ? "week" : "weeks"} is ${invoiceMoney(weekly)} a week.`;
}

/* ------------------------------------------------------------------ *
 * Budgets
 * ------------------------------------------------------------------ */

/**
 * The budget periods the API stores, in the reference frontend's own order.
 *
 * Each carries the span it covers, which is what derives the end date when a
 * period is chosen — the same `getAutoEndDate` behaviour as the reference
 * form, where picking "Quarterly" fills the end date three months out and only
 * "Custom" leaves you to type one.
 */
export const BUDGET_PERIODS = [
  "Weekly",
  "Monthly",
  "Quarterly",
  "6 months",
  "Yearly",
  "Custom",
] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/** Display label → the `period_type` value the API stores. */
export const BUDGET_PERIOD_TO_API: Record<BudgetPeriod, string> = {
  Weekly: "weekly",
  Monthly: "monthly",
  Quarterly: "quarterly",
  "6 months": "six_monthly",
  Yearly: "yearly",
  Custom: "custom",
};

/** The reverse. Unknown values fall back to Monthly, the API's own default. */
export function budgetPeriodFromApi(
  value: string | null | undefined,
): BudgetPeriod {
  const match = BUDGET_PERIODS.find(
    (period) => BUDGET_PERIOD_TO_API[period] === value,
  );
  return match ?? "Monthly";
}

/** How long each period runs. Custom has no span — that's what makes it custom. */
const BUDGET_PERIOD_SPAN: Record<
  BudgetPeriod,
  { days?: number; months?: number }
> = {
  Weekly: { days: 7 },
  Monthly: { months: 1 },
  Quarterly: { months: 3 },
  "6 months": { months: 6 },
  Yearly: { months: 12 },
  Custom: {},
};

/**
 * The end date a period implies, given its start — what the form fills in when
 * you pick a period. Empty for Custom, and for a start date that isn't set yet.
 */
export function budgetAutoEndDate(
  startDate: string,
  period: BudgetPeriod,
): string {
  const span = BUDGET_PERIOD_SPAN[period];
  const start = parseIsoDate(startDate);
  if (!start || !span || (!span.days && !span.months)) return "";

  if (span.days) {
    const end = new Date(start);
    end.setDate(end.getDate() + span.days);
    return isoDate(end);
  }

  // Month arithmetic, clamped: adding a month to 31 Jan lands on 28/29 Feb
  // rather than rolling into March, matching the reference form's addMonths.
  const dayOfMonth = start.getDate();
  const end = new Date(start);
  end.setDate(1);
  end.setMonth(end.getMonth() + (span.months ?? 0));
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  end.setDate(Math.min(dayOfMonth, lastDay));
  return isoDate(end);
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Where the alert threshold starts, in percent. */
export const DEFAULT_ALERT_THRESHOLD = "80";

export type Budget = {
  id: string;
  name: string;
  /** Typed text. */
  amount: string;
  /**
   * The percentage of the amount at which the budget reads "Nearly spent".
   * Typed text, in percent.
   */
  alertThreshold: string;
  period: BudgetPeriod;
  /**
   * The window. Required when the period is Custom, which has no calendar to
   * derive one from; for the calendar periods these record intent and the spend
   * window still comes from the calendar.
   */
  startDate: string;
  endDate: string;
  /**
   * The expense categories this envelope covers, by name, so actual spend can
   * be read from the ledger and the card has something to label itself with.
   * At least one, or there would be nothing to read.
   */
  categories: string[];
  /**
   * The same categories as the `account_subcategory_id`s the API stores them
   * as. Held alongside the names because the names are what the form shows and
   * the ids are what saves — resolving one from the other needs the account
   * catalogue, which isn't always loaded when a budget is written back.
   */
  categoryIds: number[];
  notes: string;
  /** Whether the budget rolls into the next period. Round-tripped, not shown. */
  repeatEnabled?: boolean;
  /** The API's `repeat_frequency`. Round-tripped, not shown. */
  repeatFrequency?: string;
  /**
   * Spend against this budget as the API computed it, present only on a saved
   * budget. It wins over the ledger reading below, which stays as the answer
   * for a budget being edited and for a server that returned no figure.
   */
  serverSpent?: number | null;
  /** The status the API settled on. Wins over the local calculation, as above. */
  computedStatus?: BudgetStatus | null;
};

export type BudgetDraft = Omit<
  Budget,
  "id" | "serverSpent" | "computedStatus"
>;

export function budgetAmount(budget: Pick<Budget, "amount">): number {
  return toNumber(budget.amount);
}

/**
 * The alert percentage as a 0–1 fraction, falling back to the default rather
 * than to zero — a blank or nonsense threshold shouldn't make every budget
 * read as nearly spent.
 */
export function budgetThreshold(
  budget: Pick<Budget, "alertThreshold">,
): number {
  const percent = toNumber(budget.alertThreshold);
  if (percent <= 0 || percent > 100) return toNumber(DEFAULT_ALERT_THRESHOLD) / 100;
  return percent / 100;
}

/**
 * The span of dates a budget's spend is read from.
 *
 * Every budget carries a start date, and every period but Custom derives its
 * end date from that start — so the typed window is the window, for all of
 * them. That's how the API scopes spend too, which is what keeps this fallback
 * agreeing with the server figure it stands in for.
 *
 * A budget with no dates at all falls back to the current calendar period, so a
 * half-filled draft still shows something rather than nothing.
 */
function budgetWindow(
  budget: Pick<Budget, "period" | "startDate" | "endDate">,
  todayIso: string,
): { from: string; to: string } {
  if (budget.startDate) {
    const derived =
      budget.endDate || budgetAutoEndDate(budget.startDate, budget.period);
    return { from: budget.startDate, to: derived || "9999-12-31" };
  }

  const [year, month] = todayIso.split("-").map(Number);
  const from =
    budget.period === "Yearly"
      ? `${year}-01-01`
      : budget.period === "Quarterly"
        ? `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
        : `${year}-${String(month).padStart(2, "0")}-01`;
  return { from, to: budget.endDate || "9999-12-31" };
}

/**
 * Actual spend against a budget, read from the expense ledger rather than
 * entered — a budget you have to keep up to date by hand tells you nothing.
 */
export function budgetActual(
  budget: Budget,
  expenses: Expense[],
  todayIso: string,
): number {
  // A saved budget's spend is whatever the API computed; the ledger reading is
  // the answer only while there's no server figure to defer to.
  if (budget.serverSpent != null) return budget.serverSpent;

  const { from, to } = budgetWindow(budget, todayIso);
  return expenses
    .filter(
      (expense) =>
        budget.categories.includes(expense.category) &&
        expense.date >= from &&
        expense.date <= to,
    )
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function budgetRemaining(
  budget: Budget,
  expenses: Expense[],
  todayIso: string,
): number {
  return budgetAmount(budget) - budgetActual(budget, expenses, todayIso);
}

/** 0–1, capped so an overspend doesn't render a bar wider than its track. */
export function budgetProgress(
  budget: Budget,
  expenses: Expense[],
  todayIso: string,
): number {
  const amount = budgetAmount(budget);
  if (amount <= 0) return 0;
  return Math.min(1, budgetActual(budget, expenses, todayIso) / amount);
}

export type BudgetStatus = "Within budget" | "Nearly spent" | "Over budget";

export function budgetStatus(
  budget: Budget,
  expenses: Expense[],
  todayIso: string,
): BudgetStatus | null {
  if (budget.computedStatus) return budget.computedStatus;
  const amount = budgetAmount(budget);
  if (amount <= 0) return null;
  const ratio = budgetActual(budget, expenses, todayIso) / amount;
  if (ratio > 1) return "Over budget";
  // The typed threshold decides this, so the field on the form is the one that
  // moves the badge rather than a constant hidden in here.
  return ratio >= budgetThreshold(budget) ? "Nearly spent" : "Within budget";
}

/** "Subscriptions" for one, "3 categories" past that — a card has one line. */
export function budgetCategoryLabel(
  budget: Pick<Budget, "categories">,
): string {
  if (budget.categories.length === 0) return "No categories";
  if (budget.categories.length === 1) return budget.categories[0];
  return `${budget.categories.length} categories`;
}

/** "$700 monthly · 3 categories" — the toast's confirmation line. */
export function budgetSummaryLine(draft: BudgetDraft): string {
  const amount = budgetAmount(draft);
  const money = amount > 0 ? invoiceMoney(amount) : "No amount";
  return `${money} ${draft.period.toLowerCase()} · ${budgetCategoryLabel(draft).toLowerCase()}`;
}

export function budgetStatusVariant(
  status: BudgetStatus,
): "success" | "warning" | "danger" {
  if (status === "Over budget") return "danger";
  return status === "Nearly spent" ? "warning" : "success";
}

/* ------------------------------------------------------------------ *
 * Expense plans
 * ------------------------------------------------------------------ */

/**
 * Plan types and funding sources are stored as the labels themselves — the API
 * keeps `plan_type` and `funding_source` as free text rather than an enum, so
 * these lists are both what's shown and what's sent.
 */
export const PLAN_TYPES = [
  "Expansion",
  "Asset Purchase",
  "Internal project",
  "Marketing campaign",
  "Client job",
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_FUNDING_SOURCES = [
  "Cash",
  "Business Loan",
  "Equipment and Vehicle Finance",
  "Business overdraft",
  "Business credit card",
  "Mixed",
] as const;
export type PlanFundingSource = (typeof PLAN_FUNDING_SOURCES)[number];

/**
 * The lending product each funding source points at, for the finance options
 * the plan surfaces once there's a gap to cover.
 */
export const PLAN_FUNDING_PRODUCT: Record<PlanFundingSource, string> = {
  Cash: "Business Loan",
  "Business Loan": "Business Loan",
  "Equipment and Vehicle Finance": "Equipment & Vehicle Finance",
  "Business overdraft": "Business Overdraft",
  "Business credit card": "Business Credit Card",
  Mixed: "Equipment & Vehicle Finance",
};

/**
 * Where a budget line has got to: an intention, a confirmed cost, or one that
 * came in off what was planned.
 *
 * Stored as `line_status` on the line rather than as a second field that could
 * disagree with it.
 */
export const BUDGET_LINE_STATUSES = [
  "Planned",
  "Confirmed",
  "Variance",
] as const;
export type BudgetLineStatus = (typeof BUDGET_LINE_STATUSES)[number];

export type PlanBudgetLine = {
  id: string;
  /** The cost item — "Van deposit", "Signage", "Recruiter fee". */
  name: string;
  /** Typed text, like every money field. */
  planned: string;
  /** What the ledger shows. Prefilled from the source, editable after. */
  actual: string;
  /** The expense category the actual was matched from; empty until chosen. */
  ledgerSource: string;
  status: BudgetLineStatus;
};

export type ExpensePlan = {
  id: string;
  name: string;
  type: PlanType;
  fundingSource: PlanFundingSource;
  /** ISO `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  /** What the plan is expected to bring in over its window. */
  expectedRevenue: string;
  lines: PlanBudgetLine[];
  /**
   * The status the API settled on, present only on a saved plan. It wins over
   * the local calculation, which is what keeps the badge moving while a plan is
   * being edited and there's no saved record to ask.
   */
  computedStatus?: PlanStatus | null;
};

export type ExpensePlanDraft = Omit<ExpensePlan, "id" | "computedStatus">;

let budgetLineSeq = 0;
export function newBudgetLine(): PlanBudgetLine {
  budgetLineSeq += 1;
  return {
    id: `line-${budgetLineSeq}`,
    name: "",
    planned: "",
    actual: "",
    ledgerSource: "",
    status: "Planned",
  };
}

export function linePlanned(line: Pick<PlanBudgetLine, "planned">): number {
  return toNumber(line.planned);
}

export function lineActual(line: Pick<PlanBudgetLine, "actual">): number {
  return toNumber(line.actual);
}

/** Planned less actual. Positive means there's budget left on the line. */
export function lineVariance(
  line: Pick<PlanBudgetLine, "planned" | "actual">,
): number {
  return linePlanned(line) - lineActual(line);
}

/** Total planned cost — the sum of the budget lines, not a separate figure. */
export function planCost(plan: Pick<ExpensePlan, "lines">): number {
  return plan.lines.reduce((sum, line) => sum + linePlanned(line), 0);
}

/** What the ledger says has actually been spent against the plan. */
export function planActualTotal(plan: Pick<ExpensePlan, "lines">): number {
  return plan.lines.reduce((sum, line) => sum + lineActual(line), 0);
}

/** Planned less actual, across the plan. Negative means an overspend. */
export function planRemaining(plan: Pick<ExpensePlan, "lines">): number {
  return planCost(plan) - planActualTotal(plan);
}

/**
 * Cash already committed to the plan — what the lines record as actually spent.
 *
 * The API's own reading: a plan's budget remaining is `total_planned` less
 * `total_actual`, so the actuals are the money that has genuinely gone and the
 * rest is still to find.
 */
export function planCommitted(plan: Pick<ExpensePlan, "lines">): number {
  return planActualTotal(plan);
}

/**
 * The planned cost no cash has gone against yet — the API's `variance`, floored.
 * A plan whose actuals have overrun its budget has no gap, it has an overspend,
 * which the variance figure shows as a negative and this deliberately doesn't.
 */
export function planGap(plan: Pick<ExpensePlan, "lines">): number {
  return Math.max(0, planCost(plan) - planActualTotal(plan));
}

/**
 * What the plan is expected to bring in, or null when nothing has been entered.
 *
 * Null rather than zero matters: ROI and payback are unanswerable without a
 * revenue figure, and a zero would present "no return at all" as if it were the
 * answer.
 */
export function planExpectedRevenue(
  plan: Pick<ExpensePlan, "expectedRevenue">,
): number | null {
  if (plan.expectedRevenue === "" || plan.expectedRevenue == null) return null;
  const parsed = Number(plan.expectedRevenue);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Kept for the Overview's forecast, which totals plain figures. */
export function planReturn(plan: Pick<ExpensePlan, "expectedRevenue">): number {
  return planExpectedRevenue(plan) ?? 0;
}

/**
 * How many whole months the plan runs for. Null when the window isn't set, or
 * ends where it starts — a duration of nothing can't scale an annual figure.
 */
export function planDurationMonths(
  plan: Pick<ExpensePlan, "startDate" | "endDate">,
): number | null {
  const start = parseIsoDate(plan.startDate);
  const end = parseIsoDate(plan.endDate);
  if (!start || !end || end <= start) return null;
  return Math.max(
    (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()),
    1,
  );
}

/**
 * Return on the plan, annualised: the expected revenue net of the planned cost
 * as a percentage of that cost, scaled from the plan's own duration up to a
 * year. A six-month plan returning 10% is a 20% p.a. plan, and that's the
 * figure the ROI column quotes.
 *
 * Null without a cost or without a revenue figure — a return on nothing isn't a
 * percentage.
 */
export function planRoi(
  plan: Pick<ExpensePlan, "lines" | "expectedRevenue" | "startDate" | "endDate">,
): number | null {
  const cost = planCost(plan);
  const revenue = planExpectedRevenue(plan);
  if (revenue === null || cost <= 0) return null;
  const raw = ((revenue - cost) / cost) * 100;
  const months = planDurationMonths(plan);
  return raw * (months ? 12 / months : 1);
}

/**
 * Months until the expected revenue covers the cost, at the rate the plan's own
 * window implies. Null when the plan has no window or brings in nothing — there
 * is no month it pays back in.
 */
export function planPaybackMonths(
  plan: Pick<ExpensePlan, "lines" | "expectedRevenue" | "startDate" | "endDate">,
): number | null {
  const revenue = planExpectedRevenue(plan);
  const months = planDurationMonths(plan);
  if (revenue === null || revenue <= 0 || !months) return null;
  return planCost(plan) / (revenue / months);
}

export function formatPayback(
  plan: Pick<ExpensePlan, "lines" | "expectedRevenue" | "startDate" | "endDate">,
): string {
  const months = planPaybackMonths(plan);
  if (months === null) return "No payback";
  if (months < 1) return "Under a month";
  return `${months.toFixed(months < 10 ? 1 : 0)} months`;
}

export type PlanStatus = "On track" | "Review" | "Funding gap";

/**
 * Funding first, exactly as the API computes `computed_status`: a plan that
 * costs something and isn't expected to earn at least that back is carrying a
 * funding gap. Anything else is on track.
 *
 * A plan read from the API carries the status the server settled on, and that
 * one wins — the live calculation is what keeps the figure moving while the
 * plan is being edited, before there's a saved record to ask.
 */
export function planStatus(
  plan: Pick<ExpensePlan, "lines" | "expectedRevenue"> & {
    computedStatus?: PlanStatus | null;
  },
): PlanStatus {
  if (plan.computedStatus) return plan.computedStatus;
  const cost = planCost(plan);
  const revenue = planExpectedRevenue(plan);
  return cost > 0 && (revenue === null || revenue < cost)
    ? "Funding gap"
    : "On track";
}

export function planStatusVariant(
  status: PlanStatus,
): "success" | "warning" | "danger" {
  if (status === "Funding gap") return "danger";
  return status === "Review" ? "warning" : "success";
}

/**
 * What the ledger holds for a category inside the plan's window — what the
 * Actual column is prefilled from when a source is chosen. Editable after, since
 * the spec's own note is that actuals mirror your accounts rather than dictate
 * them.
 */
export function ledgerActual(
  expenses: Expense[],
  category: string,
  startDate: string,
  endDate: string,
): number {
  return expenses
    .filter((expense) => {
      if (expense.category !== category) return false;
      if (startDate && expense.date < startDate) return false;
      if (endDate && expense.date > endDate) return false;
      return true;
    })
    .reduce((sum, expense) => sum + expense.amount, 0);
}

/* ------------------------------------------------------------------ *
 * Portfolio-wide figures — the Overview cards
 * ------------------------------------------------------------------ */

export function totalGoalAllocations(goals: Goal[]): number {
  return goals.reduce((sum, goal) => sum + goalAllocated(goal), 0);
}

export function totalCommitted(plans: ExpensePlan[]): number {
  return plans.reduce((sum, plan) => sum + planCommitted(plan), 0);
}

/** Planned cost across every plan. */
export function totalPlannedCost(plans: ExpensePlan[]): number {
  return plans.reduce((sum, plan) => sum + planCost(plan), 0);
}

export function totalFundingGap(plans: ExpensePlan[]): number {
  return plans.reduce((sum, plan) => sum + planGap(plan), 0);
}

/**
 * The projected net benefit of the plans over twelve months, after their costs —
 * so a big capital purchase can legitimately show a negative first year.
 */
export function forecastAnnualReturn(plans: ExpensePlan[]): number {
  return plans.reduce(
    (sum, plan) => sum + (planReturn(plan) - planCost(plan)),
    0,
  );
}

/**
 * Cash that isn't already spoken for.
 *
 * Counts every account — banks and the wallet — then takes off goal allocations
 * and plan commitments. Floored at zero: earmarking more than you hold is a
 * warning to show, not a negative balance to report.
 */
export function availableCash(
  wallet: number,
  goals: Goal[],
  plans: ExpensePlan[],
  banks: BankAccountBalance[] = [],
): number {
  return Math.max(
    0,
    cashOnHand(wallet, banks) -
      totalGoalAllocations(goals) -
      totalCommitted(plans),
  );
}

/** Whether allocations have outrun the cash actually held. */
export function isOverAllocated(
  wallet: number,
  goals: Goal[],
  plans: ExpensePlan[],
  banks: BankAccountBalance[] = [],
): boolean {
  return (
    totalGoalAllocations(goals) + totalCommitted(plans) >
    cashOnHand(wallet, banks)
  );
}

export function goalStatusCounts(goals: Goal[], todayIso: string) {
  return goals.reduce(
    (acc, goal) => {
      const status = goalStatus(goal, todayIso);
      if (status === "Complete") acc.complete += 1;
      else if (status === "On track") acc.onTrack += 1;
      else if (status === "Behind") acc.behind += 1;
      // A goal without a target or date counts in neither — it's unfinished.
      else acc.draft += 1;
      return acc;
    },
    { onTrack: 0, behind: 0, complete: 0, draft: 0 },
  );
}

export function planStatusCounts(plans: ExpensePlan[]) {
  return plans.reduce(
    (acc, plan) => {
      const status = planStatus(plan);
      if (status === "On track") acc.onTrack += 1;
      else if (status === "Review") acc.review += 1;
      else acc.fundingGap += 1;
      return acc;
    },
    { onTrack: 0, review: 0, fundingGap: 0 },
  );
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * A negative figure reads "−$20,100.00", not "$-20,100.00" — the sign goes
 * before the symbol, as it does on the Transactions list.
 */
export function signedMoney(value: number): string {
  return value < 0 ? `\u2212${invoiceMoney(Math.abs(value))}` : invoiceMoney(value);
}

/** Em dash rather than a figure when there's nothing to say yet. */
export function formatOrDash(value: number | null): string {
  return value === null ? "—" : invoiceMoney(value);
}

export function formatGoalDate(iso: string): string {
  return iso ? formatInvoiceDate(iso) : "No date set";
}

/** "$12,000 by 30/06/2027" — the toast's confirmation line. */
export function goalSummaryLine(goal: Pick<Goal, "targetAmount" | "targetDate">): string {
  const target = goalTarget(goal);
  const amount = target > 0 ? invoiceMoney(target) : "No target";
  return goal.targetDate
    ? `${amount} by ${formatInvoiceDate(goal.targetDate)}`
    : amount;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value);
  // Same minus glyph as `signedMoney`, so a negative ROI and a negative figure
  // are punctuated the same way.
  if (rounded < 0) return `\u2212${Math.abs(rounded)}%`;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/* ------------------------------------------------------------------ *
 * Validation — live inline errors, keystrokes never blocked
 * ------------------------------------------------------------------ */

export function amountFieldError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
    ? undefined
    : "Enter a valid amount — no letters or negatives.";
}

export type PlannerIssue = { key: string; message: string };

/**
 * What a goal needs before it can be saved. The target amount and date are
 * required here — a goal without them can't be tracked, which is exactly why
 * progress stays silent until they exist.
 */
export function goalIssues(
  draft: GoalDraft,
  /**
   * What's already earmarked against this goal, when there is one. The target
   * can't be moved below it — the money has been set aside, so a smaller target
   * would report the goal as more than complete.
   */
  allocated = 0,
): PlannerIssue[] {
  const issues: PlannerIssue[] = [];
  if (draft.name.trim().length < 2) {
    issues.push({ key: "name", message: "Name this goal." });
  }
  const amount = amountFieldError(draft.targetAmount);
  if (amount) {
    issues.push({ key: "targetAmount", message: amount });
  } else if (toNumber(draft.targetAmount) <= 0) {
    issues.push({ key: "targetAmount", message: "Enter a target amount." });
  } else if (toNumber(draft.targetAmount) < allocated) {
    issues.push({
      key: "targetAmount",
      message: `Target can't be less than the ${invoiceMoney(allocated)} already allocated.`,
    });
  }
  if (!draft.targetDate) {
    issues.push({ key: "targetDate", message: "Choose a target date." });
  }
  return issues;
}

/**
 * What a budget needs before it can be saved. Same shape as `goalIssues`: one
 * issue per field, keyed so the form can put the message under the control.
 *
 * The dates are required only for a Custom period — the calendar periods derive
 * their window, so insisting on dates there would be asking for something the
 * figures don't use.
 */
export function budgetIssues(draft: BudgetDraft): PlannerIssue[] {
  const issues: PlannerIssue[] = [];
  if (draft.name.trim().length < 2) {
    issues.push({ key: "name", message: "Name this budget." });
  }

  const amount = amountFieldError(draft.amount);
  if (amount) {
    issues.push({ key: "amount", message: amount });
  } else if (toNumber(draft.amount) <= 0) {
    issues.push({ key: "amount", message: "Enter an amount." });
  }

  const threshold = toNumber(draft.alertThreshold);
  if (!draft.alertThreshold.trim()) {
    issues.push({
      key: "alertThreshold",
      message: "Enter an alert threshold.",
    });
  } else if (
    !/^\d+$/.test(draft.alertThreshold.trim()) ||
    threshold < 1 ||
    threshold > 100
  ) {
    issues.push({
      key: "alertThreshold",
      message: "Enter a whole percentage between 1 and 100.",
    });
  }

  if (draft.period === "Custom") {
    if (!draft.startDate) {
      issues.push({ key: "startDate", message: "Choose a start date." });
    }
    if (!draft.endDate) {
      issues.push({ key: "endDate", message: "Choose an end date." });
    } else if (draft.startDate && draft.endDate < draft.startDate) {
      issues.push({
        key: "endDate",
        message: "The end date can't precede the start date.",
      });
    }
  }

  // Spend is read from the ledger by category, so an envelope with none can
  // never show anything against it.
  if (draft.categories.length === 0) {
    issues.push({
      key: "categories",
      message: "Assign at least one category.",
    });
  }

  return issues;
}

export function planIssues(draft: ExpensePlanDraft): PlannerIssue[] {
  const issues: PlannerIssue[] = [];
  if (draft.name.trim().length < 2) {
    issues.push({ key: "name", message: "Name this plan." });
  }
  if (!draft.startDate) {
    issues.push({ key: "startDate", message: "Choose a planned start date." });
  }
  if (!draft.endDate) {
    issues.push({ key: "endDate", message: "Choose a planned end date." });
  } else if (draft.startDate && draft.endDate < draft.startDate) {
    issues.push({
      key: "endDate",
      message: "The end date can't precede the start date.",
    });
  }

  const revenue = amountFieldError(draft.expectedRevenue);
  if (revenue) issues.push({ key: "expectedRevenue", message: revenue });

  // A plan with no costed line has nothing to forecast against.
  const costed = draft.lines.filter(
    (line) => line.name.trim() && linePlanned(line) > 0,
  );
  if (costed.length === 0) {
    issues.push({
      key: "lines",
      message: "Add at least one budget line with a name and a planned amount.",
    });
  }

  for (const line of draft.lines) {
    const planned = amountFieldError(line.planned);
    if (planned) {
      issues.push({ key: `planned-${line.id}`, message: planned });
    }
    const actual = amountFieldError(line.actual);
    if (actual) {
      issues.push({ key: `actual-${line.id}`, message: actual });
    }
    // A line with money on it but no name can't be read on the chart.
    if (!line.name.trim() && (linePlanned(line) > 0 || lineActual(line) > 0)) {
      issues.push({ key: `name-${line.id}`, message: "Name this budget line." });
    }
  }

  return issues;
}

/**
 * Whether a wallet movement can be recorded.
 *
 * Cash out is checked against what's *available*, not the balance: anything
 * already earmarked for a goal is spoken for, and taking it out would leave the
 * goal funded by money that isn't there. The API applies the same floor, so
 * this is the message shown before the request rather than a different rule.
 */
export function walletMovementIssue(
  value: string,
  direction: "in" | "out",
  available: number,
): string | undefined {
  const error = amountFieldError(value);
  if (error) return error;
  const amount = Number.parseFloat(value);
  if (!value.trim() || !Number.isFinite(amount) || amount <= 0) return undefined;
  return direction === "out" && amount > available
    ? `Only ${invoiceMoney(available)} is available — the rest is allocated to goals.`
    : undefined;
}

export function allocationIssue(
  value: string,
  available: number,
): string | undefined {
  const error = amountFieldError(value);
  if (error) return error;
  const amount = toNumber(value);
  if (!value.trim() || amount <= 0) return undefined;
  return amount > available
    ? `Only ${invoiceMoney(available)} is available in that account.`
    : undefined;
}

/* ------------------------------------------------------------------ *
 * Drafts
 * ------------------------------------------------------------------ */

export function emptyGoalDraft(): GoalDraft {
  return {
    name: "",
    type: "Buffer",
    targetAmount: "",
    // Empty, not today: a goal due today would be born overdue.
    targetDate: "",
  };
}

export function draftFromGoal(goal: Goal): GoalDraft {
  return {
    name: goal.name,
    type: goal.type,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
  };
}

export function emptyBudgetDraft(todayIso: string): BudgetDraft {
  return {
    name: "",
    amount: "",
    alertThreshold: DEFAULT_ALERT_THRESHOLD,
    period: "Monthly",
    // Starts today, as the plan draft does. Only Custom requires an end date,
    // so there's nothing to default it to.
    startDate: todayIso,
    endDate: budgetAutoEndDate(todayIso, "Monthly"),
    categories: [],
    categoryIds: [],
    notes: "",
  };
}

export function draftFromBudget(budget: Budget): BudgetDraft {
  return {
    name: budget.name,
    amount: budget.amount,
    alertThreshold: budget.alertThreshold,
    period: budget.period,
    startDate: budget.startDate,
    endDate: budget.endDate,
    categories: [...budget.categories],
    categoryIds: [...budget.categoryIds],
    notes: budget.notes,
    repeatEnabled: budget.repeatEnabled,
    repeatFrequency: budget.repeatFrequency,
  };
}

export function emptyPlanDraft(todayIso: string): ExpensePlanDraft {
  return {
    name: "",
    type: "Expansion",
    fundingSource: "Cash",
    startDate: todayIso,
    endDate: "",
    expectedRevenue: "",
    // One blank line, so the table has somewhere to type rather than an
    // empty frame and an Add button.
    lines: [newBudgetLine()],
  };
}

export function draftFromPlan(plan: ExpensePlan): ExpensePlanDraft {
  return {
    name: plan.name,
    type: plan.type,
    fundingSource: plan.fundingSource,
    startDate: plan.startDate,
    endDate: plan.endDate,
    expectedRevenue: plan.expectedRevenue,
    lines: plan.lines.map((line) => ({ ...line })),
  };
}

/** The categories the budget and plan forms choose from. */
export const PLANNER_CATEGORIES = [...EXPENSE_CATEGORIES];
