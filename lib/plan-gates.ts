/**
 * The routes a plan has to include before their page opens.
 *
 * Every page was reachable by URL whatever the plan said — the sidebar showed
 * KM Tracker to someone without it, and the page rendered and then failed on
 * its first request. These are the routes that answer to a feature key in the
 * profile's `allowed_features` (sole-ocr `src/services/featureAccess.js`), which
 * the server works out from the package, the add-ons, a trial and Fitrec. The
 * server still refuses the data either way; this is so the screen says why.
 *
 * Payroll answers to its seats instead (`payrollLocked`): it's billed per
 * employee and switched on from the seat picker, not through the plan.
 */
export type PlanGate = {
  /** Route prefixes, matched whole-segment: `/projects` covers `/projects/12`. */
  prefixes: string[];
  /** The `allowed_features` key that opens it. Absent on a seat-billed gate. */
  feature?: string;
  /** Opened by active payroll seats rather than a feature key. */
  seats?: boolean;
  /** What the popup calls it. */
  label: string;
  /**
   * The add-on card that sells it, when there is one. Without a card (Inventory,
   * and Transactions, which comes with Bundle or the Accounting add-on) the
   * popup sends people to the plans instead.
   */
  addonId?: string;
};

export const PLAN_GATES: PlanGate[] = [
  { prefixes: ["/transactions"], feature: "transactions", label: "Transactions" },
  { prefixes: ["/projects"], feature: "projects", label: "Project billing", addonId: "projects" },
  { prefixes: ["/time-tracker"], feature: "time-tracking", label: "Time tracker", addonId: "time-tracker" },
  {
    prefixes: ["/calendar", "/planner", "/booking-links"],
    feature: "booking",
    label: "Scheduling",
    addonId: "scheduling",
  },
  { prefixes: ["/km-tracker"], feature: "km-tracker", label: "KM tracker", addonId: "km-tracker" },
  {
    prefixes: ["/investment-property"],
    feature: "investment",
    label: "Investment property",
    addonId: "investment",
  },
  { prefixes: ["/inventory"], feature: "inventory", label: "Inventory" },
  { prefixes: ["/payroll"], seats: true, label: "Payroll" },
];

/** The gate in front of a path or an href, query and hash ignored; none if it's open to every plan. */
export function gateForPath(path: string | undefined | null): PlanGate | undefined {
  if (!path) return undefined;
  const pathname = path.split(/[?#]/)[0];
  return PLAN_GATES.find((gate) =>
    gate.prefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ),
  );
}
