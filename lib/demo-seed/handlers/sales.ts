/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like mock-server.ts */
import { fiscalYearFor } from "../country";
import type { DemoHandler, HandlerCtx } from "./types";

/*
 * Invoice and quote statuses, counts and summary tiles.
 *
 * One rule decides what status a document shows, and the tab counts, the list filters and the
 * summary tiles all use it, so they can never disagree:
 *
 *   invoice: draft | due ("Outstanding") | overdue | partially_paid | paid
 *            (an unpaid invoice past its due date is overdue, whatever was stored)
 *   quote:   the app's display status (lib/quotes.ts `quoteDisplayStatus`): billed beats everything
 *            (Converted), a settled answer stays (Accepted / Declined / Draft), and a sent quote is
 *            Expired once past its expiry, Saved if never emailed, else Sent.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const ok = (data: any, extra: Record<string, unknown> = {}) => ({ status: 200, data: { success: true, ...extra, data } });

export function invoiceStatus(inv: any, today: string): string {
  const stored = String(inv.status ?? inv.mark_as ?? "").toLowerCase();
  if (stored === "draft") return "draft";
  if (stored === "paid" || num(inv.remainingAmount) <= 0.005) return stored === "draft" ? "draft" : "paid";
  if (num(inv.paid_amount) > 0.005) return "partially_paid";
  return String(inv.due_date) < today ? "overdue" : "due";
}

export function quoteStatus(q: any, today: string): string {
  if (q.converted && (q.invoice_id != null || q.invoice)) return "converted";
  const stored = String(q.status ?? "sent").toLowerCase();
  if (stored === "draft") return "draft";
  if (stored === "accepted") return "accepted";
  if (stored === "declined" || stored === "rejected") return "declined";
  if (q.expired || (q.valid_till && String(q.valid_till) < today)) return "expired";
  if (q.sent_at === null) return "saved";
  return "sent";
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

function invoiceStats(ctx: HandlerCtx, from: string, to: string) {
  const rows = (ctx.seed.invoices as any[]).filter((i) => inRange(String(i.invoice_date), from, to));
  const status = rows.map((i) => ({ i, s: invoiceStatus(i, ctx.today) }));
  const band = (pred: (s: string) => boolean, amount: (i: any) => number) => {
    const picked = status.filter((x) => pred(x.s));
    return { count: picked.length, part_paid: picked.filter((x) => x.s === "partially_paid").length, amount: round2(picked.reduce((a, x) => a + amount(x.i), 0)) };
  };
  const overdue = status.filter((x) => x.s === "overdue");
  const oldest = overdue.reduce((max, x) => Math.max(max, Math.round((new Date(`${ctx.today}T12:00:00Z`).getTime() - new Date(`${x.i.due_date}T12:00:00Z`).getTime()) / 86400000)), 0);
  return {
    issued: round2(status.filter((x) => x.s !== "draft").reduce((a, x) => a + num(x.i.total), 0)),
    draft_count: status.filter((x) => x.s === "draft").length,
    paid: band((s) => s === "paid" || s === "partially_paid", (i) => num(i.paid_amount)),
    pending: band((s) => s === "due" || s === "partially_paid", (i) => num(i.remainingAmount)),
    overdue: { ...band((s) => s === "overdue", (i) => num(i.remainingAmount)), oldest_days: oldest },
  };
}

function quoteStats(ctx: HandlerCtx, from: string, to: string) {
  const rows = (ctx.seed.quotes as any[]).filter((q) => inRange(String(q.quote_date), from, to));
  const s = rows.map((q) => ({ q, s: quoteStatus(q, ctx.today) }));
  const sum = (list: typeof s) => round2(list.reduce((a, x) => a + num(x.q.total), 0));
  const converted = s.filter((x) => x.s === "converted");
  const open = s.filter((x) => x.s === "sent" || x.s === "saved" || x.s === "accepted");
  const lost = s.filter((x) => x.s === "declined" || x.s === "expired");
  return {
    quoted: round2(sum(converted) + sum(open) + sum(lost)),
    draft_count: s.filter((x) => x.s === "draft").length,
    converted: { count: converted.length, amount: sum(converted) },
    open: { count: open.length, accepted: open.filter((x) => x.s === "accepted").length, amount: sum(open) },
    lost: { count: lost.length, amount: sum(lost) },
  };
}

function periods(ctx: HandlerCtx) {
  const fy = fiscalYearFor(ctx.cfg, ctx.today);
  const monthStart = `${ctx.today.slice(0, 7)}-01`;
  return { year: [fy.startDate, fy.endDate] as const, month: [monthStart, `${ctx.today.slice(0, 7)}-31`] as const };
}

export const handle: DemoHandler = (ctx) => {
  if (ctx.method !== "GET") return null;
  const { path, params, seed, today } = ctx;
  const wantStats = String(params.include_stats ?? "") === "1";

  if (path === "/invoice/invoices/status-counts") {
    const invoices = seed.invoices as any[];
    const count = (s: string) => invoices.filter((i) => invoiceStatus(i, today) === s).length;
    const data: any = { all: invoices.length, draft: count("draft"), due: count("due"), overdue: count("overdue"), partially_paid: count("partially_paid"), paid: count("paid") };
    if (wantStats) {
      const p = periods(ctx);
      data.stats = { year: invoiceStats(ctx, ...p.year), month: invoiceStats(ctx, ...p.month) };
    }
    return ok(data);
  }

  if (path === "/quote/quotes/status-counts" || path === "/quote/status-counts") {
    const quotes = seed.quotes as any[];
    const count = (s: string) => quotes.filter((q) => quoteStatus(q, today) === s).length;
    const data: any = {
      all: quotes.length,
      draft: count("draft"),
      sent: count("sent"),
      saved: count("saved"),
      accepted: count("accepted"),
      converted: count("converted"),
      declined: count("declined"),
      expired: count("expired"),
    };
    if (wantStats) {
      const p = periods(ctx);
      data.stats = { year: quoteStats(ctx, ...p.year), month: quoteStats(ctx, ...p.month) };
    }
    return ok(data);
  }

  if (path === "/quote" || path === "/quote/quotes" || path === "/quote/list") {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Number(params.page_size || params.limit) || 25);
    const wanted = String(params["filter_by[display_status]"] ?? params["filter_by[status]"] ?? params.status ?? "").toLowerCase();
    const search = String(params["filter_by[search]"] ?? params.search ?? "").trim().toLowerCase();
    const sent = params["filter_by[sent_status]"];

    let rows = (seed.quotes as any[]).filter((q) => {
      const s = quoteStatus(q, today);
      if (wanted && wanted !== "all" && s !== wanted) return false;
      if (sent !== undefined && sent !== "" && (String(sent) === "1") !== (q.sent_at !== null)) return false;
      if (search && !(String(q.quote_no).toLowerCase().includes(search) || String(q.client?.name ?? "").toLowerCase().includes(search) || String(q.description ?? "").toLowerCase().includes(search))) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => String(b.quote_date).localeCompare(String(a.quote_date)) || num(b.quote_id) - num(a.quote_id));
    const start = (page - 1) * pageSize;
    return ok({ quote_details: rows.slice(start, start + pageSize).map((q) => ({ ...q, display_status: quoteStatus(q, today) })), total: rows.length });
  }
  return null;
};
