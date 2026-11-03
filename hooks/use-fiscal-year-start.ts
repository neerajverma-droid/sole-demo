"use client";

import * as React from "react";

import { useCountryContext } from "@/hooks/use-country-context";
import type { FiscalYearStart } from "@/lib/fiscal-year";

/**
 * When the open business's financial year starts — 1 July in Australia, 1 April
 * in New Zealand — for the `lib/fiscal-year` helpers and everything built on
 * them.
 *
 * Starts on 1 July until the country context lands, like the context itself,
 * and is the same object until the start actually changes, so it's safe in a
 * memo's or a query key's dependencies.
 */
export function useFiscalYearStart(): FiscalYearStart {
  const { country } = useCountryContext();
  const month = country.fiscalYearStartMonth;
  const day = country.fiscalYearStartDay;
  return React.useMemo(() => ({ month, day }), [month, day]);
}
