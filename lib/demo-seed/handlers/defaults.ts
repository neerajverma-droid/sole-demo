/* eslint-disable @typescript-eslint/no-explicit-any */
import { DEFAULT_SUPPLIERS, type DefaultSupplier } from "../default-suppliers";
import type { DemoCountry } from "../industries/types";
import type { DemoHandler } from "./types";

/*
 * Default (global) suppliers: Contacts -> Default tab.
 *
 * In the live app these are real rows owned by no account (user_id = 0), the same ~60
 * well-known brands for everyone, read-only. They are served for `filter_by[scope]=default`
 * and a detail read of one of them. New Zealand swaps the Australia-only names for local
 * equivalents.
 */

const DEFAULT_ID_BASE = 90000;
const NOTE = "Default global supplier — visible to all users.";

const AU_ONLY = new Set([
  "ATO",
  "Transport for NSW (Opal)",
  "Service NSW",
  "VicRoads",
  "Synergy",
  "Belong",
  "Humm",
  "Virgin Australia",
  "Jetstar",
  "Priceline Pharmacy",
  "Guzman y Gomez",
  "Hungry Jack's",
  "Bakers Delight",
  "Budget Direct Insurance",
  "AAMI Insurance",
  "Optus",
  "IGA",
  "Caltex/Ampol",
  "Qantas",
]);

const NZ_EXTRAS: DefaultSupplier[] = [
  { name: "Inland Revenue", email: "support@ird.govt.nz", website: "https://www.ird.govt.nz" },
  { name: "Spark", email: "support@spark.co.nz", website: "https://www.spark.co.nz" },
  { name: "One NZ", email: "support@one.nz", website: "https://one.nz" },
  { name: "Z Energy", email: "support@z.co.nz", website: "https://z.co.nz" },
  { name: "Mitre 10", email: "support@mitre10.co.nz", website: "https://www.mitre10.co.nz" },
  { name: "The Warehouse", email: "support@thewarehouse.co.nz", website: "https://www.thewarehouse.co.nz" },
  { name: "Air New Zealand", email: "support@airnz.co.nz", website: "https://www.airnewzealand.co.nz" },
  { name: "PAK'nSAVE", email: "support@paknsave.co.nz", website: "https://www.paknsave.co.nz" },
  { name: "New World", email: "support@newworld.co.nz", website: "https://www.newworld.co.nz" },
  { name: "NZ Transport Agency", email: "support@nzta.govt.nz", website: "https://www.nzta.govt.nz" },
  { name: "Briscoes", email: "support@briscoes.co.nz", website: "https://www.briscoes.co.nz" },
  { name: "Trade Me", email: "support@trademe.co.nz", website: "https://www.trademe.co.nz" },
];

const listFor = (country: DemoCountry): DefaultSupplier[] =>
  country === "AU"
    ? DEFAULT_SUPPLIERS
    : [...DEFAULT_SUPPLIERS.filter((s) => !AU_ONLY.has(s.name)), ...NZ_EXTRAS].sort((a, b) => a.name.localeCompare(b.name));

const asRow = (s: DefaultSupplier, index: number) => ({
  id: String(DEFAULT_ID_BASE + index),
  business_name: s.name,
  email: s.email,
  type: "Supplier",
  notes: NOTE,
  created_at: "01-01-2026",
  primary_contact: {
    name: "Customer Support",
    email: s.email,
    profile_color: "#2EB6C9",
    phone_number: null,
    country_calling_code: null,
  },
  address_line1: null,
  city: null,
  state: null,
  postcode: null,
  country: null,
});

const PROFILE_COLOURS = ["#2EB6C9", "#7C5CFA", "#F2994A", "#27AE60", "#EB5757", "#2F80ED"];

/** GET /contact/list: one row per person; the picker the invoice, quote and calendar editors fill from. */
const contactList: DemoHandler = (ctx) => {
  const suppliers = String(ctx.params.type ?? "1") === "2";
  const clientId = String(ctx.params.client_id ?? "");
  const search = String(ctx.params.search ?? ctx.params.searchQuery ?? "").trim().toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = (suppliers ? ctx.seed.suppliers : ctx.seed.clients) as any[];
  const rows = source
    .filter((c) => !clientId || String(c.id) === clientId)
    .filter((c) => !search || String(c.contact).toLowerCase().includes(search) || String(c.name).toLowerCase().includes(search) || String(c.email).toLowerCase().includes(search))
    .map((c) => ({
      contact_id: Number(c.contactId),
      client_id: Number(c.id),
      name: c.contact,
      email: c.email,
      phone_number: ctx.story.business.phone,
      country_calling_code: ctx.cfg.phoneDialCode,
      profile_color: PROFILE_COLOURS[Number(c.id) % PROFILE_COLOURS.length],
      is_primary: 1,
      client: {
        business_name: c.name,
        currency: ctx.cfg.currency,
        ABN: null,
        address: [c.city, ctx.cfg.name].filter(Boolean).join(", "),
      },
    }));
  return { status: 200, data: { success: true, data: rows } };
};

