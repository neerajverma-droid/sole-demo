import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { INDUSTRY_CATALOG } from "@/lib/demo-seed/industries/catalog";
import { getSeedData, handleMockRequest } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { normalizePlannerStage, normalizePlannerTask, rowsFromPayload } from "@/lib/task-planner";

/* eslint-disable @typescript-eslint/no-explicit-any */
const get = (path: string, params: Record<string, any> = {}) => handleMockRequest("GET", path, params)!;
const login = (industry: string, country: "AU" | "NZ") => handleMockRequest("POST", "/demo/login", {}, { industry, country });
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  endDemoSession();
  __resetSessionForTests();
});
afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

const SAMPLE: [string, "AU" | "NZ"][] = [
  ["plumbing", "AU"],
  ["hairdressers", "NZ"],
  ["ndis", "AU"],
  ["hospitality", "NZ"],
  ["consulting", "AU"],
];

describe("invoice statuses and counts agree", () => {
  for (const [industry, country] of SAMPLE) {
    it(`${industry} / ${country}`, () => {
      login(industry, country);
      const c = get("/invoice/invoices/status-counts").data.data;
      expect(c.draft + c.due + c.overdue + c.partially_paid + c.paid).toBe(c.all);
      for (const status of ["draft", "due", "overdue", "partially_paid", "paid"]) {
        const listed = get("/invoice/invoices", { "filter_by[status]": status, page_size: 500 }).data.data;
        expect(listed.total, status).toBe(c[status === "due" ? "due" : status]);
      }
      // Every status has some invoices, and none contradicts its dates or its money.
      expect(c.paid).toBeGreaterThan(0);
      expect(c.overdue).toBeGreaterThan(0);
      expect(c.partially_paid).toBeGreaterThan(0);
      for (const inv of getSeedData().invoices as any[]) {
        if (inv.status === "due") expect(inv.due_date >= today(), inv.invoice_no).toBe(true);
        if (inv.status === "overdue") expect(inv.due_date < today(), inv.invoice_no).toBe(true);
        if (inv.status === "paid") expect(inv.remainingAmount).toBe(0);
        if (inv.status === "partially_paid") {
          expect(inv.paid_amount).toBeGreaterThan(0);
          expect(inv.remainingAmount).toBeGreaterThan(0);
          expect(Number((inv.paid_amount + inv.remainingAmount).toFixed(2))).toBe(inv.total);
        }
      }
    });
  }

  it("the summary tiles add up from the same invoices", () => {
    login("plumbing", "AU");
    const stats = get("/invoice/invoices/status-counts", { include_stats: 1 }).data.data.stats;
    expect(stats.year.paid.amount).toBeGreaterThan(0);
    expect(stats.year.pending.count).toBeGreaterThan(0);
    expect(stats.year.overdue.count).toBeGreaterThan(0);
    expect(stats.year.overdue.oldest_days).toBeGreaterThan(0);
    expect(stats.year.issued).toBeGreaterThan(stats.year.paid.amount);
  });

  it("a new invoice moves the counts", () => {
    login("plumbing", "AU");
    const before = get("/invoice/invoices/status-counts").data.data;
    const client = get("/client/v2", { type: "1" }).data.data[0];
    handleMockRequest("POST", "/invoice/add", {}, JSON.stringify(buildEncryptedRequestBody({ invoice_no: "INV-X1", client_id: client.id, invoice_date: today(), due_date: "2099-01-01", total: 115, sub_total: 100, total_gst: 10, item: [{ description: "x", price: 100, qty: 1, gst: true }] })));
    const after = get("/invoice/invoices/status-counts").data.data;
    expect(after.all).toBe(before.all + 1);
    expect(after.due).toBe(before.due + 1);
  });
});

describe("quote statuses and counts agree", () => {
  for (const [industry, country] of SAMPLE) {
    it(`${industry} / ${country}`, () => {
      login(industry, country);
      const c = get("/quote/quotes/status-counts").data.data;
      const states = ["draft", "sent", "saved", "accepted", "converted", "declined", "expired"];
      expect(states.reduce((n, s) => n + c[s], 0)).toBe(c.all);
      for (const s of states) {
        expect(c[s], s).toBeGreaterThan(0);
        // The list filters by the display status, exactly as the app asks.
        const listed = get("/quote/quotes", { "filter_by[display_status]": s, page_size: 500 }).data.data;
        expect(listed.total, s).toBe(c[s]);
        expect(listed.quote_details.every((q: any) => q.display_status === s)).toBe(true);
      }
    });
  }

  it("converted quotes point at a real invoice for the same client; expired and saved ones say why", () => {
    login("cleaning", "AU");
    const seed = getSeedData();
    const converted = (seed.quotes as any[]).filter((q) => q.converted === 1);
    expect(converted.length).toBeGreaterThan(0);
    for (const q of converted) {
      const invoice = (seed.invoices as any[]).find((i) => i.invoice_id === q.invoice_id);
      expect(invoice, q.quote_no).toBeDefined();
      expect(invoice.client_id).toBe(q.client_id);
      expect(q.invoice.invoice_no).toBe(invoice.invoice_no);
      expect(q.total).toBe(invoice.total);
    }
    for (const q of (seed.quotes as any[]).filter((x) => x.expired)) expect(q.valid_till < today()).toBe(true);
    for (const q of (seed.quotes as any[]).filter((x) => x.status === "sent" && !x.expired)) expect(q.valid_till >= today()).toBe(true);
  });

  it("search and the summary tiles work; a saved quote is sent", () => {
    login("hairdressers", "NZ");
    const first = (getSeedData().quotes as any[])[0];
    const found = get("/quote/quotes", { "filter_by[search]": first.quote_no }).data.data;
    expect(found.total).toBe(1);
    const stats = get("/quote/quotes/status-counts", { include_stats: 1 }).data.data.stats;
    expect(stats.year.converted.count).toBeGreaterThan(0);
    expect(stats.year.open.count).toBeGreaterThan(0);
    expect(stats.year.lost.count).toBeGreaterThan(0);

    const client = get("/client/v2", { type: "1" }).data.data[0];
    const before = get("/quote/quotes/status-counts").data.data;
    handleMockRequest("POST", "/v2/quote", {}, JSON.stringify(buildEncryptedRequestBody({ quote_no: "Q-X1", client_id: client.id, quote_date: today(), valid_till: "2099-01-01", total: 115, sub_total: 100, total_gst: 15, item: [{ description: "x", price: 100, qty: 1, gst: true }] })));
    const after = get("/quote/quotes/status-counts").data.data;
    expect(after.all).toBe(before.all + 1);
    expect(after.sent).toBe(before.sent + 1);
  });
});

