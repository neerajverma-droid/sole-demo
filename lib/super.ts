/**
 * Super contributions domain: what you've paid into super, and which bank
 * transactions those payments actually landed as.
 *
 * A contribution is entered once and matched afterwards, because the two happen
 * at different times — you record what you meant to pay, then the bank feed
 * catches up. A single contribution can clear as several debits (a quarterly
 * payment split across funds or instalments), so matching is many-to-one and a
 * contribution can legitimately sit part-matched. That's what `remaining` is
 * for, and why the list has both an Amount and a Remaining amount column.
 *
 * Amounts are held as typed text on drafts, the same as everywhere else — the
 * platform rule is that numeric fields accept whatever is typed and surface a
 * live error rather than swallowing the input into a number.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";

/** The period tabs above the cards, matching Expenses and Vendor refunds. */
export const SUPER_PERIODS = ["This year", "This month"] as const;
export type SuperPeriod = (typeof SUPER_PERIODS)[number];

/**
 * The funds a new account starts with — the large Australian funds a sole
 * trader is most likely to be paying into. The list is a starting point, not a
 * closed set: the fund combobox creates new ones.
 */
export const SEED_FUND_NAMES = [
  "AustralianSuper",
  "Aware Super",
  "Hostplus",
  "HESTA",
  "UniSuper",
  "REST Super",
  "Cbus Super",
  "Australian Retirement Trust",
];

export type SuperFund = {
  id: string;
  name: string;
};

/** One bank transaction assigned to a contribution, and for how much. */
export type ContributionMatch = {
  transactionId: string;
  /** Snapshot, so a transaction leaving the feed can't blank the row. */
  reference: string;
  amount: number;
};

export type Contribution = {
  id: string;
  fundId: string;
  /** Snapshot at entry, so deleting a fund can't blank the row. */
  fundName: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** As typed. Use `contributionAmount` for the figure. */
  amount: string;
  notes: string;
  /** Whether this one is claimed as a personal deduction. */
  taxDeduction: boolean;
  matches: ContributionMatch[];
  /** Bank-feed candidates the server already sees for this contribution —
   *  what picks "AI Match" over a plain "Match" on the list. */
  possibleMatch: number;
};

export type ContributionDraft = Omit<
  Contribution,
  "id" | "matches" | "possibleMatch"
>;

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function contributionAmount(
  contribution: Pick<Contribution, "amount">,
): number {
  return toNumber(contribution.amount);
}

export function contributionMatched(
  contribution: Pick<Contribution, "matches">,
): number {
  return contribution.matches.reduce((sum, match) => sum + match.amount, 0);
}

/** Never below zero: over-assigning is blocked, but the figure shouldn't lie. */
export function contributionRemaining(
  contribution: Pick<Contribution, "amount" | "matches">,
): number {
  return Math.max(
    0,
    contributionAmount(contribution) - contributionMatched(contribution),
  );
}

export type ContributionStatus = "Unmatched" | "Partly matched" | "Matched";

export function contributionStatus(
  contribution: Pick<Contribution, "amount" | "matches">,
): ContributionStatus {
  const matched = contributionMatched(contribution);
  if (matched <= 0) return "Unmatched";
  // Cents tolerance: a split that rounds shouldn't read as permanently short.
  return contributionRemaining(contribution) < 0.005
    ? "Matched"
    : "Partly matched";
}

export function contributionStatusVariant(
  status: ContributionStatus,
): "success" | "warning" | "secondary" {
  if (status === "Matched") return "success";
  return status === "Partly matched" ? "warning" : "secondary";
}

export function formatContributionDate(iso: string): string {
  return formatInvoiceDate(iso);
}

/** An em dash for an empty figure, per the platform's table rule. */
export const EMPTY_CELL = "—";

/* ------------------------------------------------------------------ *
 * Periods, filtering and the cards
 * ------------------------------------------------------------------ */

/** ISO dates sort as text, so the period test is a prefix match. */
function periodPrefix(period: SuperPeriod, todayIso: string): string {
  const [year, month] = todayIso.split("-").map(Number);
  return period === "This month"
    ? `${year}-${String(month).padStart(2, "0")}`
    : String(year);
}

