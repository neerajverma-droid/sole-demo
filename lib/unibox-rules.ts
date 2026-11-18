/**
 * Quick Actions — every rule the cards and the urgent five apply, as pure
 * functions.
 *
 * Lifted out of the card components so they can be tested on their own, and so
 * each one sits beside the sole-webapp component it reproduces: which rows a
 * card lists, in what order, what each row says, and which button it offers.
 * Nothing here fetches, renders or writes.
 */
import { invoiceMoney } from "@/lib/invoices";
import { mapKmTrip, type KmTrip } from "@/lib/km-tracker";
import { normalizeListTask, type PlannerTask } from "@/lib/task-planner";
import type { ActiveTimer } from "@/lib/project-timer";
import {
  buildTimeInvoice,
  mapTimeTask,
  type TimeInvoice,
  type TimerSelection,
} from "@/lib/time-tracker";
import {
  formatDuration,
  shortDate,
  toNumber,
  truthy,
  isReconciled,
  type PriorityAction,
  type PriorityData,
  type PriorityItem,
  type UniboxBankTransaction,
  type UniboxInvoice,
  type UniboxMatchable,
  type UniboxPlannerTask,
  type UniboxProgress,
  type UniboxProject,
  type UniboxQuote,
  type UniboxTimeEntry,
  type UniboxTrip,
} from "@/lib/unibox";

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ *
 * Money — in the open business's own currency
 * ------------------------------------------------------------------ */

/**
 * Every figure on the screen, written the way invoices write them: the active
 * country's symbol ("$" in Australia and New Zealand, "R" in South Africa,
 * "₹" in India) and its digit grouping, always with cents. sole-webapp printed
 * "$" and en-AU whatever the business; the multi-country plan has every
 * amount follow the business's country instead.
 *
 * A plain function rather than a hook, as `invoiceMoney` is: `CurrencyBoundary`
 * remounts the app when the business's currency changes, so a figure can't be
 * left in the last business's money.
 */
export const uniboxMoney = (value: unknown): string => invoiceMoney(toNumber(value));

/** A figure that may be missing — null rather than "$0.00" for a row without one. */
export const optionalMoney = (value: unknown): string | null => (value == null ? null : uniboxMoney(value));

/** A bank line: always signed, "+" for money in and "-" for money out. */
export const bankAmountText = (row: UniboxBankTransaction): string =>
  `${isCreditLine(row) ? "+" : "-"}${uniboxMoney(bankAmount(row))}`;

/** How many rows a card lists — GetPaid, Bank feed, Expenses, Assets, … */
export const CARD_ROW_LIMIT = 5;
/** KmTrackerCard.js showed three. */
export const KM_ROW_LIMIT = 3;
/** The urgent list's size. */
export const TOP_N = 5;

/* ------------------------------------------------------------------ *
 * Get paid — GetPaidCard.js
 * ------------------------------------------------------------------ */

export const GET_PAID_GROUPS = ["Invoice", "Quote"] as const;
export const INVOICE_TABS = ["To send", "Overdue", "Due soon"] as const;
export const QUOTE_TABS = ["To send", "Convert invoice"] as const;
export type GetPaidGroup = (typeof GET_PAID_GROUPS)[number];
export type InvoiceTab = (typeof INVOICE_TABS)[number];
export type QuoteTab = (typeof QUOTE_TABS)[number];

export type GetPaidActionKey =
  | "send_invoice"
  | "follow_up"
  | "send_quote"
  | "send_quote_again"
  | "convert_quote";
export type GetPaidAction = { key: GetPaidActionKey; label: string };

export const GET_PAID_SUCCESS: Record<GetPaidActionKey, string> = {
  follow_up: "Invoice reminder sent successfully!",
  send_quote: "Quote sent successfully!",
  send_quote_again: "Quote sent again successfully!",
  send_invoice: "Invoice sent successfully!",
  convert_quote: "Quote converted to invoice successfully!",
};

/** `normalizeStatus`: the status, or the mark-as, lower-cased. */
export const statusOf = (item: { status?: string | null; mark_as?: string | null }) =>
  String(item.status || item.mark_as || "").toLowerCase();