/** The next number in a document sequence: the highest trailing number used, plus one, with its prefix. */
function nextNumber(rows: any[], key: string, prefix: string): string {
  const highest = rows.reduce((max, row) => {
    const n = Number(String(row?.[key] ?? "").match(/(\d+)\s*$/)?.[1]);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  return `${prefix}${highest + 1}`;
}

export const handle: DemoHandler = (ctx) => {
  if (ctx.method !== "GET") return null;
  if (ctx.path === "/contact/list") return contactList(ctx);

  // The editors ask the server for the next number rather than guessing one.
  if (ctx.path === "/invoice/invoice-no") {
    const no = nextNumber(ctx.seed.invoices as any[], "invoice_no", "INV-");
    return { status: 200, data: { success: true, data: { no, note: (ctx.seed.invoices as any[])[0]?.notes ?? "", count: ctx.seed.invoices.length } } };
  }
  if (ctx.path === "/v2/quote-no") {
    const no = nextNumber(ctx.seed.quotes as any[], "quote_no", "Q-");
    return { status: 200, data: { success: true, quote_no: no, data: { no, quote_no: no, note: "This quote is valid for 30 days." } } };
  }
  if (ctx.path === "/invoice/invoice-no/check" || ctx.path === "/v2/invoice-no/check") {
    const wanted = String(ctx.params.invoice_no ?? "").trim().toLowerCase();
    const exclude = String(ctx.params.exclude_id ?? "");
    const exists = Boolean(wanted) && (ctx.seed.invoices as any[]).some((i) => String(i.invoice_no).toLowerCase() === wanted && String(i.invoice_id) !== exclude);
    return { status: 200, data: { success: true, is_unique: !exists, data: { exists, is_unique: !exists } } };
  }
  if (ctx.path === "/v2/settings/get-seq-numbers") {
    const inv = nextNumber(ctx.seed.invoices as any[], "invoice_no", "INV-");
    const quo = nextNumber(ctx.seed.quotes as any[], "quote_no", "Q-");
    return {
      status: 200,
      data: { success: true, data: { invoice_prefix: "INV-", invoice_next_number: Number(inv.replace(/\D/g, "")), quote_prefix: "Q-", quote_next_number: Number(quo.replace(/\D/g, "")) } },
    };
  }
  const list = listFor(ctx.story.country);

  if (ctx.path === "/client/v2" || ctx.path === "/client") {
    if (ctx.params["filter_by[scope]"] !== "default") return null;
    const page = Math.max(1, Number(ctx.params.page) || 1);
    const limit = Math.max(1, Number(ctx.params.limit) || 25);
    const search = String(ctx.params.searchQuery ?? "").trim().toLowerCase();

    const rows = list
      .map((s, i) => asRow(s, i))
      .filter((r) => !search || r.business_name.toLowerCase().includes(search) || r.email.toLowerCase().includes(search));
    const start = (page - 1) * limit;
    const totalPages = Math.max(1, Math.ceil(rows.length / limit));
    return {
      status: 200,
      data: {
        success: true,
        data: rows.slice(start, start + limit),
        meta: {
          all: ctx.seed.clients.length + ctx.seed.suppliers.length,
          total_clients: ctx.seed.clients.length,
          total_suppliers: ctx.seed.suppliers.length,
        },
        pagination: { total: rows.length, page, limit, total_pages: totalPages, is_next: page < totalPages, is_prev: page > 1 },
      },
    };
  }

  const detail = /^\/client\/(\d+)$/.exec(ctx.path);
  if (detail) {
    const index = Number(detail[1]) - DEFAULT_ID_BASE;
    const supplier = list[index];
    if (index < 0 || !supplier) return null;
    const row = asRow(supplier, index);
    return {
      status: 200,
      data: {
        success: true,
        data: {
          id: Number(row.id),
          business_name: supplier.name,
          company_type: "business",
          email: supplier.email,
          website: supplier.website,
          notes: NOTE,
          primary_contact: { id: Number(row.id), name: "Customer Support", email: supplier.email },
          contacts: [{ id: Number(row.id), name: "Customer Support", email: supplier.email, is_primary: 1 }],
        },
      },
    };
  }
  return null;
};