/** The prior period, for the cards' delta line. */
function priorPrefix(period: SuperPeriod, todayIso: string): string {
  const [year, month] = todayIso.split("-").map(Number);
  if (period === "This month") {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  }
  return String(year - 1);
}

export function contributionsInPeriod(
  contributions: Contribution[],
  period: SuperPeriod,
  todayIso: string,
): Contribution[] {
  const prefix = periodPrefix(period, todayIso);
  return contributions.filter((entry) => entry.date.startsWith(prefix));
}

/**
 * The delta line under each card.
 *
 * Null when the prior period had nothing — a change "from zero" is infinite,
 * and reporting it as a percentage would be a lie dressed as a statistic. Same
 * rule the Expenses summary follows.
 */
function deltaLine(
  current: number,
  prior: number,
  period: SuperPeriod,
): string {
  const priorLabel = period === "This month" ? "last month" : "last year";
  if (prior <= 0) return `No comparison for ${priorLabel}`;
  const percent = Math.round(((current - prior) / prior) * 100);
  if (percent === 0) return `Level with ${priorLabel}`;
  const arrow = percent > 0 ? "up" : "down";
  return `${Math.abs(percent)}% ${arrow} on ${priorLabel}`;
}

export type SuperStats = {
  total: { value: string; delta: string; count: number };
  matched: { value: string; delta: string; count: number };
  pending: { value: string; delta: string; count: number };
  deductible: { value: string; delta: string; count: number };
};

/**
 * The four cards. Every figure is scoped to the selected period, and each
 * carries its own comparison against the same period a year or a month back.
 *
 * "Pending" is what's still unmatched — the remaining amounts summed, not the
 * face value of part-matched contributions, so the three figures reconcile:
 * matched + pending equals the total.
 */
