/**
 * Sample figures for a brand-new account's first look at the dashboard, and
 * the switch that turns them off.
 *
 * A new account has nothing to show, and a tour of a page full of $0 and empty
 * states explains very little. So the dashboard shows these until the
 * dashboard tour ends — the tour calls `window.soleEndDashboardDemo()` from
 * its last step (see `endDashboardDemo`). `hooks/use-dashboard-demo` decides
 * who sees them.
 *
 * Everything is dated relative to today, so the sample always looks current,
 * and the invoice and expense rows go through the same mappers as the API's
 * rows, so they can't drift from the real shapes.
 *
 * Nothing here is ever written to a store or sent to the server. The shared
 * stores (invoices, expenses, accounts) keep the account's real data; only the
 * dashboard's own read hooks swap these in.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  returnDueTiming,
  type CashFlowMonth,
  type DashboardBalance,
  type DashboardBankAccounts,
  type GstSetAside,
  type TopMover,
} from "@/lib/dashboard";
import { mapApiExpense, type ApiExpenseRow, type Expense } from "@/lib/expenses";
import { AU_FISCAL_YEAR_START, type FiscalYearStart } from "@/lib/fiscal-year";
import {
  addDays,
  mapApiInvoice,
  toIsoDate,
  type ApiInvoice,
  type Invoice,
} from "@/lib/invoices";
import { currentUserId } from "@/stores/session";

/* ------------------------------------------------------------------ *
 * Whether the sample is done with — sole-ocr's `/tour` resource
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };
type ApiTourData = { tour_data?: Record<string, Record<string, boolean>> | null };

/** The `tours.tour_data` key this feature owns: `{ dashboard: { demo: true } }`. */
const DEMO_TOUR_KEY = { parent_key: "dashboard", submenu_key: "demo" } as const;

/** True once this user's dashboard tour has ended. */
export async function fetchDashboardDemoDone(): Promise<boolean> {
  const response = await api.get<ApiEnvelope<ApiTourData>>(apiRoutes.tour.list);
  const tourData = response.data?.data?.tour_data;
  return tourData?.[DEMO_TOUR_KEY.parent_key]?.[DEMO_TOUR_KEY.submenu_key] === true;
}

/** Records that the sample is done with, so no device shows it again. */
export async function markDashboardDemoDone(): Promise<void> {
  await api.patch(apiRoutes.tour.list, { skippedTour: DEMO_TOUR_KEY });
}

/* ------------------------------------------------------------------ *
 * Ending the sample
 * ------------------------------------------------------------------ */

/** Fired on `window` when the sample ends; the dashboard listens for it. */
export const DASHBOARD_DEMO_ENDED_EVENT = "sole:dashboard-demo-ended";

/**
 * Per user, in this browser: "pending" once the sample has ended here,
 * "synced" once the server has recorded it too.
 *
 * It's what keeps the sample gone when the server can't be told straight away
 * (the next visit retries, see `retryPendingDashboardDemoEnd`), and what tells
 * the user's other open tabs, through the `storage` event, that it has ended.
 * Keyed by user, so someone else signing in on the same browser still gets
 * their own first look.
 */
const LOCAL_KEY_PREFIX = "sole.dashboard-demo.ended.";

export function dashboardDemoLocalKey(userId: string): string {
  return `${LOCAL_KEY_PREFIX}${userId}`;
}

type LocalEndState = "pending" | "synced";

function readLocalEnd(userId: string | null): LocalEndState | null {
  if (!userId) return null;
  try {
    const value = window.localStorage.getItem(dashboardDemoLocalKey(userId));
    return value === "pending" || value === "synced" ? value : null;
  } catch {
    // Private mode, blocked storage: the session flag and the server carry it.
    return null;
  }
}

function writeLocalEnd(userId: string | null, state: LocalEndState): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(dashboardDemoLocalKey(userId), state);
  } catch {
    // As above.
  }
}

/** Users whose sample has ended in this tab, whatever storage allows. */
const endedThisSession = new Set<string>();
const ANONYMOUS = "";

