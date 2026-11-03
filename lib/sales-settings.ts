/**
 * Sales settings: everything the eight-tab screen owns.
 *
 * Document numbering moved here out of `documents` on the settings store rather
 * than being copied — the editors read it from one place, and Sales settings is
 * where it's edited. What stays in `documents` is the non-sales half: payment
 * terms, quote expiry, GST treatment and the income account.
 *
 * The whole shape is defined up front, including the tabs not yet built, so
 * adding them is UI work rather than another store migration.
 */
import { digitsOnly } from "@/lib/contacts";

/* ------------------------------------------------------------------ *
 * Tab 1 — Settings
 * ------------------------------------------------------------------ */

/** Prefix plus the next number, for one document type. */
export type DocumentNumbering = { prefix: string; next: string };

/* ------------------------------------------------------------------ *
 * Tab 3 — Footer & Social
 * ------------------------------------------------------------------ */

/** A footer row: off until enabled, and the field only shows when it is. */
export type FooterEntry = { enabled: boolean; value: string };

export const FOOTER_LINKS = [
  { key: "website", label: "Website", placeholder: "https://example.com.au" },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/yourbusiness" },
  { key: "instagram", label: "Instagram", placeholder: "@yourbusiness" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/company/…" },
  { key: "tiktok", label: "TikTok", placeholder: "@yourbusiness" },
] as const;
export type FooterLinkKey = (typeof FOOTER_LINKS)[number]["key"];

/** Phone carries a country code, so it isn't a plain FooterEntry. */
export type FooterPhone = FooterEntry & { countryCode: string };

export const COUNTRY_CODES = ["+61", "+64", "+44", "+1", "+65"] as const;

/* ------------------------------------------------------------------ *
 * Tabs 4 and 5 — what prints on a document
 * ------------------------------------------------------------------ */

/**
 * The toggle list, in the order it renders. Grouped so the UI can print the
 * heading without a second list to keep in sync.
 */
export const DOCUMENT_FIELDS = [
  { key: "customerName", label: "Customer name", group: "Business & Customer Information" },
  { key: "customerBusinessName", label: "Customer business name", group: "Business & Customer Information" },
  { key: "customerAddress", label: "Customer address", group: "Business & Customer Information" },
  { key: "customerAbn", label: "Customer ABN", group: "Business & Customer Information" },
  { key: "yourName", label: "Your name", group: "Business & Customer Information" },
  { key: "yourBusinessName", label: "Your business name", group: "Business & Customer Information" },
  { key: "yourBusinessAddress", label: "Your business address", group: "Business & Customer Information" },
  { key: "yourBusinessAbn", label: "Your business ABN", group: "Business & Customer Information" },
  { key: "itemDescriptions", label: "Item descriptions", group: "Business & Customer Information" },
  { key: "quantityType", label: "Quantity type", group: "Business & Customer Information" },
  { key: "gst", label: "GST", group: "Business & Customer Information" },
  { key: "autoPaidReceipt", label: "Auto paid receipt", group: "Business & Customer Information" },
] as const;
export type DocumentFieldKey = (typeof DOCUMENT_FIELDS)[number]["key"];
export type DocumentFields = Record<DocumentFieldKey, boolean>;

/**
 * The same toggles, named the way this business's country names them.
 *
 * Three of these labels are Australian: an ABN is what Australia calls a
 * business number, and GST is what it calls its sales tax. A New Zealand
 * business has an NZBN and a South African one a VAT number, so the toggle
 * that hides it should say so — otherwise the setting reads as being about
 * something the business doesn't have.
 *
 * The keys and groups don't move: they're what's saved, and a label is not.
 */
export function documentFieldsFor(labels: {
  businessId: string;
  tax: string;
}): { key: DocumentFieldKey; label: string; group: string }[] {
  const overrides: Partial<Record<DocumentFieldKey, string>> = {
    customerAbn: `Customer ${labels.businessId}`,
    yourBusinessAbn: `Your business ${labels.businessId}`,
    gst: labels.tax,
  };
  return DOCUMENT_FIELDS.map((field) => ({
    key: field.key,
    label: overrides[field.key] ?? field.label,
    group: field.group,
  }));
}

export const QUOTE_ACCEPTANCE_ACTIONS = [
  "Create invoice as draft",
  "Create and send invoice",
  "Do nothing",
] as const;
export type QuoteAcceptanceAction = (typeof QUOTE_ACCEPTANCE_ACTIONS)[number];

/* ------------------------------------------------------------------ *
 * Tabs 6 and 7 — styling
 * ------------------------------------------------------------------ */

export type StyleGroup = { label: string; ids: string[] };

/* ------------------------------------------------------------------ *
 * The whole shape
 * ------------------------------------------------------------------ */

export type SalesSettings = {
  /* Tab 1 */
  invoicePrefix: string;
  nextInvoiceNumber: string;
  quotePrefix: string;
  nextQuoteNumber: string;
  /**
   * Credit notes are numbered the same way. Not edited from this screen — no
   * server field backs it — but `refundNumbering` still reads it to seed a new
   * credit note's reference.
   */
  refundPrefix: string;
  nextRefundNumber: string;

  /* Tab 2 */
  logo: string | null;
  brandColor: string;
  contentColor: string;

  /* Tab 3 */
  footerPhone: FooterPhone;
  footerLinks: Record<FooterLinkKey, FooterEntry>;

  /* Tab 4 */
  invoiceFields: DocumentFields;
  invoiceNotes: string;

  /* Tab 5 */
  quoteFields: DocumentFields;
  quoteNotes: string;
  quoteAcceptanceAction: QuoteAcceptanceAction;

  /* Tabs 6 and 7 */
  /** General/Classic selection — the backend keeps these two in one field. */
  invoiceStyle: string;
  quoteStyle: string;
  /** NDIS selection — a separate slot server-side, only offered to NDIS businesses. */
  ndisInvoiceStyle: string;
  ndisQuoteStyle: string;

  /* Tab 8 */
  textMessagesEnabled: boolean;
  bccInvoiceEmails: boolean;
  bccQuoteEmails: boolean;
  remindInvoiceDue: boolean;
  remindInvoiceOverdue: boolean;
  remindQuoteExpiry: boolean;
};

export function invoiceNumbering(s: SalesSettings): DocumentNumbering {
  return { prefix: s.invoicePrefix, next: s.nextInvoiceNumber };
}
export function quoteNumbering(s: SalesSettings): DocumentNumbering {
  return { prefix: s.quotePrefix, next: s.nextQuoteNumber };
}
export function refundNumbering(s: SalesSettings): DocumentNumbering {
  return { prefix: s.refundPrefix, next: s.nextRefundNumber };
}

/**
 * The number the server will actually issue from these settings: prefix and
 * number joined as typed — the prefix carries its own separator, so `Quotes-`
 * + `6` is `Quotes-6` and `INV` + `28` is `INV28` — with the number kept at
 * the width it was typed (`007` stays `007`). Mirrors sole-ocr's invoice and
 * quote generation, which skips forward past any number already used.
 */
export function documentNumberPreview(prefix: string, next: string): string {
  const raw = next.trim();
  const value = Math.max(Number.parseInt(raw, 10) || 1, 1);
  return `${prefix.trim()}${String(value).padStart(raw.length, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Validation — live, never blocking keystrokes
 * ------------------------------------------------------------------ */

export function prefixError(value: string): string | undefined {
  if (!value.trim()) return "Enter a prefix.";
  return /^[A-Za-z0-9-]{1,8}$/.test(value.trim())
    ? undefined
    : "Letters, numbers and hyphens only, up to 8 characters.";
}

export function nextNumberError(value: string): string | undefined {
  if (!value.trim()) return "Enter a starting number.";
  return /^\d+$/.test(value.trim())
    ? undefined
    : "Enter a whole number (0 or more).";
}

/** #RGB or #RRGGBB, with or without the hash while typing. */
export function hexColorError(value: string): string | undefined {
  if (!value.trim()) return "Enter a colour.";
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value.trim())
    ? undefined
    : "Enter a hex colour, e.g. #4D4DFE.";
}

/** Normalised for the swatch — a bare or 3-digit hex still previews. */
export function normaliseHex(value: string): string {
  const raw = value.trim().replace(/^#/, "");
  if (!/^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(raw)) return "#000000";
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${full.toUpperCase()}`;
}

export function phoneError(entry: FooterPhone): string | undefined {
  if (!entry.enabled) return undefined;
  if (!entry.value.trim()) return "Enter a phone number.";
  const digits = digitsOnly(entry.value);
  return digits.length >= 6 && digits.length <= 12
    ? undefined
    : "Enter a valid phone number.";
}

/** A link row that's switched on has to say something. */
export function linkError(entry: FooterEntry): string | undefined {
  if (!entry.enabled) return undefined;
  return entry.value.trim() ? undefined : "Enter a value, or switch this off.";
}

export type SalesIssue = { key: string; message: string };

/** Tab 1's issues, in on-screen order. */
export function settingsTabIssues(s: SalesSettings): SalesIssue[] {
  const issues: SalesIssue[] = [];
  const add = (key: string, message?: string) => {
    if (message) issues.push({ key, message });
  };
  add("invoicePrefix", prefixError(s.invoicePrefix));
  add("nextInvoiceNumber", nextNumberError(s.nextInvoiceNumber));
  add("quotePrefix", prefixError(s.quotePrefix));
  add("nextQuoteNumber", nextNumberError(s.nextQuoteNumber));
  return issues;
}

/** Tab 2's issues. */
export function brandingTabIssues(s: SalesSettings): SalesIssue[] {
  const issues: SalesIssue[] = [];
  const brand = hexColorError(s.brandColor);
  if (brand) issues.push({ key: "brandColor", message: brand });
  const content = hexColorError(s.contentColor);
  if (content) issues.push({ key: "contentColor", message: content });
  return issues;
}

/** Tab 3's issues — only rows that are switched on can fail. */
export function footerTabIssues(s: SalesSettings): SalesIssue[] {
  const issues: SalesIssue[] = [];
  const phone = phoneError(s.footerPhone);
  if (phone) issues.push({ key: "footerPhone", message: phone });
  for (const link of FOOTER_LINKS) {
    const message = linkError(s.footerLinks[link.key]);
    if (message) issues.push({ key: `footer-${link.key}`, message });
  }
  return issues;
}

/* ------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------ */

function allOn(): DocumentFields {
  return Object.fromEntries(
    DOCUMENT_FIELDS.map((field) => [field.key, true]),
  ) as DocumentFields;
}

/** Everything prints by default except the two opt-ins. */
function defaultInvoiceFields(): DocumentFields {
  return { ...allOn(), customerAbn: false, autoPaidReceipt: false };
}

function defaultQuoteFields(): DocumentFields {
  return {
    ...allOn(),
    customerAbn: false,
    // A quote isn't paid, so a paid receipt makes no sense on one.
    autoPaidReceipt: false,
  };
}

export const DEFAULT_SALES_SETTINGS: SalesSettings = {
  invoicePrefix: "INV",
  nextInvoiceNumber: "25",
  quotePrefix: "QUO",
  nextQuoteNumber: "45410",
  refundPrefix: "CRN",
  nextRefundNumber: "5",

  logo: null,
  brandColor: "#4D4DFE",
  contentColor: "#0F1117",

  footerPhone: { enabled: true, countryCode: "+61", value: "234 808 2823" },
  footerLinks: {
    website: { enabled: true, value: "https://sole.com.au" },
    facebook: { enabled: false, value: "" },
    instagram: { enabled: false, value: "" },
    linkedin: { enabled: false, value: "" },
    tiktok: { enabled: false, value: "" },
  },

  invoiceFields: defaultInvoiceFields(),
  invoiceNotes:
    "Payment due within the terms above. Please include the invoice number as your payment reference.",

  quoteFields: defaultQuoteFields(),
  quoteNotes:
    "This quote is valid for the period above. Accepting it authorises the work described.",
  quoteAcceptanceAction: "Create invoice as draft",

  invoiceStyle: "general-01",
  quoteStyle: "quote-general-01",
  ndisInvoiceStyle: "ndis-01",
  ndisQuoteStyle: "quote-ndis-01",

  textMessagesEnabled: false,
  bccInvoiceEmails: true,
  bccQuoteEmails: false,
  remindInvoiceDue: true,
  remindInvoiceOverdue: true,
  remindQuoteExpiry: true,
};

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

export const SALES_TABS = [
  { id: "settings", label: "Settings" },
  { id: "branding", label: "Logo & Colors" },
  { id: "footer", label: "Footer & Social" },
  { id: "invoice-fields", label: "Invoice Customisation" },
  { id: "quote-fields", label: "Quote Customisation" },
  { id: "invoice-styling", label: "Invoice Styling" },
  { id: "quote-styling", label: "Quote Styling" },
  { id: "communication", label: "Communication Preferences" },
] as const;
export type SalesTab = (typeof SALES_TABS)[number]["id"];

export function isSalesTab(value: string): value is SalesTab {
  return SALES_TABS.some((tab) => tab.id === value);
}

/** Which keys each tab owns — drives per-tab save and the dirty check. */
export const TAB_KEYS: Record<SalesTab, readonly (keyof SalesSettings)[]> = {
  settings: [
    "invoicePrefix",
    "nextInvoiceNumber",
    "quotePrefix",
    "nextQuoteNumber",
  ],
  branding: ["logo", "brandColor", "contentColor"],
  footer: ["footerPhone", "footerLinks"],
  "invoice-fields": ["invoiceFields", "invoiceNotes"],
  "quote-fields": ["quoteFields", "quoteNotes", "quoteAcceptanceAction"],
  "invoice-styling": ["invoiceStyle", "ndisInvoiceStyle"],
  "quote-styling": ["quoteStyle", "ndisQuoteStyle"],
  communication: [
    "textMessagesEnabled",
    "bccInvoiceEmails",
    "bccQuoteEmails",
    "remindInvoiceDue",
    "remindInvoiceOverdue",
    "remindQuoteExpiry",
  ],
};

/** This tab's values, for a save that can't carry a sibling's edits. */
export function tabSlice(
  tab: SalesTab,
  values: SalesSettings,
): Partial<SalesSettings> {
  return Object.fromEntries(
    TAB_KEYS[tab].map((key) => [key, values[key]]),
  ) as Partial<SalesSettings>;
}

/** Just this tab's keys back to their defaults. */
export function tabDefaults(tab: SalesTab): Partial<SalesSettings> {
  return tabSlice(tab, DEFAULT_SALES_SETTINGS);
}

/** Whether a tab differs from what's saved. */
export function tabDirty(
  tab: SalesTab,
  values: SalesSettings,
  stored: SalesSettings,
): boolean {
  return TAB_KEYS[tab].some(
    (key) => JSON.stringify(values[key]) !== JSON.stringify(stored[key]),
  );
}

export const SALES_SETTINGS_VERSION = 1;

/** Fills in whatever a stored copy is missing, keeping what it has. */
export function migrateSalesSettings(stored: unknown): SalesSettings {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SALES_SETTINGS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SALES_SETTINGS)) {
    if (raw[key] !== undefined && raw[key] !== null) out[key] = raw[key];
  }
  // Nested records need the same treatment, or a new field arrives undefined.
  const settings = out as unknown as SalesSettings;
  settings.invoiceFields = { ...defaultInvoiceFields(), ...settings.invoiceFields };
  settings.quoteFields = { ...defaultQuoteFields(), ...settings.quoteFields };
  settings.footerPhone = {
    ...DEFAULT_SALES_SETTINGS.footerPhone,
    ...settings.footerPhone,
  };
  settings.footerLinks = {
    ...DEFAULT_SALES_SETTINGS.footerLinks,
    ...settings.footerLinks,
  };
  return settings;
}
