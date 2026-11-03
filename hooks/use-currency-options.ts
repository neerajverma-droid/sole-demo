"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

export type CurrencyOption = {
  /** ISO 4217 code: "NZD". */
  code: string;
  /** What the exchange-rate table calls it: "New Zealand Dollar". */
  label: string;
};

type RateRow = { target_currency?: string; target_currency_label?: string };

/** The exchange-rate table's currencies, one option per code, sorted by name. */
export function mapCurrencyOptions(rows: RateRow[] | undefined): CurrencyOption[] {
  const byCode = new Map<string, CurrencyOption>();
  for (const row of rows ?? []) {
    const code = String(row.target_currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || byCode.has(code)) continue;
    byCode.set(code, { code, label: String(row.target_currency_label ?? "").trim() || code });
  }
  return [...byCode.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Every currency a record can be set to — the same table sole-webapp builds its
 * currency dropdown from (`GET /exchange-rates`).
 *
 * `include` is always in the list, even when the table is empty (it's filled
 * by a cron, so a new environment has no rows) or the request fails: a form
 * must be able to show its own default and an existing record's saved
 * currency, whatever the table holds.
 */
export function useCurrencyOptions(include: Array<string | null | undefined> = []): {
  options: CurrencyOption[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["currency-options"],
    queryFn: async () => {
      const response = await api.get<{ data?: RateRow[] }>(apiRoutes.exchangeRates.getAll);
      return mapCurrencyOptions(response.data?.data);
    },
    // Rates move daily; the list of currencies hardly ever.
    staleTime: 60 * 60_000,
  });

  const options = [...(query.data ?? [])];
  for (const code of include) {
    const upper = String(code ?? "").trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(upper) && !options.some((option) => option.code === upper)) {
      options.push({ code: upper, label: upper });
    }
  }
  return { options, loading: query.isLoading };
}
