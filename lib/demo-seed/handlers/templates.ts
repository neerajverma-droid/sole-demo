/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like mock-server.ts */
import { renderInvoiceHtml, renderQuoteHtml, previewErrorHtml } from "../doc-templates/render";
import type { DemoHandler, HandlerCtx, HandlerResponse } from "./types";

/*
 * Default invoice and quote templates ("Start from a template") for every industry.
 *
 * In the live app these are shared rows (user_id 0) per industry. Here each industry gets 8 of
 * each, built from its own price list so they read like that trade's real jobs. NDIS businesses
 * have their own set (ndis.ts, which is consulted first).
 */

const INVOICE_BASE_ID = 7000;
const QUOTE_BASE_ID = 7500;
const round2 = (n: number) => Math.round(n * 100) / 100;
const ok = (data: any, extra: Record<string, unknown> = {}): HandlerResponse => ({ status: 200, data: { success: true, ...extra, data } });
const fail = (message: string): HandlerResponse => ({ status: 200, data: { success: false, message, data: null } });

interface Item {
  description: string;
  qty: number;
  price: number;
  qty_type: string;
  disc_criteria: "percent";
  discount_percentage: number;
  discount_amount: number;
  gst: boolean;
  gst_percentage: number;
  gst_amount: number;
  item_support_no: string;
  claim_type: string;
  date: null;
  amount: number;
  total: number;
}

interface Template {
  id: number;
  module: "invoice" | "quote";
  category: string;
  description: string;
  notes: string;
  paymentTerm: number;
  popular: boolean;
  recentlyUsed: boolean;
  shared: boolean;
  items: Item[];
}

interface Store {
  built?: Template[];
  mine: Template[];
  favourites: Set<string>;
  nextId: number;
}
const stores = new WeakMap<object, Store>();
const storeFor = (seed: object): Store => {
  let s = stores.get(seed);
  if (!s) stores.set(seed, (s = { mine: [], favourites: new Set(), nextId: 7900 }));
  return s;
};

function lineFor(ctx: HandlerCtx, service: { name: string; price: number; unit: string }, qty: number): Item {
  const rate = ctx.cfg.taxRate;
  const net = round2(service.price * qty);
  const gst = round2((net * rate) / 100);
  return {
    description: service.name,
    qty,
    price: service.price,
    qty_type: service.unit,
    disc_criteria: "percent",
    discount_percentage: 0,
    discount_amount: 0,
    gst: true,
    gst_percentage: rate,
    gst_amount: gst,
    item_support_no: "",
    claim_type: "",
    date: null,
    amount: net,
    total: round2(net + gst),
  };
}

const qtyFor = (unit: string, i: number) => (unit === "hours" ? 2 + (i % 3) : unit === "days" ? 1 + (i % 2) : 1 + (i % 3));

function build(ctx: HandlerCtx): Template[] {
  const services = ctx.story.services;
  const out: Template[] = [];
  const names = ["Standard", "Repeat customer", "Quick job", "Full service", "Deposit and balance", "Monthly", "Rush", "Package"];
  (["invoice", "quote"] as const).forEach((module) => {
    for (let i = 0; i < 8; i++) {
      const main = services[i % services.length];
      const extra = services[(i * 2 + 3) % services.length];
      const items = [lineFor(ctx, main, qtyFor(main.unit, i))];
      if (extra.name !== main.name) items.push(lineFor(ctx, extra, qtyFor(extra.unit, i + 1)));
      if (i % 3 === 0 && services[(i + 5) % services.length].name !== main.name) items.push(lineFor(ctx, services[(i + 5) % services.length], 1));
      out.push({
        id: (module === "invoice" ? INVOICE_BASE_ID : QUOTE_BASE_ID) + i,
        module,
        category: `${main.name} — ${names[i]}`,
        description: `${names[i]} ${module} for ${main.name.toLowerCase()}${items.length > 1 ? ` with ${extra.name.toLowerCase()}` : ""}.`,
        notes: module === "invoice" ? `Thanks for choosing ${ctx.story.business.name}. Payment is due within the terms shown.` : "This quote is valid for 30 days.",
        paymentTerm: module === "invoice" ? [7, 14, 14, 30][i % 4] : 30,
        popular: i < 2,
        recentlyUsed: i === 0,
        shared: true,
        items,
      });
    }
  });
  return out;
}

const all = (ctx: HandlerCtx): Template[] => {
  const s = storeFor(ctx.seed);
  s.built ??= build(ctx);
  return [...[...s.mine].reverse(), ...s.built];
};
const total = (items: Item[]) => round2(items.reduce((a, i) => a + i.total, 0));
const sub = (items: Item[]) => round2(items.reduce((a, i) => a + i.amount, 0));

