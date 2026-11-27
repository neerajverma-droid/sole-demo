/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like mock-server.ts */
import {
  NDIS_INVOICE_TEMPLATES,
  NDIS_PRICE_EFFECTIVE_FROM,
  NDIS_PRICE_SCHEDULE,
  NDIS_PROPOSAL_TEMPLATES,
  NDIS_QUOTE_NOTES,
  NDIS_QUOTE_TEMPLATES,
  NDIS_SUPPORT_ITEMS,
  UNIT_TO_QTY_TYPE,
  isClaimableOn,
  ndisItemByNumber,
  type NdisProposalTemplateSpec,
  type NdisSupportItem,
  type NdisTemplateSpec,
} from "../ndis-data";
import { applyOverlayWrite } from "../overlay";
import type { DemoHandler, HandlerCtx, HandlerResponse } from "./types";

/*
 * NDIS (Health and Social Care, industry 9) for the Australian demo business:
 *
 *   - line-item search for NDIS invoices and quotes (GET /services/autocomplete)
 *   - the support-item catalogue on the Products page's NDIS tab (GET /custom-product?active_tab=ndis)
 *   - the New invoice / New quote template gallery (GET /invoice/default and friends)
 *   - participants' NDIS numbers and plan managers on the client's contacts
 *   - NDIS-flavoured proposal templates and quote defaults
 *
 * New Zealand has the NDIS country feature off, and every other industry has no NDIS surface,
 * so for those this handler always returns null and the generic mock answers as before.
 */

const NDIS_INDUSTRY_ID = 9;
const INDUSTRY_LABEL = "NDIS (Health and Social Care)";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const ok = (data: any, extra: Record<string, unknown> = {}): HandlerResponse => ({
  status: 200,
  data: { success: true, ...extra, data },
});
const fail = (message: string): HandlerResponse => ({ status: 200, data: { success: false, message, data: null } });

/* ------------------------------------------------------------------ *
 * Per-visit state. Keyed by the seed object, so a new visit (a new seed) starts clean, and
 * rebuilt deterministically when the session's recorded writes are replayed.
 * ------------------------------------------------------------------ */

interface ContactNdis {
  ndis_no?: string;
  plan_manager_name?: string;
  plan_manager_ndis?: string;
}

interface TemplateItem {
  description: string;
  qty: number;
  price: number;
  qty_type: string;
  disc_criteria: "percent" | "currency";
  discount_percentage: number;
  discount_amount: number;
  gst: boolean;
  gst_percentage: number;
  gst_amount: number;
  item_support_no: string;
  claim_type: string;
  date: string | null;
  amount: number;
  total: number;
}

interface SavedTemplate {
  id: number;
  module: "invoice" | "quote";
  type: "ndis" | "general";
  category: string;
  description: string;
  notes: string;
  paymentTerm: number;
  items: TemplateItem[];
  extra: Record<string, any>;
  createdAt: string;
}

interface NdisStore {
  contacts: Map<string, ContactNdis>;
  saved: SavedTemplate[];
  favourites: Set<string>;
  nextTemplateId: number;
}

const stores = new WeakMap<object, NdisStore>();

function storeFor(seed: object): NdisStore {
  let store = stores.get(seed);
  if (!store) {
    store = { contacts: new Map(), saved: [], favourites: new Set(), nextTemplateId: 9501 };
    stores.set(seed, store);
  }
  return store;
}

/* ------------------------------------------------------------------ *
 * Line-item search: GET /services/autocomplete
 * ------------------------------------------------------------------ */

const toSupportItem = (item: NdisSupportItem) => ({
  support_item_number: item.number,
  support_item_name: item.name,
  price_tooltip: item.tooltip,
  price_national: item.priceNational,
  price_remote: item.priceRemote,
  price_very_remote: item.priceVeryRemote,
  unit: item.unit,
  qty_type: UNIT_TO_QTY_TYPE[item.unit] || null,
  claim_type: item.claimType,
  type: item.type,
  price_schedule: NDIS_PRICE_SCHEDULE,
  price_effective_from: NDIS_PRICE_EFFECTIVE_FROM,
  is_legacy: item.isLegacy,
  end_date: item.endDate,
});

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, min), max);
};

const ownProducts = (ctx: HandlerCtx, term: string) =>
  (ctx.seed.customProducts as any[]).filter((p) => !term || String(p.item_name ?? "").toLowerCase().includes(term));