/** `getQuoteAction`: draft sends, rejected re-sends, converted has none, the rest convert. */
export function quoteAction(quote: UniboxQuote): GetPaidAction | null {
  const status = statusOf(quote);
  if (status === "converted" || Number(quote.converted) === 1) return null;
  if (status === "draft") return { key: "send_quote", label: "Send" };
  if (status === "rejected") return { key: "send_quote_again", label: "Send again" };
  return { key: "convert_quote", label: "Convert to invoice" };
}

/** Marked overdue, or sent and past its due date. */
export function isOverdueInvoice(invoice: UniboxInvoice, now: number): boolean {
  if (statusOf(invoice) === "overdue") return true;
  return Boolean(
    invoice.due_date && new Date(invoice.due_date).getTime() < now && statusOf(invoice) === "sent",
  );
}

/** Sent or due, and due within the next two days. */
export function isDueSoonInvoice(invoice: UniboxInvoice, now: number): boolean {
  if (!invoice.due_date) return false;
  const diff = (new Date(invoice.due_date).getTime() - now) / DAY_MS;
  return diff >= 0 && diff <= 2 && ["sent", "due"].includes(statusOf(invoice));
}

export type GetPaidSets = {
  invoices: Record<InvoiceTab, UniboxInvoice[]>;
  quotes: Record<QuoteTab, UniboxQuote[]>;
  invoiceCounts: Record<InvoiceTab, number>;
  quoteCounts: Record<QuoteTab, number>;
  groupCounts: Record<GetPaidGroup, number>;
  /** The header chip — both groups together. */
  total: number;
};

/** Every tab's rows and every count the card shows, before the five-row cut. */
export function getPaidSets(invoices: UniboxInvoice[], quotes: UniboxQuote[], now: number): GetPaidSets {
  const active = quotes.filter(
    (quote) => Number(quote.converted) !== 1 && statusOf(quote) !== "converted",
  );
  const invoiceSets: Record<InvoiceTab, UniboxInvoice[]> = {
    "To send": invoices.filter((invoice) => statusOf(invoice) === "draft"),
    Overdue: invoices.filter((invoice) => isOverdueInvoice(invoice, now)),
    "Due soon": invoices.filter((invoice) => isDueSoonInvoice(invoice, now)),
  };
  const quoteSets: Record<QuoteTab, UniboxQuote[]> = {
    "To send": active.filter((quote) =>
      ["send_quote", "send_quote_again"].includes(quoteAction(quote)?.key ?? ""),
    ),
    "Convert invoice": active.filter((quote) => quoteAction(quote)?.key === "convert_quote"),
  };
  const invoiceCounts = {
    "To send": invoiceSets["To send"].length,
    Overdue: invoiceSets.Overdue.length,
    "Due soon": invoiceSets["Due soon"].length,
  };
  const quoteCounts = {
    "To send": quoteSets["To send"].length,
    "Convert invoice": quoteSets["Convert invoice"].length,
  };
  const groupCounts = {
    Invoice: invoiceCounts["To send"] + invoiceCounts.Overdue + invoiceCounts["Due soon"],
    Quote: quoteCounts["To send"] + quoteCounts["Convert invoice"],
  };
  return {
    invoices: invoiceSets,
    quotes: quoteSets,
    invoiceCounts,
    quoteCounts,
    groupCounts,
    total: groupCounts.Invoice + groupCounts.Quote,
  };
}

/** "INV-3 · Acme" — the number (or id) and the client. */
export const invoiceTitle = (invoice: UniboxInvoice) =>
  `${invoice.invoice_no || invoice.id} · ${invoice.client?.name || ""}`;

export const quoteTitle = (quote: UniboxQuote) =>
  `${quote.quote_no || quote.id} · ${quote.client?.name || ""}`;

/** "Draft · 8 Sept" — the status, capitalised, and the valid-till date. */
export function quoteSub(quote: UniboxQuote): string {
  const status = statusOf(quote) || "draft";
  return `${status.charAt(0).toUpperCase()}${status.slice(1)} · ${shortDate(quote.valid_till || quote.due_date)}`;
}

