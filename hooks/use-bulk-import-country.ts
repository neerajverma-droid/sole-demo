"use client";

import * as React from "react";

import { useCountryContext } from "@/hooks/use-country-context";
import { bulkImportCountry } from "@/lib/bulk-import-country";
import type { BulkImportCountry } from "@/lib/bulk-import";

/**
 * The open business's country as the bulk importers read it — tax word,
 * contact currency, rate by date and business-number rules. Starts
 * Australian, like the context it comes from, and is stable between renders
 * so a spec built from it is only rebuilt when the country actually changes.
 */
export function useBulkImportCountry(): BulkImportCountry {
  const { country } = useCountryContext();
  return React.useMemo(() => bulkImportCountry(country), [country]);
}