function searchServices(ctx: HandlerCtx): HandlerResponse {
  const term = String(ctx.params.query ?? "").trim().toLowerCase();
  const limit = clamp(ctx.params.limit, 10, 1, 30);

  let catalogue: NdisSupportItem[] = [];
  if (term) {
    catalogue = NDIS_SUPPORT_ITEMS.filter(
      (item) => isClaimableOn(item, ctx.today) && (item.name.toLowerCase().includes(term) || item.number.toLowerCase().includes(term)),
    ).sort(
      (a, b) =>
        Number(b.number.toLowerCase() === term) - Number(a.number.toLowerCase() === term) ||
        Number(a.isLegacy) - Number(b.isLegacy) ||
        a.name.localeCompare(b.name),
    );
  }

  // The business's own NDIS products come after the catalogue rows (capped so a dropdown stays short).
  const own = ownProducts(ctx, term)
    .slice(0, limit)
    .map((p) => ({
      support_item_number: "",
      qty_type: p.qty_type || "",
      gst: false,
      support_item_name: p.item_name || "",
      description: "",
      price_tooltip: "",
      price: p.selling_price ?? "",
      inventory_flag: p.inventory_flag || 0,
      inventory_count: Number(p.inventory_count) || 0,
    }));

  // A bare array, not the usual { success, data } envelope: that is what the live endpoint sends.
  return { status: 200, data: [...catalogue.slice(0, limit).map(toSupportItem), ...own] };
}

/** The general services dictionary: here, the business's own products. Also a bare array. */
function searchAllServices(ctx: HandlerCtx): HandlerResponse {
  const term = String(ctx.params.query ?? "").trim().toLowerCase();
  const limit = clamp(ctx.params.limit, 10, 1, 30);
  const rows = ownProducts(ctx, term)
    .slice(0, limit)
    .map((p) => ({
      item_name: p.item_name || "",
      description: p.sale_description || "",
      category: "Services",
      price: p.selling_price ?? "",
      qty_type: p.qty_type || "",
      gst: !!p.gst,
      product_id: p.id,
      inventory_flag: p.inventory_flag || 0,
      inventory_count: Number(p.inventory_count) || 0,
    }));
  return { status: 200, data: rows };
}

/* ------------------------------------------------------------------ *
 * Price-guide catalogue: GET /custom-product?active_tab=ndis
 * ------------------------------------------------------------------ */

function supportCatalogue(ctx: HandlerCtx): HandlerResponse {
  const { params } = ctx;
  const search = String(params.search_query ?? "").trim().toLowerCase();
  const page = clamp(params.page, 1, 1, 100000);
  const limit = clamp(params.limit, 20, 1, 1000);
  const groups = String(params.registration_group ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const categories = String(params.support_category ?? "")
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);

  // Legacy codes were superseded for a reason, so the catalogue never lists one.
  const rows = NDIS_SUPPORT_ITEMS.filter(
    (item) =>
      !item.isLegacy &&
      (!search || item.name.toLowerCase().includes(search) || item.number.toLowerCase().includes(search)) &&
      (!groups.length || groups.includes(item.registrationGroupName)) &&
      (!categories.length || categories.includes(item.supportCategoryNumber)),
  );

  const start = (page - 1) * limit;
  return {
    status: 200,
    data: {
      success: true,
      data: rows.slice(start, start + limit).map((item) => ({
        id: item.id,
        support_item_number: item.number,
        support_item_name: item.name,
        registration_group_number: item.registrationGroupNumber,
        registration_group_name: item.registrationGroupName,
        support_category_number: item.supportCategoryNumber,
        support_category_name: item.supportCategoryName,
        type: item.type,
      })),
      pagination: { total: rows.length, total_pages: Math.ceil(rows.length / limit) },
    },
  };
}

/* ------------------------------------------------------------------ *
 * Templates: the New invoice / New quote gallery
 * ------------------------------------------------------------------ */

const INVOICE_BASE_ID = 9001;
const QUOTE_BASE_ID = 9101;

interface TemplateRecord {
  id: number;
  module: "invoice" | "quote";
  type: "ndis" | "general";
  shared: boolean;
  category: string;
  description: string;
  notes: string;
  paymentTerm: number;
  popular: boolean;
  recentlyUsed: boolean;
  items: TemplateItem[];
  extra: Record<string, any>;
}

