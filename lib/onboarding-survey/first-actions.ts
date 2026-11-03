/**
 * "Right — want to make something?"
 *
 * Ported from `sole-webapp/components/OnboardingSurveyPopup/firstActions.js`.
 * The last step of onboarding offers the one thing this trade most likely
 * wants to do first, so the popup ends by putting the user INSIDE the product
 * rather than back on an empty dashboard. A tradie quotes before they invoice;
 * a shop prices its products before either; a consultant just invoices.
 *
 * Hrefs are this app's real routes, not source's — `/quotes/create` and
 * `/invoices/create` were sole-webapp's Pages Router paths; here the
 * equivalent screens are the App Router "create" choosers under
 * `app/(app)/quotes/new`, `app/(app)/invoices/new` and
 * `app/(app)/expenses/new` (each picks manual vs. NDIS/OCR from there), and
 * products live at `app/(app)/sales/products`.
 *
 * `feature` on the products action is dropped rather than remapped: source
 * gated it behind the `products-services` add-on, but here "Product &
 * services" is a plain Sales row nobody has to buy — there is no equivalent
 * lock to check, so nothing here needs `canUse` to hide it. `canUse` is kept
 * as a parameter anyway (defaulting to always-allow) so a genuinely gated
 * first action can be added later without changing this function's shape —
 * see the doc on `canUse` below for what was actually available to wire it to.
 *
 * Industry remap: the same table as `industry-lines.ts` and
 * `pin-suggestions.ts` — see `industry-lines.ts` for the full reasoning.
 * "Consulting" reads as "Professional services" here too, so it takes the
 * same quote-led ordering.
 */

export type FirstAction = {
  key: "quote" | "invoice" | "expense" | "products";
  title: string;
  subtitle: string;
  href: string;
  /**
   * An add-on id this action requires, checked via `canUse` before it's
   * offered. None of today's four actions set one — see the file doc on why
   * `products` doesn't — but the field stays on the type so a future gated
   * action can add one without changing this file's shape.
   */
  feature?: string;
};

const ACTIONS: Record<FirstAction["key"], FirstAction> = {
  quote: {
    key: "quote",
    title: "Send your first quote",
    subtitle: "Win the job now, turn it into an invoice in one tap later.",
    href: "/quotes/new",
  },
  invoice: {
    key: "invoice",
    title: "Create your first invoice",
    subtitle: "Bill a client and get paid — we'll handle the GST line.",
    href: "/invoices/new",
  },
  expense: {
    key: "expense",
    title: "Record an expense",
    subtitle: "Snap a receipt and we'll read it for you.",
    href: "/expenses/new",
  },
  products: {
    key: "products",
    title: "Add your products",
    subtitle: "Price them once, then invoice in seconds.",
    href: "/sales/products",
  },
};

/** Quote first, because the job is won before it is billed. */
const QUOTE_LED = [
  "Trades",
  "Construction",
  "Creatives",
  "Arts",
  "Professional services",
  "Consulting",
  "Admin Services",
  "Influencers",
];

/** Stock before invoices — nothing can be billed until it has a price. */
const STOCK_LED = ["Retail", "Manufacturers", "Food services"];

function orderFor(industryName: string): FirstAction["key"][] {
  if (QUOTE_LED.includes(industryName)) {
    return ["quote", "invoice", "expense"];
  }
  if (STOCK_LED.includes(industryName)) {
    return ["products", "invoice", "expense"];
  }
  return ["invoice", "expense", "quote"];
}

/**
 * Whether a gated action is offered at all.
 *
 * Source wired this to `hasFeatureAccess(subscriptionData, feature)`. This app
 * has no single equivalent — entitlements live per add-on
 * (`addedAddonsAtom`/`ADDONS` in `lib/atoms.ts` / `lib/addons.ts`), read via a
 * Jotai atom rather than a plain function, and no action in `ACTIONS` above
 * ends up needing one (see the file doc on why `products` doesn't). Kept as a
 * parameter, defaulting to always-allow, so the caller can wire a real check
 * in later without this function's shape changing — an action added in future
 * with a genuine add-on gate would set its own `feature` key to an add-on id
 * and pass a `canUse` built from `addedAddonsAtom`.
 */
export type CanUseFeature = (feature?: string) => boolean;

/**
 * The offers for an industry, best-fit first. `canUse(feature)` decides
 * whether a gated option is offered at all — see `CanUseFeature` above.
 */
export default function firstActions(
  industryName = "",
  canUse: CanUseFeature = () => true,
): FirstAction[] {
  return orderFor(industryName)
    .map((key) => ACTIONS[key])
    .filter((action) => canUse(action.feature))
    .slice(0, 3);
}
