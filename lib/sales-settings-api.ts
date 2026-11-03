/**
 * Sales settings — the real API calls behind the eight-tab screen.
 *
 * Ported from sole-webapp's `components/Settings/Branding.js`,
 * `InvoiceQuoteReferences.js` and `CommunicationPreference.js`, which between
 * them read and write endpoints under `settings.*` plus
 * `communicationPreference.*` and the user's own profile picture. sole-webapp's
 * generic `useService().post` always AES-encrypts non-file fields before
 * sending (see `hooks/useService.js`) — `buildEncryptedRequestBody` is that
 * same shape, so every write below goes through it. GET responses are plain
 * JSON, matching `useService().get`.
 *
 * A few fields have no server counterpart at all: credit note numbering
 * (`refundPrefix`/`nextRefundNumber` — sole-webapp has no such field, and
 * there's no UI for it here either, but `refundNumbering()` still reads the
 * default to seed a new credit note's reference), quote's "Item descriptions"
 * toggle (sole-webapp's quote tab has no `quo_display_desc`), and the Quote
 * Acceptance Flow's "Do nothing" option (sole-webapp only ever creates the
 * invoice as a draft or sends it). All three are left as local-only state.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { getCountryCallingAndPhoneNumber } from "@/lib/phone";
import { digitsOnly } from "@/lib/contacts";
import {
  FOOTER_LINKS,
  type FooterLinkKey,
  type SalesSettings,
} from "@/lib/sales-settings";

type ApiResult<T> = { success: boolean; message?: string; data?: T };

/** Drops keys whose value is `undefined`, so a partial patch can't blank a field. */
function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** sole-webapp stores these as 0/1 or booleans depending on the endpoint. */
function toBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === "1" || value === "true";
}

async function unwrap<T>(
  promise: Promise<{ data: ApiResult<T> }>,
  failureMessage: string,
): Promise<T | undefined> {
  const response = await promise;
  if (response.data?.success === false) {
    throw new Error(response.data.message || failureMessage);
  }
  return response.data?.data;
}

/* ------------------------------------------------------------------ *
 * Tab 1 — Settings (sequence numbers, invoice email)
 * ------------------------------------------------------------------ */

type ApiSeqNumbers = {
  invoice_prefix?: string;
  next_invoice_no?: string | number;
  quote_prefix?: string;
  next_quote_no?: string | number;
};

async function fetchSeqNumbers(): Promise<Partial<SalesSettings>> {
  const response = await api.get<ApiResult<ApiSeqNumbers>>(
    apiRoutes.settings.getSeqNumber,
  );
  return seqNumbersFromApi(response.data?.data);
}

function seqNumbersFromApi(
  d: ApiSeqNumbers | undefined,
): Partial<SalesSettings> {
  if (!d) return {};
  return definedOnly({
    invoicePrefix: d.invoice_prefix,
    nextInvoiceNumber:
      d.next_invoice_no != null ? String(d.next_invoice_no) : undefined,
    quotePrefix: d.quote_prefix,
    nextQuoteNumber:
      d.next_quote_no != null ? String(d.next_quote_no) : undefined,
  });
}

export async function saveSeqNumbersApi(values: {
  invoicePrefix: string;
  nextInvoiceNumber: string;
  quotePrefix: string;
  nextQuoteNumber: string;
}): Promise<Partial<SalesSettings>> {
  const body = buildEncryptedRequestBody({
    invoice_prefix: values.invoicePrefix,
    next_invoice_no: values.nextInvoiceNumber,
    quote_prefix: values.quotePrefix,
    next_quote_no: values.nextQuoteNumber,
  });
  const saved = await unwrap(
    api.post<ApiResult<ApiSeqNumbers>>(apiRoutes.settings.saveSeqNumber, body),
    "Couldn't save invoice & quote numbering.",
  );
  // What the server stored, not what was sent: a new prefix that already has
  // documents under it starts at the first number they haven't used.
  return seqNumbersFromApi(saved);
}

