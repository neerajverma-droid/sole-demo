import { pinTargets } from "@/lib/nav";

/**
 * Which sidebar shortcuts to offer a new user, given the trade they just told
 * Pip about.
 *
 * Ported from `sole-webapp/components/OnboardingSurveyPopup/pinSuggestions.js`.
 * Source keys its `BY_INDUSTRY` by `services/industry.services.js`'s ~23 names
 * and its ids by `PINNABLE_ITEMS` in `components/Layout/AppSidebar.jsx`;
 * neither matches this app one-for-one, so both had to be remapped rather than
 * copied.
 *
 * Industry remap: the same table as `industry-lines.ts` and
 * `first-actions.ts` — each file keeps its own copy since each is a small,
 * self-contained port of its own source file, but the three should stay in
 * agreement. See `industry-lines.ts` for the full reasoning.
 *
 * Id remap: source's ids are checked one by one against this app's nav
 * catalogue (`lib/nav.ts`). Several of source's suggestions are add-ons here
 * (`km-tracker`, `time-tracker`, `scheduling`, `assets` the paid register,
 * `projects`) rather than pinnable rail rows — `lib/nav.ts`'s own
 * `PIN_TARGETS` deliberately excludes add-ons from pinning ("a pin that put a
 * second copy of a row in PINNED would make adding an add-on look like it had
 * landed in two places"), so none of those survive the port. Others have no
 * equivalent at all here (`booking-links`, `proposal`, `all-projects`,
 * `all-trips`, `investment-property`, `property-portfolio`, `reputation`) and
 * are dropped rather than guessed at. The rest map to their nearest
 * equivalent by meaning:
 *
 *   - `expenses-overview` → `expenses-list` (the Expenses screen itself)
 *   - `products-services`  → `products` ("Product & services", under Sales)
 *   - `assets` (source's paid asset register) → `asset-register` (this app's
 *     free Assets row — the row a suggestion should point at when nobody has
 *     bought the paid one)
 *   - `customer-supplier-report` → `cust-supplier` (under the reporting suite)
 *   - `super-contributions` → `super` (under Expenses)
 *   - `bas-report` → `bas` (under the reporting suite)
 *
 * A few industries are left with no trade-specific suggestion at all once
 * their extras are filtered (their entire source list was add-ons, or had no
 * home here) — CORE alone covers them, same as source's own behaviour for an
 * industry it doesn't recognise.
 */

/** Everyone gets these — the four screens the app is actually used for. */
const CORE = ["invoices", "expenses-list", "all-transactions", "contacts"];

/**
 * The extras that earn their place per trade, keyed by this app's own
 * industry names (`lib/settings.ts`'s `INDUSTRIES`). Already filtered down to
 * ids that exist in `lib/nav.ts` at the time this was written — see the file
 * doc above for what was dropped or remapped and why. `suggestedPinIds` below
 * filters again at call time, so a row renamed or removed later can't put a
 * dead shortcut in front of anyone even if this table is left stale.
 */
const BY_INDUSTRY: Record<string, string[]> = {
  Trades: ["quotes", "asset-register"],
  Construction: ["quotes", "asset-register"],
  "Make up": ["products"],
  Creatives: ["quotes"],
  Arts: ["quotes", "products", "inventory"],
  Influencers: ["quotes", "asset-register"],
  Retail: ["inventory", "products", "cust-supplier"],
  Manufacturers: ["inventory", "products", "asset-register"],
  "Food services": ["inventory", "products"],
  "Transport & logistics": ["asset-register"],
  Finance: ["bas"],
  Insurance: ["cust-supplier", "bas"],
  "Professional services": [],
  Consulting: [],
  "Admin Services": ["quotes"],
  "NDIS (Health and Social Care)": [],
  "Personal Trainers / Fitness": ["client-refund"],
  Other: ["quotes"],
};

/**
 * Suggested shortcut ids for an industry, best-fit first: the trade-specific
 * ones lead, because they are the reason this popup is worth showing at all.
 *
 * Resolved through `lib/nav.ts`'s own `pinTargets` before being handed back —
 * the same function the sidebar's PINNED section uses to turn stored ids into
 * rows, dropping any id that no longer names one. Mirrors source's own
 * defensive check against `PINNABLE_ITEMS` at call time, using the app's own
 * existing "resolve ids, drop the dead ones" primitive rather than a second
 * one invented for this file.
 */
export default function suggestedPinIds(industryName = ""): string[] {
  const extras = BY_INDUSTRY[industryName] ?? BY_INDUSTRY.Other ?? [];
  const candidates = [...new Set([...extras, ...CORE])];
  return pinTargets(candidates).map((item) => item.id);
}
