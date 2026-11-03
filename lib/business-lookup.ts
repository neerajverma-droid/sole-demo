/**
 * Look a business up in its country's register, to fill the form from it.
 *
 * Australia's ABR and New Zealand's NZBN register, both reached through
 * sole-ocr's `/country-context/lookup` rather than called from here.
 *
 * That indirection is the point, not an accident of layering. The ABR's JSON
 * endpoint authenticates with a registered GUID
 * (`abr.business.gov.au/json/AbnDetails.aspx?abn=…&guid=…`) and the NZBN
 * gateway with a subscription key — calling either from the browser ships that
 * credential to every visitor who opens dev tools, and anyone can then spend
 * our quota. sole-ocr holds both and this sends it a number.
 *
 * It also means the response shape is normalised server-side: the two
 * registers disagree about almost every field name, and the frontend reads one
 * shape for both.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

/** What a register tells us, after sole-ocr has normalised the two shapes. */
export type BusinessRegisterRecord = {
  /** The number as the register holds it, which may be formatted differently. */
  identifier: string;
  /** The registered entity name — what fills the business-name field. */
  name: string;
  /** A trading name where the register publishes one. */
  tradingName?: string;
  /** The register's own words: "Australian Private Company", "NZ Limited Company". */
  entityType?: string;
  /** "Active", "Registered" — a cancelled entity is worth seeing. */
  status?: string;
  /**
   * Whether the register says this entity is registered for GST. Undefined
   * when the register doesn't publish it, which is NOT the same as false.
   */
  taxRegistered?: boolean;
  region?: string;
  postcode?: string;
};

type RawRecord = {
  identifier?: string;
  name?: string;
  trading_name?: string;
  entity_type?: string;
  status?: string;
  tax_registered?: boolean;
  region?: string;
  postcode?: string;
};

export type LookupResult =
  | { ok: true; record: BusinessRegisterRecord }
  | { ok: false; message: string };

const text = (value: string | null | undefined): string => value?.trim() ?? "";

/**
 * @param value the business number as typed — separators and all.
 * @param countryIso2 which register to ask. Passed explicitly because
 *   onboarding chooses the country on the same screen as the number, so the
 *   business's own country is still the default one at this point.
 *
 * Never throws. A register that is down, unconfigured or simply has no match
 * all come back as `ok: false` with something sayable, because none of them is
 * a reason to stop someone signing up — the fields are all typeable by hand.
 */
export async function lookupBusiness(
  value: string,
  countryIso2: string,
): Promise<LookupResult> {
  try {
    const response = await api.get<{ success?: boolean; data?: RawRecord }>(
      apiRoutes.country.lookup,
      { params: { value: value.trim(), country: countryIso2.toUpperCase() } },
    );

    const raw = response.data?.data;
    if (!raw?.name) {
      return { ok: false, message: "No match in the business register." };
    }

    return {
      ok: true,
      record: {
        identifier: text(raw.identifier),
        name: text(raw.name),
        tradingName: text(raw.trading_name) || undefined,
        entityType: text(raw.entity_type) || undefined,
        status: text(raw.status) || undefined,
        // Passed through as-is: `undefined` means the register didn't say,
        // which must not be flattened into "not registered".
        taxRegistered: raw.tax_registered,
        region: text(raw.region) || undefined,
        postcode: text(raw.postcode) || undefined,
      },
    };
  } catch (error) {
    // 404 is the backend's "no match" (or no register wired up for this
    // country); anything else is the register being unreachable.
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    const message = (
      error as { response?: { data?: { message?: string } } }
    )?.response?.data?.message;

    return {
      ok: false,
      message:
        message ||
        (status === 404
          ? "No match in the business register."
          : "The business register is unavailable right now."),
    };
  }
}