/* ------------------------------------------------------------------ *
 * Tabs 2, 3, 4, 5, 6, 7 — one shared record: get-branding / save-branding
 *
 * sole-webapp's Branding.js keeps all of these tabs in one Formik form and
 * always submits the whole thing, regardless of which tab is open. Here each
 * tab still saves independently (per the existing per-tab dirty/save UI), so
 * `saveBrandingApi` always sends the full current `SalesSettings` — the
 * caller merges this tab's edits into the last-loaded record first — rather
 * than a partial payload that would blank out a sibling tab's fields.
 * ------------------------------------------------------------------ */

type ApiBranding = {
  brand_color?: string;
  content_color?: string;
  inv_customer_name?: unknown;
  inv_customer_business_name?: unknown;
  inv_customer_address?: unknown;
  inv_customer_abn?: unknown;
  inv_sole_user_name?: unknown;
  inv_sole_business_name?: unknown;
  inv_sole_business_address?: unknown;
  inv_sole_business_abn?: unknown;
  inv_display_desc?: unknown;
  quo_customer_name?: unknown;
  quo_customer_business_name?: unknown;
  quo_customer_address?: unknown;
  quo_customer_abn?: unknown;
  quo_sole_user_name?: unknown;
  quo_sole_business_name?: unknown;
  quo_sole_business_address?: unknown;
  quo_sole_business_abn?: unknown;
  phone_enabled?: unknown;
  phone?: string;
  website_enabled?: unknown;
  website?: string;
  facebook_url_enabled?: unknown;
  facebook_url?: string;
  instagram_url_enabled?: unknown;
  instagram_url?: string;
  linkedin_url_enabled?: unknown;
  linkedin_url?: string;
  tiktok_url_enabled?: unknown;
  tiktok_url?: string;
  invoice_template?: string | number;
  quote_template?: string | number;
  ndis_template?: string | number;
  ndis_quote_template?: string | number;
  invoice_note?: string | null;
  quote_note?: string | null;
  send_paid_invoice_receipt?: unknown;
  quote_accept_invoice_action?: string;
  show_quantity_type?: unknown;
  show_gst?: unknown;
  quo_show_quantity_type?: unknown;
  quo_show_gst?: unknown;
};

/** sole-webapp's field key for each footer link, keyed the same as `FOOTER_LINKS`. */
const FOOTER_LINK_API_FIELD: Record<FooterLinkKey, string> = {
  website: "website",
  facebook: "facebook_url",
  instagram: "instagram_url",
  linkedin: "linkedin_url",
  tiktok: "tiktok_url",
};

function quoteAcceptanceActionFromApi(
  value: string | undefined,
): SalesSettings["quoteAcceptanceAction"] | undefined {
  if (value === "send") return "Create and send invoice";
  if (value === "draft") return "Create invoice as draft";
  return undefined;
}

/** "Do nothing" has no server value — sole-webapp only ever drafts or sends. */
function quoteAcceptanceActionToApi(
  value: SalesSettings["quoteAcceptanceAction"],
): string {
  return value === "Create and send invoice" ? "send" : "draft";
}

