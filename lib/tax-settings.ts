/**
 * The GST rate the books are kept at — `/v2/settings/tax-settings`.
 *
 * Ported from sole-webapp's `components/Settings/TaxesAndBanking/TaxSetup.js`,
 * which reads and writes the same endpoint: a GET returns `tax_settings` (one
 * record, or a list whose first entry is the one in use), and a POST to the
 * same URL creates it, or updates it when an `id` rides along.
 *
 * A record either follows the business's country (`follow_country_rate = 1`:
 * the registry's rate for each document's date, so a government change applies
 * itself) or pins a custom rate (`0`). For a following record the server reports
 * today's country rate as `tax_percentage`.
 *
 * What this endpoint is NOT is the whole Tax & GST section. It holds a tax
 * NAME, a PERCENTAGE, the follow flag and an is-default flag — there is no
 * column anywhere for BAS frequency or the financial year start, which is why
 * those two stay in `stores/preferences.ts` and say so on the form. The
 * accounting basis is real, but it lives on the business record
 * (`accounting_type`), not here — see `saveAccountingBasis`.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

type ApiResult<T> = { success?: boolean; message?: string; data?: T };

type ApiTaxSetting = {
  id?: number | string | null;
  tax_name?: string | null;
  tax_percentage?: number | string | null;
  follow_country_rate?: unknown;
  /** The country's standard rate today, sent alongside each record. */
  country_rate?: number | string | null;
  is_default?: unknown;
};

type ApiTaxSettings = {
  tax_settings?: ApiTaxSetting | ApiTaxSetting[] | null;
};

/**
 * The GST record as the form holds it.
 *
 * `id` is carried so a save updates the existing row instead of adding a
 * second GST rate every time Save is pressed — the endpoint takes a create and
 * an update on the same verb and URL, told apart only by this field.
 */
export type TaxRateForm = {
  id: number | string | null;
  name: string;
  /** As typed, so a half-entered "1" doesn't snap to 1%. Validated on save. */
  percentage: string;
  /** Whether this rate applies by default — what "Registered for GST" means here. */
  isDefault: boolean;
  /** Follows the country's standard rate (true) or is a custom rate (false). */
  followsCountry: boolean;
  /** The country's standard rate today, when the server sent it. */
  countryRate: number | null;
};

/** Australia's GST, for an account the server has never been told about. */
export const DEFAULT_TAX_RATE: TaxRateForm = {
  id: null,
  name: "GST",
  percentage: "10",
  isDefault: false,
  followsCountry: true,
  countryRate: null,
};

/** sole-webapp stores this as 0/1, a boolean or a string depending on the row. */
function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export async function fetchTaxRate(): Promise<TaxRateForm> {
  const response = await api.get<ApiResult<ApiTaxSettings>>(
    apiRoutes.tax.getDetails,
  );
  const raw = response.data?.data?.tax_settings;
  // Same both-shapes read TaxSetup.js does — the endpoint has returned each.
  const setting = Array.isArray(raw) ? raw[0] : raw;
  if (!setting) return DEFAULT_TAX_RATE;

  const countryRate = setting.country_rate != null && Number.isFinite(Number(setting.country_rate)) ? Number(setting.country_rate) : null;
  return {
    id: setting.id ?? null,
    name: setting.tax_name || "GST",
    percentage:
      setting.tax_percentage != null ? String(Number(setting.tax_percentage)) : "",
    isDefault: toBool(setting.is_default),
    // An older server sends no flag: every record it holds behaves as following.
    followsCountry: setting.follow_country_rate === undefined || setting.follow_country_rate === null ? true : toBool(setting.follow_country_rate),
    countryRate,
  };
}

/**
 * Blank, non-numeric or out of range. The server accepts 1–100: a business that
 * charges no tax isn't registered, rather than registered at 0%.
 */
export function taxPercentageError(value: string, tax = "GST"): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `${tax} rate is required.`;
  const rate = Number(trimmed);
  if (!Number.isFinite(rate) || rate < 1 || rate > 100) {
    return `${tax} rate must be a number between 1 and 100.`;
  }
  return undefined;
}

/**
 * Creates the rate, or updates it when the form already carries an id.
 *
 * Returns whatever id the server settles on, so the caller can keep editing
 * the row it just created rather than making another one on the next save.
 */
export async function saveTaxRate(
  values: TaxRateForm,
  options: {
    /**
     * Stored on the business as its registration, which the server then enforces
     * (no tax on documents when false). Sent only when the person actually made
     * that choice; left out, the business's registration stays as it was.
     */
    taxRegistered?: boolean;
  } = {},
): Promise<number | string | null> {
  const body = buildEncryptedRequestBody({
    ...(values.id != null ? { id: values.id } : {}),
    tax_name: values.name.trim() || "GST",
    tax_percentage: Number(values.percentage),
    is_default: values.isDefault ? 1 : 0,
    // Said outright rather than left for the server to infer from the percentage.
    follow_country_rate: values.followsCountry ? 1 : 0,
    ...(options.taxRegistered !== undefined ? { tax_registered: options.taxRegistered ? 1 : 0 } : {}),
  });

  const response = await api.post<ApiResult<{ id?: number | string }>>(
    apiRoutes.tax.getDetails,
    body,
  );

  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save your tax settings.");
  }

  // Whether a business is GST-registered changes what half the product should
  // show it, so "how many configure this at all" is a setup-funnel question
  // rather than a settings detail.
  track(EVENTS.GST_SETTINGS_CONFIGURED, {
    rate: Number(values.percentage),
    is_default: Boolean(values.isDefault),
    follows_country: Boolean(values.followsCountry),
    is_first_time: values.id == null,
  });

  return response.data?.data?.id ?? values.id;
}