export function superStats(
  contributions: Contribution[],
  period: SuperPeriod,
  todayIso: string,
): SuperStats {
  const current = contributionsInPeriod(contributions, period, todayIso);
  const prior = contributions.filter((entry) =>
    entry.date.startsWith(priorPrefix(period, todayIso)),
  );

  const sum = (list: Contribution[], of: (c: Contribution) => number) =>
    list.reduce((total, entry) => total + of(entry), 0);

  const total = sum(current, contributionAmount);
  const matched = sum(current, contributionMatched);
  const pending = sum(current, contributionRemaining);
  // What you intend to claim personally — the figure the notice of intent has
  // to cover, so it's worth reading beside the total rather than counted from
  // the rows by hand.
  const deductibleOf = (entry: Contribution) =>
    entry.taxDeduction ? contributionAmount(entry) : 0;
  const deductible = sum(current, deductibleOf);

  return {
    total: {
      value: invoiceMoney(total),
      delta: deltaLine(total, sum(prior, contributionAmount), period),
      count: current.length,
    },
    matched: {
      value: invoiceMoney(matched),
      delta: deltaLine(matched, sum(prior, contributionMatched), period),
      count: current.filter((entry) => contributionStatus(entry) === "Matched")
        .length,
    },
    pending: {
      value: invoiceMoney(pending),
      delta: deltaLine(pending, sum(prior, contributionRemaining), period),
      count: current.filter((entry) => contributionStatus(entry) !== "Matched")
        .length,
    },
    deductible: {
      value: invoiceMoney(deductible),
      delta: deltaLine(deductible, sum(prior, deductibleOf), period),
      count: current.filter((entry) => entry.taxDeduction).length,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Validation — live, never blocking keystrokes
 * ------------------------------------------------------------------ */

export type SuperIssue = { key: string; message: string };

export function amountFieldError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
    ? undefined
    : "Enter a valid amount — no letters or negatives.";
}

export function contributionIssues(draft: ContributionDraft): SuperIssue[] {
  const issues: SuperIssue[] = [];

  if (!draft.fundId && !draft.fundName.trim()) {
    issues.push({ key: "fund", message: "Choose the fund this went to." });
  }
  if (!draft.date) {
    issues.push({ key: "date", message: "Choose a contribution date." });
  }

  const amount = amountFieldError(draft.amount);
  if (amount) {
    issues.push({ key: "amount", message: amount });
  } else if (!draft.amount.trim() || contributionAmount(draft) <= 0) {
    issues.push({ key: "amount", message: "Enter a contribution amount." });
  }

  return issues;
}

/**
 * The combobox's create row. Mirrors `clientCreateLabel` so a fund and a client
 * are added the same way — "Create" once you've typed a name, an invitation
 * before you have.
 */
export function fundCreateLabel(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `Create "${trimmed}"` : "Add new fund";
}

/** A fund needs a name, and not one already on the list. */
export function fundNameError(
  name: string,
  funds: SuperFund[],
  ignoreId?: string,
): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Name this fund.";
  const clash = funds.some(
    (fund) =>
      fund.id !== ignoreId &&
      fund.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return clash ? "A fund with this name already exists." : undefined;
}

/* ------------------------------------------------------------------ *
 * Drafts
 * ------------------------------------------------------------------ */

export function emptyContributionDraft(todayIso: string): ContributionDraft {
  return {
    fundId: "",
    fundName: "",
    date: todayIso,
    amount: "",
    notes: "",
    taxDeduction: false,
  };
}

export function draftFromContribution(
  contribution: Contribution,
): ContributionDraft {
  return {
    fundId: contribution.fundId,
    fundName: contribution.fundName,
    date: contribution.date,
    amount: contribution.amount,
    notes: contribution.notes,
    taxDeduction: contribution.taxDeduction,
  };
}

/** "$1,200.00 to AustralianSuper" — the toast's confirmation line. */
export function contributionSummaryLine(draft: ContributionDraft): string {
  const amount = contributionAmount(draft);
  const money = amount > 0 ? invoiceMoney(amount) : "No amount";
  return draft.fundName.trim()
    ? `${money} to ${draft.fundName.trim()}`
    : money;
}

/* ------------------------------------------------------------------ *
 * API — GET/POST /v2/super-contribution and /fund, sole-webapp's
 * components/SuperContributions/index.js and its fund combobox.
 * ------------------------------------------------------------------ */

type ApiContribution = {
  id: string | number;
  fund_id: string | number | null;
  fund_name: string | null;
  /** Raw DATEONLY value, already `YYYY-MM-DD`. */
  date: string;
  price: number | string;
  description?: string | null;
  is_taxable: boolean | number | string;
  /** Already netted against whatever's been reconciled server-side. */
  remaining_amount: number | string;
  possible_match?: number | string;
};

/** Accepts the same boolean/number/string-ish values the backend does. */
function parseTaxDeduction(value: boolean | number | string | undefined): boolean {
  return !!value && value !== "0";
}

/**
 * Neither the list nor the detail endpoint returns the individual bank
 * transactions behind a contribution's `remaining_amount` — there's nothing
 * per-transaction to show. A single synthetic match standing in for
 * "however much of this is reconciled" is enough for `contributionMatched`/
 * `contributionRemaining`/`contributionStatus` to read correctly without
 * changing any of them. Real matching itself (`lib/bank-match.ts`) doesn't
 * read this — it fetches candidates and confirms matches against the API
 * directly, so this stand-in never has to look like a real transaction.
 */
function syntheticMatches(
  id: string | number,
  amount: number,
  remaining: number,
): ContributionMatch[] {
  const reconciled = Math.max(0, amount - Math.max(0, remaining));
  return reconciled > 0.005
    ? [
      {
        transactionId: `reconciled-${id}`,
        reference: "Bank reconciliation",
        amount: reconciled,
      },
    ]
    : [];
}

function mapApiContribution(raw: ApiContribution): Contribution {
  const amount = Number(raw.price ?? 0);
  const remaining = Number(raw.remaining_amount ?? amount);

  return {
    id: String(raw.id),
    fundId: raw.fund_id != null ? String(raw.fund_id) : "",
    fundName: raw.fund_name ?? "",
    date: raw.date,
    amount: String(amount),
    notes: raw.description ?? "",
    taxDeduction: parseTaxDeduction(raw.is_taxable),
    matches: syntheticMatches(raw.id, amount, remaining),
    possibleMatch: Number(raw.possible_match ?? 0),
  };
}

export type ContributionsPage = {
  contributions: Contribution[];
  total: number;
};

/**
 * `name` is the only filter the server understands, and it matches the
 * fund's name (a joined column), not the contribution itself. `page`/`limit`
 * drive real server-side pagination — the page count and the empty state
 * are built from the response's own `pagination.total`, not the length of
 * whatever page happens to come back.
 */
export async function fetchContributionsPage(
  page: number,
  pageSize: number,
  search?: string,
): Promise<ContributionsPage> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(pageSize),
  };
  if (search?.trim()) params.name = search.trim();

  const response = await api.get<{
    success: boolean;
    data?: ApiContribution[];
    pagination?: { total?: number };
  }>(apiRoutes.superContribution.list, { params });

  const contributions = (response.data?.data ?? []).map(mapApiContribution);
  return {
    contributions,
    total: response.data?.pagination?.total ?? contributions.length,
  };
}

