"use client";

import * as React from "react";

import { useCountryContext } from "@/hooks/use-country-context";
import { FALLBACK_COUNTRY_CONTEXT } from "@/lib/country-context";
import { useCountryStore } from "@/stores/country";

/**
 * Re-renders the page when the open business's currency changes.
 *
 * The plain money formatters (`invoiceMoney`, `reportMoney`, `axisMoney` …)
 * are called from hundreds of places that aren't subscribed to the country
 * context, and read the open business's currency from the country store. A
 * screen that drew before the store was filled would keep "$" for a South
 * African business, so the page is keyed on the stored currency: it remounts
 * once when that lands, and once on a switch to a business in another
 * currency. Australian businesses never change from the fallback, so they
 * never remount.
 *
 * Keyed on the store rather than the hook's value: the hook fills the store in
 * an effect, after its own render, and the remounted page must read the filled
 * store.
 */
export function CurrencyBoundary({ children }: { children: React.ReactNode }) {
  useCountryContext();
  const currency = useCountryStore((state) => state.context?.currency || FALLBACK_COUNTRY_CONTEXT.currency);
  return <React.Fragment key={currency}>{children}</React.Fragment>;
}
