/**
 * The plan picker's catalogue: packages, add-ons and what a selection costs.
 *
 * Transcribed from the handoff's Settings reference — the "Simple pricing, built
 * for you" panel — rather than invented, so the names, prices, badges and the
 * 20% annual saving are the design's numbers. The panel had never been built in
 * React; this is the data half of it, kept out of the component so the two
 * places that show it can't disagree about what anything costs.
 *
 * Prices are monthly. Annual multiplies by `ANNUAL_MULTIPLIER` and bills yearly,
 * which is why every total reads "per average month".
 */

import { invoiceMoney } from "@/lib/invoices";

export type BillingCycle = "monthly" | "annual";

/** The 20% the Annual toggle advertises. */
export const ANNUAL_MULTIPLIER = 0.8;

export type PricingPackage = {
  id: string;
  name: string;
  /** Monthly, before the cycle or any discount. */
  price: number;
  badge?: string;
  /** Why it can't be chosen. Disabled with the reason, per the platform rule. */
  unavailableReason?: string;
  features: string[];
  /** Shown struck through — what this tier stops short of. */
  excluded: string[];
};

/**
 * The five tiers.
 *
 * The reference only spelled out the feature lists for Invoices and Expenses;
 * the other four carried a name, a price and a badge. Theirs are written here in
 * the same voice so no card renders featureless — worth checking against the
 * real plan comparison when it lands.
 */
export const PRICING_PACKAGES: PricingPackage[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    features: [
      "5 invoices & quotes a month",
      "Expense tracking & receipts",
      "Dashboard & reports",
    ],
    excluded: ["Unlimited invoicing", "Bank feed"],
  },
  {
    id: "invexp",
    name: "Invoices and Expenses",
    price: 14.99,
    features: [
      "Unlimited invoices & quotes",
      "Unlimited expenses & assets",
      "Full dashboard",
    ],
    excluded: ["Transactions", "Bank feed"],
  },
  {
    id: "compliance",
    name: "Compliance Bundle",
    price: 24.99,
    badge: "25% off",
    features: [
      "Everything in Invoices and Expenses",
      "BAS reporting & GST",
      "Liability & capital tracking",
    ],
    excluded: ["Time tracking"],
  },
  {
    id: "advanced",
    name: "Advanced",
    price: 44.99,
    badge: "Best value",
    features: [
      "Everything in the Compliance Bundle",
      "Every add-on included",
      "Priority support",
    ],
    excluded: [],
  },
  {
    id: "pro",
    name: "Pro",
    price: 59.99,
    badge: "Coming June 2026",
    unavailableReason: "Pro opens in June 2026.",
    features: [
      "Everything in Advanced",
      "Multi-entity consolidation",
      "Dedicated onboarding",
    ],
    excluded: [],
  },
];

/**
 * What a monthly price becomes once the cycle and any standing discount apply.
 *
 * One function for every price on the panel — a card, an add-on row and the
 * total all go through it, so the figures can't add up to something other than
 * what they're shown beside.
 */
export function pricingRate(
  monthly: number,
  cycle: BillingCycle,
  discount = 1,
): number {
  const rate =
    monthly * (cycle === "annual" ? ANNUAL_MULTIPLIER : 1) * discount;
  return Math.round(rate * 100) / 100;
}

/** "/ average month", or the annual variant that says when it's billed. */
export function pricingPeriodLabel(cycle: BillingCycle): string {
  return cycle === "annual"
    ? "/ average month · billed yearly"
    : "/ average month";
}

/** "$14.99" — the one place a price is formatted. Free reads as a word. */
export function pricingMoney(value: number): string {
  return value <= 0 ? "Free" : invoiceMoney(value);
}