type ApiContributionDetail = {
  id: string | number;
  /** Nested here, unlike the list row's flat `fund_name` — the get-one
   *  endpoint returns the fund's id too, which the list doesn't. */
  fund: { id: string | number; name: string } | null;
  /** `DD-MM-YYYY`, unlike the list's raw ISO — see `isoFromDisplayDate`. */
  date: string;
  price: number | string;
  notes?: string | null;
  is_taxable: boolean | number | string;
  remaining_amount: number | string;
};

/** The detail endpoint's own display format, converted back to the ISO the rest of this module expects. */
function isoFromDisplayDate(value: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return value;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * One contribution, for the edit form — the list's own rows don't carry the
 * fund's id (only its name), so editing needs this rather than reusing
 * whatever's already in the store.
 */
export async function fetchContributionDetail(
  id: string,
): Promise<Contribution> {
  const response = await api.get<{
    success: boolean;
    data?: ApiContributionDetail;
  }>(`${apiRoutes.superContribution.details}/${id}`);
  const raw = response.data?.data;
  if (!raw) throw new Error("Contribution not found");

  const amount = Number(raw.price ?? 0);
  const remaining = Number(raw.remaining_amount ?? amount);

  return {
    id: String(raw.id),
    fundId: raw.fund ? String(raw.fund.id) : "",
    fundName: raw.fund?.name ?? "",
    date: isoFromDisplayDate(raw.date),
    amount: String(amount),
    notes: raw.notes ?? "",
    taxDeduction: parseTaxDeduction(raw.is_taxable),
    matches: syntheticMatches(raw.id, amount, remaining),
    // The detail endpoint doesn't return this — only the list does, since
    // it's purely a "which button does this row show" signal.
    possibleMatch: 0,
  };
}

/**
 * Encrypted, matching businesses and every other create/update this app
 * sends this way — the fields fold into one AES-encrypted `data` string.
 * No files here (super contribution documents are disabled server-side), so
 * this always travels as plain JSON, never FormData.
 */
export async function createContributionApi(
  draft: ContributionDraft,
): Promise<void> {
  const body = buildEncryptedRequestBody({
    fund_id: draft.fundId,
    price: contributionAmount(draft),
    date: draft.date,
    is_taxable: draft.taxDeduction ? 1 : 0,
    notes: draft.notes || "",
    fund_name: draft.fundName || "",
  });

  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.superContribution.create,
    body,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to record contribution");
  }
  track(EVENTS.SUPER_CONTRIBUTION_RECORDED, {
    amount: contributionAmount(draft),
    is_taxable: Boolean(draft.taxDeduction),
  });
}

/**
 * Same shape as creating one, minus `fund_name` — the update endpoint only
 * ever reassigns `fund_id`, it doesn't rename the fund's snapshot.
 */
export async function updateContributionApi(
  id: string,
  draft: ContributionDraft,
): Promise<void> {
  const body = buildEncryptedRequestBody({
    fund_id: draft.fundId,
    price: contributionAmount(draft),
    date: draft.date,
    is_taxable: draft.taxDeduction ? 1 : 0,
    notes: draft.notes || "",
  });

  const response = await api.patch<{ success: boolean; message?: string }>(
    `${apiRoutes.superContribution.update}/${id}`,
    body,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to save contribution");
  }
}

