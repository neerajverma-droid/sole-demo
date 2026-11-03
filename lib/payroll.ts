/**
 * Payroll — the pieces every payroll screen shares: the seat subscription, the
 * Microkeeper connection, the overview figures, and the formatting the tables
 * all lean on.
 *
 * Payroll itself runs in Microkeeper. `sole-ocr` proxies and caches it, so an
 * employee "syncs" to Microkeeper and a pay run is "created in Microkeeper";
 * nothing here calculates PAYG or lodges STP. The area-specific types live
 * beside this file — `payroll-employees.ts`, `payroll-payruns.ts`,
 * `payroll-leave.ts`, `payroll-reports.ts`.
 */

import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { formatInvoiceDate } from "@/lib/invoices";
import api from "@/utils/axiosInstance";

/** Where the module lives. Every payroll route hangs off this. */
export const PAYROLL_ROOT = "/payroll";

/** An em dash for an empty figure, per the platform's table rule. */
export const PAYROLL_EMPTY = "—";

/* ------------------------------------------------------------------ *
 * Seats
 * ------------------------------------------------------------------ */

/**
 * Payroll is billed per employee, prepaid, with no free seats — a business
 * starts at zero and buys what it needs. $4.99 a seat a month, or $59.88 a
 * seat a year (no annual discount).
 */
export const PAYROLL_SEAT_PRICE = {
  monthly: 4.99,
  annual: 59.88,
} as const;

export const PAYROLL_CURRENCY = "AUD";

export type PayrollStatus =
  | "NOT_STARTED"
  | "ACTIVE"
  | "PAST_DUE"
  | "FROZEN"
  | "CANCELED";

export type PayrollBillingInterval = "MONTHLY" | "YEARLY";

/** `GET /payroll/subscription`, camel-cased already by the backend. */
export type PayrollSeats = {
  status: PayrollStatus;
  isActive: boolean;
  isFrozen: boolean;
  pricePerEmployee: number;
  billingInterval: PayrollBillingInterval;
  employeeLimit: number;
  activeEmployees: number;
  availableSeats: number;
  canAddEmployee: boolean;
  monthlyCost: number;
  annualCost: number;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
};

/** What a business with no payroll record at all looks like. */
export const NO_PAYROLL_SEATS: PayrollSeats = {
  status: "NOT_STARTED",
  isActive: false,
  isFrozen: false,
  pricePerEmployee: PAYROLL_SEAT_PRICE.monthly,
  billingInterval: "MONTHLY",
  employeeLimit: 0,
  activeEmployees: 0,
  availableSeats: 0,
  canAddEmployee: false,
  monthlyCost: 0,
  annualCost: 0,
  currentPeriodEnd: null,
  gracePeriodEnd: null,
};

/**
 * Whether payroll can be used at all — the same test sole-webapp's employee
 * list makes before it lets anyone add a person.
 */
export function payrollEnabled(seats: PayrollSeats | null | undefined): boolean {
  return !!seats && seats.isActive && seats.status === "ACTIVE";
}

/** Payroll is on but every paid seat is taken. */
export function seatLimitReached(seats: PayrollSeats | null | undefined): boolean {
  if (!payrollEnabled(seats) || !seats) return false;
  return (
    seats.availableSeats <= 0 ||
    (seats.employeeLimit > 0 && seats.activeEmployees >= seats.employeeLimit)
  );
}

/** One seat's price for the interval the seats are billed on. */
export function seatUnitPrice(interval: PayrollBillingInterval): number {
  return interval === "YEARLY"
    ? PAYROLL_SEAT_PRICE.annual
    : PAYROLL_SEAT_PRICE.monthly;
}

/** "/mo" or "/yr", for a price quoted against the seats' own interval. */
export function seatIntervalSuffix(interval: PayrollBillingInterval): string {
  return interval === "YEARLY" ? "/yr" : "/mo";
}

/** What the seats cost each billing period. */
export function seatRecurringTotal(seats: PayrollSeats): number {
  return seats.billingInterval === "YEARLY" ? seats.annualCost : seats.monthlyCost;
}

export const PAYROLL_STATUS_LABEL: Record<PayrollStatus, string> = {
  NOT_STARTED: "Not enabled",
  ACTIVE: "Active",
  PAST_DUE: "Payment overdue",
  FROZEN: "Paused",
  CANCELED: "Cancelled",
};

export function payrollStatusVariant(
  status: PayrollStatus,
): "success" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PAST_DUE":
      return "warning";
    case "FROZEN":
      return "danger";
    default:
      return "secondary";
  }
}