/** The invoice row's line under the title, by tab. */
export function invoiceSub(invoice: UniboxInvoice, tab: InvoiceTab, now: number): string {
  if (tab === "To send") return "Draft";
  if (tab === "Due soon") return `Due ${shortDate(invoice.due_date)}`;
  const days = invoice.due_date
    ? Math.floor((now - new Date(invoice.due_date).getTime()) / DAY_MS)
    : null;
  return `${days ? `${days} ${days === 1 ? "day" : "days"} overdue` : "Overdue"} · Due ${shortDate(invoice.due_date)}`;
}

/** To send sends; overdue and due soon both chase. */
export const invoiceAction = (tab: InvoiceTab): GetPaidAction =>
  tab === "To send" ? { key: "send_invoice", label: "Send" } : { key: "follow_up", label: "Follow up" };

/** The id a quote action is sent against — its quote id where the row has one. */
export const quoteIdOf = (quote: UniboxQuote) => quote.quote_id ?? quote.id;

/* ------------------------------------------------------------------ *
 * Bank feed — BankFeedCard.js
 * ------------------------------------------------------------------ */

/** Not a saved transaction, not reconciled or matched, and not partly allocated. */
export function isUnmatchedBankLine(row: UniboxBankTransaction): boolean {
  if (row._source === "saved_transaction") return false;
  if (isReconciled(row)) return false;
  if (row.matched_transaction_no) return false;
  const amount = Number(row.amount ?? row.total ?? 0);
  const available = Number(row.available_amount ?? row.remaining_amount ?? amount);
  return !Number.isFinite(amount) || !Number.isFinite(available) || available >= amount - 0.005;
}

export const bankFeedRows = (rows: UniboxBankTransaction[]) =>
  rows.filter(isUnmatchedBankLine).slice(0, CARD_ROW_LIMIT);

export const bankLabel = (row: UniboxBankTransaction) =>
  row.description || row.name || row.payee || row.vendor_name || "Transaction";

export function bankDetail(row: UniboxBankTransaction): string {
  if (row._source === "bank_transaction") {
    return row.matched_transaction_no ? `Sole match: ${row.matched_transaction_no}` : "Unmatched";
  }
  return row.category || row.status || "";
}

/** Money in: the direction says so, or there's a credit figure, or the type is credit. */
export function isCreditLine(row: UniboxBankTransaction): boolean {
  if (row.direction) return row.direction.toLowerCase() === "credit";
  return toNumber(row.credit) > 0 || row.transaction_type === "credit";
}

export const bankAmount = (row: UniboxBankTransaction) =>
  Math.abs(toNumber(row.amount ?? row.credit ?? row.debit ?? row.total));

/**
 * The row as the bank match dialog's store keeps it — `openBankMatch` from
 * the old page: the transaction's own id wins, then the row id, then the
 * priority item's entity id.
 */
export function bankMatchRow(
  row: Partial<UniboxBankTransaction>,
  fallbackId?: string | number,
): (Partial<UniboxBankTransaction> & { bank_transacton_id: string | number; transaction_id: string | number }) | null {
  const id = row.bank_transacton_id ?? row.id ?? fallbackId;
  if (id == null) return null;
  return { ...row, bank_transacton_id: id, transaction_id: row.transaction_id ?? id };
}

/* ------------------------------------------------------------------ *
 * Expenses, Assets, Liabilities, Equity — the matchable cards
 * ------------------------------------------------------------------ */

export type MatchKind = "expense" | "asset" | "liability" | "equity";

/** Up to five not yet reconciled. */
export const matchableRows = (rows: UniboxMatchable[]) =>
  rows.filter((row) => !isReconciled(row)).slice(0, CARD_ROW_LIMIT);

/** "AI Match" when the feed already found candidates, plain "Match" otherwise. */
export const matchButtonType = (row: UniboxMatchable): "ai" | "normal" =>
  toNumber(row.possible_match) > 0 ? "ai" : "normal";