/**
 * Encrypted, matching every other write here, even though the body carries
 * nothing the server reads — `id` is all this endpoint needs, and it comes
 * from the URL. The server rejects deleting a reconciled contribution.
 */
export async function deleteContributionApi(id: string): Promise<void> {
  const response = await api.delete<{ success: boolean; message?: string }>(
    `${apiRoutes.superContribution.delete}/${id}`,
    { data: buildEncryptedRequestBody({}) },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete contribution");
  }
}

export type SuperMatrixPeriod = "year" | "month";

type ApiMatrixCard = {
  key: "total_contributions" | "matched_contributions" | "pending_contributions";
  total_amount: number;
  percentage_change: number;
};

type ApiMatrix = {
  has_previous_data: boolean;
  cards_data: ApiMatrixCard[];
};

/**
 * `type` maps straight from the period tabs — the same "This year"/"This
 * month" choice the table's own period filter uses, so the cards and the
 * table always describe the same stretch of time.
 */
export async function fetchContributionMatrix(
  type: SuperMatrixPeriod,
): Promise<ApiMatrix> {
  const response = await api.get<{ success: boolean; data?: ApiMatrix }>(
    apiRoutes.superContribution.kpi,
    { params: { type } },
  );
  const raw = response.data?.data;
  if (!raw || !Array.isArray(raw.cards_data)) {
    return { has_previous_data: false, cards_data: [] };
  }
  return raw;
}

export type SuperMatrixStats = {
  total: { value: string; delta: string };
  matched: { value: string; delta: string };
  pending: { value: string; delta: string };
};

/** Mirrors `deltaLine`'s wording, off the server's own percentage instead of one computed locally. */
function matrixDeltaLine(
  percentageChange: number,
  hasPreviousData: boolean,
  period: SuperPeriod,
): string {
  const priorLabel = period === "This month" ? "last month" : "last year";
  if (!hasPreviousData) return `No comparison for ${priorLabel}`;
  const rounded = Math.round(percentageChange);
  if (rounded === 0) return `Level with ${priorLabel}`;
  const arrow = rounded > 0 ? "up" : "down";
  return `${Math.abs(rounded)}% ${arrow} on ${priorLabel}`;
}

/**
 * Total, matched and pending come straight from the matrix — the backend's
 * own reconciled/unreconciled split, all-or-nothing per contribution, rather
 * than this module's own partial-match-aware sums. Tax-deductible has no
 * server equivalent, so the cards screen still computes that one from
 * `superStats`.
 */
export function mapContributionMatrix(
  matrix: ApiMatrix,
  period: SuperPeriod,
): SuperMatrixStats {
  const cards = Array.isArray(matrix?.cards_data) ? matrix.cards_data : [];
  const cardFor = (key: ApiMatrixCard["key"]) => {
    const card = cards.find((entry) => entry.key === key);
    return {
      value: invoiceMoney(card?.total_amount ?? 0),
      delta: matrixDeltaLine(
        card?.percentage_change ?? 0,
        Boolean(matrix?.has_previous_data),
        period,
      ),
    };
  };

  return {
    total: cardFor("total_contributions"),
    matched: cardFor("matched_contributions"),
    pending: cardFor("pending_contributions"),
  };
}

type ApiFund = { id: string | number; name: string };

export async function fetchFunds(): Promise<SuperFund[]> {
  const response = await api.get<{ success: boolean; data?: ApiFund[] }>(
    apiRoutes.fund.list,
  );
  return (response.data?.data ?? []).map((fund) => ({
    id: String(fund.id),
    name: fund.name,
  }));
}

/** Encrypted, same as creating a contribution — a single `{ name }` field. */
export async function createFundApi(name: string): Promise<SuperFund> {
  const body = buildEncryptedRequestBody({ name });
  const response = await api.post<{
    success: boolean;
    message?: string;
    data?: ApiFund;
  }>(apiRoutes.fund.create, body);
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to create fund");
  }
  const fund = response.data.data;
  return { id: String(fund.id), name: fund.name };
}
