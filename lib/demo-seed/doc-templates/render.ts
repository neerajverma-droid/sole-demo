/* eslint-disable @typescript-eslint/no-explicit-any -- maps loosely typed seed rows onto the backend template data shapes */
/**
 * Renders the REAL Sole invoice and quote layouts (ported verbatim from sole-ocr,
 * see ./invoice and ./quote) to an HTML string, in the browser, from the demo's books.
 *
 * It does the same steps as the server's preview route and nothing more:
 *   template data -> template function -> applyBrandingToHtml -> wrapWithDocumentStructure
 *
 * Pure and synchronous: no clock, no randomness, no I/O. The caller hands in the story,
 * the country config and the seed, so the same books always give the same page.
 */

import type { DemoCountryConfig } from "../country";
import type { SeedData } from "../generator";
import { brandFor, businessLogo } from "../logo";
import type { Story } from "../story";
import { applyBrandingToHtml, wrapWithDocumentStructure } from "./branding";

import invoiceClassic1 from "./invoice/classic-template-1";
import invoiceClassic2 from "./invoice/classic-template-2";
import invoiceClassic3 from "./invoice/classic-template-3";
import invoiceClassic4 from "./invoice/classic-template-4";
import invoiceNdis1 from "./invoice/ndis-1";
import invoiceNdis2 from "./invoice/ndis-2";
import invoiceNdis3 from "./invoice/ndis-3";
import invoiceNdis4 from "./invoice/ndis-4";
import quoteClassic1 from "./quote/classic-template-1";
import quoteClassic2 from "./quote/classic-template-2";
import quoteClassic3 from "./quote/classic-template-3";
import quoteClassic4 from "./quote/classic-template-4";
import quoteNdis1 from "./quote/ndis-1";
import quoteNdis2 from "./quote/ndis-2";
import quoteNdis3 from "./quote/ndis-3";
import quoteNdis4 from "./quote/ndis-4";

export type DocKind = "invoice" | "quote";
type TemplateFn = (
  data: any,
  branding: any,
  payLink?: string,
  isReceipt?: boolean,
  showPayment?: boolean,
  showBanner?: boolean,
  hasPaid?: boolean,
) => string;

const TEMPLATES: Record<DocKind, Record<string, TemplateFn>> = {
  invoice: {
    "classic-template-1": invoiceClassic1,
    "classic-template-2": invoiceClassic2,
    "classic-template-3": invoiceClassic3,
    "classic-template-4": invoiceClassic4,
    "ndis-1": invoiceNdis1,
    "ndis-2": invoiceNdis2,
    "ndis-3": invoiceNdis3,
    "ndis-4": invoiceNdis4,
  },
  quote: {
    "classic-template-1": quoteClassic1,
    "classic-template-2": quoteClassic2,
    "classic-template-3": quoteClassic3,
    "classic-template-4": quoteClassic4,
    "ndis-1": quoteNdis1,
    "ndis-2": quoteNdis2,
    "ndis-3": quoteNdis3,
    "ndis-4": quoteNdis4,
  },
};

/* ---------------------------------------------------------------------- *
 * Template ids
 * ---------------------------------------------------------------------- */

/** The `templates` table ids the Sales settings Styling tab offers (see sole-ocr utils/layoutId.js). */
export const TEMPLATE_IDS = {
  invoice: { classic: [17, 18, 19, 20], ndis: [2, 8, 9, 10], fallback: 1 },
  quote: { classic: [21, 22, 23, 24], ndis: [25, 26, 27, 28], fallback: 11 },
} as const;

/** True when the visitor's business is an NDIS provider in a country that offers NDIS. */
export function isNdisCapable(story: Story, cfg: DemoCountryConfig): boolean {
  return Number(story.business.industry_id) === 9 && cfg.features?.ndis === true;
}

