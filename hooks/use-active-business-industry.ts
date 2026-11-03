"use client";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useIndustriesQuery } from "@/hooks/use-industries-query";

/**
 * The active business's real industry name — resolved from its `industryId`
 * against the live industries list.
 *
 * Deliberately not `useSettingsStore`'s `business.industry`: that store is a
 * separate, locally-edited profile snapshot (written only from the Settings
 * form and onboarding) that was never wired to the real multi-business API,
 * so it can name a completely different industry than whichever business is
 * actually active — that's what put "Professional services" (the store's own
 * hardcoded default) in the General tab's header for a Finance-industry
 * business. Empty until the business and industries list have both loaded.
 */
export function useActiveBusinessIndustry(): string {
  const { business } = useActiveBusiness();
  const { data: industries = [] } = useIndustriesQuery();

  if (business?.industryId == null) return "";
  return (
    industries.find((entry) => entry.id === String(business.industryId))
      ?.name ?? ""
  );
}