export function matchableTitle(kind: MatchKind, row: UniboxMatchable): string {
  if (kind === "expense") return row.name || row.client?.name || "Expense";
  return row.name || { asset: "Asset", liability: "Liability", equity: "Equity" }[kind];
}

export function matchableSub(kind: MatchKind, row: UniboxMatchable): string {
  if (kind === "expense") return `Needs matching · ${shortDate(row.date)}`;
  if (kind === "asset") return `${row.status || "Active"} · ${shortDate(row.date_of_purchase)}`;
  const label = kind === "liability" ? "Liability" : "Equity";
  return [label, row.contact, row.date ? shortDate(row.date) : ""].filter(Boolean).join(" · ");
}

/** The id the match endpoints take — the record's own id field where it has one. */
export function matchableId(kind: MatchKind, row: UniboxMatchable): string {
  const own = { expense: row.expense_id, asset: row.asset_id, liability: row.liability_id, equity: row.equity_id }[kind];
  return String(own ?? row.id);
}

/** What's left to match: the row's remaining figure, else its whole price. */
export const remainingOf = (row: UniboxMatchable | PriorityData) =>
  toNumber(row.remainingAmount ?? row.remaining_amount ?? row.price);

/* ------------------------------------------------------------------ *
 * Time tracker — TimeTrackerCard.js
 * ------------------------------------------------------------------ */

/** timeEntryActions.js `isRunningTimeEntry`: a timer, still running. */
export const isRunningTimeEntry = (entry: UniboxTimeEntry) =>
  entry.entry_type === "timer" && String(entry.status || "").toLowerCase() === "running";

/**
 * Whether a row is the timer running right now.
 *
 * The app's active timer decides once it has answered — `activeTimerId` is its
 * id, or null when nothing is running. It changes the moment a timer starts or
 * stops anywhere (this card, the top bar, the Time Tracker), where this card's
 * own list only changes when it's refetched; trusting the list kept a stopped
 * timer's row on "Stop" until the page was reloaded. Until the active timer is
 * known (`undefined`), the row's own status is all there is.
 */
export function isLiveTimeEntry(entry: UniboxTimeEntry, activeTimerId?: string | null): boolean {
  if (activeTimerId === undefined) return isRunningTimeEntry(entry);
  return activeTimerId !== null && String(entry.id) === activeTimerId;
}

export const entryMinutes = (entry: UniboxTimeEntry) =>
  Math.round(toNumber(entry.duration_minutes ?? entry.duration));

const stamp = (value: unknown) => {
  const time = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

/** Latest activity first (updated, else created), ties by creation, then as sent; five. */
export function recentTimeEntries(entries: UniboxTimeEntry[]): UniboxTimeEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        stamp(b.entry.updated_at ?? b.entry.created_at) - stamp(a.entry.updated_at ?? a.entry.created_at) ||
        stamp(b.entry.created_at) - stamp(a.entry.created_at) ||
        a.index - b.index,
    )
    .slice(0, CARD_ROW_LIMIT)
    .map(({ entry }) => entry);
}

export const timeEntryTitle = (entry: UniboxTimeEntry) =>
  `${entry.task_name || "General task"}${entry.project_name ? ` — ${entry.project_name}` : ""}`;

/** The row's single button: Stop while running, else Invoice — or a spent "Invoiced". */
export function timeEntryAction(
  entry: UniboxTimeEntry,
  live: boolean = isRunningTimeEntry(entry),
): { label: "Stop" | "Invoice" | "Invoiced"; disabled: boolean } {
  if (live) return { label: "Stop", disabled: false };
  if (truthy(entry.is_invoiced)) return { label: "Invoiced", disabled: true };
  return { label: "Invoice", disabled: false };
}

/** "Running now", or "1.5 hrs · not yet invoiced". */
export function timeEntrySub(entry: UniboxTimeEntry, live: boolean = isRunningTimeEntry(entry)): string {
  if (live) return "Running now";
  return `${formatDuration(entryMinutes(entry))} · ${truthy(entry.is_invoiced) ? "invoiced" : "not yet invoiced"}`;
}

