/**
 * Sample rows for the Quick Actions tour.
 *
 * A new account has nothing to point at — no bank lines, no time entries, no
 * projects — so while the tour runs, a card whose real list is empty draws a
 * few of these instead. They are shaped like sole-ocr's own `/unibox/*`
 * responses so the cards render them unchanged, and every row carries `__demo`
 * so the card's buttons can tell it apart: pressing one explains it is sample
 * data rather than calling the server with an id that doesn't exist there.
 *
 * Never fetched, never cached, never saved. See `stores/tour-demo.ts`.
 */
import { toast } from "sonner";

import {
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
import { isDueSoonInvoice, isOverdueInvoice, statusOf } from "@/lib/unibox-rules";

/** The Quick Actions tour in Usertour — what the page watches for. */
export const QUICK_ACTIONS_TOUR_ID = "cmvuoubdh07jqz7i3ge1rnziu";

const DAY_MS = 86_400_000;

/** The urgent list shows this many. */
const PRIORITY_SLOTS = 5;

type Demo = { __demo: true };

const demo = <T extends object>(row: T): T & Demo => ({ ...row, __demo: true });

/** Whether a row is one of the samples above. */
export const isDemoRow = (row: unknown): boolean =>
  typeof row === "object" && row !== null && (row as Partial<Demo>).__demo === true;

/** What a sample row's buttons do instead of calling the server. */
export function showSampleNotice() {
  toast.info("This is sample data, so nothing was changed.", {
    description: "The same button works on your own data once you have some.",
  });
}

/** `YYYY-MM-DD`, `days` from now. */
const day = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

/** An ISO timestamp, `hours` from now. */
const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

const DRAFT_INVOICE = demo<UniboxInvoice>({
  id: "demo-inv-draft",
  invoice_no: "INV-1042",
  status: "draft",
  due_date: day(14),
  total: 1250,
  client: { name: "Acme Pty Ltd" },
});

const OVERDUE_INVOICE = demo<UniboxInvoice>({
  id: "demo-inv-overdue",
  invoice_no: "INV-1038",
  status: "overdue",
  due_date: day(-6),
  total: 2480,
  client: { name: "Northside Café" },
});

const DUE_SOON_INVOICE = demo<UniboxInvoice>({
  id: "demo-inv-due",
  invoice_no: "INV-1041",
  status: "sent",
  due_date: day(1),
  total: 860,
  client: { name: "Harbour Studio" },
});

const BANK_PAYOUT = demo<UniboxBankTransaction>({
  id: "demo-bank-payout",
  _source: "bank_transaction",
  description: "Stripe payout",
  transaction_date: day(-2),
  amount: 1250,
  direction: "credit",
});

const BANK_PHONE = demo<UniboxBankTransaction>({
  id: "demo-bank-phone",
  _source: "bank_transaction",
  description: "Telstra — business mobile",
  transaction_date: day(-4),
  amount: 129,
  direction: "debit",
});

const EXPENSE_PAPER = demo<UniboxMatchable>({
  id: "demo-exp-paper",
  name: "Officeworks — printer paper",
  date: day(-3),
  price: 86.4,
  // One with a likely payment found, so "AI Match" is there to see.
  possible_match: 1,
});

const EXPENSE_SOFTWARE = demo<UniboxMatchable>({
  id: "demo-exp-software",
  name: "Adobe subscription",
  date: day(-5),
  price: 79.99,
  possible_match: 0,
});

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

const QUOTES: UniboxQuote[] = [
  demo<UniboxQuote>({
    id: "demo-quote-draft",
    quote_no: "Q-210",
    status: "draft",
    valid_till: day(10),
    total: 3400,
    client: { name: "Acme Pty Ltd" },
  }),
  demo<UniboxQuote>({
    id: "demo-quote-accepted",
    quote_no: "Q-207",
    status: "accepted",
    valid_till: day(5),
    total: 1900,
    client: { name: "Harbour Studio" },
  }),
];

const sampleSection = {
  quotes: (): UniboxQuote[] => QUOTES,
  expenses: (): UniboxMatchable[] => [EXPENSE_PAPER, EXPENSE_SOFTWARE],
  assets: (): UniboxMatchable[] => [
    demo<UniboxMatchable>({
      id: "demo-asset-laptop",
      name: 'MacBook Pro 14"',
      status: "Active",
      date_of_purchase: day(-20),
      price: 3299,
      possible_match: 0,
    }),
  ],
  liabilities: (): UniboxMatchable[] => [
    demo<UniboxMatchable>({
      id: "demo-liab-loan",
      name: "Business loan",
      contact: "Commonwealth Bank",
      date: day(-30),
      price: 15000,
    }),
  ],
  equity: (): UniboxMatchable[] => [
    demo<UniboxMatchable>({
      id: "demo-equity-owner",
      name: "Owner contribution",
      contact: "You",
      date: day(-15),
      price: 5000,
    }),
  ],
  bankTransactions: (): UniboxBankTransaction[] => [BANK_PAYOUT, BANK_PHONE],
  timeTracker: (): UniboxTimeEntry[] => [
    demo<UniboxTimeEntry>({
      id: "demo-time-design",
      entry_type: "manual",
      task_name: "Website design",
      project_name: "Brand refresh",
      client_name: "Acme Pty Ltd",
      status: "completed",
      duration_minutes: 150,
      amount: 375,
      rate: 150,
      is_billable: 1,
      is_invoiced: 0,
      created_at: at(-20),
      updated_at: at(-20),
    }),
    demo<UniboxTimeEntry>({
      id: "demo-time-call",
      entry_type: "manual",
      task_name: "Client call",
      client_name: "Harbour Studio",
      status: "completed",
      duration_minutes: 45,
      amount: 112.5,
      rate: 150,
      is_billable: 1,
      is_invoiced: 0,
      created_at: at(-44),
      updated_at: at(-44),
    }),
  ],
  projects: (): UniboxProject[] => [
    demo<UniboxProject>({
      id: "demo-proj-brand",
      name: "Brand refresh",
      client_name: "Acme Pty Ltd",
      status: "Active",
      end_date: day(30),
    }),
    demo<UniboxProject>({
      id: "demo-proj-fitout",
      name: "Shopfront fit-out",
      client_name: "Harbour Studio",
      status: "On hold",
      end_date: day(60),
    }),
  ],
  kmTracker: (): UniboxTrip[] => [
    demo<UniboxTrip>({
      id: "demo-trip-site",
      reason: "Client site visit",
      start_location: "Sydney NSW",
      end_location: "Parramatta NSW",
      distance: 23.4,
      date: day(-1),
      trip_type: "business",
      is_billable: 1,
      is_invoiced: 0,
    }),
    demo<UniboxTrip>({
      id: "demo-trip-supplier",
      reason: "Supplier pick-up",
      start_location: "Sydney NSW",
      end_location: "Alexandria NSW",
      distance: 11.2,
      date: day(-3),
      is_billable: 0,
      is_invoiced: 0,
    }),
  ],
  workComingUp: (): UniboxPlannerTask[] => [
    demo<UniboxPlannerTask>({
      id: "demo-task-install",
      event_id: "demo-task-install",
      task_name: "Kitchen install — day 1",
      start_at: at(48),
      is_billable: 1,
      amount: 960,
      stage: { name: "Scheduled" },
      contact: { name: "Acme Pty Ltd" },
    }),
    demo<UniboxPlannerTask>({
      id: "demo-task-quote",
      event_id: "demo-task-quote",
      task_name: "On-site quote visit",
      start_at: at(96),
      is_billable: 1,
      amount: 180,
      stage: { name: "Backlog" },
      contact: { name: "Harbour Studio" },
    }),
  ],
  priorities: (): PriorityItem[] => [
    demo<PriorityItem>({
      id: "demo-pri-overdue",
      type: "overdue_invoice",
      resource_type: "invoice",
      entity_id: OVERDUE_INVOICE.id,
      action: [
        { key: "follow_up", label: "Follow up" },
        { key: "mark_as_paid", label: "Mark as paid" },
      ],
      data: OVERDUE_INVOICE,
    }),
    demo<PriorityItem>({
      id: "demo-pri-bank",
      type: "unmatched_bank",
      resource_type: "bank_feed",
      entity_id: BANK_PAYOUT.id,
      action: { key: "match", label: "Match" },
      data: BANK_PAYOUT,
    }),
    demo<PriorityItem>({
      id: "demo-pri-expense",
      type: "unmatched_expense",
      resource_type: "expense",
      entity_id: EXPENSE_PAPER.id,
      action: { key: "match", label: "Match" },
      data: EXPENSE_PAPER,
    }),
    demo<PriorityItem>({
      id: "demo-pri-due",
      type: "due_invoice",
      resource_type: "invoice",
      entity_id: DUE_SOON_INVOICE.id,
      action: [
        { key: "follow_up", label: "Follow up" },
        { key: "mark_as_paid", label: "Mark as paid" },
      ],
      data: DUE_SOON_INVOICE,
    }),
    demo<PriorityItem>({
      id: "demo-pri-phone",
      type: "unmatched_bank",
      resource_type: "bank_feed",
      entity_id: BANK_PHONE.id,
      action: { key: "match", label: "Match" },
      data: BANK_PHONE,
    }),
  ],
  progress: (): UniboxProgress => ({
    health: { score: 72, status: "Good", to_action: 3 },
    streak: {
      current: 3,
      level: "Regular",
      next_level: "Sharp",
      to_next_level: 41,
      progress_percent: 35,
    },
    activity: {
      counts: [0, 2, 1, 3, 0, 2, 4],
      days: ["S", "M", "T", "W", "T", "F", "Today"],
      total_this_week: 12,
      comparison: { direction: "ahead", label: "Ahead of last week" },
    },
    recent_actions: [
      { id: "demo-recent-1", title: "Invoice INV-1037 sent", date: day(0) },
      { id: "demo-recent-2", title: "Expense matched to bank", date: day(-1) },
      { id: "demo-recent-3", title: "Quote Q-205 converted", date: day(-2) },
    ],
  }),
} as const;

/* ------------------------------------------------------------------ *
 * The overlay
 * ------------------------------------------------------------------ */

const hasNone = <T>(rows: T[], test: (row: T) => boolean) => !rows.some(test);

/**
 * Get paid's invoices fill by tab, not as a whole: an account with one draft
 * invoice has nothing under Overdue or Due soon, and those are the tabs worth
 * showing. Each tab with no real row gets a sample; real invoices stay.
 */
function withInvoiceSamples(real: UniboxInvoice[], now: number): UniboxInvoice[] {
  const added: UniboxInvoice[] = [];
  if (hasNone(real, (invoice) => statusOf(invoice) === "draft")) added.push(DRAFT_INVOICE);
  if (hasNone(real, (invoice) => isOverdueInvoice(invoice, now))) added.push(OVERDUE_INVOICE);
  if (hasNone(real, (invoice) => isDueSoonInvoice(invoice, now))) added.push(DUE_SOON_INVOICE);
  return added.length > 0 ? [...real, ...added] : real;
}

const progressIsEmpty = (progress: UniboxProgress | null | undefined) =>
  !progress ||
  (!progress.streak?.current &&
    !progress.activity?.total_this_week &&
    !(progress.recent_actions?.length ?? 0));

/**
 * What a section draws while the tour runs: its own rows when it has any, a
 * few samples when it has none. `sampled` says which, for the card's tag and
 * the banner.
 */
export function overlayDemo<T>(
  section: string,
  real: T,
  now: number = Date.now(),
): { data: T; sampled: boolean } {
  const keep = { data: real, sampled: false };

  if (section === "invoices") {
    const rows = Array.isArray(real) ? (real as UniboxInvoice[]) : [];
    const merged = withInvoiceSamples(rows, now);
    return merged === rows ? keep : { data: merged as T, sampled: true };
  }

  if (section === "priorities") {
    // Topped up to the five the list shows, so the tour sees it full: the
    // account's own items first, examples only for the places left over.
    const rows = Array.isArray(real) ? (real as PriorityItem[]) : [];
    if (rows.length >= PRIORITY_SLOTS) return keep;
    const filled = [...rows, ...sampleSection.priorities().slice(0, PRIORITY_SLOTS - rows.length)];
    return { data: filled as T, sampled: true };
  }

  if (section === "progress") {
    return progressIsEmpty(real as UniboxProgress | null)
      ? { data: sampleSection.progress() as T, sampled: true }
      : keep;
  }

  const sample = (sampleSection as Record<string, (() => unknown) | undefined>)[section];
  if (!sample) return keep;

  const empty = real == null || (Array.isArray(real) && real.length === 0);
  return empty ? { data: sample() as T, sampled: true } : keep;
}
