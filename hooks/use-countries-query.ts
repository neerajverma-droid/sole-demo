"use client";

import { useQuery } from "@tanstack/react-query";

import { detectCountry, fetchCountries } from "@/lib/countries";

/**
 * The supported countries, cached for an hour.
 *
 * Much longer than the industries list's five minutes: a country is added to
 * the registry when Sole launches in it, which is a release, not an edit. The
 * one screen that reads this is onboarding, so a stale-by-an-hour list costs
 * nothing and a refetch per mount would be pure waste.
 */
export function useCountriesQuery() {
  return useQuery({
    queryKey: ["countries"],
    queryFn: fetchCountries,
    staleTime: 60 * 60_000,
  });
}

/**
 * Where the visitor probably is, asked once per page load.
 *
 * Never retried: it's a convenience, and an error just leaves the country
 * field empty for the person to fill in — the way it worked before.
 */
export function useDetectedCountryQuery() {
  return useQuery({
    queryKey: ["detected-country"],
    queryFn: detectCountry,
    staleTime: Infinity,
    retry: false,
  });
}
