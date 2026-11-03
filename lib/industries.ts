/**
 * The real industries list — GET /industry — replacing the local, made-up
 * `INDUSTRIES` strings the picker used before with the same ids and names
 * sole-webapp's business-profile form saves against.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { NDIS_INDUSTRY } from "@/lib/settings";

export type IndustryOption = { id: string; name: string };

/**
 * The one entry this app already has its own gating constant for — every
 * NDIS-conditional field, template and invoice type across the platform
 * compares against `NDIS_INDUSTRY`'s exact string, so the real API's plainer
 * "Health and Social Care" is relabelled to match rather than introducing a
 * second name for the same thing. `industry_id` on the wire is still the
 * real `9`, unaffected by the label swap.
 */
const HEALTH_AND_SOCIAL_CARE_ID = "9";

function withLocalLabels(list: IndustryOption[]): IndustryOption[] {
  return list.map((entry) =>
    entry.id === HEALTH_AND_SOCIAL_CARE_ID
      ? { ...entry, name: NDIS_INDUSTRY }
      : entry,
  );
}

type RawIndustry = { value?: number | string; id?: number | string; name?: string; title?: string };

/**
 * No fallback list — a failed or malformed response is a real failure, not
 * something to paper over with fabricated industries. Left to throw:
 * `useIndustriesQuery` surfaces it as `isError`, same as any other query.
 */
export async function fetchIndustries(): Promise<IndustryOption[]> {
  const response = await api.get<{ success: boolean; data?: RawIndustry[] } | RawIndustry[]>(
    apiRoutes.industry.list,
  );
  const body = response.data;
  const raw = Array.isArray(body) ? body : body?.data;

  if (!Array.isArray(raw)) {
    throw new Error("Industries list came back in an unexpected shape");
  }

  return withLocalLabels(
    raw.map((entry) => ({
      id: String(entry.value ?? entry.id ?? ""),
      name: entry.name || entry.title || "Industry",
    })),
  );
}
