/**
 * Where "Back" goes from SolePay onboarding.
 *
 * Someone can start SolePay setup from an invoice they're writing: the invoice
 * is saved as a draft, they're sent to onboarding, and Back there should return
 * them to that draft — in edit mode — rather than to the Payments page.
 *
 * Onboarding is five pages (overview, business, directors, accounts, documents),
 * so a query param on the first would be lost on the second. The first page
 * reads `?returnInvoice=<id>` (or `?returnTo=<path>`) and parks the target in
 * sessionStorage, which every step can read. Cleared once Back is used.
 *
 * sessionStorage is per tab and every access is guarded, so a blocked store
 * just means Back goes to Payments as it always did. A remembered target
 * expires after a few hours, so a setup abandoned yesterday can't send Back to
 * a stale invoice when onboarding is opened from the Payments page later.
 */

const STORAGE_KEY = "sole:solepay-return";
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

export const SOLEPAY_ONBOARDING_HREF = "/payments/solepay/onboarding";
export const PAYMENTS_FALLBACK_HREF = "/payments";

/** The invoice's own page, which opens a draft in edit mode. */
export function invoiceEditHref(invoiceId: string): string {
  return `/invoices/${encodeURIComponent(invoiceId)}`;
}

/** An in-app path only — never a full URL, which would make Back an open redirect. */
function safePath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

/** The onboarding URL that carries where to come back to. */
export function solePayOnboardingHref(
  target: { invoiceId?: string | null; returnTo?: string | null } = {},
): string {
  if (target.invoiceId) {
    return `${SOLEPAY_ONBOARDING_HREF}?returnInvoice=${encodeURIComponent(target.invoiceId)}`;
  }
  const path = safePath(target.returnTo);
  return path
    ? `${SOLEPAY_ONBOARDING_HREF}?returnTo=${encodeURIComponent(path)}`
    : SOLEPAY_ONBOARDING_HREF;
}

/**
 * Called by the first onboarding page with its query string: remembers the
 * target if there is one. No param leaves whatever is already remembered alone,
 * so landing on step two after a refresh doesn't forget it.
 */
export function rememberSolePayReturn(params: URLSearchParams): void {
  const invoiceId = params.get("returnInvoice");
  const path = invoiceId
    ? invoiceEditHref(invoiceId)
    : safePath(params.get("returnTo"));
  if (!path) return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ path, at: Date.now() }),
    );
  } catch {
    // Storage unavailable — Back falls back to Payments.
  }
}

/** The remembered return path, or null when onboarding was opened directly. */
export function readSolePayReturn(): string | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const { path, at } = JSON.parse(stored) as { path?: string; at?: number };
    if (typeof at !== "number" || Date.now() - at > MAX_AGE_MS) return null;
    return safePath(path);
  } catch {
    return null;
  }
}

export function clearSolePayReturn(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
