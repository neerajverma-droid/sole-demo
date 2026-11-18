/**
 * Quick Actions backend wiring — sole-ocr's `/unibox/*` resource.
 *
 * The same fifteen reads sole-webapp's `pages/quick-actions` makes on mount,
 * and the same writes its cards and priority rows fire. Rows are kept close to
 * the wire shape on purpose: each card filters and labels them exactly as the
 * old Unibox cards did, and the match / invoice dialogs they open take the
 * server's own ids, so a mapped copy would only be a second place for a field
 * name to drift.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

type Id = string | number;

/* ------------------------------------------------------------------ *
 * Row shapes — only the fields the cards read
 * ------------------------------------------------------------------ */

export type UniboxClient = { id?: Id; name?: string | null } | null;

export type UniboxInvoice = {
  id: Id;
  invoice_no?: string | null;
  status?: string | null;
  mark_as?: string | null;
  due_date?: string | null;
  total?: number | string | null;
  client?: UniboxClient;
};

export type UniboxQuote = {
  id: Id;
  quote_id?: Id;
  quote_no?: string | null;
  status?: string | null;
  mark_as?: string | null;
  converted?: number | string | boolean | null;
  valid_till?: string | null;
  due_date?: string | null;
  total?: number | string | null;
  client?: UniboxClient;
};

/** Shared by expenses, assets, liabilities and equity — all "match me" rows. */
export type UniboxMatchable = {
  id: Id;
  expense_id?: Id;
  asset_id?: Id;
  liability_id?: Id;
  equity_id?: Id;
  name?: string | null;
  contact?: string | null;
  client?: UniboxClient;
  status?: string | null;
  date?: string | null;
  date_of_purchase?: string | null;
  price?: number | string | null;
  remaining_amount?: number | string | null;
  possible_match?: number | string | null;
  is_reconciled?: boolean | number | string | null;
  [key: string]: unknown;
};

export type UniboxBankTransaction = {
  id: Id;
  bank_transacton_id?: Id;
  transaction_id?: Id;
  bank_account_id?: Id;
  bank_name?: string | null;
  _source?: string;
  description?: string | null;
  user_description?: string | null;
  name?: string | null;
  payee?: string | null;
  vendor_name?: string | null;
  category?: string | null;
  status?: string | null;
  direction?: string | null;
  transaction_type?: string | null;
  transaction_date?: string | null;
  amount?: number | string | null;
  credit?: number | string | null;
  debit?: number | string | null;
  total?: number | string | null;
  available_amount?: number | string | null;
  remaining_amount?: number | string | null;
  is_reconciled?: boolean | number | string | null;
  matched_transaction_no?: string | null;
  [key: string]: unknown;
};