/** Five entries' worth of tracked time, for the card's headline figure. */
export const totalEntryMinutes = (entries: UniboxTimeEntry[]) =>
  entries.reduce((sum, entry) => sum + entryMinutes(entry), 0);

type Raw = Record<string, unknown>;

/** What the running timer already carries, to seed the save-and-stop dialog. */
export function selectionFromTimer(timer: ActiveTimer): TimerSelection {
  const task = (timer.raw.taskDetail ?? {}) as Raw;
  const rate = toNumber(task.rate);
  return {
    client: timer.clientId
      ? { clientId: timer.clientId, contactId: timer.contactId, name: timer.clientName, email: "" }
      : null,
    assignProject: !!timer.projectId,
    projectId: timer.projectId ?? "",
    jobId: timer.jobId ?? "",
    isBillable: timer.isBillable,
    hourlyRate: timer.hourlyRate || (rate ? String(rate) : ""),
  };
}

/** "Fitout · Stage 1" — the running timer's project and job. */
export function timerProjectLabel(timer: ActiveTimer | null): string {
  if (!timer) return "";
  const task = (timer.raw.taskDetail ?? {}) as Raw;
  const project = String(((task.projectDetail ?? {}) as Raw).project_name ?? "");
  const job = String(((task.jobDetail ?? {}) as Raw).job_name ?? "");
  return [project, job].filter(Boolean).join(" · ");
}

/**
 * The flat unibox entry as the one-task, one-log shape `buildTimeInvoice`
 * reads — the same line TimeEntryInvoiceFlow built from it.
 */
export function timeEntryInvoice(entry: UniboxTimeEntry): TimeInvoice | { error: string } {
  const task = mapTimeTask({
    task_id: entry.task_id ?? entry.id,
    task_name: entry.task_name,
    charge_type: entry.charge_type,
    rate: entry.rate,
    is_billable: entry.is_billable ?? 1,
    project_id: entry.project_id,
    project_name: entry.project_name,
    job_id: entry.project_job_id,
    job_name: entry.job_name,
    client_id: entry.client_id,
    contact_id: entry.contact_id,
    client_name: entry.client_name,
    time_entries: [
      {
        id: entry.id,
        log_date: entry.log_date ?? entry.start_time,
        start_time: entry.start_time,
        end_time: entry.end_time,
        created_at: entry.created_at,
        duration_minutes: entry.duration_minutes ?? entry.duration,
        amount: entry.amount,
        status: entry.status ?? "completed",
        is_invoiced: entry.is_invoiced,
        invoice_id: entry.invoice_id,
      },
    ],
  });
  return buildTimeInvoice([task], new Set([String(entry.id)]));
}

/* ------------------------------------------------------------------ *
 * Projects — ProjectsCard.js
 * ------------------------------------------------------------------ */

export const projectName = (project: UniboxProject) =>
  project.name || project.project_name || "Untitled project";

/** "Acme · Active · Due 8 Sept". */
export const projectSub = (project: UniboxProject) =>
  [project.client_name, project.status || "Active", project.end_date ? `Due ${shortDate(project.end_date)}` : ""]
    .filter(Boolean)
    .join(" · ");

/** "On hold" → "on_hold" — the key the tile's colour is looked up by. */
export const projectStatusKey = (project: UniboxProject) =>
  String(project.status || "active").toLowerCase().replace(/ /g, "_");

/* ------------------------------------------------------------------ *
 * Work coming up — WorkComingUpCard.js
 * ------------------------------------------------------------------ */

export function isCompletedTask(task: UniboxPlannerTask): boolean {
  const category = String(task.stage?.category || "").toLowerCase();
  const stage = String(task.stage?.name || "").toLowerCase();
  const status = String(task.status || "").toLowerCase();
  return Boolean(
    task.is_completed ||
      task.completed_at ||
      category === "closed" ||
      stage === "done" ||
      ["done", "completed"].includes(status),
  );
}

export const taskAmount = (task: UniboxPlannerTask) => toNumber(task.amount ?? task.total ?? task.value);

