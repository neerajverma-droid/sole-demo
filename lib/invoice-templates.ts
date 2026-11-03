import {
  DEFAULT_PAYMENT_TERMS,
  addDays,
  daysBetween,
  emptyInvoiceDraft,
  emptyNdisDraft,
  isLineItemFilled,
  newLineItem,
  newNdisLineItem,
  toNdisClaimType,
  toQtyType,
  type DiscountType,
  type InvoiceDraft,
  type NdisClaimType,
} from "@/lib/invoices";
import {
  billableEntries,
  depositPayload,
  documentTotals,
  itemPayload,
} from "@/lib/invoice-submit";
import { NDIS_INDUSTRY, type Industry } from "@/lib/settings";
import api from "@/utils/axiosInstance";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import apiRoutes from "@/config/api-routes";

export const TEMPLATE_CATEGORIES = [
  "Trades",
  "Creative",
  "Consulting",
  "Retail",
  /* NDIS categories — a support provider bills nothing like a trade. */
  "Assessment",
  "Support",
  "Group program",
  "Travel & admin",
  "Consumables",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** The pill row mixes three saved views with the real categories. */
export const TEMPLATE_FILTERS = [
  "All",
  "Favourites",
  "Recent",
  "Popular",
  ...TEMPLATE_CATEGORIES,
] as const;
export type TemplateFilter = (typeof TEMPLATE_FILTERS)[number];

/**
 * "General" is the fallback collection, shown to every industry that has none of
 * its own. Only NDIS ships a collection today — a Trades or Retail business still
 * gets the general set, and narrows it with the category pills.
 */
export type TemplateIndustry = Industry | "General";

/** Accent bar in the preview thumbnail — the only colour on the card. */
export type TemplateAccent = "indigo" | "orange" | "teal";

export const ACCENT_CLASS: Record<TemplateAccent, string> = {
  indigo: "bg-primary",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  /**
   * The category pills only ever light up for one of `TEMPLATE_CATEGORIES` —
   * a real saved template's own category rarely matches one of those, so this
   * is a free string rather than that fixed union; it still renders on the
   * card and still participates in search.
   */
  category: string;
  /** Decides which gallery shows it, and which editor its card opens. */
  industry: TemplateIndustry;
  /**
   * A collection Sole ships (`user_id = 0` on the row), as opposed to one the
   * user saved. Shared with every account, so it can be used or copied but
   * never updated.
   */
  standard?: boolean;
  /** The row's industry, sent back to the preview endpoint. */
  industryId?: number | null;
  /** "general" or "industry" — which collection the template belongs to. */
  scope?: string;
  accent: TemplateAccent;
  popular?: boolean;
  recentlyUsed?: boolean;
  /**
   * What the template is for and when to reach for it — the card's blurb. Kept
   * apart from `description`, which is document text that goes on the invoice
   * itself and so has to stay short.
   */
  summary: string;
  /** Prefills the invoice description. */
  description: string;
  /** Prefills the line items — and sets the preview's skeleton line count. */
  items: {
    description: string;
    quantity: string;
    price: string;
    gst: boolean;
    /** NDIS templates only; `description` is then the support item name. */
    supportItemNumber?: string;
    claimType?: NdisClaimType;
  }[];
  notes?: string;
  paymentTermsDays: number;
};

/**
 * "Health and Social Care" — the industry that makes NDIS invoicing available
 * at all. It's the business's own `industry_id`, and it's the only thing that
 * decides whether the NDIS paths appear.
 */
export const NDIS_INDUSTRY_ID = 9;

/**
 * NDIS templates open the NDIS editor; everything else opens the general one.
 *
 * Note this is the *template's* own kind, not the business's industry: an NDIS
 * provider raises ordinary invoices too, and a general template of theirs must
 * still open the general editor.
 */
export function isNdisTemplate(template: InvoiceTemplate): boolean {
  return template.industry === NDIS_INDUSTRY;
}

export function templateHref(template: InvoiceTemplate): string {
  const editor = isNdisTemplate(template) ? "ndis" : "general";
  return `/invoices/new/${editor}?template=${template.id}`;
}

/** Short form for the card's tag — the full industry label is too long there. */
export function templateIndustryTag(
  template: InvoiceTemplate,
): string | undefined {
  if (template.industry === "General") return undefined;
  return template.industry === NDIS_INDUSTRY ? "NDIS" : template.industry;
}

/**
 * Pills for a given collection: the saved views, then only the categories that
 * actually appear in it — an NDIS provider has no use for a Retail pill.
 */
export function filtersForTemplates(
  templates: InvoiceTemplate[],
): TemplateFilter[] {
  return [
    "All",
    "Favourites",
    "Recent",
    "Popular",
    ...TEMPLATE_CATEGORIES.filter((category) =>
      templates.some((template) => template.category === category),
    ),
  ];
}

/**
 * Live filtering for the gallery. `favourites` comes from the invoices store,
 * so the Favourites pill reflects what the user has starred.
 */
export function filterTemplates(
  templates: InvoiceTemplate[],
  filter: TemplateFilter,
  query: string,
  favourites: string[],
): InvoiceTemplate[] {
  const needle = query.trim().toLowerCase();

  return templates.filter((template) => {
    const matchesFilter =
      filter === "All" ||
      (filter === "Favourites" && favourites.includes(template.id)) ||
      (filter === "Recent" && !!template.recentlyUsed) ||
      (filter === "Popular" && !!template.popular) ||
      template.category === filter;

    if (!matchesFilter) return false;
    if (!needle) return true;

    return (
      template.name.toLowerCase().includes(needle) ||
      template.category.toLowerCase().includes(needle)
    );
  });
}

/* ------------------------------------------------------------------ *
 * API — GET /invoice/default, GET /invoice/default/:id, POST .../favourite
 *
 * Backed by sole-webapp's "default invoices": a business's own saved
 * starting points, plus a shared set every account sees. Popular and Recent
 * are real server-computed signals (usage_count/last_used_at on the
 * backend), not the placeholder booleans this file used to hardcode.
 * ------------------------------------------------------------------ */

export type ApiDefaultInvoice = {
  id: string | number;
  /** 0 marks a shared default every account sees — read-only to all of them. */
  user_id?: string | number | null;
  industry_id?: string | number | null;
  category?: string;
  description?: string;
  type?: string;
  is_default?: boolean;
  template_scope?: string;
  template_scope_label?: string;
  is_favourite?: boolean;
  popular?: boolean;
  recently_used?: boolean;
  item_count?: number;
};

const TEMPLATE_ACCENTS: TemplateAccent[] = ["indigo", "orange", "teal"];

/** A short, stable index into the accent palette — same id, same colour always. */
export function accentForId(id: string): TemplateAccent {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return TEMPLATE_ACCENTS[hash % TEMPLATE_ACCENTS.length];
}

/** A shared default template (`user_id = 0`) — usable by anyone, editable by no one. */
export function isGlobalTemplateOwner(
  userId: string | number | null | undefined,
): boolean {
  return userId != null && userId !== "" && Number(userId) === 0;
}

function mapApiDefaultInvoice(raw: ApiDefaultInvoice): InvoiceTemplate {
  const id = String(raw.id);
  const label = raw.template_scope_label?.trim() || "General";

  return {
    id,
    name: raw.category?.trim() || "Untitled template",
    category: label,
    industry: raw.type === "ndis" ? NDIS_INDUSTRY : "General",
    // `is_default` is the template's *scope* (general vs industry), not who
    // owns it — the shared, read-only set is the user_id = 0 rows.
    standard: isGlobalTemplateOwner(raw.user_id),
    industryId: raw.industry_id != null && raw.industry_id !== "" ? Number(raw.industry_id) : null,
    scope: raw.template_scope || (raw.is_default ? "general" : "industry"),
    accent: accentForId(id),
    popular: !!raw.popular,
    recentlyUsed: !!raw.recently_used,
    summary: raw.description?.trim() || `${label} template`,
    description: raw.description ?? "",
    // The list endpoint carries only a count, not the real lines — enough for
    // the card's decorative skeleton bars and "N lines" caption. The real
    // lines come from fetchInvoiceDefaultDetail once the template is opened.
    items: Array.from({ length: raw.item_count ?? 0 }, () => ({
      description: "",
      quantity: "",
      price: "",
      gst: false,
    })),
    notes: "",
    paymentTermsDays: 7,
  };
}

/** The account's saved starting points — its own, plus the shared set every account sees. */
export async function fetchInvoiceDefaults(
  industryId: number | null,
): Promise<{ templates: InvoiceTemplate[]; favouriteIds: string[] }> {
  const response = await api.get<{
    success: boolean;
    data?: { invoices?: ApiDefaultInvoice[] };
  }>(apiRoutes.invoice.default, {
    params: {
      module: "invoice",
      page_size: 100,
      ...(industryId != null ? { industry_id: industryId } : {}),
    },
  });

  const raw = response.data?.data?.invoices ?? [];
  return {
    templates: raw.map(mapApiDefaultInvoice),
    favouriteIds: raw
      .filter((item) => item.is_favourite)
      .map((item) => String(item.id)),
  };
}

/**
 * The template rendered as HTML with sample data — sole-webapp's Preview
 * button (`GET /invoice-default/preview`, which answers `{ data: html }`).
 */
export async function fetchInvoiceTemplatePreviewHtml(
  template: Pick<InvoiceTemplate, "id" | "industryId" | "scope">,
  userId: string | null,
  /** "quote" renders the quote layout; the endpoint is shared. */
  templateType?: "quote",
): Promise<string> {
  const response = await api.get<{ success?: boolean; data?: string }>(
    apiRoutes.invoice.defaultPreview,
    {
      params: {
        invoiceId: template.id,
        useDemo: "false",
        ...(userId ? { userId } : {}),
        ...(template.industryId != null
          ? { industry_id: template.industryId }
          : {}),
        template_scope: template.scope || "general",
        ...(templateType ? { templateType } : {}),
      },
    },
  );
  const html = response.data?.data;
  if (!html) throw new Error("Couldn't load the preview.");
  return html;
}

/** Deletes one of the user's own saved templates. The shared set can't be. */
export async function deleteInvoiceDefaultApi(id: string): Promise<void> {
  const response = await api.delete<{ success?: boolean; message?: string }>(
    apiRoutes.invoice.defaultDetail(id),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete that template.");
  }
}

/** Toggles the current user's star on one template, returning the new state. */
export async function toggleInvoiceDefaultFavouriteApi(
  id: string,
): Promise<boolean> {
  const response = await api.post<{
    success: boolean;
    data?: { is_favourite: boolean };
  }>(apiRoutes.invoice.defaultFavourite(id));
  return !!response.data?.data?.is_favourite;
}

type ApiDefaultInvoiceItem = {
  description?: string;
  qty?: number | string;
  price?: number | string;
  qty_type?: string;
  disc_criteria?: string;
  discount_percentage?: number | string;
  discount_amount?: number | string;
  gst_percentage?: number | string;
  item_support_no?: string;
  claim_type?: string;
  /** NDIS supports only — the date the support was delivered. */
  date?: string;
};

export type ApiDefaultInvoiceDetail = {
  /** 0 marks a shared default — the save dialog may only copy it, never update it. */
  user_id?: string | number | null;
  industry_id?: string | number | null;
  /**
   * Always "invoice" on the detail endpoint — the old API's document type,
   * not the template's kind. Read `template_type` for that.
   */
  type?: string | null;
  /** The template's own kind, "ndis" or "general" (null on rows saved without one). */
  template_type?: string | null;
  category?: string;
  description?: string;
  notes?: string;
  extra_discount?: number | string;
  payment_term?: number;
  client_id?: string | number | null;
  client?: { client_id?: string | number; name?: string } | null;
  invoice_item?: ApiDefaultInvoiceItem[];
};

function apiItemNumber(value: number | string | undefined): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "currency" is the stored spelling for a flat-amount discount, not "amount". */
function defaultItemDiscountType(raw: ApiDefaultInvoiceItem): DiscountType {
  return raw.disc_criteria === "currency" || raw.disc_criteria === "amount"
    ? "amount"
    : "percent";
}

/** The discount as the template stored it — no folding one type into the other. */
function defaultItemDiscountValue(raw: ApiDefaultInvoiceItem): string {
  if (defaultItemDiscountType(raw) === "amount") {
    return raw.discount_amount != null ? String(raw.discount_amount) : "";
  }
  return raw.discount_percentage != null
    ? String(raw.discount_percentage)
    : "";
}

/** The full record behind a template — line items included — fetched once it's actually opened. */
export async function fetchInvoiceDefaultDetail(
  id: string,
): Promise<ApiDefaultInvoiceDetail> {
  const response = await api.get<{
    success: boolean;
    data?: ApiDefaultInvoiceDetail;
  }>(apiRoutes.invoice.defaultDetail(id));
  if (!response.data?.data) throw new Error("Template not found");
  return response.data.data;
}

/** Prefills a draft from a saved template's real record, keeping its own numbering and dates. */
export function draftFromInvoiceDefault(
  detail: ApiDefaultInvoiceDetail,
  ndis: boolean,
  number: string,
  today: string,
): InvoiceDraft {
  const base = ndis
    ? emptyNdisDraft(number, today)
    : emptyInvoiceDraft(number, today);

  const items = (detail.invoice_item ?? []).map((item) => ({
    ...(ndis ? newNdisLineItem() : newLineItem()),
    description: item.description ?? "",
    quantity: item.qty != null ? String(item.qty) : "",
    price: item.price != null ? String(item.price) : "",
    qtyType: toQtyType(item.qty_type),
    discountPercent: defaultItemDiscountValue(item),
    discountType: defaultItemDiscountType(item),
    // NDIS supports are GST-free; a general template's lines carry whatever
    // GST rate the template was saved with.
    gst: ndis ? false : apiItemNumber(item.gst_percentage) > 0,
    supportItemNumber: ndis ? (item.item_support_no ?? "") : undefined,
    claimType: ndis ? toNdisClaimType(item.claim_type) : undefined,
    // A template's supports are undated — the delivery date belongs to the
    // claim being written, so it opens on today.
    date: ndis ? item.date || today : undefined,
  }));

  return {
    ...base,
    // A template is a starting point for any client, so none is preselected —
    // the user picks one, and the editor's client check holds the save until
    // they do. (Shared defaults carry client_id 0, which isn't a client at all.)
    clientId: null,
    clientName: "",
    description: detail.description?.trim() || base.description,
    // Same rule sole-webapp's own category-select uses: due = today +
    // payment_term days, defaulting to 7 when the template doesn't carry one.
    due: addDays(today, detail.payment_term || DEFAULT_PAYMENT_TERMS),
    items: items.length > 0 ? items : base.items,
    extraDiscount:
      detail.extra_discount != null
        ? String(detail.extra_discount)
        : base.extraDiscount,
    notes: detail.notes ?? base.notes,
  };
}

/* ------------------------------------------------------------------ *
 * Saving the current invoice as a template — POST /invoice/default,
 * PUT /invoice/default/:id
 *
 * Same shape sole-webapp's own "Save as template" dialog sends. Reuses the
 * invoice-save path's own totals, line-item and deposit builders, so a
 * template's figures are computed exactly the way the invoice that becomes
 * one would be — the two are the same document, just parked under a
 * category instead of a client.
 * ------------------------------------------------------------------ */

export type SaveTemplateInput = {
  draft: InvoiceDraft;
  /** The name it's saved under — what the gallery card shows and searches. */
  category: string;
  ndis: boolean;
  /**
   * The business's own industry. Sent for general and NDIS templates alike —
   * the gallery lists a business's templates by its industry, so a template
   * saved under any other value (or none) would never show up again. `type`
   * is what tells an NDIS template from a general one.
   */
  industryId: number | null;
  gstPercent: number;
  gstEnabled: boolean;
  /** The PDF layout id, so the template renders on the same one the invoice would. */
  renderTemplateId: string;
};

function buildInvoiceDefaultPayload(
  input: SaveTemplateInput,
): Record<string, unknown> {
  const {
    draft,
    category,
    ndis,
    industryId,
    gstPercent,
    gstEnabled,
    renderTemplateId,
  } = input;

  const kept = billableEntries(draft.items);
  const items = kept.map((entry) => entry.item);
  const indexMap = new Map(
    kept.map((entry, position) => [entry.index, position]),
  );

  const totals = documentTotals({ ...draft, items }, gstPercent);

  return {
    category: category.trim(),
    description: draft.description,
    industry_id: industryId ?? (ndis ? NDIS_INDUSTRY_ID : null),
    template_id: renderTemplateId,
    notes: draft.notes,
    // The backend requires both dates on a template (as sole-webapp always
    // sent them); a template opened later re-derives its due date from
    // `payment_term`, so these just record the draft it was saved from.
    invoice_date: draft.issued,
    due_date: draft.due,
    payment_term: Math.max(0, daysBetween(draft.issued, draft.due)),
    sub_total: totals.subTotal,
    total_discount: totals.discount,
    extra_discount: totals.extraDiscount,
    total_gst: totals.gst,
    total: totals.total,
    gst_enabled: gstEnabled,
    gst_percentage: gstPercent,
    module: "invoice",
    type: ndis ? "ndis" : "general",
    // A template isn't billed to anyone yet, so unlike a real invoice
    // nothing here converts a deposit's figures to AUD — `rate` is always
    // null, and the deposit is recorded in whatever the draft's own figures
    // already are.
    ...depositPayload(draft, totals, gstPercent, null, indexMap),
    items: items.map((item) => templateItemPayload(item, gstPercent, ndis)),
  };
}

/**
 * The invoice line payload plus `disc` — the template endpoints read a line's
 * discount from `disc` (sole-webapp's spelling), not the `discount` the
 * invoice endpoints take, so without it every template line saved at 0%.
 */
export function templateItemPayload(
  ...args: Parameters<typeof itemPayload>
): ReturnType<typeof itemPayload> {
  const payload = itemPayload(...args);
  return { ...payload, disc: payload.discount };
}

/**
 * The one thing that blocks saving a template that doesn't also block
 * saving the invoice itself — a template has no client and no dates, so
 * those required-field checks don't apply to it.
 */
export function templateSaveIssue(draft: InvoiceDraft): string | undefined {
  if (!draft.items.some(isLineItemFilled)) {
    return "Add at least one line item with a description, quantity and price.";
  }
  return undefined;
}

/**
 * A create treats every absent key as "use the default", so blanks are simply
 * left out — encryptPayload would otherwise send a top-level null as "".
 */
export function withoutBlanks(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );
}

type SaveInvoiceDefaultResponse = {
  success: boolean;
  message?: string;
  data?: { invoice?: { id?: string | number } };
};

/** Creates a new saved template from the current draft. */
export async function createInvoiceDefaultApi(
  input: SaveTemplateInput,
): Promise<{ id: string }> {
  const response = await api.post<SaveInvoiceDefaultResponse>(
    apiRoutes.invoice.default,
    buildEncryptedRequestBody(withoutBlanks(buildInvoiceDefaultPayload(input))),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save that template.");
  }
  const id = response.data?.data?.invoice?.id;
  if (id == null) {
    throw new Error("The template saved but the server returned no id.");
  }
  return { id: String(id) };
}

/** Overwrites the template this draft was opened from. */
export async function updateInvoiceDefaultApi(
  id: string,
  input: SaveTemplateInput,
): Promise<void> {
  const response = await api.put<{ success: boolean; message?: string }>(
    apiRoutes.invoice.defaultDetail(id),
    buildEncryptedRequestBody(buildInvoiceDefaultPayload(input)),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't update that template.");
  }
}