/**
 * Which ported layout an id renders on. A classic id from the Styling tab is honoured as it is,
 * and so is an NDIS id for an NDIS business. Any other id (the general layouts, which are not ported) lands on
 * ((id - 1) mod 4) + 1 over the classic layouts, or the NDIS ones for an NDIS business.
 */
export function resolveTemplateFile(
  kind: DocKind,
  rawId: unknown,
  ndisCapable: boolean,
): string {
  const ids = TEMPLATE_IDS[kind];
  const parsed = Number(String(rawId ?? "").trim());
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : ids.fallback;

  const classicAt = (ids.classic as readonly number[]).indexOf(id);
  if (classicAt >= 0) return `classic-template-${classicAt + 1}`;
  // An NDIS id only means an NDIS layout to an NDIS business; to anyone else it is just a number
  // from the general range (invoice id 2 is the app's own "template 2"), so it falls through.
  const ndisAt = (ids.ndis as readonly number[]).indexOf(id);
  if (ndisCapable && ndisAt >= 0) return `ndis-${ndisAt + 1}`;

  const slot = ((id - 1) % 4) + 1;
  return ndisCapable ? `ndis-${slot}` : `classic-template-${slot}`;
}

/* ---------------------------------------------------------------------- *
 * Branding. Same colours as the demo's GET /v2/settings/get-branding.
 * ---------------------------------------------------------------------- */

export function demoBranding(story: Story) {
  const biz = story.business;
  return {
    brand_color: brandFor(story).primary,
    content_color: "#0f172a",
    phone_enabled: 1,
    phone: biz.phone,
    website_enabled: 1,
    website: biz.website,
  };
}

/* ---------------------------------------------------------------------- *
 * Small helpers
 * ---------------------------------------------------------------------- */

