/**
 * What's left of the Dashboard's demo fixtures.
 *
 * The Dashboard itself is wired to the real API now (see `lib/dashboard.ts`,
 * `hooks/use-dashboard-query.ts`) — everything that used to live here for it
 * has moved there. What's left is used elsewhere:
 *
 *  - `money` is the shared formatter, used well beyond the Dashboard.
 *  - `AccountStage` backs the dev-only "Preview state" toggle.
 *  - `REVENUE_GOAL.defaultTarget` seeds the goal-target store. Its other
 *    fields are frozen samples the vendored `sole-project` snapshot still
 *    compiles against — see the type's own doc comment.
 *  - `MONTHLY_CASH_FLOW` is the auth screen's promo mockup (`AuthPromoMockup`)
 *    — decorative, and shown to a visitor with no session to fetch real
 *    figures for, so it stays a static illustration rather than a query.
 */

import type { CashFlowMonth } from "@/lib/dashboard";
import { activeAmountDigits, activeCurrencySymbol } from "@/lib/country-context";

export type AccountStage = "new" | "active";

export function money(value: number): string {
  return `${activeCurrencySymbol()}${activeAmountDigits(value, { maximumFractionDigits: 0 })}`;
}

/**
 * The target a new account starts on.
 *
 * `defaultTarget` is the live field: the dashboard store seeds `goalTarget`
 * from it, and someone who has never set a goal is shown it.
 *
 * Nothing else here is reported any more. The earned figure, the average
 * invoice value, the invoices needed and the period label were all frozen, and
 * all shown on the dashboard as though they were the books — so raising an
 * invoice moved none of them and the greeting could quote a different total
 * than the card beneath it. They're derived now, from `financialYearRevenue`
 * and `currentFinancialYear` in `lib/invoices`. Don't read them: they're kept
 * only because the vendored `sole-project` snapshot still compiles against this
 * module, and they should go with it.
 */
export const REVENUE_GOAL = {
  defaultTarget: 1400000,
  /** @deprecated Frozen sample. Use `financialYearRevenue`. */
  earned: 86500,
  /** @deprecated Frozen sample. Use `currentFinancialYear().label`. */
  periodLabel: "Financial year 2026",
  /** @deprecated Frozen sample. Derive from `financialYearRevenue`. */
  avgInvoiceValue: 4325,
  /** @deprecated Frozen sample. Derive from the goal and the average. */
  invoicesNeeded: 304,
};

/**
 * Money in vs money out by month, January 2025 to August 2026.
 *
 * Decorative only now — `AuthPromoMockup` on the auth screen, which has no
 * signed-in business to fetch real figures for.
 */
export const MONTHLY_CASH_FLOW: CashFlowMonth[] = [
  { key: "2025-01", month: "Jan", year: 2025, moneyIn: 4200, moneyOut: 3900 },
  { key: "2025-02", month: "Feb", year: 2025, moneyIn: 4600, moneyOut: 4100 },
  { key: "2025-03", month: "Mar", year: 2025, moneyIn: 5100, moneyOut: 4300 },
  { key: "2025-04", month: "Apr", year: 2025, moneyIn: 4800, moneyOut: 4600 },
  { key: "2025-05", month: "May", year: 2025, moneyIn: 5600, moneyOut: 4500 },
  { key: "2025-06", month: "Jun", year: 2025, moneyIn: 6100, moneyOut: 5200 },
  { key: "2025-07", month: "Jul", year: 2025, moneyIn: 6400, moneyOut: 5300 },
  { key: "2025-08", month: "Aug", year: 2025, moneyIn: 5900, moneyOut: 5100 },
  { key: "2025-09", month: "Sep", year: 2025, moneyIn: 6300, moneyOut: 5400 },
  { key: "2025-10", month: "Oct", year: 2025, moneyIn: 6800, moneyOut: 5600 },
  { key: "2025-11", month: "Nov", year: 2025, moneyIn: 7200, moneyOut: 6100 },
  { key: "2025-12", month: "Dec", year: 2025, moneyIn: 5400, moneyOut: 4800 },
  { key: "2026-01", month: "Jan", year: 2026, moneyIn: 5800, moneyOut: 5200 },
  { key: "2026-02", month: "Feb", year: 2026, moneyIn: 6200, moneyOut: 5100 },
  { key: "2026-03", month: "Mar", year: 2026, moneyIn: 7400, moneyOut: 5600 },
  { key: "2026-04", month: "Apr", year: 2026, moneyIn: 6900, moneyOut: 6200 },
  { key: "2026-05", month: "May", year: 2026, moneyIn: 8600, moneyOut: 6000 },
  { key: "2026-06", month: "Jun", year: 2026, moneyIn: 8200, moneyOut: 6800 },
  { key: "2026-07", month: "Jul", year: 2026, moneyIn: 9600, moneyOut: 7000 },
  { key: "2026-08", month: "Aug", year: 2026, moneyIn: 8900, moneyOut: 7300 },
];