async function fetchBranding(): Promise<Partial<SalesSettings>> {
  const response = await api.get<ApiResult<ApiBranding>>(
    apiRoutes.settings.getBranding,
  );
  const d = response.data?.data;
  if (!d) return {};

  const { countryCallingCode, nationalNumber } =
    getCountryCallingAndPhoneNumber(d.phone, "+61");

  const footerLinks = Object.fromEntries(
    FOOTER_LINKS.map((link) => {
      const field = FOOTER_LINK_API_FIELD[link.key];
      const enabledKey = `${field}_enabled` as keyof ApiBranding;
      const valueKey = field as keyof ApiBranding;
      return [
        link.key,
        {
          enabled: toBool(d[enabledKey]),
          value: (d[valueKey] as string | undefined) ?? "",
        },
      ];
    }),
  ) as SalesSettings["footerLinks"];

  return definedOnly({
    brandColor: d.brand_color,
    contentColor: d.content_color,

    footerPhone: d.phone_enabled !== undefined || d.phone !== undefined
      ? {
          enabled: toBool(d.phone_enabled),
          countryCode: countryCallingCode,
          value: nationalNumber,
        }
      : undefined,
    footerLinks,

    invoiceFields:
      d.inv_customer_name !== undefined
        ? {
            customerName: toBool(d.inv_customer_name, true),
            customerBusinessName: toBool(d.inv_customer_business_name, true),
            customerAddress: toBool(d.inv_customer_address, true),
            customerAbn: toBool(d.inv_customer_abn),
            yourName: toBool(d.inv_sole_user_name, true),
            yourBusinessName: toBool(d.inv_sole_business_name, true),
            yourBusinessAddress: toBool(d.inv_sole_business_address, true),
            yourBusinessAbn: toBool(d.inv_sole_business_abn, true),
            itemDescriptions: toBool(d.inv_display_desc, true),
            quantityType: toBool(d.show_quantity_type, true),
            gst: toBool(d.show_gst, true),
            autoPaidReceipt: toBool(d.send_paid_invoice_receipt),
          }
        : undefined,
    invoiceNotes:
      d.invoice_note != null && d.invoice_note !== "null"
        ? d.invoice_note
        : undefined,

    quoteFields:
      d.quo_customer_name !== undefined
        ? {
            customerName: toBool(d.quo_customer_name, true),
            customerBusinessName: toBool(d.quo_customer_business_name, true),
            customerAddress: toBool(d.quo_customer_address, true),
            customerAbn: toBool(d.quo_customer_abn),
            yourName: toBool(d.quo_sole_user_name, true),
            yourBusinessName: toBool(d.quo_sole_business_name, true),
            yourBusinessAddress: toBool(d.quo_sole_business_address, true),
            yourBusinessAbn: toBool(d.quo_sole_business_abn, true),
            // No server field for either of these on a quote.
            itemDescriptions: true,
            quantityType: toBool(d.quo_show_quantity_type, true),
            gst: toBool(d.quo_show_gst, true),
            autoPaidReceipt: false,
          }
        : undefined,
    quoteNotes:
      d.quote_note != null && d.quote_note !== "null"
        ? d.quote_note
        : undefined,
    quoteAcceptanceAction: quoteAcceptanceActionFromApi(
      d.quote_accept_invoice_action,
    ),

    invoiceStyle:
      d.invoice_template != null ? String(d.invoice_template) : undefined,
    quoteStyle: d.quote_template != null ? String(d.quote_template) : undefined,
    ndisInvoiceStyle:
      d.ndis_template != null ? String(d.ndis_template) : undefined,
    ndisQuoteStyle:
      d.ndis_quote_template != null ? String(d.ndis_quote_template) : undefined,
  });
}

/** Always the full record — see the module note on why this isn't a partial. */
export async function saveBrandingApi(values: SalesSettings): Promise<void> {
  const linkFields = Object.fromEntries(
    FOOTER_LINKS.flatMap((link) => {
      const entry = values.footerLinks[link.key];
      const field = FOOTER_LINK_API_FIELD[link.key];
      return [
        [`${field}_enabled`, entry.enabled ? 1 : 0],
        // Matches Branding.js: only sent while the row is switched on.
        ...(entry.enabled ? [[field, entry.value]] : []),
      ];
    }),
  );

  const fields: Record<string, unknown> = {
    brand_color: values.brandColor,
    content_color: values.contentColor,

    inv_customer_name: values.invoiceFields.customerName ? 1 : 0,
    inv_customer_business_name: values.invoiceFields.customerBusinessName
      ? 1
      : 0,
    inv_customer_address: values.invoiceFields.customerAddress ? 1 : 0,
    inv_customer_abn: values.invoiceFields.customerAbn ? 1 : 0,
    inv_sole_user_name: values.invoiceFields.yourName ? 1 : 0,
    inv_sole_business_name: values.invoiceFields.yourBusinessName ? 1 : 0,
    inv_sole_business_address: values.invoiceFields.yourBusinessAddress
      ? 1
      : 0,
    inv_sole_business_abn: values.invoiceFields.yourBusinessAbn ? 1 : 0,
    inv_display_desc: values.invoiceFields.itemDescriptions ? 1 : 0,
    show_quantity_type: values.invoiceFields.quantityType ? 1 : 0,
    show_gst: values.invoiceFields.gst ? 1 : 0,
    send_paid_invoice_receipt: values.invoiceFields.autoPaidReceipt ? 1 : 0,

    quo_customer_name: values.quoteFields.customerName ? 1 : 0,
    quo_customer_business_name: values.quoteFields.customerBusinessName
      ? 1
      : 0,
    quo_customer_address: values.quoteFields.customerAddress ? 1 : 0,
    quo_customer_abn: values.quoteFields.customerAbn ? 1 : 0,
    quo_sole_user_name: values.quoteFields.yourName ? 1 : 0,
    quo_sole_business_name: values.quoteFields.yourBusinessName ? 1 : 0,
    quo_sole_business_address: values.quoteFields.yourBusinessAddress ? 1 : 0,
    quo_sole_business_abn: values.quoteFields.yourBusinessAbn ? 1 : 0,
    quo_show_quantity_type: values.quoteFields.quantityType ? 1 : 0,
    quo_show_gst: values.quoteFields.gst ? 1 : 0,

    ...linkFields,
    phone_enabled: values.footerPhone.enabled ? 1 : 0,
    ...(values.footerPhone.enabled
      ? {
          phone: `${values.footerPhone.countryCode}${digitsOnly(values.footerPhone.value)}`,
        }
      : {}),

    invoice_template: values.invoiceStyle || 1,
    quote_template: values.quoteStyle || 13,
    ndis_template: values.ndisInvoiceStyle || 7,
    ndis_quote_template: values.ndisQuoteStyle || 25,

    invoice_note: values.invoiceNotes,
    quote_note: values.quoteNotes,
    quote_accept_invoice_action: quoteAcceptanceActionToApi(
      values.quoteAcceptanceAction,
    ),
  };

  const body = buildEncryptedRequestBody(fields);
  await unwrap(
    api.post<ApiResult<unknown>>(apiRoutes.settings.saveBranding, body),
    "Couldn't save sales settings.",
  );
}