/** Whether this user's sample has already ended here — this tab or this browser. */
export function dashboardDemoEndedLocally(userId: string | null): boolean {
  return endedThisSession.has(userId ?? ANONYMOUS) || readLocalEnd(userId) != null;
}

/**
 * Turns the dashboard's sample data off: right away on screen, and for good
 * on the server.
 *
 * This is what the Usertour dashboard tour calls when it ends — exposed as
 * `window.soleEndDashboardDemo` by `UsertourBootstrap` — and what the
 * dashboard calls itself when it can tell the tour is over or never came (see
 * `use-dashboard-demo`). Calling it more than once is harmless.
 *
 * Never rejects: if the server can't be told, the page has still switched and
 * the end is kept locally and retried, so there is nothing for a tour to
 * handle.
 */
export async function endDashboardDemo(
  userId: string | null = currentUserId(),
): Promise<void> {
  const key = userId ?? ANONYMOUS;
  if (endedThisSession.has(key)) return;
  endedThisSession.add(key);
  if (readLocalEnd(userId) !== "synced") writeLocalEnd(userId, "pending");

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DASHBOARD_DEMO_ENDED_EVENT));
  }
  await syncDashboardDemoEnd(userId);
}

/** Re-sends an end the server never got. Safe to call on every visit. */
export async function retryPendingDashboardDemoEnd(userId: string | null): Promise<void> {
  if (readLocalEnd(userId) === "pending") await syncDashboardDemoEnd(userId);
}

async function syncDashboardDemoEnd(userId: string | null): Promise<void> {
  try {
    await markDashboardDemoDone();
    writeLocalEnd(userId, "synced");
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[dashboard-demo] could not record the tour as done; will retry.", error);
    }
  }
}

declare global {
  interface Window {
    /** Called by the Usertour dashboard tour when it ends. See `endDashboardDemo`. */
    soleEndDashboardDemo?: () => Promise<void>;
  }
}

/* ------------------------------------------------------------------ *
 * The sample business: a small consultancy a few months into the year
 * ------------------------------------------------------------------ */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function todayIso(): string {
  return toIsoDate(new Date());
}

/** Issued `issuedAgo` days ago, due `dueIn` days after that. */
function demoInvoiceRow(
  id: number,
  client: string,
  total: number,
  remaining: number,
  status: string,
  issuedAgo: number,
  dueIn: number,
  description: string,
): ApiInvoice {
  const issued = addDays(todayIso(), -issuedAgo);
  return {
    invoice_id: `demo-${id}`,
    invoice_no: `INV-${String(id).padStart(4, "0")}`,
    client_id: null,
    client: { name: client },
    invoice_date: issued,
    due_date: addDays(issued, dueIn),
    status,
    description,
    total,
    remainingAmount: remaining,
    sent_at: status === "draft" ? null : issued,
    currency_code: "AUD",
  };
}

export function demoInvoices(): Invoice[] {
  const today = todayIso();
  const rows: ApiInvoice[] = [
    demoInvoiceRow(1012, "Harbour Cafe", 4400, 0, "paid", 58, 14, "Monthly bookkeeping"),
    demoInvoiceRow(1013, "Northside Physio", 2750, 0, "paid", 44, 14, "Website refresh"),
    demoInvoiceRow(1014, "Coastal Dental", 6600, 0, "paid", 30, 14, "Quarterly advisory"),
    demoInvoiceRow(1015, "Bright Spark Electrical", 3300, 3300, "sent", 12, 14, "Payroll setup"),
    demoInvoiceRow(1016, "Green Leaf Landscaping", 1650, 1650, "overdue", 26, 14, "BAS preparation"),
    demoInvoiceRow(1017, "Harbour Cafe", 5500, 2500, "partially_paid", 8, 21, "Systems review"),
    demoInvoiceRow(1018, "Northside Physio", 1200, 1200, "draft", 1, 14, "Training session"),
  ];
  return rows.map((row) => mapApiInvoice(row, today));
}

