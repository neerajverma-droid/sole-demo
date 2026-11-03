/**
 * Where a freshly authenticated person lands, and which business they land in.
 *
 * Five entry points end here — password, code, SSO callback, email
 * verification and a resumed session — so the decision is made once, in one
 * place, and they cannot drift on it.
 *
 * The order is the order of things that can't be skipped: an account that has
 * never finished sign-up goes to onboarding whatever else is true of it, and
 * only then does the business list decide between the app and the chooser.
 *
 * Setting the business id is not optional here, and it used to be: the old
 * version only wrote it when the account had EXACTLY one business. With two or
 * more, nothing was stored, every request went out without `business_id`, and
 * the backend fell back to whichever business it calls default
 * (`sole-ocr/src/middleware/businessContext.js`) — so someone who had switched
 * businesses before signing out came back to a different one, and the rail
 * named a business the data on screen didn't belong to.
 *
 * It now always resolves one: the account's default business, then the first
 * one it can actually open.
 */
import { apiGet } from "@/lib/api/client";
import { clearBusinessId, setBusinessId } from "@/lib/api/business-id";
import { apiRoutes } from "@/lib/api/routes";
import type { AuthUser } from "@/lib/api/types";

export const ONBOARDING_ROUTE = "/onboarding";
export const BUSINESS_HOME_ROUTE = "/dashboard";
export const CHOOSE_BUSINESS_ROUTE = "/businesses";

type BusinessSummary = {
  id?: number | string;
  is_default?: boolean | number;
  is_locked?: boolean;
  payment_status?: string;
  subscription_status?: string;
};

/** A business that can only be opened by completing checkout. */
function isLocked(business: BusinessSummary): boolean {
  return (
    business.is_locked === true ||
    business.payment_status === "locked" ||
    business.subscription_status === "locked"
  );
}

/**
 * The business to open, or null when none can be.
 *
 * The account's default first — that's the one the backend itself would pick,
 * so agreeing with it means a stored id and an unstored one resolve the same
 * business rather than two different ones. A locked default falls through to
 * the first openable business, because opening a business nobody can use is
 * worse than opening a different one.
 */
export function resolveActiveBusiness(
  businesses: BusinessSummary[],
): BusinessSummary | null {
  const openable = businesses.filter(
    (business) => business?.id != null && !isLocked(business),
  );
  if (openable.length === 0) return null;

  return (
    openable.find((business) => Boolean(business.is_default)) ?? openable[0]
  );
}

export async function resolvePostAuthRoute(
  user: AuthUser | null | undefined,
): Promise<string> {
  // A brand-new account has no business profile yet, which is precisely what
  // onboarding exists to collect. Any business id left over from whoever used
  // this browser last would scope onboarding's own save to the wrong account.
  if (user?.is_first_login) {
    clearBusinessId();
    return ONBOARDING_ROUTE;
  }

  const result = await apiGet<BusinessSummary[]>(apiRoutes.businesses.list, {
    auth: "bearer",
  });

  const businesses = Array.isArray(result.data) ? result.data : [];

  // No business on the account is the same situation as a first login: there is
  // nothing to open until onboarding has created one.
  if (businesses.length === 0) {
    clearBusinessId();
    return ONBOARDING_ROUTE;
  }

  const active = resolveActiveBusiness(businesses);

  if (!active) {
    // Every business is payment-locked. The chooser is the only screen that
    // can do anything about that, and it's the one place checkout lives.
    clearBusinessId();
    return CHOOSE_BUSINESS_ROUTE;
  }

  setBusinessId(active.id!);
  return BUSINESS_HOME_ROUTE;
}