/** The 402 the backend sends when a new employee would pass the seat limit. */
export const SEAT_LIMIT_CODE = "SEAT_LIMIT_REACHED";

/**
 * The other two 402s from adding an employee: payroll was never bought, or
 * the seat payment is overdue. Neither is fixed by buying more seats.
 */
export const PAYROLL_NOT_ACTIVE_CODE = "PAYROLL_NOT_ACTIVE";
export const PAYROLL_OVERDUE_CODE = "PAYROLL_BILLING_OVERDUE";

/* ------------------------------------------------------------------ *
 * Microkeeper connection
 * ------------------------------------------------------------------ */

export type MicrokeeperStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "ERROR"
  | "NOT_CONNECTED";

export type MicrokeeperConnection = {
  connected: boolean;
  status: MicrokeeperStatus | null;
  businessName: string;
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

export const NO_MICROKEEPER_CONNECTION: MicrokeeperConnection = {
  connected: false,
  status: null,
  businessName: "",
  lastVerifiedAt: null,
  lastSyncAt: null,
  lastError: null,
};

export const MICROKEEPER_REGISTER_URL = "https://microkeeper.com.au/register.php";

/** Both Microkeeper keys are exactly 32 letters and digits. */
export const MICROKEEPER_KEY_LENGTH = 32;

/** The same three messages sole-webapp's connect dialog gives, in order. */
export function validateMicrokeeperKey(label: string, value: string): string | null {
  const key = value.trim();
  if (!key) return `${label} is required.`;
  if (key.length !== MICROKEEPER_KEY_LENGTH) {
    return `${label} must be exactly ${MICROKEEPER_KEY_LENGTH} characters.`;
  }
  if (!/^[A-Za-z0-9]+$/.test(key)) {
    return `${label} can only contain letters and numbers.`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

export type PayrunStatus =
  | "DRAFT"
  | "PENDING"
  | "IN_PROGRESS"
  | "PROCESSING"
  | "PROCESSED"
  | "LOCKED"
  | "UNLOCKED"
  | "COMPLETED"
  | "FAILED";

export type PayPeriod = "weekly" | "fortnightly" | "semi-monthly" | "monthly";

/** The latest-run card on the Overview — a slice of a pay run row. */
export type LatestPayrun = {
  mkRunId: string;
  mkYear: string;
  status: PayrunStatus;
  period: PayPeriod | string;
  startDate: string;
  endDate: string;
  paymentDate: string;
  paymentTotal: number;
  expenseTotal: number;
  deductionTotal: number;
};

export type PayrollOverviewStats = {
  totalEmployees: number;
  activeEmployees: number;
  profileIncomplete: number;
  fullTime: number;
  partTime: number;
  casual: number;
  subContractor: number;
  synced: number;
  pendingSync: number;
  failedSync: number;
  totalPayruns: number;
  completedPayruns: number;
  totalPaymentAmount: number;
};

export type PayrollOverview = {
  businessName: string;
  connection: MicrokeeperConnection;
  stats: PayrollOverviewStats;
  latestPayrun: LatestPayrun | null;
};

/* ------------------------------------------------------------------ *
 * Pay run status — shared by the Overview card and every run list
 * ------------------------------------------------------------------ */

export const PAYRUN_STATUS_LABEL: Record<PayrunStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  PROCESSING: "Processing",
  PROCESSED: "Processed",
  LOCKED: "Locked",
  UNLOCKED: "Unlocked",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function payrunStatusLabel(status: string): string {
  return PAYRUN_STATUS_LABEL[status as PayrunStatus] ?? titleCase(status);
}

export function payrunStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "COMPLETED":
    case "PROCESSED":
    case "LOCKED":
      return "success";
    case "FAILED":
      return "danger";
    case "DRAFT":
    case "UNLOCKED":
      return "secondary";
    default:
      return "warning";
  }
}

export const PAY_PERIOD_LABEL: Record<PayPeriod, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  "semi-monthly": "Semi-monthly",
  monthly: "Monthly",
};