/* ------------------------------------------------------------------ *
 * Logo — the account's profile picture, not part of save-branding.
 * Uploaded/removed the moment Save Changes is pressed on the Branding tab.
 * ------------------------------------------------------------------ */

type ApiUserProfile = { profile_pic?: string | null };

async function fetchLogo(): Promise<Partial<SalesSettings>> {
  // sole-webapp's `getUserProfile` (hooks/useService.js) always POSTs this
  // endpoint, encrypted body and all, despite the name — not a GET.
  const body = buildEncryptedRequestBody({});
  const response = await api.post<
    ApiResult<{ user?: ApiUserProfile } & ApiUserProfile>
  >(apiRoutes.user.getUserProfile, body);
  const d = response.data?.data;
  const profilePic = d?.user?.profile_pic ?? d?.profile_pic;
  return definedOnly({ logo: profilePic || null });
}

/** Turns a `data:` URL (a logo just picked/cropped, not yet uploaded) into a File. */
function dataUrlToFile(dataUrl: string, filename = "logo.jpg"): File {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = /data:(.*);base64/.exec(header ?? "");
  const mime = mimeMatch?.[1] || "image/jpeg";
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

/** Uploads a newly picked/cropped logo, returning the URL the server now serves it from. */
export async function uploadLogoApi(dataUrl: string): Promise<string> {
  const form = new FormData();
  form.append("profile_pic", dataUrlToFile(dataUrl));
  const data = await unwrap(
    api.post<ApiResult<{ user?: ApiUserProfile }>>(
      apiRoutes.user.updateUserProfile,
      form,
    ),
    "Couldn't upload that logo.",
  );
  const url = data?.user?.profile_pic;
  if (!url) throw new Error("The logo uploaded but the server returned no URL.");
  return url;
}

export async function removeLogoApi(): Promise<void> {
  const body = buildEncryptedRequestBody({});
  await unwrap(
    api.post<ApiResult<unknown>>(apiRoutes.user.removeProfilePicture, body),
    "Couldn't remove the logo.",
  );
}

/* ------------------------------------------------------------------ *
 * Tab 8 — Communication preferences
 * ------------------------------------------------------------------ */

type ApiNotificationSetting = { module?: string; is_email?: unknown };
type ApiReminderSetting = {
  inv_before?: unknown;
  inv_before_days?: number | string;
  inv_after?: unknown;
  inv_after_days?: number | string;
  quo_before?: unknown;
  quo_before_days?: number | string;
};
type ApiCommunicationPreferences = {
  notification_setting_details?: ApiNotificationSetting[];
  reminder_setting?: ApiReminderSetting;
};

async function fetchCommunicationPreferences(): Promise<Partial<SalesSettings>> {
  const response = await api.get<ApiResult<ApiCommunicationPreferences>>(
    apiRoutes.communicationPreference.get,
  );
  const d = response.data?.data;
  if (!d) return {};

  const modules = d.notification_setting_details ?? [];
  const invoiceModule = modules.find((entry) => entry.module === "invoice");
  const quoteModule = modules.find((entry) => entry.module === "quote");
  const reminder = d.reminder_setting ?? {};

  return definedOnly({
    bccInvoiceEmails: invoiceModule ? toBool(invoiceModule.is_email) : undefined,
    bccQuoteEmails: quoteModule ? toBool(quoteModule.is_email) : undefined,
    remindInvoiceDue: toBool(reminder.inv_before),
    remindInvoiceOverdue: toBool(reminder.inv_after),
    remindQuoteExpiry: toBool(reminder.quo_before),
  });
}

async function fetchTextMessageStatus(): Promise<Partial<SalesSettings>> {
  const body = buildEncryptedRequestBody({});
  const response = await api.post<ApiResult<{ is_text_message?: unknown }>>(
    apiRoutes.settings.getTextMessageStatus,
    body,
  );
  const status = response.data?.data?.is_text_message;
  return status === undefined ? {} : { textMessagesEnabled: toBool(status) };
}

/**
 * Whether the Monday weekly summary email is on. It lives in the same
 * `notification_setting` table as the invoice and quote switches, under the
 * module `weekly_summary`; no row means off.
 */
export async function fetchWeeklySummaryEnabled(): Promise<boolean> {
  const response = await api.get<ApiResult<ApiCommunicationPreferences>>(
    apiRoutes.communicationPreference.get,
  );
  const modules = response.data?.data?.notification_setting_details ?? [];
  const entry = modules.find((item) => item.module === "weekly_summary");
  return entry ? toBool(entry.is_email) : false;
}

export async function saveNotificationPreferenceApi(
  module: "invoice" | "quote" | "weekly_summary",
  enabled: boolean,
): Promise<void> {
  const body = buildEncryptedRequestBody({
    module,
    is_email: enabled ? 1 : 0,
    is_push_notification: enabled ? 1 : 0,
  });
  await unwrap(
    api.post<ApiResult<unknown>>(apiRoutes.communicationPreference.addNotification, body),
    "Couldn't save that notification preference.",
  );
}

/**
 * A reminder's day-count has no field in this UI (see the module note), so a
 * fixed default is sent — the same "the day before/after" the tab's own copy
 * already promises.
 */
const REMINDER_DEFAULT_DAYS = 1;

export async function saveReminderPreferenceApi(
  type: "inv_before" | "inv_after" | "quo_before",
  enabled: boolean,
): Promise<void> {
  const body = buildEncryptedRequestBody(
    enabled
      ? { type, status: "on", days: REMINDER_DEFAULT_DAYS }
      : { type, status: "off" },
  );
  await unwrap(
    api.post<ApiResult<unknown>>(apiRoutes.communicationPreference.addComPreference, body),
    "Couldn't save that reminder.",
  );
}

export async function enableTextMessageApi(enabled: boolean): Promise<void> {
  const body = buildEncryptedRequestBody({ isToggled: enabled ? 1 : 0 });
  await unwrap(
    api.post<ApiResult<unknown>>(apiRoutes.settings.enableTextMessage, body),
    "Couldn't update text message settings.",
  );
}

/* ------------------------------------------------------------------ *
 * The combined fetch — hydrates the store once on load.
 * ------------------------------------------------------------------ */

export async function fetchSalesSettings(): Promise<Partial<SalesSettings>> {
  // Each piece is as independent here as it is in sole-webapp, where it's a
  // separate component with its own try/catch — one endpoint failing (e.g.
  // communication preferences) shouldn't blank out the tabs that loaded fine.
  const results = await Promise.allSettled([
    fetchSeqNumbers(),
    fetchBranding(),
    fetchLogo(),
    fetchCommunicationPreferences(),
    fetchTextMessageStatus(),
  ]);
  return results.reduce<Partial<SalesSettings>>((merged, result) => {
    if (result.status === "fulfilled") return { ...merged, ...result.value };
    console.error("Failed to load part of sales settings:", result.reason);
    return merged;
  }, {});
}