function row(ctx: HandlerCtx, t: Template) {
  return {
    id: t.id,
    user_id: t.shared ? 0 : 1,
    industry_id: ctx.story.business.industry_id,
    category: t.category,
    description: t.description,
    type: "general",
    module: t.module,
    is_default: false,
    template_scope: "industry",
    template_scope_label: ctx.story.label,
    is_favourite: storeFor(ctx.seed).favourites.has(String(t.id)),
    popular: t.popular,
    recently_used: t.recentlyUsed,
    item_count: t.items.length,
    sub_total: sub(t.items),
    total: total(t.items),
    currency_code: ctx.cfg.currency,
  };
}

function preview(ctx: HandlerCtx, t: Template | undefined): HandlerResponse {
  if (!t) return ok(previewErrorHtml("Template not found."));
  const seedClient: any = ctx.seed.clients[0];
  const due = new Date(`${ctx.today}T12:00:00Z`);
  due.setUTCDate(due.getUTCDate() + t.paymentTerm);
  const record: any = {
    invoice_id: 0,
    quote_id: 0,
    invoice_no: t.module === "invoice" ? "INV-0000" : undefined,
    quote_no: t.module === "quote" ? "Q-0000" : undefined,
    invoice_date: ctx.today,
    quote_date: ctx.today,
    due_date: due.toISOString().slice(0, 10),
    valid_till: due.toISOString().slice(0, 10),
    status: "draft",
    sub_total: sub(t.items),
    tax_amount: round2(total(t.items) - sub(t.items)),
    total: total(t.items),
    client: { client_id: 0, name: seedClient?.name ?? "Sample Client", email: seedClient?.email ?? "client@example.com", city: seedClient?.city, country: ctx.cfg.name },
    selected_contact: [{ id: 0, name: seedClient?.contact ?? "Sample Contact", email: seedClient?.email ?? "", is_primary: 1 }],
    items: t.items.map((i) => ({ ...i, price: i.price, qty: i.qty })),
    notes: t.notes,
    description: t.description,
  };
  try {
    const opts = { story: ctx.story, cfg: ctx.cfg, seed: ctx.seed, today: ctx.today, record };
    return ok(t.module === "quote" ? renderQuoteHtml(opts) : renderInvoiceHtml(opts));
  } catch {
    return ok(previewErrorHtml("This preview couldn't be drawn."));
  }
}

export const handle: DemoHandler = (ctx) => {
  const { method, path } = ctx;
  const s = storeFor(ctx.seed);

  if (method === "GET") {
    if (path === "/invoice/default") {
      const quote = String(ctx.params.module ?? "") === "quote" || String(ctx.params.is_quote ?? "") === "true";
      const rows = all(ctx).filter((t) => t.module === (quote ? "quote" : "invoice"));
      const limit = Math.max(1, Number(ctx.params.limit ?? ctx.params.page_size) || 100);
      const page = Math.max(1, Number(ctx.params.page) || 1);
      return ok(
        {
          invoices: rows.slice((page - 1) * limit, page * limit).map((t) => row(ctx, t)),
          pagination: { currentPage: page, totalPages: Math.ceil(rows.length / limit), totalItems: rows.length, itemsPerPage: limit },
        },
      );
    }
    const detail = /^\/invoice\/default\/(\d+)$/.exec(path);
    if (detail) {
      const t = all(ctx).find((x) => String(x.id) === detail[1]);
      if (!t) return fail("Template not found");
      return ok({
        is_deposit: 0,
        id: t.id,
        user_id: t.shared ? 0 : 1,
        industry_id: ctx.story.business.industry_id,
        type: "invoice",
        template_type: "general",
        module: t.module,
        category: t.category,
        description: t.description,
        notes: t.notes,
        extra_discount: 0,
        payment_term: t.paymentTerm,
        client_id: 0,
        client: null,
        sub_total: sub(t.items),
        total: total(t.items),
        total_gst: round2(total(t.items) - sub(t.items)),
        currency_code: ctx.cfg.currency,
        invoice_item: t.items,
      });
    }
    if (path === "/invoice-default/preview") {
      return preview(ctx, all(ctx).find((x) => String(x.id) === String(ctx.params.invoiceId ?? "")));
    }
    return null;
  }

  const favourite = /^\/invoice\/default\/(\d+)\/favourite$/.exec(path);
  if (method === "POST" && favourite) {
    const id = favourite[1];
    if (!all(ctx).some((t) => String(t.id) === id)) return fail("Template not found");
    const now = !s.favourites.has(id);
    if (now) s.favourites.add(id);
    else s.favourites.delete(id);
    return ok({ is_favourite: now });
  }
  return null;
};