/** Billable and not done; five. */
export const workComingUpRows = (tasks: UniboxPlannerTask[]) =>
  tasks.filter((task) => truthy(task.is_billable) && !isCompletedTask(task)).slice(0, CARD_ROW_LIMIT);

export const totalBooked = (tasks: UniboxPlannerTask[]) =>
  tasks.reduce((sum, task) => sum + taskAmount(task), 0);

/** "Mon, 3 Nov, 9:00 am", or "Not scheduled". */
export function taskDate(value: string | null | undefined): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export const taskClient = (task: UniboxPlannerTask) =>
  task.contact?.name || task.contact?.label || task.client?.business_name || task.client?.name || "";

/** When and for whom — "Mon, 3 Nov, 9:00 am · Acme". */
export const taskWhen = (task: UniboxPlannerTask) =>
  [taskDate(task.start_at || task.event_start_at), taskClient(task)].filter(Boolean).join(" · ");

/** The task as the invoice flow takes it — `toInvoiceTask`. */
export const plannerTaskFor = (task: UniboxPlannerTask, index: number): PlannerTask =>
  normalizeListTask(
    {
      ...task,
      event_id: task.event_id ?? task.id,
      start_time: task.start_at || task.event_start_at,
      end_time: task.end_at || task.event_end_at,
    } as Parameters<typeof normalizeListTask>[0],
    index,
  );

/* ------------------------------------------------------------------ *
 * KM tracker — KmTrackerCard.js
 * ------------------------------------------------------------------ */

export const tripId = (trip: UniboxTrip) => String(trip.id ?? trip._id ?? "");
export const isTripInvoiced = (trip: UniboxTrip) => truthy(trip.is_invoiced) || Boolean(trip.invoice_id);
export const isTripReadyToInvoice = (trip: UniboxTrip) =>
  (truthy(trip.is_billable) || trip.isBillable === true) && !isTripInvoiced(trip);

/** Ready-to-invoice first, otherwise as sent; three. */
export const kmRows = (trips: UniboxTrip[]) =>
  [...trips].sort((a, b) => Number(isTripReadyToInvoice(b)) - Number(isTripReadyToInvoice(a))).slice(0, KM_ROW_LIMIT);

export const totalKm = (trips: UniboxTrip[]) =>
  trips.reduce((sum, trip) => sum + (parseFloat(String(trip.distance ?? "")) || 0), 0);

const TRIP_TYPE: Record<string, string> = { business: "Business", personal: "Personal", split: "Split" };
export const tripTypeLabel = (type: unknown) => TRIP_TYPE[String(type)] ?? "Unclassified";

export function formatTripDistance(distance: unknown): string {
  const value = Number(distance);
  return Number.isFinite(value) ? value.toFixed(2) : String(distance ?? "");
}

/** The address up to its first comma, cut to fit with an ellipsis. */
export function shortenLocation(location: string | null | undefined, max = 24): string {
  const primary = String(location || "").split(",")[0].trim();
  return primary.length <= max ? primary : `${primary.slice(0, max - 1).trimEnd()}…`;
}

/** `getTripTitle` — the reason and a shortened route, else the distance. */
export function tripTitle(trip: UniboxTrip): string {
  const reason = trip.reason || "Trip";
  const route = [shortenLocation(trip.start_location), shortenLocation(trip.end_location)]
    .filter(Boolean)
    .join(" → ");
  if (route) return `${reason} (${route})`;
  if (trip.distance) return `${reason} · ${formatTripDistance(trip.distance)} km`;
  return reason;
}

/** `getFullTripTitle` — the tooltip, with the whole route. */
export function fullTripTitle(trip: UniboxTrip): string {
  const route = [trip.start_location, trip.end_location].filter(Boolean).join(" → ");
  return route ? `${trip.reason || "Trip"} (${route})` : trip.reason || "Trip";
}

/** "8 Sept · 12.50 km · Business". */
export const tripSub = (trip: UniboxTrip) =>
  [shortDate(trip.date), trip.distance ? `${formatTripDistance(trip.distance)} km` : "", tripTypeLabel(trip.trip_type)]
    .filter(Boolean)
    .join(" · ");