export type UniboxTimeEntry = {
  id: Id;
  task_id?: Id | null;
  task_name?: string | null;
  /** "timer" for a clocked session, otherwise a manual entry. */
  entry_type?: string | null;
  project_id?: Id | null;
  project_name?: string | null;
  project_job_id?: Id | null;
  job_name?: string | null;
  client_id?: Id | null;
  contact_id?: Id | null;
  client_name?: string | null;
  status?: string | null;
  is_active?: boolean | number | null;
  start_time?: string | null;
  end_time?: string | null;
  log_date?: string | null;
  duration_minutes?: number | string | null;
  duration?: number | string | null;
  amount?: number | string | null;
  rate?: number | string | null;
  charge_type?: string | null;
  is_billable?: boolean | number | string | null;
  is_invoiced?: boolean | number | null;
  invoice_id?: Id | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type UniboxProject = {
  id: Id;
  name?: string | null;
  project_name?: string | null;
  client_name?: string | null;
  status?: string | null;
  end_date?: string | null;
  [key: string]: unknown;
};

export type UniboxTrip = {
  id?: Id;
  _id?: Id;
  reason?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  distance?: number | string | null;
  date?: string | null;
  trip_type?: string | null;
  is_billable?: boolean | number | string | null;
  isBillable?: boolean;
  is_invoiced?: boolean | number | null;
  invoice_id?: Id | null;
  [key: string]: unknown;
};

export type UniboxPlannerTask = {
  id?: Id;
  event_id?: Id;
  task_id?: Id | null;
  task_name?: string | null;
  title?: string | null;
  description?: string | null;
  task_details?: string | null;
  start_at?: string | null;
  event_start_at?: string | null;
  end_at?: string | null;
  event_end_at?: string | null;
  status?: string | null;
  is_completed?: boolean | null;
  completed_at?: string | null;
  is_billable?: boolean | number | string | null;
  amount?: number | string | null;
  total?: number | string | null;
  value?: number | string | null;
  contact?: { name?: string | null; label?: string | null } | null;
  client?: { name?: string | null; business_name?: string | null } | null;
  stage?: {
    name?: string | null;
    category?: string | null;
    color?: string | null;
    bg_color?: string | null;
  } | null;
  [key: string]: unknown;
};

export type PriorityAction = { key: string; label: string };

/** A priority's record — an invoice, a bank line or an expense, by `resource_type`. */
export type PriorityData = Partial<UniboxInvoice> &
  Partial<UniboxBankTransaction> &
  Partial<UniboxMatchable>;

export type PriorityItem = {
  id: string;
  type?: string;
  resource_type?: "invoice" | "bank_feed" | "expense" | string;
  entity_id?: Id;
  action?: PriorityAction | PriorityAction[] | null;
  data?: PriorityData;
};

export type UniboxProgress = {
  health?: { score?: number; status?: string; to_action?: number };
  streak?: {
    current?: number;
    level?: string;
    next_level?: string;
    to_next_level?: number;
    progress_percent?: number;
  };
  activity?: {
    counts?: number[];
    days?: string[];
    total_this_week?: number;
    comparison?: { direction?: "ahead" | "behind" | "same"; label?: string };
  };
  recent_actions?: { id: Id; title?: string; date?: string }[];
};

export type OnboardingSuggestion = { complete?: boolean; href?: string };

export type UniboxOnboarding = {
  show_suggestions?: boolean;
  suggestions?: Record<string, OnboardingSuggestion>;
  checklist?: Record<string, OnboardingSuggestion>;
};

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

async function getList<T>(url: string, params?: Record<string, string>): Promise<T[]> {
  const response = await api.get<ApiEnvelope<T[]>>(url, params ? { params } : undefined);
  const data = response.data?.data;
  return Array.isArray(data) ? data : [];
}

export const fetchUniboxQuotes = () => getList<UniboxQuote>(apiRoutes.unibox.quotes);
export const fetchUniboxExpenses = () => getList<UniboxMatchable>(apiRoutes.unibox.expenses);
export const fetchUniboxAssets = () => getList<UniboxMatchable>(apiRoutes.unibox.assets);
export const fetchUniboxLiabilities = () => getList<UniboxMatchable>(apiRoutes.unibox.liabilities);
export const fetchUniboxEquity = () => getList<UniboxMatchable>(apiRoutes.unibox.equity);
export const fetchUniboxTimeEntries = () => getList<UniboxTimeEntry>(apiRoutes.unibox.timeTracker);
export const fetchUniboxProjects = () => getList<UniboxProject>(apiRoutes.unibox.projects);
export const fetchUniboxTrips = () => getList<UniboxTrip>(apiRoutes.unibox.kmTracker);
export const fetchUniboxWorkComingUp = () =>
  getList<UniboxPlannerTask>(apiRoutes.unibox.workComingUp);
export const fetchUniboxBankTransactions = () =>
  getList<UniboxBankTransaction>(apiRoutes.unibox.bankTransactions);

/**
 * Draft, overdue and due-soon invoices, merged by id — the old page asked for
 * the three statuses separately and de-duplicated, since an invoice can be
 * both overdue and in the due-soon window on the boundary day.
 */
export async function fetchUniboxInvoices(): Promise<UniboxInvoice[]> {
  const sets = await Promise.all(
    ["draft", "overdue", "due_soon"].map((status) =>
      getList<UniboxInvoice>(apiRoutes.unibox.invoices, { status }),
    ),
  );
  const byId = new Map<string, UniboxInvoice>();
  sets.flat().forEach((invoice) => byId.set(String(invoice.id), invoice));
  return Array.from(byId.values());
}

export async function fetchUniboxPriorities(): Promise<PriorityItem[]> {
  const response = await api.get<ApiEnvelope<{ items?: PriorityItem[] }>>(
    apiRoutes.unibox.priorities,
  );
  return response.data?.data?.items ?? [];
}

export async function fetchUniboxProgress(): Promise<UniboxProgress | null> {
  const response = await api.get<ApiEnvelope<UniboxProgress>>(apiRoutes.unibox.progress);
  return response.data?.data ?? null;
}

export async function fetchUniboxOnboarding(): Promise<UniboxOnboarding | null> {
  const response = await api.get<ApiEnvelope<UniboxOnboarding>>(apiRoutes.unibox.onboarding);
  return response.data?.data ?? null;
}

/* ------------------------------------------------------------------ *
 * Writes — each resolves with the server's message, or throws its error
 * ------------------------------------------------------------------ */

type ActionResult = { success?: boolean; message?: string };

function settle(result: ActionResult | undefined, fallback: string): string {
  if (!result?.success) throw new Error(result?.message || fallback);
  return result.message ?? "";
}

export async function sendUniboxInvoiceApi(invoiceId: Id): Promise<string> {
  const response = await api.post<ActionResult>(apiRoutes.unibox.sendInvoice(String(invoiceId)));
  return settle(response.data, "Unable to send this invoice.");
}

export async function sendUniboxQuoteApi(quoteId: Id): Promise<string> {
  const response = await api.post<ActionResult>(apiRoutes.unibox.sendQuote(String(quoteId)));
  return settle(response.data, "Unable to send this quote.");
}

/**
 * Converts an accepted quote, due on its valid-till date (or today).
 *
 * Encrypted, as `convertQuoteToInvoiceApi` in lib/quotes.ts is — plain
 * FormData is what the server answers with "Failed to decrypt payload". That
 * one takes a mapped `Quote`; this takes the unibox row as it arrived.
 */
export async function convertUniboxQuoteApi(quote: UniboxQuote): Promise<string> {
  return (await convertUniboxQuoteWithIdApi(quote)).message;
}

/** As above, plus the id of the invoice the server raised — for analytics. */
export async function convertUniboxQuoteWithIdApi(
  quote: UniboxQuote,
): Promise<{ message: string; invoiceId: string | null }> {
  const response = await api.post<
    ActionResult & { data?: { invoice_id?: Id | null } }
  >(
    apiRoutes.invoice.convertToInvoice,
    buildEncryptedRequestBody({
      id: String(quote.quote_id ?? quote.id),
      due_date: quote.valid_till || new Date().toISOString().split("T")[0],
    }),
  );
  const message = settle(response.data, "Unable to convert this quote.");
  const invoiceId = response.data?.data?.invoice_id;
  return { message, invoiceId: invoiceId == null ? null : String(invoiceId) };
}

/* ------------------------------------------------------------------ *
 * Shared rules the cards apply — lifted from the old Unibox components
 * ------------------------------------------------------------------ */

export const truthy = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || String(value ?? "").toLowerCase() === "true";

export const isReconciled = (row: { is_reconciled?: unknown }): boolean =>
  truthy(row.is_reconciled);

export const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** "8 Sept"-style short date, as `uniboxData.formatDate` printed it. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** `uniboxData.formatDuration`: "45 min", "2 hr", "1.5 hrs". */
export function formatDuration(minutes: number): string {
  if (!minutes) return "0 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours}.${Math.round((rest / 60) * 10)} hrs`;
}

/** "Today", "Yesterday", "N days ago". */
export function daysAgo(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diff = Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86_400_000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

/* ------------------------------------------------------------------ *
 * Quick-start suggestions — QuickStartSuggestions.js
 * ------------------------------------------------------------------ */

export const QUICK_START_SUGGESTIONS = [
  {
    key: "first_contact",
    title: "Add your first contact",
    description: "Save a customer or supplier to use later.",
  },
  {
    key: "first_invoice",
    title: "Create your first invoice",
    description: "Create and send an invoice to a customer.",
  },
  {
    key: "customise_sales_documents",
    title: "Customise your invoices and quotes",
    description: "Choose how your invoices and quotes will look.",
  },
] as const;

export type QuickStartKey = (typeof QUICK_START_SUGGESTIONS)[number]["key"];

/**
 * Where each suggestion's "Start" goes in this app. The server's `href` is the
 * legacy site's URL (which doesn't exist here), so it isn't used.
 */
export const QUICK_START_ROUTES: Record<QuickStartKey, string> = {
  first_contact: "/contacts?new=1",
  first_invoice: "/invoices/new",
  customise_sales_documents: "/sales/settings",
};

export function pendingQuickStart(
  onboarding: UniboxOnboarding | null | undefined,
): ((typeof QUICK_START_SUGGESTIONS)[number] & { href: string })[] {
  if (!onboarding?.show_suggestions) return [];
  const suggestions = onboarding.suggestions || onboarding.checklist || {};
  const firstStepsDone =
    suggestions.first_contact?.complete && suggestions.first_invoice?.complete;
  return QUICK_START_SUGGESTIONS.filter(({ key }) => {
    if (key === "customise_sales_documents" && firstStepsDone) return false;
    return !suggestions[key]?.complete;
  }).map((suggestion) => ({
    ...suggestion,
    href: QUICK_START_ROUTES[suggestion.key],
  }));
}

/* ------------------------------------------------------------------ *
 * Customise — which cards show under "Everything else"
 * ------------------------------------------------------------------ */

export type UniboxCardId =
  | "get_paid"
  | "bank_feed"
  | "expenses"
  | "progress"
  | "time_tracker"
  | "assets"
  | "projects"
  | "work_coming_up"
  | "km_tracker"
  | "liabilities_equity";

export type UniboxCardOption = {
  id: UniboxCardId;
  label: string;
  /** The plan feature sole-webapp gated it on — kept for reference, not enforced. */
  feature: string | null;
  /** How many cards it puts in the grid — Liabilities & equity is two. */
  cardCount: number;
};

export const UNIBOX_CARD_OPTIONS: UniboxCardOption[] = [
  { id: "get_paid", label: "Get paid", feature: "sales", cardCount: 1 },
  { id: "bank_feed", label: "Bank feed", feature: "transactions", cardCount: 1 },
  { id: "expenses", label: "Expenses", feature: "expenses", cardCount: 1 },
  { id: "progress", label: "Your progress", feature: "dashboard", cardCount: 1 },
  { id: "time_tracker", label: "Time tracker", feature: "time-tracking", cardCount: 1 },
  { id: "assets", label: "Assets", feature: "assets", cardCount: 1 },
  { id: "projects", label: "Projects", feature: "projects", cardCount: 1 },
  { id: "work_coming_up", label: "Work coming up", feature: "booking", cardCount: 1 },
  { id: "km_tracker", label: "KM tracker", feature: "km-tracker", cardCount: 1 },
  { id: "liabilities_equity", label: "Liabilities & equity", feature: null, cardCount: 2 },
];

export const DEFAULT_CARD_VISIBILITY = Object.fromEntries(
  UNIBOX_CARD_OPTIONS.map((option) => [option.id, true]),
) as Record<UniboxCardId, boolean>;

/** Per user and business, as the old page keyed it. */
export function cardVisibilityKey(userId: string, businessId: string | null): string {
  return `unibox-card-visibility:${userId}:${businessId || "default"}`;
}

/**
 * A saved preference as it comes back out of storage: only an object counts,
 * and anything it doesn't mention falls back to shown.
 */
export function parseCardVisibility(raw: string | null): Record<UniboxCardId, boolean> {
  let stored: Partial<Record<UniboxCardId, boolean>> = {};
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed;
  } catch {
    /* a preference we can't read is a preference we don't have */
  }
  return { ...DEFAULT_CARD_VISIBILITY, ...stored };
}

/** Flips one card; one never saved is on, so the first flip turns it off. */
export const toggleCardVisibility = (
  visibility: Record<UniboxCardId, boolean>,
  id: UniboxCardId,
): Record<UniboxCardId, boolean> => ({ ...visibility, [id]: visibility[id] === false });

/** How many cards the grid draws — Liabilities & equity is two. */
export const visibleCardCount = (visibility: Record<UniboxCardId, boolean>) =>
  UNIBOX_CARD_OPTIONS.reduce((count, option) => count + (visibility[option.id] !== false ? option.cardCount : 0), 0);