const CLAIM_BY_CATALOGUE: Record<string, string> = {
  "Direct Service": "Standard Service",
  "Provider Travel": "Travel – Time",
  "non-labour costs": "Travel – Non-Labour Costs",
  Cancellation: "Cancellation",
  "Non-Face-to-Face": "Non-Face-to-Face (NF2F)",
  "NDIA Requested Reports": "NDIA Requested Reports",
  Telehealth: "Telehealth",
};

function specItems(spec: NdisTemplateSpec): TemplateItem[] {
  return spec.lines.map((line) => {
    const support = ndisItemByNumber(line.number);
    const price = line.price ?? support?.priceNational ?? 0;
    const total = round2(line.qty * price);
    return {
      description: support?.name ?? line.number,
      qty: line.qty,
      price,
      qty_type: support ? UNIT_TO_QTY_TYPE[support.unit] : "items",
      disc_criteria: "percent",
      discount_percentage: 0,
      discount_amount: 0,
      // NDIS supports are GST-free.
      gst: false,
      gst_percentage: 0,
      gst_amount: 0,
      item_support_no: line.number,
      claim_type: line.claim ?? CLAIM_BY_CATALOGUE[support?.claimType ?? ""] ?? "Standard Service",
      date: null,
      amount: total,
      total,
    };
  });
}

function baseTemplates(): TemplateRecord[] {
  const build = (specs: readonly NdisTemplateSpec[], mod: "invoice" | "quote", base: number): TemplateRecord[] =>
    specs.map((spec, index) => ({
      id: base + index,
      module: mod,
      type: "ndis",
      shared: true,
      category: spec.name,
      description: spec.description,
      notes: spec.notes,
      paymentTerm: spec.paymentTerm,
      popular: !!spec.popular,
      recentlyUsed: !!spec.recentlyUsed,
      items: specItems(spec),
      extra: {},
    }));
  return [...build(NDIS_INVOICE_TEMPLATES, "invoice", INVOICE_BASE_ID), ...build(NDIS_QUOTE_TEMPLATES, "quote", QUOTE_BASE_ID)];
}

const savedAsRecord = (saved: SavedTemplate): TemplateRecord => ({
  id: saved.id,
  module: saved.module,
  type: saved.type,
  shared: false,
  category: saved.category,
  description: saved.description,
  notes: saved.notes,
  paymentTerm: saved.paymentTerm,
  popular: false,
  recentlyUsed: false,
  items: saved.items,
  extra: saved.extra,
});

/** Own saved templates first (newest first), then the shared set, as the live gallery orders them. */
const allTemplates = (store: NdisStore): TemplateRecord[] => [
  ...[...store.saved].reverse().map(savedAsRecord),
  ...baseTemplates(),
];

const findTemplate = (store: NdisStore, id: string): TemplateRecord | undefined =>
  allTemplates(store).find((t) => String(t.id) === id);

const templateTotal = (items: TemplateItem[]) => round2(items.reduce((sum, item) => sum + item.total, 0));

function galleryRow(record: TemplateRecord, store: NdisStore) {
  return {
    id: record.id,
    user_id: record.shared ? 0 : 1,
    industry_id: NDIS_INDUSTRY_ID,
    category: record.category,
    description: record.description,
    type: record.type,
    module: record.module,
    is_default: false,
    template_scope: "industry",
    template_scope_label: INDUSTRY_LABEL,
    is_favourite: store.favourites.has(String(record.id)),
    popular: record.popular,
    recently_used: record.recentlyUsed,
    item_count: record.items.length,
    sub_total: templateTotal(record.items),
    total: templateTotal(record.items),
    currency_code: "AUD",
  };
}

function templateGallery(ctx: HandlerCtx): HandlerResponse {
  const store = storeFor(ctx.seed);
  const wantsQuote = String(ctx.params.module ?? "") === "quote" || String(ctx.params.is_quote ?? "") === "true";
  const page = clamp(ctx.params.page, 1, 1, 100000);
  const limit = clamp(ctx.params.limit ?? ctx.params.page_size, 100, 1, 500);

  const rows = allTemplates(store).filter((t) => t.module === (wantsQuote ? "quote" : "invoice"));
  const start = (page - 1) * limit;
  return {
    status: 200,
    data: {
      success: true,
      data: {
        invoices: rows.slice(start, start + limit).map((t) => galleryRow(t, store)),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(rows.length / limit),
          totalItems: rows.length,
          itemsPerPage: limit,
        },
      },
    },
  };
}