/** The unibox row as the KM module's own trip — its distance field is named differently. */
export const kmTripFor = (trip: UniboxTrip): KmTrip =>
  mapKmTrip({ ...trip, id: tripId(trip), distance_km: trip.distance_km ?? trip.distance } as Parameters<
    typeof mapKmTrip
  >[0]);

/* ------------------------------------------------------------------ *
 * Your progress — YourProgressCard.js
 * ------------------------------------------------------------------ */

const FALLBACK_DAYS = ["S", "S", "M", "T", "W", "T", "Today"];
const MAX_RECENT = 5;

export function progressView(progress: UniboxProgress | null | undefined) {
  const activity = progress?.activity ?? {};
  const counts = Array.isArray(activity.counts) ? activity.counts : [];
  const toNext = progress?.streak?.to_next_level ?? 0;
  const nextLevel = progress?.streak?.next_level;
  return {
    score: progress?.health?.score ?? 0,
    level: progress?.streak?.level ?? "Regular",
    nextLevelText: nextLevel && toNext > 0 ? `${toNext} more to ${nextLevel}` : "Top tier!",
    percent: Math.min(100, Math.max(0, progress?.streak?.progress_percent ?? 0)),
    counts,
    days: activity.days?.length === counts.length ? activity.days : FALLBACK_DAYS.slice(0, counts.length),
    max: Math.max(...counts, 1),
    totalThisWeek: activity.total_this_week ?? 0,
    comparison: {
      direction: activity.comparison?.direction ?? "same",
      label: activity.comparison?.label ?? "Same as last week",
    },
    recent: Array.isArray(progress?.recent_actions) ? progress.recent_actions.slice(0, MAX_RECENT) : [],
  };
}

/** "1 action", "3 actions" — a bar's count, said in full. */
export const actionCountText = (count: number) => `${count} ${count === 1 ? "action" : "actions"}`;

/**
 * The date a bar stands for. The last bar is today and each one before it a
 * day earlier — which is what the server's single-letter labels ("S", "S")
 * can't say on their own.
 */
export function activityDay(index: number, length: number, now: number): Date {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - (length - 1 - index));
  return date;
}

/** "Today", else "Sat 7 Mar". */
export function activityDayLabel(index: number, length: number, now: number): string {
  if (index === length - 1) return "Today";
  return activityDay(index, length, now)
    .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "");
}

/* ------------------------------------------------------------------ *
 * The hero and the urgent five — pages/quick-actions
 * ------------------------------------------------------------------ */

export function heroView(progress: UniboxProgress | null | undefined) {
  const score = progress?.health?.score ?? 0;
  return {
    score,
    status: progress?.health?.status ?? "",
    /** Over 50 is green; 50 and under is the warning tone. */
    healthy: score > 50,
    streak: progress?.streak?.current ?? 0,
  };
}

/**
 * How the five are shared: setup suggestions first, then the AI review row,
 * then the server's priorities in whatever slots are left.
 */
export function topFive(input: {
  quickStartCount: number;
  aiCount: number;
  priorities: PriorityItem[];
  /** The server's own "to action" figure, when it sent one. */
  toActionFromServer?: number;
}) {
  const hasAi = input.aiCount > 0 ? 1 : 0;
  const slots = Math.max(0, TOP_N - input.quickStartCount - hasAi);
  return {
    slots,
    visible: input.priorities.slice(0, slots),
    leftToAction: input.quickStartCount + hasAi + input.priorities.length,
    toAction: (input.toActionFromServer ?? input.priorities.length) + input.quickStartCount + hasAi,
  };
}

export const priorityActions = (item: PriorityItem): PriorityAction[] =>
  Array.isArray(item.action) ? item.action : item.action ? [item.action] : [];

