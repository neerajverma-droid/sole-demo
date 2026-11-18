/**
 * Supplier bills — money owed that hasn't been paid yet.
 *
 * A bill is recorded (read off the document, or typed in) as a saved draft,
 * and is not an expense: it stays out of the expense list, P&L and GST.
 * Converting it makes exactly one expense for the bill total, dated on the bill
 * date, and from there it's an ordinary expense — matched to a debit
 * transaction the same way. How much of a bill is paid is read off that
 * expense's matches; nothing on the bill itself stores it.
 *
 * Two things are kept apart on purpose:
 *  - `status` is where the bill is in its life: saved, converted or void.
 *  - `paymentStatus` / `isOverdue` say whether it's still owed. A saved bill is
 *    owed too — it just hasn't been turned into an expense yet.
 *
 * A repeating bill runs on a schedule (`BillSchedule`). Each copy the schedule
 * makes is an ordinary bill carrying `occurrenceNo`, and the copies still to
 * come show up as `BillExpected` rows before they exist. Backed by sole-ocr's
 * `/v2/bill` (migrations 0158 and 0185).
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { mapApiMatchCandidate, type ApiMatchCandidate, type PossibleMatches } from "@/lib/bank-match";
import type { ExpenseAttachment } from "@/lib/expenses";

export const BILL_FILTERS = ["All", "To convert", "Unpaid", "Overdue", "Paid"] as const;
export type BillFilter = (typeof BILL_FILTERS)[number];

/** What the server calls each list filter. "Unpaid" is everything still owed, saved bills included. */
const BILL_FILTER_PARAM: Record<BillFilter, string> = {
  All: "all",
  "To convert": "draft",
  Unpaid: "unpaid",
  Overdue: "overdue",
  Paid: "paid",
};

/** How often a bill can repeat — the ids are what the server stores. */
export const BILL_REPEAT_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half yearly" },
  { value: "yearly", label: "Yearly" },
] as const;
export type BillRepeatFrequency = (typeof BILL_REPEAT_OPTIONS)[number]["value"];

export function billRepeatLabel(frequency: string): string {
  return BILL_REPEAT_OPTIONS.find((option) => option.value === frequency)?.label ?? "";
}

const REPEAT_STEPS: Record<BillRepeatFrequency, { days?: number; months?: number }> = {
  weekly: { days: 7 },
  fortnightly: { days: 14 },
  monthly: { months: 1 },
  quarterly: { months: 3 },
  half_yearly: { months: 6 },
  yearly: { months: 12 },
};

/**
 * The date one repeat after `iso` — what a new repeat's next bill date starts
 * at. Month-based steps keep the day where the month has it and fall back to
 * the month's last day where it doesn't (31 Jan → 28 Feb), as the server does.
 */