function demoExpenseRow(
  id: number,
  name: string,
  category: string,
  supplier: string,
  price: number,
  daysAgo: number,
  paid: boolean,
): ApiExpenseRow {
  return {
    expense_id: `demo-${id}`,
    name,
    price,
    total_price: price,
    date: addDays(todayIso(), -daysAgo),
    gst: 1,
    gst_percentage: 10,
    paid_with_cash: 0,
    is_reconciled: paid ? 1 : 0,
    remainingAmount: paid ? 0 : price,
    account_subcategory: { name: category },
    client: { name: supplier },
  };
}

export function demoExpenses(): Expense[] {
  const rows: ApiExpenseRow[] = [
    demoExpenseRow(501, "Office rent", "Rent", "Main Street Properties", 2200, 32, true),
    demoExpenseRow(502, "Accounting software", "Software & subscriptions", "Cloud Apps Co", 330, 20, true),
    demoExpenseRow(503, "Fuel", "Motor vehicle", "Metro Fuel", 180, 9, true),
    demoExpenseRow(504, "Phone and internet", "Telephone & internet", "Telco Plus", 165, 6, false),
    demoExpenseRow(505, "Insurance", "Insurance", "Safe Cover", 890, 3, false),
  ];
  return rows.map(mapApiExpense);
}

export function demoBalance(): DashboardBalance {
  const now = new Date();
  const balances = [9200, 11800, 10400, 13900, 15600, 18450];
  return {
    currentBalance: balances[balances.length - 1],
    series: balances.map((balance, index) => {
      const monthsBack = balances.length - 1 - index;
      const month = (now.getMonth() - monthsBack + 12) % 12;
      return { month: MONTH_LABELS[month], balance };
    }),
  };
}

export function demoBankAccounts(): DashboardBankAccounts {
  const syncedAt = new Date().toISOString();
  const accounts = [
    {
      id: "demo-acc-1",
      bankId: null,
      name: "Business Everyday",
      account: "•••• 4821",
      balance: 14250,
      accountType: "TRANS_AND_SAVINGS_ACCOUNTS",
      syncedAt,
      archived: false,
    },
    {
      id: "demo-acc-2",
      bankId: null,
      name: "Tax Savings",
      account: "•••• 9107",
      balance: 4200,
      accountType: "TRANS_AND_SAVINGS_ACCOUNTS",
      syncedAt,
      archived: false,
    },
  ];
  return {
    accounts,
    totalBalance: accounts.reduce((sum, account) => sum + account.balance, 0),
  };
}

/** 24 months, oldest first — the same reach the live fetch has. */
export function demoCashFlow(): CashFlowMonth[] {
  const now = new Date();
  const months: CashFlowMonth[] = [];
  for (let back = 23; back >= 0; back -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const month = date.getMonth();
    // A gentle seasonal wave so the chart reads as a business, not a flat line.
    const wave = Math.round(Math.sin((month / 12) * Math.PI * 2) * 1800);
    months.push({
      key: `${date.getFullYear()}-${String(month + 1).padStart(2, "0")}`,
      month: MONTH_LABELS[month],
      year: date.getFullYear(),
      moneyIn: 12500 + wave + (23 - back) * 120,
      moneyOut: 7800 + Math.round(wave / 2) + (23 - back) * 60,
    });
  }
  return months;
}

export function demoGst(
  fiscalYearStart: FiscalYearStart = AU_FISCAL_YEAR_START,
): GstSetAside {
  return {
    amount: 2140,
    ...returnDueTiming(new Date(), undefined, fiscalYearStart),
  };
}

export const DEMO_TOP_INCOMES: TopMover[] = [
  { id: "demo-in-1", label: "Harbour Cafe", amount: 9900, clientName: "Harbour Cafe" },
  { id: "demo-in-2", label: "Coastal Dental", amount: 6600, clientName: "Coastal Dental" },
  { id: "demo-in-3", label: "Northside Physio", amount: 2750, clientName: "Northside Physio" },
];

export const DEMO_TOP_EXPENSES: TopMover[] = [
  { id: "demo-out-1", label: "Rent", amount: 2200, category: "Rent" },
  { id: "demo-out-2", label: "Insurance", amount: 890, category: "Insurance" },
  { id: "demo-out-3", label: "Software & subscriptions", amount: 330, category: "Software & subscriptions" },
];

/** The sample's annual revenue goal. */
export const DEMO_GOAL_TARGET = 120000;