/** PriorityRow: label, badge, status line, amount and where "Open" goes, by resource type. */
export function describePriority(item: PriorityItem, now: number) {
  const data = item.data ?? {};
  const invoice = item.resource_type === "invoice";
  const bank = item.resource_type === "bank_feed";
  const overdue = item.type === "overdue_invoice";
  const due = data.due_date ? new Date(data.due_date) : null;
  const daysOverdue = overdue && due ? Math.max(0, Math.floor((now - due.getTime()) / DAY_MS)) : null;
  const amount = invoice ? data.total : bank ? data.amount : data.price;
  const credit = bank && data.direction === "credit";

  return {
    overdue,
    bank,
    title: invoice
      ? `${data.invoice_no || data.id} · ${data.client?.name || "Client"}`
      : bank
        ? data.description || "Bank transaction"
        : data.name || data.client?.name || "Expense",
    chip: invoice ? "Invoice" : bank ? "Bank" : "Expense",
    status: overdue
      ? `${daysOverdue || 0} ${daysOverdue === 1 ? "day" : "days"} overdue · Due ${data.due_date || ""}`
      : item.type === "due_invoice"
        ? `Due ${data.due_date || ""}`
        : bank
          ? `Unmatched${data.transaction_date ? ` · ${data.transaction_date}` : ""}`
          : `Needs matching${data.date ? ` · ${data.date}` : ""}`,
    amount,
    credit,
    /** The figure as shown: unsigned, "+" in front of money coming in. */
    amountText: amount == null ? null : `${credit ? "+" : ""}${uniboxMoney(Math.abs(toNumber(amount)))}`,
    href: invoice ? `/invoices/${item.entity_id}` : bank ? "/transactions" : `/expenses/${item.entity_id}`,
    openLabel: invoice ? "Open the invoice" : bank ? "Open the bank feed" : "Open the expense",
  };
}

export type PriorityRoute =
  | { kind: "invoice-reminder"; invoiceId: string }
  | { kind: "invoice-paid-cash"; invoiceId: string }
  | { kind: "bank-match" }
  | { kind: "expense-match" }
  | { kind: "expense-open"; href: string }
  | { kind: "none" };

/** `handlePriorityAction`: what pressing an action on a priority does. */
export function priorityRoute(item: PriorityItem, action: PriorityAction): PriorityRoute {
  if (item.resource_type === "invoice") {
    if (action.key === "follow_up") return { kind: "invoice-reminder", invoiceId: String(item.entity_id) };
    if (action.key === "mark_as_paid") return { kind: "invoice-paid-cash", invoiceId: String(item.entity_id) };
    return { kind: "none" };
  }
  if (item.resource_type === "bank_feed") {
    return action.key === "match" ? { kind: "bank-match" } : { kind: "none" };
  }
  if (item.resource_type === "expense") {
    return action.key.includes("match")
      ? { kind: "expense-match" }
      : { kind: "expense-open", href: `/expenses/${item.entity_id}` };
  }
  return { kind: "none" };
}

export const PRIORITY_ERRORS = {
  "invoice-reminder": "Failed to send the invoice reminder. Please try again.",
  "invoice-paid-cash": "Failed to update cash payment status. Please try again.",
} as const;

export const PRIORITY_SUCCESS = {
  "invoice-reminder": "Invoice reminder sent successfully!",
  "invoice-paid-cash": "Invoice marked as paid with cash successfully!",
} as const;

/** Acted on here *and* gone from the server's list — what the ring counts. */
export function clearedPriorityIds(touched: Iterable<string>, priorities: PriorityItem[]): string[] {
  const live = new Set(priorities.map((item) => item.id));
  return [...touched].filter((id) => !live.has(id));
}

/** The line beside the ring, by how long the run of clears is. */
export function runCopy(run: number, total: number): { headline: string; sub: string } {
  if (run >= 2) {
    return {
      headline: `${run} in a row`,
      sub: run >= 5 ? "On fire — unstoppable!" : run >= 3 ? "You're on a roll — keep going" : "Nice — keep it going",
    };
  }
  if (total === 0) return { headline: "All clear", sub: "Nothing waiting on you right now" };
  return { headline: "Ready when you are", sub: "Clear one to get the ball rolling" };
}

/** A toast from the third clear in a row; confetti at three and from five on. */
export const runToast = (run: number) => (run >= 3 ? `🔥 ${run} in a row!` : null);
export const runBursts = (run: number) => run === 3 || run >= 5;