export function stepRepeatDate(iso: string, frequency: BillRepeatFrequency): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  const step = REPEAT_STEPS[frequency];
  if (step.days) return addDays(iso, step.days);
  const target = new Date(Date.UTC(year, month - 1 + (step.months ?? 0), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function toFrequency(value: unknown): BillRepeatFrequency {
  return BILL_REPEAT_OPTIONS.some((option) => option.value === value) ? (value as BillRepeatFrequency) : "monthly";
}

/** When a repeat stops: never, after a date, or after a number of bills (a loan's 12 payments). */
export const BILL_REPEAT_ENDS = [
  { value: "never", label: "Until I stop it" },
  { value: "on_date", label: "On a date" },
  { value: "after_count", label: "After a number of bills" },
] as const;
export type BillRepeatEnd = (typeof BILL_REPEAT_ENDS)[number]["value"];

function toRepeatEnd(value: unknown): BillRepeatEnd {
  return value === "on_date" || value === "after_count" ? value : "never";
}

/** Where the bill is in its life, as stored. */
export type BillStatus = "draft" | "approved" | "void";
/** Whether it's still owed — worked out by the server from its expense's matches. */
export type BillPaymentStatus = "unpaid" | "part_paid" | "paid" | "void";
export type BillScheduleStatus = "active" | "ended" | "stopped";

/** One line as typed — text, so a half-typed amount can be shown, not swallowed. */
export type BillLine = {
  key: string;
  description: string;
  quantity: string;
  /** Unit price, excluding tax. */
  price: string;
  gst: boolean;
};

/** What a bill row knows about the schedule it came from. */
export type BillScheduleSummary = {
  id: string;
  frequency: BillRepeatFrequency;
  status: BillScheduleStatus;
  /** Bill date of the next copy; "" once the schedule has ended or stopped. */
  nextDate: string;
  endType: BillRepeatEnd;
  endDate: string;
  totalCount: number | null;
  occurrencesMade: number;
};

export type Bill = {
  id: string;
  billNo: string;
  /** ISO `YYYY-MM-DD`, or "" while a draft has none. */
  billDate: string;
  dueDate: string;
  status: BillStatus;
  paymentStatus: BillPaymentStatus;
  /** Still owed and past its due date. A saved bill can be overdue too. */
  isOverdue: boolean;
  amountPaid: number;
  /** What's still owed: the total less what's been matched so far. */
  amountDue: number;
  /**
   * List rows only: bank transactions within matching tolerance of what's
   * owed — the expense list's own signal, driving the AI Match button.
   */
  possibleMatch: number;
  subTotal: number;
  totalGst: number;
  total: number;
  notes: string;
  source: "manual" | "ocr";
  /** 0–100 when the bill was read off a document. */
  confidence: number | null;
  /** The expense converting made; null while it's only saved. */
  expenseId: string | null;
  /** Which bill of its series this is (1-based); null when it isn't from a schedule. */
  occurrenceNo: number | null;
  schedule: BillScheduleSummary | null;
  supplierId: string | null;
  supplierName: string;
  categoryId: string;
  category: string;
  /** Detail only — the list row carries no lines. */
  lines: BillLine[];
  /**
   * The tax rate the lines were recorded at. Kept while the bill date doesn't
   * change, so an edit never re-prices a draft — the server does the same.
   */
  gstPercent: number | null;
  attachments: ExpenseAttachment[];
  /** Another bill from the same supplier with the same number — a warning, never a block. */
  duplicateOf: string | null;
};

/** A copy a schedule will make later — shown ahead of time, not a bill yet. */
export type BillExpected = {
  /** Stable for a list key: the schedule and which bill of it this is. */
  key: string;
  scheduleId: string;
  occurrenceNo: number;
  totalCount: number | null;
  frequency: BillRepeatFrequency;
  billDate: string;
  dueDate: string;
  total: number;
  supplierId: string | null;
  supplierName: string;
  category: string;
  /**
   * A date the owner skipped: it won't be made and uses up no count. Only the
   * schedule panel lists these (struck through, with Undo); they carry no
   * occurrence number.
   */
  skipped: boolean;
};

/** How a new bill repeats, as the form edits it. Counts are text while typed. */
export type BillRepeatDraft = {
  enabled: boolean;
  frequency: BillRepeatFrequency;
  /** ISO date the next copy is made; "" until one is picked. */
  nextDate: string;
  endType: BillRepeatEnd;
  endDate: string;
  totalCount: string;
};

export type BillDraft = {
  supplierId: string | null;
  supplierName: string;
  categoryId: string;
  category: string;
  billNo: string;
  billDate: string;
  dueDate: string;
  notes: string;
  lines: BillLine[];
  source: "manual" | "ocr";
  confidence: number | null;
  /**
   * Only read when the bill starts a repeat (a new bill, or a saved one not in
   * a series yet). A bill already in a series is changed through its schedule.
   */
  repeat: BillRepeatDraft;
};

/** One bucket of the Bills hero: what's still owed in it, and how many bills. */
export type BillDueBucket = { amount: number; count: number; expectedCount: number };

/** The Bills page's hero: what's been paid this month, then what's coming, from today. */
export type BillSummary = {
  asOf: string;
  /** Payments matched to bills this calendar month, by the bank transaction's date. */
  paidThisMonth: { amount: number; count: number };
  overdue: BillDueBucket;
  due7: BillDueBucket;
  due30: BillDueBucket;
  owed: BillDueBucket;
};

/** A bill of a series, as the schedule panel lists it. */
export type BillSeriesRow = {
  id: string;
  billNo: string;
  billDate: string;
  dueDate: string;
  total: number;
  status: BillStatus;
  paymentStatus: BillPaymentStatus;
  isOverdue: boolean;
  occurrenceNo: number | null;
};

export type BillSchedule = BillScheduleSummary & {
  /** Days from each copy's bill date to its due date; null = copies have no due date. */
  dueDays: number | null;
  subTotal: number;
  totalGst: number;
  total: number;
  notes: string;
  supplierId: string | null;
  supplierName: string;
  categoryId: string;
  category: string;
  lines: BillLine[];
  /** Every bill made so far, newest first. */
  bills: BillSeriesRow[];
  /** The next few copies to come. */
  upcoming: BillExpected[];
};

/** A schedule as the Manage repeat panel edits it. */
export type BillScheduleDraft = {
  supplierId: string | null;
  supplierName: string;
  categoryId: string;
  category: string;
  notes: string;
  frequency: BillRepeatFrequency;
  nextDate: string;
  /** Text while typed; "" = copies have no due date. */
  dueDays: string;
  endType: BillRepeatEnd;
  endDate: string;
  totalCount: string;
  lines: BillLine[];
};

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

export type BillBadge = {
  label: string;
  variant: "secondary" | "warning" | "danger" | "success" | "outline";
};

/**
 * The one status a bill shows. Being overdue wins over everything still owed;
 * a saved bill that isn't overdue reads "Saved", because converting it is the
 * next thing it needs.
 */
export function billBadge(bill: Pick<Bill, "status" | "paymentStatus" | "isOverdue">): BillBadge {
  if (bill.status === "void" || bill.paymentStatus === "void") return { label: "Void", variant: "outline" };
  if (bill.paymentStatus === "paid") return { label: "Paid", variant: "success" };
  if (bill.isOverdue) return { label: "Overdue", variant: "danger" };
  if (bill.paymentStatus === "part_paid") return { label: "Part paid", variant: "warning" };
  if (bill.status === "draft") return { label: "Saved", variant: "secondary" };
  return { label: "Unpaid", variant: "warning" };
}

export function isBillOwed(bill: Pick<Bill, "status" | "paymentStatus">): boolean {
  return bill.status !== "void" && (bill.paymentStatus === "unpaid" || bill.paymentStatus === "part_paid");
}

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`, both ISO dates; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** An ISO date moved by whole days. */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/**
 * The due date's colour, as the invoice list colours its own: red once a bill
 * still owed is overdue, amber while it falls due within a week, muted
 * otherwise (and always once paid).
 */
export function billDueClass(bill: Pick<Bill, "dueDate" | "status" | "paymentStatus" | "isOverdue">, today: string): string {
  if (!bill.dueDate || !isBillOwed(bill)) return "text-muted-foreground";
  if (bill.isOverdue || bill.dueDate < today) return "font-medium text-destructive";
  if (daysBetween(today, bill.dueDate) <= 7) return "font-medium text-warning";
  return "text-muted-foreground";
}

/** "3 of 12" for a series with an end count; otherwise null. */
export function occurrenceLabel(occurrenceNo: number | null, totalCount: number | null): string | null {
  if (!occurrenceNo || !totalCount) return null;
  return `${occurrenceNo} of ${totalCount}`;
}

/** "Repeats monthly", "Repeated monthly" once the schedule is over. */
export function scheduleLabel(schedule: Pick<BillScheduleSummary, "frequency" | "status">): string {
  const frequency = billRepeatLabel(schedule.frequency).toLowerCase();
  return schedule.status === "active" ? `Repeats ${frequency}` : `Repeated ${frequency}`;
}

/** "12 bills", "until 30/06/2027", or nothing for a repeat with no end. */
export function scheduleEndLabel(schedule: Pick<BillScheduleSummary, "endType" | "endDate" | "totalCount">): string | null {
  if (schedule.endType === "after_count" && schedule.totalCount) return `${schedule.totalCount} bills in all`;
  if (schedule.endType === "on_date" && schedule.endDate) {
    const [year, month, day] = schedule.endDate.split("-");
    return `Until ${day}/${month}/${year}`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Upcoming — owed bills and expected copies, grouped by when they're due
 * ------------------------------------------------------------------ */

export type UpcomingItem = { kind: "bill"; bill: Bill } | { kind: "expected"; expected: BillExpected };

export type UpcomingGroupId = "overdue" | "week" | "month" | "later" | "undated";

export type UpcomingGroup = {
  id: UpcomingGroupId;
  title: string;
  total: number;
  items: UpcomingItem[];
};

const UPCOMING_TITLES: Record<UpcomingGroupId, string> = {
  overdue: "Overdue",
  week: "Due in the next 7 days",
  month: "Due within 30 days",
  later: "Later",
  undated: "No due date",
};

/** When an item is due, for sorting and grouping; an expected copy with no due date falls due on its bill date. */
export function upcomingDueDate(item: UpcomingItem): string {
  return item.kind === "bill" ? item.bill.dueDate : item.expected.dueDate || item.expected.billDate;
}

export function upcomingAmount(item: UpcomingItem): number {
  return item.kind === "bill" ? item.bill.amountDue : item.expected.total;
}

/**
 * Owed bills and expected copies in the buckets the hero uses: overdue, the
 * next 7 days, within 30, later, and bills with no due date. Empty groups are
 * left out; each group is soonest first.
 */
export function groupUpcoming(bills: Bill[], expected: BillExpected[], today: string): UpcomingGroup[] {
  const items: UpcomingItem[] = [
    ...bills.filter(isBillOwed).map((bill) => ({ kind: "bill" as const, bill })),
    ...expected.map((entry) => ({ kind: "expected" as const, expected: entry })),
  ];
  const buckets = new Map<UpcomingGroupId, UpcomingItem[]>();
  for (const item of items) {
    const due = upcomingDueDate(item);
    let id: UpcomingGroupId;
    if (!due) id = "undated";
    else {
      const days = daysBetween(today, due);
      id = days < 0 ? "overdue" : days <= 7 ? "week" : days <= 30 ? "month" : "later";
    }
    buckets.set(id, [...(buckets.get(id) ?? []), item]);
  }
  const order: UpcomingGroupId[] = ["overdue", "week", "month", "later", "undated"];
  return order
    .filter((id) => buckets.has(id))
    .map((id) => {
      const groupItems = (buckets.get(id) ?? []).sort((a, b) => {
        const byDate = upcomingDueDate(a).localeCompare(upcomingDueDate(b));
        // A real bill before the expected copy on the same day.
        return byDate !== 0 ? byDate : a.kind === b.kind ? 0 : a.kind === "bill" ? -1 : 1;
      });
      return {
        id,
        title: UPCOMING_TITLES[id],
        total: round2(groupItems.reduce((sum, item) => sum + upcomingAmount(item), 0)),
        items: groupItems,
      };
    });
}

/* ------------------------------------------------------------------ *
 * Drafts and validation
 * ------------------------------------------------------------------ */

let lineSeq = 0;
export function newBillLine(values: Partial<Omit<BillLine, "key">> = {}): BillLine {
  lineSeq += 1;
  return {
    key: `line_${Date.now()}_${lineSeq}`,
    description: "",
    quantity: "1",
    price: "",
    gst: false,
    ...values,
  };
}

export function emptyRepeatDraft(): BillRepeatDraft {
  return { enabled: false, frequency: "monthly", nextDate: "", endType: "never", endDate: "", totalCount: "" };
}

export function emptyBillDraft(today: string): BillDraft {
  return {
    supplierId: null,
    supplierName: "",
    categoryId: "",
    category: "",
    billNo: "",
    billDate: today,
    // Due the day it's dated until told otherwise.
    dueDate: today,
    notes: "",
    lines: [newBillLine()],
    source: "manual",
    confidence: null,
    repeat: emptyRepeatDraft(),
  };
}

export function draftFromBill(bill: Bill): BillDraft {
  return {
    supplierId: bill.supplierId,
    supplierName: bill.supplierName,
    categoryId: bill.categoryId,
    category: bill.category,
    billNo: bill.billNo,
    billDate: bill.billDate,
    dueDate: bill.dueDate || bill.billDate,
    notes: bill.notes,
    lines: bill.lines.length > 0 ? bill.lines : [newBillLine()],
    source: bill.source,
    confidence: bill.confidence,
    repeat: emptyRepeatDraft(),
  };
}

/**
 * A repeat setting changed on the bill form. Until the next bill date has been
 * picked by hand (`nextPicked`), it follows the bill date and the frequency —
 * one repeat on — whenever the repeat is switched on or its frequency changes.
 */
export function withRepeatChange(
  draft: Pick<BillDraft, "billDate" | "repeat">,
  values: Partial<BillRepeatDraft>,
  nextPicked: boolean,
  today: string,
): BillRepeatDraft {
  const repeat = { ...draft.repeat, ...values };
  const startsNow = values.enabled === true && !draft.repeat.enabled;
  if (!nextPicked && !("nextDate" in values) && repeat.enabled && (startsNow || "frequency" in values || !repeat.nextDate)) {
    repeat.nextDate = stepRepeatDate(draft.billDate || today, repeat.frequency);
  }
  return repeat;
}

/**
 * The bill date changed on the form. The due date moves with it while it
 * hasn't been picked by hand and still sits on the old bill date (or is
 * empty); a repeat's next bill date moves with it until that's been picked.
 */
export function withBillDate(
  draft: Pick<BillDraft, "billDate" | "dueDate" | "repeat">,
  billDate: string,
  picks: { duePicked: boolean; nextPicked: boolean },
  today: string,
): Pick<BillDraft, "billDate"> & Partial<Pick<BillDraft, "dueDate" | "repeat">> {
  const dueFollows = !picks.duePicked && (!draft.dueDate || draft.dueDate === draft.billDate);
  const nextFollows = draft.repeat.enabled && !picks.nextPicked;
  return {
    billDate,
    ...(dueFollows ? { dueDate: billDate } : {}),
    ...(nextFollows ? { repeat: { ...draft.repeat, nextDate: stepRepeatDate(billDate || today, draft.repeat.frequency) } } : {}),
  };
}

export function draftFromSchedule(schedule: BillSchedule): BillScheduleDraft {
  return {
    supplierId: schedule.supplierId,
    supplierName: schedule.supplierName,
    categoryId: schedule.categoryId,
    category: schedule.category,
    notes: schedule.notes,
    frequency: schedule.frequency,
    nextDate: schedule.nextDate,
    dueDays: String(schedule.dueDays ?? 0),
    endType: schedule.endType,
    endDate: schedule.endDate,
    totalCount: schedule.totalCount != null ? String(schedule.totalCount) : "",
    lines: schedule.lines.length > 0 ? schedule.lines : [newBillLine()],
  };
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** A row with nothing typed in it — dropped on save, the same as the server does. */
export function isBlankLine(line: BillLine): boolean {
  return !line.description.trim() && !(Number(line.price) || 0);
}

/**
 * The same sums the server makes: each line is entered excluding tax and a
 * taxed line is charged at the business's rate. `rate` is 0 for a business
 * that isn't registered, and then no line carries tax.
 */
export function billTotals(lines: BillLine[], rate: number) {
  const rows = lines.map((line) => {
    const quantity = Number(line.quantity) || 0;
    const net = round2(quantity * (Number(line.price) || 0));
    const tax = line.gst && rate > 0 ? round2((net * rate) / 100) : 0;
    return { key: line.key, net, tax, gross: round2(net + tax) };
  });
  const subTotal = round2(rows.reduce((sum, row) => sum + row.net, 0));
  const totalGst = round2(rows.reduce((sum, row) => sum + row.tax, 0));
  return { rows, subTotal, totalGst, total: round2(subTotal + totalGst) };
}

export type BillIssue = { key: string; message: string };

function lineIssues(lines: BillLine[]): BillIssue[] {
  const issues: BillIssue[] = [];
  lines.forEach((line, index) => {
    if (isBlankLine(line)) return;
    const quantity = Number(line.quantity);
    if (!line.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      issues.push({ key: `line-${line.key}-quantity`, message: `Line ${index + 1}: quantity must be more than 0` });
    }
    if (line.price.trim() && !Number.isFinite(Number(line.price))) {
      issues.push({ key: `line-${line.key}-price`, message: `Line ${index + 1}: enter a valid price` });
    }
  });
  return issues;
}

/** What blocks saving at all — a draft may be incomplete, but not wrong. */
export function billIssues(draft: BillDraft): BillIssue[] {
  const issues = lineIssues(draft.lines);
  if (draft.billDate && draft.dueDate && draft.dueDate < draft.billDate) {
    issues.push({ key: "dueDate", message: "Due date can't be before the bill date" });
  }
  return issues;
}

/**
 * The end rule of a repeat: a date on or after the next copy, or a count of at
 * least `minCount` bills. Shared by a new bill's repeat and the schedule panel.
 */
function repeatEndIssues(
  repeat: { nextDate: string; endType: BillRepeatEnd; endDate: string; totalCount: string },
  minCount: number,
): BillIssue[] {
  if (repeat.endType === "on_date") {
    if (!repeat.endDate) return [{ key: "repeatEndDate", message: "Pick the date the repeat ends" }];
    if (repeat.nextDate && repeat.endDate < repeat.nextDate) {
      return [{ key: "repeatEndDate", message: "The end date can't be before the next bill" }];
    }
  }
  if (repeat.endType === "after_count") {
    const count = Number(repeat.totalCount);
    if (!repeat.totalCount.trim() || !Number.isInteger(count) || count < minCount) {
      return [{ key: "repeatTotalCount", message: `Enter a whole number of bills, ${minCount} or more` }];
    }
  }
  return [];
}

/**
 * What else saving needs on top of `billIssues`: a supplier and a category, and
 * — for a bill starting a repeat — when it repeats next and when it stops.
 * Shown once a save is tried.
 */
export function saveIssues(draft: BillDraft, startsRepeat = true): BillIssue[] {
  const issues: BillIssue[] = [];
  if (!draft.supplierId) issues.push({ key: "supplier", message: "Choose a supplier" });
  if (!draft.categoryId) issues.push({ key: "category", message: "Choose a category" });
  if (!draft.dueDate) issues.push({ key: "dueDate", message: "Add the due date" });
  if (startsRepeat && draft.repeat.enabled) {
    if (!draft.repeat.nextDate) {
      issues.push({ key: "repeatNextDate", message: "Pick when it repeats next" });
    } else if (draft.billDate && draft.repeat.nextDate <= draft.billDate) {
      issues.push({ key: "repeatNextDate", message: "The next date must be after the bill date" });
    }
    // This bill is the first of the series, so a count of 1 wouldn't repeat at all.
    issues.push(...repeatEndIssues(draft.repeat, 2));
  }
  return issues;
}

/** What converting needs, on top of `billIssues` — the server checks the same. */
export function approveIssues(draft: BillDraft, total: number): BillIssue[] {
  const issues: BillIssue[] = [];
  if (!draft.supplierId) issues.push({ key: "supplier", message: "Choose a supplier" });
  if (!draft.categoryId) issues.push({ key: "category", message: "Choose a category" });
  if (!draft.billDate) issues.push({ key: "billDate", message: "Add the bill date" });
  if (!(total > 0)) issues.push({ key: "total", message: "Add at least one line with an amount" });
  return issues;
}

/** What blocks saving a schedule's changes. `occurrencesMade` bills already exist, so a count must go past them. */
export function scheduleIssues(draft: BillScheduleDraft, occurrencesMade: number, today: string): BillIssue[] {
  const issues = lineIssues(draft.lines);
  if (!draft.supplierId) issues.push({ key: "supplier", message: "Choose a supplier" });
  if (!draft.categoryId) issues.push({ key: "category", message: "Choose a category" });
  if (!draft.nextDate) issues.push({ key: "repeatNextDate", message: "Pick when the next bill is made" });
  else if (draft.nextDate < today) issues.push({ key: "repeatNextDate", message: "The next bill can't be in the past" });
  // Every bill has a due date, so every copy needs a gap — 0 is due on the bill date.
  const days = Number(draft.dueDays);
  if (!draft.dueDays.trim() || !Number.isInteger(days) || days < 0) {
    issues.push({ key: "dueDays", message: "Enter a whole number of days, 0 or more" });
  }
  issues.push(...repeatEndIssues(draft, occurrencesMade + 1));
  return issues;
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

type ApiBillItem = {
  description?: string | null;
  qty?: number | string | null;
  price?: number | string | null;
  gst?: boolean | number | null;
  gst_percentage?: number | string | null;
};

type ApiClientRef = { client_id?: number | string | null; name?: string | null } | null;
type ApiCategoryRef = { account_subcategory_id?: number | string | null; name?: string | null } | null;

type ApiScheduleSummary = {
  schedule_id: number | string;
  frequency?: string | null;
  status?: string | null;
  next_date?: string | null;
  end_type?: string | null;
  end_date?: string | null;
  total_count?: number | string | null;
  occurrences_made?: number | string | null;
};

type ApiBill = {
  bill_id: number | string;
  bill_no?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  status: BillStatus;
  payment_status?: string | null;
  is_overdue?: boolean | number | null;
  amount_paid?: number | string | null;
  amount_due?: number | string | null;
  possible_match?: number | string | null;
  sub_total?: number | string | null;
  total_gst?: number | string | null;
  total?: number | string | null;
  notes?: string | null;
  source?: "manual" | "ocr" | null;
  ocr_confidence?: number | string | null;
  expense_id?: number | string | null;
  occurrence_no?: number | string | null;
  schedule?: ApiScheduleSummary | null;
  client?: ApiClientRef;
  account_subcategory?: ApiCategoryRef;
  items?: ApiBillItem[] | null;
  documents?: { document_id?: number | string | null; file_name?: string | null; file_path?: string | null }[] | null;
  duplicate_of?: number | string | null;
};

type ApiExpected = {
  schedule_id: number | string;
  occurrence_no?: number | string | null;
  total_count?: number | string | null;
  frequency?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  total?: number | string | null;
  client?: ApiClientRef;
  account_subcategory?: ApiCategoryRef;
  skipped?: boolean | null;
};

const isoDate = (value: string | null | undefined) => value?.slice(0, 10) ?? "";
const optionalCount = (value: unknown) => {
  const count = Number(value);
  return value != null && Number.isFinite(count) && count > 0 ? count : null;
};

function toPaymentStatus(value: unknown, status: BillStatus): BillPaymentStatus {
  if (status === "void" || value === "void") return "void";
  if (value === "paid" || value === "part_paid") return value;
  return "unpaid";
}

function mapScheduleSummary(raw: ApiScheduleSummary): BillScheduleSummary {
  return {
    id: String(raw.schedule_id),
    frequency: toFrequency(raw.frequency),
    status: raw.status === "ended" || raw.status === "stopped" ? raw.status : "active",
    nextDate: isoDate(raw.next_date),
    endType: toRepeatEnd(raw.end_type),
    endDate: isoDate(raw.end_date),
    totalCount: optionalCount(raw.total_count),
    occurrencesMade: Number(raw.occurrences_made) || 0,
  };
}

function mapItems(items: ApiBillItem[] | null | undefined): BillLine[] {
  return (items ?? []).map((item) =>
    newBillLine({
      description: item.description ?? "",
      quantity: String(Number(item.qty) || 1),
      price: item.price != null ? String(Number(item.price)) : "",
      gst: Boolean(Number(item.gst)),
    }),
  );
}

function mapApiBill(raw: ApiBill): Bill {
  const total = Number(raw.total) || 0;
  const paymentStatus = toPaymentStatus(raw.payment_status, raw.status);
  const amountPaid = Number(raw.amount_paid) || 0;
  return {
    id: String(raw.bill_id),
    billNo: raw.bill_no?.trim() ?? "",
    billDate: isoDate(raw.bill_date),
    dueDate: isoDate(raw.due_date),
    status: raw.status,
    paymentStatus,
    isOverdue: Boolean(Number(raw.is_overdue)) || raw.is_overdue === true,
    amountPaid,
    amountDue: raw.amount_due != null ? Number(raw.amount_due) || 0 : paymentStatus === "paid" || paymentStatus === "void" ? 0 : round2(total - amountPaid),
    possibleMatch: Number(raw.possible_match) || 0,
    subTotal: Number(raw.sub_total) || 0,
    totalGst: Number(raw.total_gst) || 0,
    total,
    notes: raw.notes ?? "",
    source: raw.source === "ocr" ? "ocr" : "manual",
    confidence: raw.ocr_confidence != null && Number.isFinite(Number(raw.ocr_confidence)) ? Number(raw.ocr_confidence) : null,
    expenseId: raw.expense_id != null ? String(raw.expense_id) : null,
    occurrenceNo: optionalCount(raw.occurrence_no),
    schedule: raw.schedule ? mapScheduleSummary(raw.schedule) : null,
    supplierId: raw.client?.client_id != null ? String(raw.client.client_id) : null,
    supplierName: raw.client?.name?.trim() ?? "",
    categoryId: raw.account_subcategory?.account_subcategory_id != null ? String(raw.account_subcategory.account_subcategory_id) : "",
    category: raw.account_subcategory?.name?.trim() ?? "",
    lines: mapItems(raw.items),
    gstPercent: (() => {
      const rate = Number((raw.items ?? []).find((item) => Boolean(Number(item.gst)))?.gst_percentage);
      return rate > 0 ? rate : null;
    })(),
    attachments: (raw.documents ?? [])
      .filter((document) => document.file_path)
      .map((document) => ({
        documentId: String(document.document_id ?? ""),
        name: document.file_name?.trim() || "Attachment",
        url: document.file_path as string,
      })),
    duplicateOf: raw.duplicate_of != null ? String(raw.duplicate_of) : null,
  };
}

function mapExpected(raw: ApiExpected): BillExpected {
  const occurrenceNo = Number(raw.occurrence_no) || 0;
  const skipped = Boolean(raw.skipped);
  return {
    // A skipped date has no number, so its date keeps the key unique.
    key: skipped ? `${raw.schedule_id}-skipped-${isoDate(raw.bill_date)}` : `${raw.schedule_id}-${occurrenceNo}`,
    skipped,
    scheduleId: String(raw.schedule_id),
    occurrenceNo,
    totalCount: optionalCount(raw.total_count),
    frequency: toFrequency(raw.frequency),
    billDate: isoDate(raw.bill_date),
    dueDate: isoDate(raw.due_date),
    total: Number(raw.total) || 0,
    supplierId: raw.client?.client_id != null ? String(raw.client.client_id) : null,
    supplierName: raw.client?.name?.trim() ?? "",
    category: raw.account_subcategory?.name?.trim() ?? "",
  };
}

const apiLines = (lines: BillLine[]) =>
  lines
    .filter((line) => !isBlankLine(line))
    .map((line) => ({
      description: line.description.trim(),
      qty: Number(line.quantity) || 1,
      price: Number(line.price) || 0,
      gst: line.gst,
    }));

function apiRepeatEnd(repeat: { endType: BillRepeatEnd; endDate: string; totalCount: string }) {
  return {
    end_type: repeat.endType,
    end_date: repeat.endType === "on_date" ? repeat.endDate || null : null,
    total_count: repeat.endType === "after_count" ? Number(repeat.totalCount) || null : null,
  };
}

function draftToApiFields(draft: BillDraft, startsRepeat: boolean) {
  return {
    client_id: draft.supplierId,
    account_subcategory_id: draft.categoryId || null,
    bill_no: draft.billNo.trim(),
    bill_date: draft.billDate || null,
    due_date: draft.dueDate || null,
    notes: draft.notes.trim(),
    source: draft.source,
    ocr_confidence: draft.confidence,
    items: apiLines(draft.lines),
    ...(startsRepeat && draft.repeat.enabled
      ? {
          repeat: {
            frequency: draft.repeat.frequency,
            next_date: draft.repeat.nextDate || null,
            ...apiRepeatEnd(draft.repeat),
          },
        }
      : {}),
  };
}

function scheduleDraftToApiFields(draft: BillScheduleDraft) {
  return {
    client_id: draft.supplierId,
    account_subcategory_id: draft.categoryId || null,
    notes: draft.notes.trim(),
    frequency: draft.frequency,
    next_date: draft.nextDate || null,
    due_days: Number(draft.dueDays) || 0,
    ...apiRepeatEnd(draft),
    items: apiLines(draft.lines),
  };
}

/** A 200 that says it failed (the plan limit answers this way) is still a failure. */
function assertSuccess<T>(body: ApiEnvelope<T> | undefined, fallback: string): T {
  if (!body?.success) throw new Error(body?.message || fallback);
  return body.data as T;
}

export type BillListFilters = {
  status: BillFilter;
  search: string;
  /** Bill date range, inclusive ISO dates. */
  from?: string;
  to?: string;
  supplierId?: string;
  /** Leave one bill out — the supplier history on a bill's own page. */
  excludeId?: string;
};

export async function fetchBillsPage(
  page: number,
  pageSize: number,
  filters: BillListFilters,
): Promise<{ bills: Bill[]; total: number }> {
  const response = await api.get<ApiEnvelope<{ bills: ApiBill[]; pagination: { total: number } }>>(apiRoutes.bill.list, {
    params: {
      page,
      limit: pageSize,
      status: BILL_FILTER_PARAM[filters.status],
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.supplierId ? { client_id: filters.supplierId } : {}),
      ...(filters.excludeId ? { exclude_id: filters.excludeId } : {}),
    },
  });
  const data = assertSuccess(response.data, "Couldn't load bills.");
  return { bills: (data?.bills ?? []).map(mapApiBill), total: data?.pagination?.total ?? 0 };
}

type ApiDueBucket = { amount?: number | string; count?: number | string; expected_count?: number | string };

export async function fetchBillSummary(): Promise<BillSummary> {
  const response = await api.get<
    ApiEnvelope<{
      as_of?: string;
      paid_this_month?: { amount?: number | string; count?: number | string };
      overdue?: ApiDueBucket;
      due_7_days?: ApiDueBucket;
      due_30_days?: ApiDueBucket;
      owed?: ApiDueBucket;
    }>
  >(apiRoutes.bill.summary);
  const data = assertSuccess(response.data, "Couldn't load the bill summary.");
  const bucket = (raw: ApiDueBucket | undefined): BillDueBucket => ({
    amount: Number(raw?.amount) || 0,
    count: Number(raw?.count) || 0,
    expectedCount: Number(raw?.expected_count) || 0,
  });
  return {
    asOf: isoDate(data?.as_of),
    paidThisMonth: {
      amount: Number(data?.paid_this_month?.amount) || 0,
      count: Number(data?.paid_this_month?.count) || 0,
    },
    overdue: bucket(data?.overdue),
    due7: bucket(data?.due_7_days),
    due30: bucket(data?.due_30_days),
    owed: bucket(data?.owed),
  };
}

/** Every bill still owed, and the copies schedules will make in the next `days`. */
export async function fetchUpcomingBills(days: number): Promise<{ asOf: string; bills: Bill[]; expected: BillExpected[] }> {
  const response = await api.get<ApiEnvelope<{ as_of?: string; bills?: ApiBill[]; expected?: ApiExpected[] }>>(
    apiRoutes.bill.upcoming,
    { params: { days } },
  );
  const data = assertSuccess(response.data, "Couldn't load upcoming bills.");
  return {
    asOf: isoDate(data?.as_of),
    bills: (data?.bills ?? []).map(mapApiBill),
    expected: (data?.expected ?? []).map(mapExpected),
  };
}

/** Bills and expected copies falling due between two dates (a month on the calendar). */
export async function fetchBillCalendar(from: string, to: string): Promise<{ bills: Bill[]; expected: BillExpected[] }> {
  const response = await api.get<ApiEnvelope<{ bills?: ApiBill[]; expected?: ApiExpected[] }>>(apiRoutes.bill.calendar, {
    params: { from, to },
  });
  const data = assertSuccess(response.data, "Couldn't load the bill calendar.");
  return { bills: (data?.bills ?? []).map(mapApiBill), expected: (data?.expected ?? []).map(mapExpected) };
}

export async function fetchBillDetail(id: string): Promise<Bill> {
  const response = await api.get<ApiEnvelope<ApiBill>>(apiRoutes.bill.info(id));
  return mapApiBill(assertSuccess(response.data, "Couldn't load this bill."));
}

type SaveResult = { id: string; duplicateOf: string | null };

/** Files ride along on the create itself — there's no bill id yet to attach them to. */
export async function createBillApi(draft: BillDraft, files: File[] = []): Promise<SaveResult> {
  const response = await api.post<ApiEnvelope<{ id: number | string; duplicate_of?: number | string | null }>>(
    apiRoutes.bill.create,
    buildEncryptedRequestBody(draftToApiFields(draft, true), files),
  );
  const data = assertSuccess(response.data, "Failed to save bill.");
  return { id: String(data.id), duplicateOf: data.duplicate_of != null ? String(data.duplicate_of) : null };
}

/** `startsRepeat` is false for a bill already in a series — its repeat is the schedule's business. */
export async function updateBillApi(id: string, draft: BillDraft, startsRepeat = true): Promise<SaveResult> {
  const response = await api.put<ApiEnvelope<{ id: number | string; duplicate_of?: number | string | null }>>(
    apiRoutes.bill.info(id),
    buildEncryptedRequestBody(draftToApiFields(draft, startsRepeat)),
  );
  const data = assertSuccess(response.data, "Failed to update bill.");
  return { id: String(data.id), duplicateOf: data.duplicate_of != null ? String(data.duplicate_of) : null };
}

/**
 * Saved bills only — the server refuses a converted bill until it's undone.
 * `stopSchedule` also stops the repeat each deleted bill belongs to.
 */
export async function deleteBillsApi(ids: string[], options: { stopSchedule?: boolean } = {}): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.bill.bulkDelete,
    buildEncryptedRequestBody({ bills: ids, ...(options.stopSchedule ? { stop_schedule: true } : {}) }),
  );
  assertSuccess(response.data, ids.length === 1 ? "Failed to delete the bill." : "Failed to delete bills.");
}

export async function approveBillApi(id: string): Promise<{ expenseId: string }> {
  const response = await api.post<ApiEnvelope<{ expense_id: number | string }>>(apiRoutes.bill.approve(id));
  const data = assertSuccess(response.data, "Failed to approve bill.");
  return { expenseId: String(data.expense_id) };
}

/**
 * Bank transactions that could pay a bill — sized to a saved bill's total, or
 * to what's left on a converted bill's expense. `multiple` is the "Assign to
 * multiple" pool: every recent debit, whatever its amount. Same candidates and
 * rules as an expense's match dialog.
 */
export async function fetchBillPossibleMatches(id: string, multiple: boolean): Promise<PossibleMatches> {
  const response = await api.get<ApiEnvelope<{ list?: ApiMatchCandidate[]; remaining_amount?: number | string }>>(
    apiRoutes.bill.possibleMatches(id),
    { params: multiple ? { multiple_match_mode: "true" } : {} },
  );
  const data = assertSuccess(response.data, "Couldn't look for matching transactions.");
  return {
    candidates: (data?.list ?? []).map(mapApiMatchCandidate),
    remainingAmount: Number(data?.remaining_amount) || 0,
  };
}

/** Fetched fresh on each opening, like the expense dialog's — a stale remainder would mislead. */
export function billPossibleMatchesQuery(id: string, multiple: boolean) {
  return {
    queryKey: ["bill-possible-matches", id, multiple] as const,
    queryFn: () => fetchBillPossibleMatches(id, multiple),
    staleTime: 0,
    gcTime: 0,
  };
}

export type BillMatchResult = {
  expenseId: string;
  /** True when this match is what turned a saved bill into an expense. */
  createdExpense: boolean;
  paymentStatus: BillPaymentStatus;
  amountDue: number;
};

/**
 * Pays a bill from the bank feed in one step: the server converts a saved bill
 * to its expense, then matches that expense to the chosen transactions with
 * the expense matcher. If the match fails, the conversion is undone with it.
 */
export async function matchBillApi(id: string, transactionIds: string[]): Promise<BillMatchResult> {
  const response = await api.post<
    ApiEnvelope<{
      expense_id: number | string;
      created_expense?: boolean;
      payment_status?: string;
      amount_due?: number | string;
    }>
  >(apiRoutes.bill.match(id), buildEncryptedRequestBody({ transaction_ids: transactionIds }));
  const data = assertSuccess(response.data, "Couldn't match this bill.");
  return {
    expenseId: String(data.expense_id),
    createdExpense: Boolean(data.created_expense),
    paymentStatus: toPaymentStatus(data.payment_status, "approved"),
    amountDue: Number(data.amount_due) || 0,
  };
}

export async function unapproveBillApi(id: string): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(apiRoutes.bill.unapprove(id));
  assertSuccess(response.data, "Failed to unapprove bill.");
}

type ApiSchedule = ApiScheduleSummary & {
  due_days?: number | string | null;
  sub_total?: number | string | null;
  total_gst?: number | string | null;
  total?: number | string | null;
  notes?: string | null;
  client?: ApiClientRef;
  account_subcategory?: ApiCategoryRef;
  items?: ApiBillItem[] | null;
  bills?: {
    bill_id: number | string;
    bill_no?: string | null;
    bill_date?: string | null;
    due_date?: string | null;
    total?: number | string | null;
    status: BillStatus;
    payment_status?: string | null;
    is_overdue?: boolean | number | null;
    occurrence_no?: number | string | null;
  }[] | null;
  upcoming?: ApiExpected[] | null;
};

function mapSchedule(raw: ApiSchedule): BillSchedule {
  const dueDays = Number(raw.due_days);
  return {
    ...mapScheduleSummary(raw),
    dueDays: raw.due_days != null && Number.isFinite(dueDays) ? dueDays : null,
    subTotal: Number(raw.sub_total) || 0,
    totalGst: Number(raw.total_gst) || 0,
    total: Number(raw.total) || 0,
    notes: raw.notes ?? "",
    supplierId: raw.client?.client_id != null ? String(raw.client.client_id) : null,
    supplierName: raw.client?.name?.trim() ?? "",
    categoryId: raw.account_subcategory?.account_subcategory_id != null ? String(raw.account_subcategory.account_subcategory_id) : "",
    category: raw.account_subcategory?.name?.trim() ?? "",
    lines: mapItems(raw.items),
    bills: (raw.bills ?? []).map((bill) => ({
      id: String(bill.bill_id),
      billNo: bill.bill_no?.trim() ?? "",
      billDate: isoDate(bill.bill_date),
      dueDate: isoDate(bill.due_date),
      total: Number(bill.total) || 0,
      status: bill.status,
      paymentStatus: toPaymentStatus(bill.payment_status, bill.status),
      isOverdue: Boolean(Number(bill.is_overdue)) || bill.is_overdue === true,
      occurrenceNo: optionalCount(bill.occurrence_no),
    })),
    upcoming: (raw.upcoming ?? []).map(mapExpected),
  };
}

export async function fetchBillSchedule(id: string): Promise<BillSchedule> {
  const response = await api.get<ApiEnvelope<ApiSchedule>>(apiRoutes.bill.schedule(id));
  return mapSchedule(assertSuccess(response.data, "Couldn't load this repeat."));
}

/** Changes the bills still to come. Bills already made keep what they have. */
export async function updateBillScheduleApi(id: string, draft: BillScheduleDraft): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    apiRoutes.bill.schedule(id),
    buildEncryptedRequestBody(scheduleDraftToApiFields(draft)),
  );
  assertSuccess(response.data, "Couldn't save the repeat.");
}

/**
 * Skips one bill to come — `billDate`, or the next one. It isn't made and
 * doesn't count towards an end count, and stays listed so it can be undone.
 */
export async function skipBillScheduleApi(id: string, billDate?: string): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.bill.scheduleSkip(id),
    buildEncryptedRequestBody(billDate ? { bill_date: billDate } : {}),
  );
  assertSuccess(response.data, "Couldn't skip that bill.");
}

/** Takes back a skip: the bill on `billDate` will be made after all. */
export async function unskipBillScheduleApi(id: string, billDate: string): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.bill.scheduleUnskip(id),
    buildEncryptedRequestBody({ bill_date: billDate }),
  );
  assertSuccess(response.data, "Couldn't undo the skip.");
}

/** Ends a repeat. Bills already made stay as they are. */
export async function stopBillScheduleApi(id: string): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(apiRoutes.bill.scheduleStop(id));
  assertSuccess(response.data, "Couldn't stop this repeat.");
}

export async function uploadBillAttachment(billId: string, file: File): Promise<string | null> {
  const form = new FormData();
  form.append("files[]", file);
  const response = await api.post<ApiEnvelope<{ document_ids?: (number | string)[] }>>(apiRoutes.bill.attachments(billId), form);
  const data = assertSuccess(response.data, `Couldn't attach "${file.name}".`);
  const id = data?.document_ids?.[data.document_ids.length - 1];
  return id != null ? String(id) : null;
}

export async function deleteBillAttachment(billId: string, documentId: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(apiRoutes.bill.attachment(billId, documentId));
  assertSuccess(response.data, "Couldn't remove that attachment.");
}
