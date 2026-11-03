import { format, isValid, parseISO } from "date-fns";

/**
 * Display helpers shared by every admin screen.
 *
 * The old admin redefined its status badge and date format on each page, and
 * they drifted — "trial" was blue on one screen and amber on the next. One
 * mapping here keeps a status the same colour wherever it's shown.
 */

/** The semantic tones a status pill can take; colour comes from the tokens. */
export type PillTone = "success" | "warning" | "danger" | "info" | "neutral";

export const PILL_TONES: Record<PillTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-primary/10 text-primary",
  neutral: "bg-muted text-muted-foreground",
};

export type TenantStatus = "active" | "trial" | "suspended" | "cancelled";

const TENANT_STATUS: Record<TenantStatus, { label: string; tone: PillTone }> = {
  active: { label: "Active", tone: "success" },
  trial: { label: "Trial", tone: "info" },
  suspended: { label: "Suspended", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** A tenant's status as a label and tone; an unknown status shows as itself. */
export function tenantStatusPill(status: string): { label: string; tone: PillTone } {
  const known = TENANT_STATUS[status as TenantStatus];
  if (known) return known;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
  return { label, tone: "neutral" };
}

/** `12 Mar 2026`, or an en dash when the backend sent nothing usable. */
export function formatAdminDate(value: string | null | undefined): string {
  if (!value) return "–";
  const date = parseISO(value);
  return isValid(date) ? format(date, "d MMM yyyy") : "–";
}

const COUNT = new Intl.NumberFormat("en-AU");

/** A whole-number count with grouping: `12,480`. */
export function formatCount(value: number): string {
  return COUNT.format(value);
}

/** `48%`, rounded; 0% when the whole is zero rather than NaN. */
export function formatShare(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}