const num = (value: unknown, fallback = 0): number => {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const text = (value: unknown, fallback = ""): string =>
  value === undefined || value === null ? fallback : String(value);
const truthy = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

const escapeText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Address parts joined the way the server's formatAddress does: blanks dropped, consecutive repeats dropped. */
function formatAddress(parts: unknown[]): string {
  const cleaned = parts.map((p) => text(p).trim()).filter(Boolean);
  const unique: string[] = [];
  cleaned.forEach((part, index) => {
    if (index === 0 || cleaned[index - 1].toLowerCase() !== part.toLowerCase()) {
      unique.push(part);
    }
  });
  return unique.join(", ");
}

/** Phones as the demo's own screens show them (national format); the real invoice's plain-digit AU style is not copied. */
function printedPhone(value: unknown): string {
  return text(value).trim();
}

/* ---------------------------------------------------------------------- *
 * Country wording (documentLabels.js + documentRenderData.js, as far as the demo needs)
 * ---------------------------------------------------------------------- */

function countryLabels(cfg: DemoCountryConfig, story: Story, total: number, hasTax: boolean) {
  const labels: Record<string, string | null> = {
    tax: "GST",
    tax_invoice: "Tax Invoice",
    tax_quote: "Tax Quote",
    business_id: "ABN",
    tax_id: "ABN",
    bank_branch: "BSB",
    tax_free: "GST free",
    tax_inclusive: "Inc GST",
    tax_exclusive: "Ex GST",
    tax_return: "BAS",
    ...cfg.labels,
  };
  const registered = story.business.tax_registered !== 0;
  const taxInvoiceTitle = String(registered ? labels.tax_invoice : "Invoice").toUpperCase();
  const taxQuoteTitle = String(registered ? labels.tax_quote : "Quote").toUpperCase();
  const charged = hasTax && registered;
  return {
    iso2: cfg.iso2,
    currency: cfg.currency,
    currency_symbol: cfg.currencySymbol,
    locale: cfg.locale,
    tax_label: labels.tax,
    tax_invoice_title: taxInvoiceTitle,
    tax_quote_title: taxQuoteTitle,
    document_title: charged ? taxInvoiceTitle : "INVOICE",
    quote_title: charged ? taxQuoteTitle : "QUOTE",
    is_tax_invoice: registered,
    tax_invoice_required: true,
    tax_invoice_kind: "full",
    buyer_details_required: total >= 1000,
    business_id_label: labels.business_id,
    tax_id_label: labels.tax_id,
    customer_id_label: labels.customer_id || labels.business_id,
    bank_branch_label: labels.bank_branch,
    tax_free_label: labels.tax_free,
    tax_inclusive_label: labels.tax_inclusive,
    tax_exclusive_label: labels.tax_exclusive,
    tax_return_label: labels.tax_return,
    tax_authority: cfg.taxAuthority,
    tax_included_note: `Total includes ${labels.tax}`,
  };
}

/** The business's own numbers, labelled the way its country labels them (ABN; NZBN and GST number). */
function providerIdentifiers(cfg: DemoCountryConfig, story: Story) {
  const biz = story.business;
  const list: { key: string; label: string; value: string }[] = [];
  const primary = text(biz.abn || cfg.businessId).trim();
  if (primary) list.push({ key: "business_registration_number", label: cfg.businessIdLabel, value: primary });
  const taxId = text(biz.tax_id || cfg.taxId).trim();
  // AU's tax number is its ABN; printing it twice says nothing.
  if (taxId && taxId !== primary && cfg.taxIdLabel !== cfg.businessIdLabel) {
    list.push({ key: "tax_registration_number", label: cfg.taxIdLabel, value: taxId });
  }
  return list;
}

/* ---------------------------------------------------------------------- *
 * Lines
 * ---------------------------------------------------------------------- */

interface Line {
  description: string;
  qty: number;
  qty_type: string;
  unit_price: number;
  /** Line net, after the line discount, before tax. */
  total: number;
  gst_amount: number;
  gst_percentage: number;
  gst: boolean;
  discount: number;
  discountAmount: number;
  criteria: "percent" | "currency";
  item_support_no: string;
  claim_type: string;
  date: string | null;
}

function normaliseLines(raw: any[], rate: number): Line[] {
  return (Array.isArray(raw) ? raw : []).map((item) => {
    const qty = num(item?.qty ?? item?.quantity, 1);
    const price = num(item?.price ?? item?.unit_price);
    const criteriaRaw = text(item?.disc_criteria ?? item?.discount_criteria).toLowerCase();
    const criteria: "percent" | "currency" =
      criteriaRaw === "currency" || criteriaRaw === "amount" ? "currency" : "percent";
    const discount = Math.max(0, num(item?.discount ?? item?.disc ?? item?.discount_percentage));
    const gross = qty * price;
    const discountAmount =
      criteria === "percent" ? round2((gross * discount) / 100) : round2(Math.min(discount, gross));
    const net = round2(gross - discountAmount);
    const pct = num(item?.gst_percentage, 0);
    const gst =
      truthy(item?.gst) || truthy(item?.isGstEnabled) || pct > 0 || num(item?.gst_amount) > 0;
    const gstPct = gst ? (pct > 0 ? pct : rate) : 0;
    const gstAmount =
      item?.gst_amount !== undefined && item?.gst_amount !== null && gst
        ? num(item.gst_amount)
        : gst
          ? round2((net * gstPct) / 100)
          : 0;
    return {
      description: text(item?.description),
      qty,
      qty_type: text(item?.qty_type, "items") || "items",
      unit_price: price,
      total: net,
      gst_amount: gstAmount,
      gst_percentage: gstPct,
      gst,
      discount,
      discountAmount,
      criteria,
      item_support_no: text(item?.item_support_no),
      claim_type: text(item?.claim_type),
      date: item?.date ? text(item.date) : null,
    };
  });
}

interface Totals {
  sub_total: number;
  total_discount: number;
  extra_discount: number;
  total_gst: number;
  total: number;
}

function totalsFor(lines: Line[], given: Record<string, any>): Totals {
  const subTotal = round2(lines.reduce((a, l) => a + l.total, 0));
  const gst = round2(lines.reduce((a, l) => a + l.gst_amount, 0));
  const extra = Math.max(0, num(given.extra_discount));
  const pick = (value: unknown, fallback: number) =>
    value === undefined || value === null || value === "" ? fallback : num(value, fallback);
  const sub = pick(given.sub_total, subTotal);
  const tax = pick(given.total_gst ?? given.tax_amount, gst);
  return {
    sub_total: sub,
    total_discount: pick(given.total_discount, round2(lines.reduce((a, l) => a + l.discountAmount, 0))),
    extra_discount: extra,
    total_gst: tax,
    total: pick(given.total, round2(sub + tax - extra)),
  };
}

/* ---------------------------------------------------------------------- *
 * Parties
 * ---------------------------------------------------------------------- */

function findParty(seed: SeedData, id: unknown, name?: unknown): any {
  const key = text(id);
  const all = [...(seed.clients as any[]), ...(seed.suppliers as any[])];
  if (key) {
    const byId = all.find((c) => text(c.id) === key);
    if (byId) return byId;
  }
  const wanted = text(name).trim().toLowerCase();
  return wanted ? all.find((c) => text(c.name).trim().toLowerCase() === wanted) : undefined;
}

function demoNdisNumber(seedText: string): string {
  let h = 7;
  for (let i = 0; i < seedText.length; i++) h = (h * 31 + seedText.charCodeAt(i)) % 10000000;
  return `43${String(h).padStart(7, "0")}`;
}

function buildProvider(story: Story, cfg: DemoCountryConfig, ndis: boolean, email?: string) {
  const biz = story.business;
  return {
    provider_name: biz.name,
    abn: text(biz.abn),
    address: formatAddress([biz.address?.line1, biz.address?.city, biz.address?.state, biz.address?.postcode, biz.address?.country]),
    email: email || biz.email,
    phone_no: printedPhone(biz.phone),
    country_code: cfg.phoneDialCode,
    user_name: [biz.owner?.first_name, biz.owner?.last_name].filter(Boolean).join(" "),
    company_name: biz.name,
    ndis_no: ndis ? demoNdisNumber(biz.name) : "",
    identifiers: providerIdentifiers(cfg, story),
  };
}

function buildParticipant(
  party: any,
  contact: any,
  fallbackName: string,
  cfg: DemoCountryConfig,
  ndis: boolean,
  labels: ReturnType<typeof countryLabels>,
) {
  const partyName = text(party?.name || fallbackName).trim();
  const contactName = text(contact?.name || party?.contact).trim();
  // The printed name is the contact; the client's own name rides under it so the document
  // always names the client the app lists it under.
  const participantName = contactName || partyName;
  const company = partyName && partyName.toLowerCase() !== participantName.toLowerCase() ? partyName : "";
  return {
    participant_name: participantName,
    name: participantName,
    company_name: company,
    address: formatAddress([
      party?.address_line1 ?? party?.street,
      party?.suburb,
      party?.city,
      party?.state,
      party?.postcode,
      party?.country,
    ]),
    email: text(contact?.email || party?.email),
    phone_no: printedPhone(contact?.phone_number ?? contact?.phone ?? party?.phone),
    abn: text(party?.abn ?? party?.ABN),
    ndis_no: ndis ? text(party?.ndis_no ?? party?.ndisNumber) || demoNdisNumber(partyName || participantName) : "",
    identifier_label: labels.customer_id_label,
  };
}

function buildPlanManager(party: any, ndis: boolean) {
  return {
    plan_manager_name: ndis ? text(party?.plan_manager_name) : "",
    plan_manager_ndis: ndis ? text(party?.plan_manager_ndis) : "",
  };
}

function paymentDueDescription(invoiceDate: string, dueDate: string): string {
  const parse = (value: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(invoiceDate);
  const b = parse(dueDate);
  if (a === null || b === null) return "Please make payment by the invoice due date.";
  const days = Math.max(0, Math.round((b - a) / 86400000));
  return `Please make payment within ${days} ${days === 1 ? "day" : "days"} of invoice date.`;
}

/* ---------------------------------------------------------------------- *
 * Template data
 * ---------------------------------------------------------------------- */

export interface RenderContext {
  story: Story;
  cfg: DemoCountryConfig;
  seed: SeedData;
  today: string;
}

export interface RenderOptions extends RenderContext {
  /** A saved invoice/quote row from the seed. */
  record?: any;
  /** The decoded runtime-preview body for a draft that has not been saved. */
  payload?: Record<string, any> | null;
  /** The numeric template id the caller asked for. */
  templateId?: string | number | null;
  /** invoice-receipt layout (a paid invoice). */
  receipt?: boolean;
}

function contactFor(record: any, party: any, payload?: Record<string, any> | null): any {
  const picked = Array.isArray(payload?.selected_contact) ? payload!.selected_contact : record?.selected_contact;
  if (Array.isArray(picked) && picked.length) {
    return picked.find((p: any) => p?.is_primary === 1) ?? picked[0];
  }
  return party ? { name: party.contact, email: party.email } : null;
}

function invoiceData(o: RenderOptions, ndis: boolean) {
  const { story, cfg, seed } = o;
  const record = o.record;
  const payload = o.payload ?? null;
  const rate = cfg.taxRate;
  const src: Record<string, any> = payload ?? record ?? {};

  const lines = normaliseLines(
    payload
      ? (payload.items ?? payload.item ?? payload.invoice_item)
      : (record?.invoice_items ?? record?.items),
    rate,
  );
  const totals = totalsFor(lines, payload ?? { sub_total: record?.sub_total, total_gst: record?.tax_amount, total: record?.total });
  const hasTax = totals.total_gst > 0 || lines.some((l) => l.gst_amount > 0);
  const labels = countryLabels(cfg, story, totals.total, hasTax);

  const party = findParty(seed, src.client_id ?? record?.client_id, src.client_name ?? record?.client?.name);
  const clientName = text(party?.name || record?.client?.name || src.client_name);
  const contact = contactFor(record, party, payload);

  const invoiceDate = text(src.invoice_date, o.today);
  const dueDate = text(src.due_date, invoiceDate);
  // A draft in the editor has no payment status yet; a saved row carries the books' own.
  const status = text(record?.mark_as ?? record?.status);

  return {
    country: labels,
    base_currency: cfg.currency,
    has_tax: hasTax,
    invoice_no: text(src.invoice_no, record?.invoice_no || "DRAFT"),
    invoice_date: invoiceDate,
    due_date: dueDate,
    has_paid: status,
    status,
    provider: buildProvider(story, cfg, ndis, text(src.invoice_email)),
    participant: buildParticipant(party, contact, clientName, cfg, ndis, labels),
    plan_manager: buildPlanManager(party, ndis),
    invoice_item: lines.map((l) => ({
      description: l.description,
      qty: l.qty,
      qty_type: l.qty_type,
      unit_price: l.unit_price,
      total: l.total,
      gst_amount: l.gst_amount,
      gst_percentage: l.gst_percentage,
      discount_criteria: l.criteria,
      discount: l.discount,
      isGstEnabled: l.gst,
      item_support_no: l.item_support_no,
      claim_type: l.claim_type,
      date: l.date || o.today,
    })),
    payment: {
      account_name: text(story.business.account_holder),
      bsb: cfg.labels.bank_branch ? text(story.business.bsb) : "",
      account_number: text(story.business.account_number),
      last_date_desc: paymentDueDescription(invoiceDate, dueDate),
      payment_terms: paymentDueDescription(invoiceDate, dueDate),
      bank_branch_label: labels.bank_branch_label,
    },
    sub_total: totals.sub_total,
    total_discount: totals.total_discount,
    total_gst: totals.total_gst,
    total: totals.total,
    extra_discount: totals.extra_discount,
    notes: text(src.notes),
    description: text(src.description),
    logo_url: businessLogo(story),
    isPayrix: false,
    isStripe: false,
    is_multicurrency: 0,
    currency_code: cfg.currency,
    is_deposit_invoice: false,
    payment_structure: "full",
    payment_schedules: [],
    is_fitrec: false,
  };
}

function quoteData(o: RenderOptions, ndis: boolean) {
  const { story, cfg, seed } = o;
  const record = o.record;
  const payload = o.payload ?? null;
  const rate = cfg.taxRate;
  const src: Record<string, any> = payload ?? record ?? {};

  const lines = normaliseLines(
    payload ? (payload.items ?? payload.item) : record?.items ?? record?.quote_items,
    rate,
  );
  const totals = totalsFor(lines, payload ?? { sub_total: record?.sub_total, total_gst: record?.tax_amount, total: record?.total });
  const hasTax = totals.total_gst > 0 || lines.some((l) => l.gst_amount > 0);
  const labels = countryLabels(cfg, story, totals.total, hasTax);

  const party = findParty(seed, src.client_id ?? record?.client_id, src.client_name ?? record?.client?.name);
  const clientName = text(party?.name || record?.client?.name || src.client_name);
  const contact = contactFor(record, party, payload);
  const quoteDate = text(src.quote_date ?? src.quoteDate, o.today);

  return {
    country: labels,
    base_currency: cfg.currency,
    has_tax: hasTax,
    quote_no: text(src.quote_no ?? src.quote_number, record?.quote_no || "DRAFT"),
    quote_date: quoteDate,
    valid_till: text(src.valid_till ?? src.quoteExpDate, quoteDate),
    description: text(src.description),
    provider: buildProvider(story, cfg, ndis, text(src.invoice_email)),
    participant: buildParticipant(party, contact, clientName, cfg, ndis, labels),
    plan_manager: buildPlanManager(party, ndis),
    quote_items: lines.map((l) => ({
      description: l.description,
      qty: l.qty,
      qty_type: l.qty_type || "Items",
      unit_price: l.unit_price,
      total: l.total,
      gst_amount: l.gst_amount,
      gst_percentage: l.gst_percentage,
      discount_amount: l.discountAmount,
      discount_percentage: l.criteria === "percent" ? l.discount : 0,
      discount_criteria: l.criteria,
      isGstEnabled: l.gst,
      item_support_no: l.item_support_no || null,
      claim_type: l.claim_type || null,
      date: l.date,
      gst: l.gst ? 1 : 0,
    })),
    payment: {
      account_name: text(story.business.account_holder),
      bsb: cfg.labels.bank_branch ? text(story.business.bsb) : "",
      account_number: text(story.business.account_number),
      bank_branch_label: labels.bank_branch_label,
    },
    sub_total: totals.sub_total,
    total_discount: totals.total_discount,
    total_gst: totals.total_gst,
    total: totals.total,
    extra_discount: totals.extra_discount,
    is_deposit: 0,
    payment_structure: "full",
    exchange_rate: null,
    total_after_exchange: null,
    currency_code: cfg.currency,
    is_multicurrency: 0,
    notes: text(src.notes),
    logo_url: businessLogo(story),
    is_fitrec: false,
  };
}

/** The same escaping sole-ocr's escapeQuoteRenderData applies before a quote reaches its template. */
function escapeQuoteRenderData(data: any) {
  const escapeFields = (source: any, fields: string[]) => {
    if (!source || typeof source !== "object") return source;
    const next = { ...source };
    for (const field of fields) {
      if (typeof next[field] === "string") next[field] = escapeText(next[field]);
    }
    return next;
  };
  return {
    ...data,
    ...escapeFields(data, ["notes", "description", "custom_note"]),
    participant: escapeFields(data.participant, ["participant_name", "business_name", "company_name", "name", "address", "email", "phone_no", "abn", "ndis_no"]),
    plan_manager: escapeFields(data.plan_manager, ["plan_manager_name", "plan_manager_ndis"]),
    provider: escapeFields(data.provider, ["provider_name", "company_name", "user_name", "address", "email", "phone_no", "abn", "ndis_no"]),
  };
}

/* ---------------------------------------------------------------------- *
 * Public API
 * ---------------------------------------------------------------------- */

function renderDocument(kind: DocKind, o: RenderOptions): string {
  const ndisCapable = isNdisCapable(o.story, o.cfg);
  const file = resolveTemplateFile(kind, o.templateId, ndisCapable);
  const fn = TEMPLATES[kind][file];
  const branding: any = demoBranding(o.story);
  // Only NDIS layouts print NDIS numbers; everywhere else the participant is just the client.
  const usesNdis = file.startsWith("ndis");
  const data = kind === "invoice" ? invoiceData(o, usesNdis && ndisCapable) : quoteData(o, usesNdis && ndisCapable);
  const showPayment = o.payload ? o.payload.show_bank_details !== 0 && o.payload.show_bank_details !== "0" : true;

  let html = fn(
    kind === "quote" ? escapeQuoteRenderData(data) : data,
    branding,
    "",
    kind === "invoice" && Boolean(o.receipt),
    showPayment,
  );
  html = applyBrandingToHtml(html, branding);
  return wrapWithDocumentStructure(html, branding);
}

/** A saved invoice (`record`) or an unsaved draft (`payload`) as the real invoice layout's HTML. */
export function renderInvoiceHtml(options: RenderOptions): string {
  return renderDocument("invoice", options);
}

/** A saved quote (`record`) or an unsaved draft (`payload`) as the real quote layout's HTML. */
export function renderQuoteHtml(options: RenderOptions): string {
  return renderDocument("quote", options);
}

/** A small, self-contained error page: a preview must never throw into the app. */
export function previewErrorHtml(message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Preview unavailable</title></head><body style="font-family:Arial,sans-serif;color:#334155;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><p>${escapeText(message)}</p></body></html>`;
}

/* ---------------------------------------------------------------------- *
 * Template catalogue for GET /template/list
 * ---------------------------------------------------------------------- */

export interface TemplateListItem {
  id: number;
  template_id: string;
  name: string;
  type: DocKind;
  category_id: number;
  category_name: "CLASSIC" | "NDIS";
  file_path: string;
  is_default: number;
  thumbnail: string;
}

const CATEGORY_IDS = { CLASSIC: 3, NDIS: 2 } as const;

export function templateCatalogue(story: Story, cfg: DemoCountryConfig): TemplateListItem[] {
  const items: TemplateListItem[] = [];
  const ndis = isNdisCapable(story, cfg);
  (["invoice", "quote"] as const).forEach((kind) => {
    const ids = TEMPLATE_IDS[kind];
    ids.classic.forEach((id, index) => {
      const file = `classic-template-${index + 1}`;
      items.push({
        id,
        template_id: file,
        name: `Classic Style ${index + 1}`,
        type: kind,
        category_id: CATEGORY_IDS.CLASSIC,
        category_name: "CLASSIC",
        file_path: `${file}.js`,
        is_default: 0,
        thumbnail: `/images/template/${kind === "invoice" ? "Invoice" : "Quote"}-classic-${index + 1}.jpg`,
      });
    });
    if (!ndis) return;
    ids.ndis.forEach((id, index) => {
      const file = `ndis-${index + 1}`;
      items.push({
        id,
        template_id: file,
        name: `NDIS Style ${index + 1}`,
        type: kind,
        category_id: CATEGORY_IDS.NDIS,
        category_name: "NDIS",
        file_path: `${file}.js`,
        is_default: index === 0 ? 1 : 0,
        thumbnail: `/images/template/NDISTemplate-${index + 1}.jpg`,
      });
    });
  });
  return items;
}