describe("planner", () => {
  const board = () => (get("/planner").data.data as any[]).map((s) => ({ ...s, cards: rowsFromPayload<any>(s.cards) }));

  for (const [industry, country] of SAMPLE) {
    it(`${industry} / ${country}: a populated board in the shape the app reads`, () => {
      login(industry, country);
      const stages = board();
      expect(stages.map((s) => normalizePlannerStage(s, 0).name)).toEqual(["To Do", "In Progress", "Review / Testing", "Invoiced"]);
      for (const s of stages) expect(s.cards.length, s.name).toBeGreaterThan(0);
      const tasks = stages.flatMap((s) => s.cards.map((c: any, i: number) => normalizePlannerTask(c, s.id, i)));
      for (const t of tasks) {
        expect(t.task_name).toBeTruthy();
        expect(t.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        if (t.is_billable) expect(t.client?.label).toBeTruthy();
      }
      expect(tasks.some((t) => t.is_billable)).toBe(true);
      expect(tasks.some((t) => t.project_name)).toBe(true);
    });
  }

  it("filters, sorting, paging and the list view", () => {
    login("plumbing", "AU");
    const all = get("/planner/tasks", { page: 1, limit: 100 }).data.data;
    expect(all.pagination.total).toBeGreaterThanOrEqual(18);
    const overdue = get("/planner/tasks", { overdue: "true", limit: 100 }).data.data;
    expect(overdue.rows.length).toBeGreaterThan(0);
    expect(overdue.rows.every((r: any) => r.stage_id !== "4" && r.end_time.slice(0, 10) < today())).toBe(true);
    const billable = get("/planner/tasks", { billable: "true", limit: 100 }).data.data;
    expect(billable.rows.every((r: any) => r.is_billable)).toBe(true);
    const byClient = get("/planner/tasks", { "client_id[]": all.rows[2].client.id, limit: 100 }).data.data;
    expect(byClient.rows.every((r: any) => r.client.id === all.rows[2].client.id)).toBe(true);
    const page2 = get("/planner/tasks", { page: 2, limit: 5 }).data.data;
    expect(page2.rows).toHaveLength(5);
    const high = get("/planner/tasks", { sortBy: "priority", limit: 3 }).data.data;
    expect(high.rows.every((r: any) => r.priority === "high")).toBe(true);
    expect(rowsFromPayload(get("/planner/stage/1", { cursor: "8" }).data.data)).toBeDefined();
    const search = get("/planner/tasks", { search: all.rows[0].client.label.split(" ")[0], limit: 100 }).data.data;
    expect(search.rows.length).toBeGreaterThan(0);
  });

  it("moving a card and bulk-moving to the final stage change the board and the calendar", () => {
    login("plumbing", "AU");
    const todo = board()[0].cards;
    const card = todo[0];
    handleMockRequest("PUT", `/calendar/${card.event_id}`, {}, JSON.stringify(buildEncryptedRequestBody({ stage_id: 2 })));
    expect(board()[1].cards.some((c: any) => c.event_id === card.event_id)).toBe(true);
    expect(board()[0].cards.some((c: any) => c.event_id === card.event_id)).toBe(false);

    const ids = board()[1].cards.slice(0, 2).map((c: any) => c.event_id);
    handleMockRequest("POST", "/planner/tasks/bulk-move-final", {}, JSON.stringify(buildEncryptedRequestBody({ event_ids: ids })));
    const done = board()[3].cards.map((c: any) => c.event_id);
    for (const id of ids) expect(done).toContain(id);
  });

  it("a stage endpoint answers for every industry", () => {
    for (const entry of INDUSTRY_CATALOG) {
      login(entry.slug, "NZ");
      expect(board().every((s) => s.cards.length > 0), entry.slug).toBe(true);
    }
  });
});