export function payPeriodLabel(period: string): string {
  return PAY_PERIOD_LABEL[period as PayPeriod] ?? titleCase(period);
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/** $1,234.56 — every payroll figure is AUD to the cent. */
export function payrollMoney(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `$${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** $1,235 — a headline total where the cents are noise. */
export function payrollMoneyWhole(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `$${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-AU", {
    maximumFractionDigits: 0,
  })}`;
}

/** DD/MM/YYYY from an ISO date or timestamp, or a dash. */
export function payrollDate(value: string | null | undefined): string {
  if (!value) return PAYROLL_EMPTY;
  return formatInvoiceDate(value.slice(0, 10));
}

/** "12 Oct 2026, 3:04 pm" — for sync and verification times. */
export function payrollDateTime(value: string | null | undefined): string {
  if (!value) return PAYROLL_EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return PAYROLL_EMPTY;
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "01/10/2026 – 14/10/2026" */
export function payrollDateRange(start: string, end: string): string {
  return `${payrollDate(start)} – ${payrollDate(end)}`;
}

/** Up to two initials for an avatar, from whatever name parts exist. */
export function payrollInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** FULL_TIME → "Full time". */
export function titleCase(value: string | null | undefined): string {
  if (!value) return PAYROLL_EMPTY;
  const words = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "1 employee" / "3 employees". */
export function plural(count: number, noun: string): string {
  return `${count.toLocaleString("en-AU")} ${count === 1 ? noun : `${noun}s`}`;
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

function unwrap<T>(
  response: { data?: ApiEnvelope<T> },
  fallback: string,
): T {
  if (!response.data?.success || response.data.data === undefined) {
    throw new Error(response.data?.message || fallback);
  }
  return response.data.data;
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const str = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

/** `GET /payroll/subscription` — already camelCase from the backend. */
export type ApiPayrollSeats = Partial<{
  status: string;
  isActive: boolean;
  isFrozen: boolean;
  pricePerEmployee: number | string;
  billingInterval: string;
  employeeLimit: number | string;
  activeEmployees: number | string;
  availableSeats: number | string;
  canAddEmployee: boolean;
  monthlyCost: number | string;
  annualCost: number | string;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
}>;

const PAYROLL_STATUSES: PayrollStatus[] = [
  "NOT_STARTED",
  "ACTIVE",
  "PAST_DUE",
  "FROZEN",
  "CANCELED",
];

export function mapPayrollSeats(raw: ApiPayrollSeats | null | undefined): PayrollSeats {
  if (!raw) return NO_PAYROLL_SEATS;
  const status = PAYROLL_STATUSES.includes(raw.status as PayrollStatus)
    ? (raw.status as PayrollStatus)
    : "NOT_STARTED";
  // sole-webapp also accepted "ANNUAL" for the yearly interval.
  const interval: PayrollBillingInterval =
    raw.billingInterval === "YEARLY" || raw.billingInterval === "ANNUAL"
      ? "YEARLY"
      : "MONTHLY";
  return {
    status,
    isActive: Boolean(raw.isActive),
    isFrozen: Boolean(raw.isFrozen),
    pricePerEmployee: num(raw.pricePerEmployee) || PAYROLL_SEAT_PRICE.monthly,
    billingInterval: interval,
    employeeLimit: num(raw.employeeLimit),
    activeEmployees: num(raw.activeEmployees),
    availableSeats: num(raw.availableSeats),
    canAddEmployee: Boolean(raw.canAddEmployee),
    monthlyCost: num(raw.monthlyCost),
    annualCost: num(raw.annualCost),
    currentPeriodEnd: strOrNull(raw.currentPeriodEnd),
    gracePeriodEnd: strOrNull(raw.gracePeriodEnd),
  };
}

export async function fetchPayrollSeats(): Promise<PayrollSeats> {
  const response = await api.get<ApiEnvelope<ApiPayrollSeats>>(
    apiRoutes.payroll.subscription,
  );
  return mapPayrollSeats(unwrap(response, "Failed to load payroll seats"));
}

/**
 * Charges the card on file for more seats straight away. The backend refuses
 * unless payroll is already active and paid up — top-ups extend payroll, they
 * don't switch it on.
 */
export async function addPayrollSeats(input: {
  additionalSeats: number;
  isRecurring: boolean;
}): Promise<PayrollSeats> {
  const response = await api.post<ApiEnvelope<ApiPayrollSeats>>(
    apiRoutes.payroll.addSeats,
    buildEncryptedRequestBody({
      additionalSeats: input.additionalSeats,
      isRecurring: input.isRecurring,
    }),
  );
  return mapPayrollSeats(unwrap(response, "Failed to add seats"));
}

type ApiConnection = Partial<{
  status: string;
  connected: boolean;
  microkeeper_business_name: string | null;
  last_verified_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}>;

export function mapMicrokeeperConnection(
  raw: ApiConnection | null | undefined,
): MicrokeeperConnection {
  if (!raw) return NO_MICROKEEPER_CONNECTION;
  const status = (
    ["CONNECTED", "DISCONNECTED", "ERROR", "NOT_CONNECTED"] as const
  ).find((value) => value === raw.status);
  return {
    // The overview sends `connected`; the connection endpoint doesn't, so it
    // falls back to the status that implies it.
    connected: raw.connected ?? status === "CONNECTED",
    status: status ?? null,
    businessName: str(raw.microkeeper_business_name),
    lastVerifiedAt: strOrNull(raw.last_verified_at),
    lastSyncAt: strOrNull(raw.last_sync_at),
    lastError: strOrNull(raw.last_error),
  };
}

type ApiOverview = Partial<{
  business: { name?: string | null } | null;
  connection: ApiConnection | null;
  stats: Record<string, unknown> | null;
  latest_payrun: Record<string, unknown> | null;
}>;

export function mapPayrollOverview(raw: ApiOverview): PayrollOverview {
  const stats = raw.stats ?? {};
  const run = raw.latest_payrun;
  return {
    businessName: str(raw.business?.name),
    connection: mapMicrokeeperConnection(raw.connection),
    stats: {
      totalEmployees: num(stats.total_employees),
      activeEmployees: num(stats.active_employees),
      profileIncomplete: num(stats.profile_incomplete),
      fullTime: num(stats.full_time),
      partTime: num(stats.part_time),
      casual: num(stats.casual),
      subContractor:
        num(stats.sub_contractor) + num(stats.sub_contractor_with_super),
      synced: num(stats.synced),
      pendingSync: num(stats.pending_sync),
      failedSync: num(stats.failed_sync),
      totalPayruns: num(stats.total_payruns),
      completedPayruns: num(stats.completed_payruns),
      totalPaymentAmount: num(stats.total_payment_amount),
    },
    latestPayrun: run
      ? {
          mkRunId: str(run.mk_run_id ?? run.id),
          mkYear: str(run.mk_year),
          status: str(run.status) as PayrunStatus,
          period: str(run.period),
          startDate: str(run.start_date),
          endDate: str(run.end_date),
          paymentDate: str(run.payment_date),
          paymentTotal: num(run.payment_total),
          expenseTotal: num(run.expense_total),
          deductionTotal: num(run.deduction_total),
        }
      : null,
  };
}

export async function fetchPayrollOverview(): Promise<PayrollOverview> {
  const response = await api.get<ApiEnvelope<ApiOverview>>(
    apiRoutes.payroll.overview,
  );
  return mapPayrollOverview(unwrap(response, "Failed to load payroll"));
}

export type MicrokeeperKeys = {
  businessName: string;
  devKey: string;
  bizKey: string;
};

function keysBody(keys: MicrokeeperKeys) {
  return buildEncryptedRequestBody({
    microkeeper_business_name: keys.businessName.trim(),
    mk_dev_key: keys.devKey.trim(),
    mk_biz_key: keys.bizKey.trim(),
  });
}

/** First connection — `POST /microkeeper/connect`. */
export async function connectMicrokeeper(
  keys: MicrokeeperKeys,
): Promise<MicrokeeperConnection> {
  const response = await api.post<ApiEnvelope<ApiConnection>>(
    apiRoutes.payroll.microkeeperConnect,
    keysBody(keys),
  );
  return mapMicrokeeperConnection(
    unwrap(response, "Failed to connect Microkeeper"),
  );
}

/** Replacing the keys on an existing connection — `PATCH /microkeeper/connection`. */
export async function updateMicrokeeperKeys(
  keys: MicrokeeperKeys,
): Promise<MicrokeeperConnection> {
  const response = await api.patch<ApiEnvelope<ApiConnection>>(
    apiRoutes.payroll.microkeeperConnection,
    keysBody(keys),
  );
  return mapMicrokeeperConnection(
    unwrap(response, "Failed to update the Microkeeper keys"),
  );
}

/**
 * Re-checks the stored keys against Microkeeper. Encrypted like every other
 * write even though it carries nothing — the server reads only the scope.
 */
export async function verifyMicrokeeper(): Promise<MicrokeeperConnection> {
  const response = await api.post<ApiEnvelope<ApiConnection>>(
    apiRoutes.payroll.microkeeperVerify,
    buildEncryptedRequestBody({}),
  );
  return mapMicrokeeperConnection(
    unwrap(response, "Failed to verify the connection"),
  );
}

export async function disconnectMicrokeeper(): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    apiRoutes.payroll.microkeeperConnection,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to disconnect Microkeeper");
  }
}

/**
 * The `code` on a payroll 402/403, so a caller can tell "out of seats" (offer
 * Add seats) from "not enabled" or "overdue" (send them to billing).
 */
export function payrollErrorCode(error: unknown): string | null {
  const data = (error as { response?: { data?: { code?: unknown } } })?.response
    ?.data;
  return typeof data?.code === "string" ? data.code : null;
}