function templateDetail(ctx: HandlerCtx, id: string): HandlerResponse {
  const record = findTemplate(storeFor(ctx.seed), id);
  if (!record) return fail("Template not found");
  const total = templateTotal(record.items);
  return ok({
    is_deposit: 0,
    ...record.extra,
    id: record.id,
    user_id: record.shared ? 0 : 1,
    industry_id: NDIS_INDUSTRY_ID,
    // The detail endpoint's own `type` is always "invoice"; `template_type` is the template's kind.
    type: "invoice",
    template_type: record.type,
    module: record.module,
    category: record.category,
    description: record.description,
    notes: record.notes,
    extra_discount: 0,
    payment_term: record.paymentTerm,
    client_id: 0,
    client: null,
    sub_total: total,
    total,
    total_gst: 0,
    currency_code: "AUD",
    invoice_item: record.items,
  });
}

const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The template as HTML with sample participant details: the gallery's Preview button. */
function templatePreview(ctx: HandlerCtx): HandlerResponse {
  const record = findTemplate(storeFor(ctx.seed), String(ctx.params.invoiceId ?? ""));
  const business = ctx.story.business;
  const isQuote = record?.module === "quote" || String(ctx.params.templateType ?? "") === "quote";
  const items = record?.items ?? [];
  const lines = items
    .map(
      (item) => `<tr><td>${esc(item.description)}<div class="sub">${esc(item.item_support_no)} · ${esc(item.claim_type)}</div></td>
<td class="r">${item.qty} ${esc(item.qty_type)}</td><td class="r">${money(item.price)}</td><td class="r">${money(item.total)}</td></tr>`,
    )
    .join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;margin:32px;color:#1c2430}h1{font-size:22px;margin:0 0 4px}.sub{font-size:11px;color:#6b7686}
table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:8px 6px;border-bottom:1px solid #e3e7ee;text-align:left;font-size:13px}.r{text-align:right}
.meta{display:flex;gap:40px;margin-top:16px;font-size:13px}.tot{text-align:right;margin-top:14px;font-size:15px;font-weight:600}.note{margin-top:24px;font-size:12px;color:#4b5563}
</style></head><body>
<h1>${isQuote ? "Quote" : "Tax invoice"}${record ? ` · ${esc(record.category)}` : ""}</h1>
<div class="sub">${esc(business.name)} · ABN ${esc(business.abn)} · Provider NDIS registration 4050012345</div>
<div class="meta"><div><b>Participant</b><br>Sample Participant<br>NDIS no. 430123456</div><div><b>Plan manager</b><br>Sample Plan Management<br>405012345</div></div>
<table><thead><tr><th>Support</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${lines}</tbody></table>
<div class="tot">Total (GST-free) ${money(templateTotal(items))}</div>
<div class="note">${esc(record?.notes ?? "")}</div></body></html>`;
  return ok(html);
}

const numberOf = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** A line as the editor saves it (`items[]`) -> as the detail endpoint returns it. */
function savedItem(raw: any): TemplateItem {
  const qty = numberOf(raw.qty);
  const price = numberOf(raw.price);
  const flat = raw.disc_criteria === "currency";
  const discount = numberOf(raw.discount ?? raw.disc);
  const gross = qty * price;
  const net = round2(flat ? gross - discount : gross * (1 - discount / 100));
  const gstAmount = round2(numberOf(raw.gst_amount));
  return {
    description: String(raw.description ?? ""),
    qty,
    price,
    qty_type: String(raw.qty_type ?? "items"),
    disc_criteria: flat ? "currency" : "percent",
    discount_percentage: flat ? 0 : discount,
    discount_amount: flat ? discount : 0,
    gst: !!raw.gst,
    gst_percentage: numberOf(raw.gst_percentage),
    gst_amount: gstAmount,
    item_support_no: String(raw.item_support_no ?? ""),
    claim_type: String(raw.claim_type ?? ""),
    date: raw.date ? String(raw.date) : null,
    amount: round2(net + gstAmount),
    total: net,
  };
}

function saveTemplate(ctx: HandlerCtx, store: NdisStore, existing?: SavedTemplate): SavedTemplate {
  const f = ctx.fields();
  const { items, category, description, notes, payment_term, module: mod, type, ...rest } = f;
  const next: SavedTemplate = {
    id: existing?.id ?? store.nextTemplateId,
    module: (mod ?? existing?.module) === "quote" ? "quote" : "invoice",
    type: (type ?? existing?.type) === "general" ? "general" : "ndis",
    category: String(category ?? existing?.category ?? "Untitled template").trim(),
    description: String(description ?? existing?.description ?? ""),
    notes: String(notes ?? existing?.notes ?? ""),
    paymentTerm: payment_term !== undefined ? Math.max(0, numberOf(payment_term)) : (existing?.paymentTerm ?? 7),
    items: Array.isArray(items) ? items.map(savedItem) : (existing?.items ?? []),
    extra: {
      is_deposit: rest.is_deposit,
      deposit_type: rest.deposit_type,
      deposit_selection_type: rest.deposit_selection_type,
      deposit_value: rest.deposit_value,
      deposit_selected_items: rest.deposit_selected_items,
      deposit_due_date: rest.deposit_due_date,
      payment_structure: rest.payment_structure,
    },
    createdAt: existing?.createdAt ?? ctx.today,
  };
  if (existing) Object.assign(existing, next);
  else {
    store.saved.push(next);
    store.nextTemplateId += 1;
  }
  return next;
}

function templateWrite(ctx: HandlerCtx): HandlerResponse | null {
  const store = storeFor(ctx.seed);
  const { method, path } = ctx;

  if (method === "POST" && path === "/invoice/default") {
    const saved = saveTemplate(ctx, store);
    return ok({ invoice: { id: saved.id } }, { message: "Template saved." });
  }

  const favourite = /^\/invoice\/default\/(\d+)\/favourite$/.exec(path);
  if (favourite && method === "POST") {
    const id = favourite[1];
    if (!findTemplate(store, id)) return fail("Template not found");
    const nowFavourite = !store.favourites.has(id);
    if (nowFavourite) store.favourites.add(id);
    else store.favourites.delete(id);
    return ok({ is_favourite: nowFavourite });
  }

  const one = /^\/invoice\/default\/(\d+)$/.exec(path);
  if (one && (method === "PUT" || method === "DELETE")) {
    const id = one[1];
    const index = store.saved.findIndex((t) => String(t.id) === id);
    if (index < 0) {
      return findTemplate(store, id)
        ? fail(method === "PUT" ? "Shared templates can't be changed. Save a copy instead." : "Shared templates can't be deleted.")
        : fail("Template not found");
    }
    if (method === "DELETE") {
      store.saved.splice(index, 1);
      store.favourites.delete(id);
      return ok(null, { message: "Template deleted." });
    }
    saveTemplate(ctx, store, store.saved[index]);
    return ok({ invoice: { id: Number(id) } }, { message: "Template updated." });
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Participants: NDIS number and plan manager on the client's primary contact
 * ------------------------------------------------------------------ */

const FALLBACK_PLAN_MANAGERS = ["ClearPath Plan Management", "Compass Funds Management", "Harbour Plan Managers"];

/** A stable 9-digit provider number for a named plan manager, e.g. 405012345. */
function providerNumber(name: string): string {
  let hash = 7;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  return `4050${String(hash).padStart(5, "0")}`;
}

function planManagerNames(ctx: HandlerCtx): string[] {
  const fromClients = (ctx.seed.clients as any[]).filter((c) => /plan manag/i.test(String(c.name))).map((c) => String(c.name));
  return fromClients.length ? fromClients : FALLBACK_PLAN_MANAGERS;
}

/**
 * What the seed implies for a client's primary contact: a participant (a residential client) gets a
 * 9-digit NDIS number starting 43, and two in three are plan-managed. Organisations get nothing.
 */
function derivedNdis(ctx: HandlerCtx, client: any): Required<ContactNdis> {
  const none = { ndis_no: "", plan_manager_name: "", plan_manager_ndis: "" };
  if (client.kind !== "residential") return none;
  const n = Number(client.id) || 0;
  const ndis_no = `43${String((n * 1000003 + 123457) % 10000000).padStart(7, "0")}`;
  if ((n * 37 + 11) % 3 === 0) return { ...none, ndis_no };
  const managers = planManagerNames(ctx);
  const name = managers[(n * 37 + 11) % managers.length];
  return { ndis_no, plan_manager_name: name, plan_manager_ndis: providerNumber(name) };
}

const ndisFor = (ctx: HandlerCtx, client: any): Required<ContactNdis> => ({
  ...derivedNdis(ctx, client),
  ...(storeFor(ctx.seed).contacts.get(String(client.contactId)) ?? {}),
});

const findClientRecord = (ctx: HandlerCtx, id: string): any =>
  [...(ctx.seed.clients as any[]), ...(ctx.seed.suppliers as any[])].find((c) => String(c.id) === id);

function clientDetail(ctx: HandlerCtx, id: string): HandlerResponse | null {
  const found = findClientRecord(ctx, id);
  if (!found) return null;
  const isClient = (ctx.seed.clients as any[]).includes(found);
  const ndis = isClient ? ndisFor(ctx, found) : { ndis_no: "", plan_manager_name: "", plan_manager_ndis: "" };
  return ok({
    id: Number(found.id),
    business_name: found.name,
    company_type: "business",
    email: found.email,
    city: "city" in found ? found.city : ctx.story.business.address.city,
    country: ctx.cfg.name,
    primary_contact: { id: Number(found.contactId), name: found.contact, email: found.email },
    contacts: [
      {
        id: Number(found.contactId),
        name: found.contact,
        email: found.email,
        is_primary: 1,
        ...ndis,
      },
    ],
  });
}

const PROFILE_COLOURS = ["#2EB6C9", "#7C5CFA", "#F2994A", "#27AE60", "#EB5757", "#2F80ED"];

/** GET /contact/list: the contact picker the invoice and quote editors fill from. */
function contactList(ctx: HandlerCtx): HandlerResponse {
  const suppliers = String(ctx.params.type ?? "1") === "2";
  const list = (suppliers ? ctx.seed.suppliers : ctx.seed.clients) as any[];
  return ok(
    list.map((c) => {
      const ndis = suppliers ? { ndis_no: "" } : { ndis_no: ndisFor(ctx, c).ndis_no };
      return {
        contact_id: Number(c.contactId),
        client_id: Number(c.id),
        name: c.contact,
        email: c.email,
        phone_number: ctx.story.business.phone,
        country_calling_code: ctx.cfg.phoneDialCode,
        profile_color: PROFILE_COLOURS[Number(c.id) % PROFILE_COLOURS.length],
        is_primary: 1,
        ...ndis,
        client: {
          business_name: c.name,
          currency: ctx.seed.business.currency,
          ABN: null,
          address: [c.city, ctx.cfg.name].filter(Boolean).join(", "),
        },
      };
    }),
  );
}

const NDIS_FIELDS = ["ndis_no", "plan_manager_name", "plan_manager_ndis"] as const;

const pickNdis = (fields: Record<string, any>): ContactNdis => {
  const out: ContactNdis = {};
  for (const key of NDIS_FIELDS) if (fields[key] !== undefined && fields[key] !== null) out[key] = String(fields[key]).trim();
  return out;
};

function contactWrite(ctx: HandlerCtx): HandlerResponse | null {
  const { method, path } = ctx;

  // PATCH /contact/:id saving the participant's NDIS number and plan manager.
  const contact = /^\/contact\/(\d+)$/.exec(path);
  if (contact && (method === "PATCH" || method === "PUT")) {
    const fields = ctx.fields();
    const ndis = pickNdis(fields);
    if (!Object.keys(ndis).length) return null;
    // The overlay applies the name and email part; the NDIS part lives here.
    const response = applyOverlayWrite(method, path, fields, ctx.seed, ctx.today, ctx.cfg.taxRate);
    const store = storeFor(ctx.seed);
    store.contacts.set(contact[1], { ...store.contacts.get(contact[1]), ...ndis });
    return (response as HandlerResponse | null) ?? ok({ id: Number(contact[1]) });
  }

  // POST /client creating a participant with their NDIS number on the primary contact.
  if (method === "POST" && path === "/client") {
    const fields = ctx.fields();
    const primary = Array.isArray(fields.contacts) ? fields.contacts[0] : null;
    const ndis = primary ? pickNdis(primary) : {};
    if (!Object.keys(ndis).length) return null;
    const response = applyOverlayWrite(method, path, fields, ctx.seed, ctx.today, ctx.cfg.taxRate);
    if (!response?.data?.success) return response as HandlerResponse | null;
    const contactId = String(response.data.data?.primary_contact ?? "");
    if (contactId) {
      storeFor(ctx.seed).contacts.set(contactId, ndis);
      response.data.data.contacts = [{ id: Number(contactId), contact_id: Number(contactId) }];
    }
    return response as HandlerResponse;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Proposal templates and quote defaults
 * ------------------------------------------------------------------ */

const fill = (text: string, business: string) => text.replace(/\{business\}/g, business);
const paragraphsHtml = (paragraphs: string[]) => paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");

function proposalTemplateRows(ctx: HandlerCtx) {
  const business = ctx.story.business.name;
  return NDIS_PROPOSAL_TEMPLATES.map((spec: NdisProposalTemplateSpec, index) => {
    const id = String(9101 + index);
    const description = fill(spec.description, business);
    return {
      id,
      template_id: id,
      template_name: fill(spec.name, business),
      template_type: spec.type,
      description,
      created_at: spec.created,
      services_count: spec.services?.length ?? 0,
      summary: description,
      spec,
    };
  });
}

function proposalTemplateFull(row: ReturnType<typeof proposalTemplateRows>[number], business: string) {
  const { spec, ...base } = row;
  const full: Record<string, any> = { ...base, updated_at: spec.created };
  const html = paragraphsHtml((spec.paragraphs ?? []).map((p) => fill(p, business)));
  if (spec.type === "PROPOSAL") {
    full.snapshot_data = {
      services: (spec.services ?? []).map((s) => ({
        description: s.description,
        quantity: s.quantity,
        price: s.price,
        discount_percent: 0,
        discount_amount: 0,
        gst_percent: 0,
        gst_amount: 0,
        amount: round2(s.quantity * s.price),
      })),
    };
  } else {
    full.html_content = html;
    if (spec.type === "INTRODUCTION") {
      full.lexical_content = [{ id: `${row.id}-intro`, type: "text", isPrimary: true, editorHtml: html }];
    }
    if (spec.type === "THANK_YOU") {
      full.lexical_content = {
        title: fill(spec.name, business),
        message: (spec.paragraphs ?? []).map((p) => fill(p, business)).join("\n\n"),
        button_label: "",
        button_url: "",
      };
    }
  }
  return full;
}

function proposalTemplates(ctx: HandlerCtx): HandlerResponse {
  const type = ctx.params.template_type;
  const rows = proposalTemplateRows(ctx)
    .filter((row) => !type || row.template_type === type)
    .map((row) => ({ ...row, spec: undefined }));
  return ok(rows);
}

function proposalTemplate(ctx: HandlerCtx, id: string): HandlerResponse | null {
  const row = proposalTemplateRows(ctx).find((r) => r.id === id);
  return row ? ok(proposalTemplateFull(row, ctx.story.business.name)) : null;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export const handle: DemoHandler = (ctx) => {
  // Only the Australian NDIS story. New Zealand (feature off) and every other industry pass through.
  if (ctx.story.business.industry_id !== NDIS_INDUSTRY_ID || !ctx.cfg.features.ndis) return null;
  const { method, path } = ctx;

  if (method === "GET") {
    if (path === "/services/autocomplete") return searchServices(ctx);
    if (path === "/services/all/autocomplete") return searchAllServices(ctx);
    if (path === "/custom-product" && String(ctx.params.active_tab ?? "") === "ndis") return supportCatalogue(ctx);

    if (path === "/invoice/default") return templateGallery(ctx);
    const detail = /^\/invoice\/default\/(\d+)$/.exec(path);
    if (detail) return templateDetail(ctx, detail[1]);
    if (path === "/invoice-default/preview") return templatePreview(ctx);

    if (path === "/contact/list") return contactList(ctx);
    const client = /^\/client\/(\d+)$/.exec(path);
    if (client) return clientDetail(ctx, client[1]);

    if (path === "/proposal/templates") return proposalTemplates(ctx);
    const template = /^\/proposal\/templates\/(\d+)$/.exec(path);
    if (template) return proposalTemplate(ctx, template[1]);

    if (path === "/quote/default") return ok({ notes: NDIS_QUOTE_NOTES, expire_after: 30 });
    return null;
  }

  return templateWrite(ctx) ?? contactWrite(ctx);
};
