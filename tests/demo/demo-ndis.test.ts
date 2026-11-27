/* eslint-disable @typescript-eslint/no-explicit-any -- reads loosely typed mock API payloads */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildStory } from "@/lib/demo-seed/build-story";
import { getCountryConfig } from "@/lib/demo-seed/country";
import { generateSeedData } from "@/lib/demo-seed/generator";
import { handle as ndisHandler } from "@/lib/demo-seed/handlers/ndis";
import type { HandlerCtx } from "@/lib/demo-seed/handlers/types";
import { NDIS_SUPPORT_ITEMS } from "@/lib/demo-seed/ndis-data";
import { getSeedData, handleMockRequest } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";

afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

function startVisit(industry: string, country: "AU" | "NZ") {
  const res = handleMockRequest("POST", "/demo/login", {}, { industry, country });
  expect(res?.data.success).toBe(true);
}

const get = (path: string, params: Record<string, unknown> = {}) => handleMockRequest("GET", path, params)?.data;

/** Calls the NDIS handler directly, without the generic mock behind it. */
function direct(industry: string, country: "AU" | "NZ", path: string, params: Record<string, unknown> = {}) {
  const story = buildStory(industry, country);
  const ctx: HandlerCtx = {
    method: "GET",
    path,
    params,
    fields: () => ({}),
    seed: generateSeedData(story),
    story,
    cfg: getCountryConfig(country),
    today: "2026-11-27",
  };
  return ndisHandler(ctx);
}

describe("NDIS catalogue data", () => {
  it("is a realistic catalogue: unique numbers, three tiers, the 2026-27 schedule", () => {
    expect(NDIS_SUPPORT_ITEMS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(NDIS_SUPPORT_ITEMS.map((i) => i.number)).size).toBe(NDIS_SUPPORT_ITEMS.length);
    const categories = new Set(NDIS_SUPPORT_ITEMS.map((i) => i.supportCategoryNumber));
    for (const n of [1, 2, 3, 4, 7, 14, 15]) expect(categories.has(n)).toBe(true);
    for (const item of NDIS_SUPPORT_ITEMS.filter((i) => i.type === "Price Limited Supports" && i.unit === "Hour")) {
      expect(item.priceNational!).toBeLessThan(item.priceRemote!);
      expect(item.priceRemote!).toBeLessThan(item.priceVeryRemote!);
    }
  });
});

describe("NDIS line-item search (GET /services/autocomplete)", () => {
  beforeEach(() => startVisit("ndis", "AU"));

  it("finds supports by name and answers a bare array with the three price tiers", () => {
    const rows = get("/services/autocomplete", { query: "Self-Care Activities - Standard - Weekday Daytime", page: 1, limit: 10, txnType: "Credit" });
    expect(Array.isArray(rows)).toBe(true);
    const item = rows.find((r: any) => r.support_item_number === "01_011_0107_1_1");
    expect(item).toMatchObject({
      support_item_name: "Assistance With Self-Care Activities - Standard - Weekday Daytime",
      price_national: 73.58,
      price_remote: 103.01,
      price_very_remote: 110.37,
      unit: "Hour",
      qty_type: "hours",
      claim_type: "Weekday Daytime",
      type: "Price Limited Supports",
      price_schedule: "2026-27",
      price_effective_from: "2026-07-01",
      is_legacy: false,
      end_date: null,
    });
  });

  it("finds supports by number, with an exact number first", () => {
    const exact = get("/services/autocomplete", { query: "01_011_0107_1_1" });
    expect(exact[0].support_item_number).toBe("01_011_0107_1_1");
    const prefix = get("/services/autocomplete", { query: "15_617", limit: 30 });
    expect(prefix.length).toBeGreaterThan(3);
    expect(prefix.every((r: any) => r.support_item_number.includes("15_617"))).toBe(true);
  });

  it("respects the limit", () => {
    const three = get("/services/autocomplete", { query: "support", limit: 3 }).filter((r: any) => r.support_item_number);
    expect(three).toHaveLength(3);
    const capped = get("/services/autocomplete", { query: "a", limit: 500 }).filter((r: any) => r.support_item_number);
    expect(capped.length).toBeLessThanOrEqual(30);
  });

  it("maps claim-type variants and units the frontend understands", () => {
    const rows = get("/services/autocomplete", { query: "Occupational Therapist", limit: 30 });
    const claims = rows.map((r: any) => r.claim_type);
    for (const claim of ["Cancellation", "Provider Travel", "NDIA Requested Reports", "Telehealth", "Non-Face-to-Face"]) {
      expect(claims).toContain(claim);
    }
    const monthly = get("/services/autocomplete", { query: "Plan Management - Monthly" })[0];
    expect(monthly).toMatchObject({ unit: "Month", qty_type: "months" });
  });

  it("follows the catalogue rows with the business's own NDIS products", () => {
    const rows = get("/services/autocomplete", { query: "Support coordination", limit: 10 });
    const firstOwn = rows.findIndex((r: any) => r.support_item_number === "");
    expect(firstOwn).toBeGreaterThan(0);
    expect(rows.slice(firstOwn).every((r: any) => r.support_item_number === "")).toBe(true);
    expect(rows[firstOwn]).toMatchObject({
      support_item_name: "Support coordination",
      gst: false,
      description: "",
      price: 100.14,
      inventory_flag: 0,
      inventory_count: 0,
    });
  });

  it("an empty query offers only the business's own products", () => {
    const rows = get("/services/autocomplete", { query: "" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => r.support_item_number === "")).toBe(true);
  });

  it("keeps a legacy item until its end date and drops one past it", () => {
    const meals = get("/services/autocomplete", { query: "Preparation And Delivery Of Meals" })[0];
    expect(meals).toMatchObject({ is_legacy: true, end_date: "2027-09-30", price_national: null, price_remote: null });
    expect(get("/services/autocomplete", { query: "14_031_0127_8_3" }).filter((r: any) => r.support_item_number)).toHaveLength(0);
  });

  it("the general dictionary answers a bare array too", () => {
    const rows = get("/services/all/autocomplete", { query: "Personal care", limit: 10, exclude_ndis: 1 });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toMatchObject({ item_name: "Personal care" });
  });
});

describe("NDIS price-guide catalogue (GET /custom-product?active_tab=ndis)", () => {
  beforeEach(() => startVisit("ndis", "AU"));

  it("lists the catalogue in pages, without legacy items", () => {
    const first = get("/custom-product", { active_tab: "ndis", page: 1, limit: 10 });
    expect(first.success).toBe(true);
    expect(first.data).toHaveLength(10);
    expect(first.data[0]).toEqual({
      id: expect.any(Number),
      support_item_number: expect.any(String),
      support_item_name: expect.any(String),
      registration_group_number: expect.any(Number),
      registration_group_name: expect.any(String),
      support_category_number: expect.any(Number),
      support_category_name: expect.any(String),
      type: expect.any(String),
    });
    const total = first.pagination.total;
    expect(total).toBe(NDIS_SUPPORT_ITEMS.filter((i) => !i.isLegacy).length);
    expect(first.pagination.total_pages).toBe(Math.ceil(total / 10));

    const second = get("/custom-product", { active_tab: "ndis", page: 2, limit: 10 });
    expect(second.data[0].id).not.toBe(first.data[0].id);
    const everything = get("/custom-product", { active_tab: "ndis", limit: 1000 });
    expect(everything.data).toHaveLength(total);
    expect(everything.data.some((r: any) => r.support_item_number === "14_031_0127_8_3")).toBe(false);
  });

  it("filters by search, registration group name and support category number", () => {
    const search = get("/custom-product", { active_tab: "ndis", search_query: "sleepover", limit: 50 });
    expect(search.data.length).toBeGreaterThan(0);
    expect(search.data.every((r: any) => /sleepover/i.test(r.support_item_name))).toBe(true);

    const group = get("/custom-product", { active_tab: "ndis", registration_group: "Therapeutic Supports", limit: 100 });
    expect(group.data.length).toBeGreaterThan(5);
    expect(group.data.every((r: any) => r.registration_group_name === "Therapeutic Supports")).toBe(true);

    const category = get("/custom-product", { active_tab: "ndis", support_category: "7", limit: 100 });
    expect(category.data.length).toBeGreaterThan(2);
    expect(category.data.every((r: any) => r.support_category_number === 7)).toBe(true);

    const both = get("/custom-product", { active_tab: "ndis", support_category: "7,14", registration_group: "Support Coordination", limit: 100 });
    expect(both.data.every((r: any) => r.registration_group_name === "Support Coordination" && r.support_category_number === 7)).toBe(true);
    expect(both.data.length).toBeGreaterThan(0);
  });

  it("leaves the ordinary products list alone", () => {
    const products = get("/custom-product", { page: 1, limit: 5 });
    expect(products.data[0].item_name).toBe("Community participation (weekday)");
  });
});

describe("NDIS template gallery (GET /invoice/default)", () => {
  beforeEach(() => startVisit("ndis", "AU"));

  it("lists NDIS invoice templates the way the live endpoint does", () => {
    const res = get("/invoice/default", { module: "invoice", industry_id: 9, page_size: 100 });
    expect(res.success).toBe(true);
    const rows = res.data.invoices;
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.length).toBeLessThanOrEqual(12);
    for (const row of rows) {
      expect(row).toMatchObject({
        user_id: 0,
        industry_id: 9,
        type: "ndis",
        is_default: false,
        template_scope: "industry",
        template_scope_label: "NDIS (Health and Social Care)",
        is_favourite: false,
      });
      expect(row.category).toBeTruthy();
      expect(row.item_count).toBeGreaterThan(0);
    }
    expect(rows.map((r: any) => r.category)).toEqual(
      expect.arrayContaining(["Weekly personal care", "Community access", "Support coordination monthly", "Plan management fee", "Transport", "Cancellation (short notice)", "Therapy assistant"]),
    );
    expect(res.data.pagination).toMatchObject({ currentPage: 1, totalItems: rows.length, itemsPerPage: 100 });
  });

  it("serves the full template by id, lines carrying their support item", () => {
    const rows = get("/invoice/default", { module: "invoice", industry_id: 9 }).data.invoices;
    const care = rows.find((r: any) => r.category === "Weekly personal care");
    const detail = get(`/invoice/default/${care.id}`).data;
    expect(detail).toMatchObject({ category: "Weekly personal care", template_type: "ndis", industry_id: 9, user_id: 0, client_id: 0 });
    expect(detail.invoice_item).toHaveLength(care.item_count);
    expect(detail.invoice_item[0]).toMatchObject({
      description: "Assistance With Self-Care Activities - Standard - Weekday Daytime",
      qty: 10,
      price: 73.58,
      qty_type: "hours",
      item_support_no: "01_011_0107_1_1",
      claim_type: "Standard Service",
      gst_percentage: 0,
      total: 735.8,
    });

    const cancel = rows.find((r: any) => r.category === "Cancellation (short notice)");
    const lines = get(`/invoice/default/${cancel.id}`).data.invoice_item;
    expect(lines.every((l: any) => l.claim_type === "Cancellation")).toBe(true);
  });

  it("keeps quote templates apart from invoice ones, and unknown ids are not found", () => {
    const quotes = get("/invoice/default", { module: "quote", is_quote: true, industry_id: 9 }).data.invoices;
    const invoices = get("/invoice/default", { module: "invoice", industry_id: 9 }).data.invoices;
    expect(quotes.length).toBeGreaterThanOrEqual(4);
    expect(quotes.every((q: any) => q.module === "quote" && q.type === "ndis")).toBe(true);
    expect(new Set([...quotes, ...invoices].map((r: any) => r.id)).size).toBe(quotes.length + invoices.length);
    expect(get("/invoice/default/424242").success).toBe(false);
  });

  it("stars templates, and saves, updates and deletes the user's own", () => {
    const [first] = get("/invoice/default", { module: "invoice", industry_id: 9 }).data.invoices;
    const star = handleMockRequest("POST", `/invoice/default/${first.id}/favourite`)?.data;
    expect(star.data.is_favourite).toBe(true);
    expect(get("/invoice/default", { module: "invoice" }).data.invoices.find((r: any) => r.id === first.id).is_favourite).toBe(true);
    expect(handleMockRequest("POST", `/invoice/default/${first.id}/favourite`)?.data.data.is_favourite).toBe(false);

    const created = handleMockRequest("POST", "/invoice/default", {}, {
      category: "My weekly roster",
      description: "Saved from an invoice",
      module: "invoice",
      type: "ndis",
      payment_term: 10,
      items: [{ description: "Self-care", price: 70, qty: 2, qty_type: "hours", item_support_no: "01_011_0107_1_1", claim_type: "Standard Service", discount: 0, disc_criteria: "percent", gst: false }],
    })?.data;
    expect(created.success).toBe(true);
    const id = created.data.invoice.id;
    const listed = get("/invoice/default", { module: "invoice", industry_id: 9 }).data.invoices;
    expect(listed[0]).toMatchObject({ id, category: "My weekly roster", user_id: 1, type: "ndis" });
    const detail = get(`/invoice/default/${id}`).data;
    expect(detail).toMatchObject({ payment_term: 10, total: 140 });
    expect(detail.invoice_item[0].item_support_no).toBe("01_011_0107_1_1");

    expect(handleMockRequest("PUT", `/invoice/default/${id}`, {}, { category: "Renamed" })?.data.success).toBe(true);
    expect(get(`/invoice/default/${id}`).data.category).toBe("Renamed");
    expect(handleMockRequest("DELETE", `/invoice/default/${id}`)?.data.success).toBe(true);
    expect(get(`/invoice/default/${id}`).success).toBe(false);

    // The shared set is read-only.
    expect(handleMockRequest("DELETE", `/invoice/default/${first.id}`)?.data.success).toBe(false);
  });

  it("renders a template preview as HTML", () => {
    const [first] = get("/invoice/default", { module: "invoice" }).data.invoices;
    const preview = get("/invoice-default/preview", { invoiceId: first.id, useDemo: "false", template_scope: "industry" });
    expect(preview.success).toBe(true);
    expect(preview.data).toContain("<table");
    expect(preview.data).toContain(first.category);
  });
});

describe("NDIS participants (GET /client/:id)", () => {
  beforeEach(() => startVisit("ndis", "AU"));

  it("gives participants an NDIS number and, mostly, a plan manager", () => {
    const seed = getSeedData();
    const participants = seed.clients.filter((c: any) => c.kind === "residential");
    expect(participants.length).toBeGreaterThan(5);
    const details = participants.map((c: any) => get(`/client/${c.id}`).data.contacts[0]);
    for (const contact of details) {
      expect(contact.is_primary).toBe(1);
      expect(contact.ndis_no).toMatch(/^43\d{7}$/);
    }
    expect(new Set(details.map((c: any) => c.ndis_no)).size).toBe(details.length);
    const managed = details.filter((c: any) => c.plan_manager_name);
    expect(managed.length).toBeGreaterThan(0);
    expect(managed.length).toBeLessThan(details.length);
    for (const contact of managed) expect(contact.plan_manager_ndis).toMatch(/^4050\d{5}$/);
    for (const contact of details.filter((c: any) => !c.plan_manager_name)) expect(contact.plan_manager_ndis).toBe("");
  });

  it("is deterministic, and keeps the base shape", () => {
    const first = get("/client/100").data;
    startVisit("ndis", "AU");
    expect(get("/client/100").data).toEqual(first);
    expect(first).toMatchObject({ id: 100, business_name: "Ava Henderson", primary_contact: { id: 200 } });
  });

  it("gives organisations no NDIS number", () => {
    const org = getSeedData().clients.find((c: any) => c.kind !== "residential");
    expect(get(`/client/${org!.id}`).data.contacts[0].ndis_no).toBe("");
  });

  it("saves NDIS details onto the contact, and reads them back everywhere", () => {
    const res = handleMockRequest("PATCH", "/contact/200", {}, {
      ndis_no: "430999888",
      plan_manager_name: "Test Plan Managers",
      plan_manager_ndis: "405099999",
    })?.data;
    expect(res.success).toBe(true);
    expect(get("/client/100").data.contacts[0]).toMatchObject({
      ndis_no: "430999888",
      plan_manager_name: "Test Plan Managers",
      plan_manager_ndis: "405099999",
    });
    const picker = get("/contact/list", { type: 1 }).data;
    expect(picker.find((c: any) => c.contact_id === 200)).toMatchObject({ client_id: 100, is_primary: 1, ndis_no: "430999888" });
    // Other participants are untouched.
    expect(get("/client/101").data.contacts[0].ndis_no).not.toBe("430999888");
  });

  it("a PATCH that doesn't carry NDIS fields still goes to the generic contact update", () => {
    const res = handleMockRequest("PATCH", "/contact/200", {}, { name: "Sarah H." })?.data;
    expect(res.success).toBe(true);
    expect(get("/client/100").data.contacts[0].name).toBe("Sarah H.");
  });

  it("creating a participant with an NDIS number keeps it", () => {
    const res = handleMockRequest("POST", "/client", {}, {
      name: "Jamie Rivers",
      email: "jamie@example.com",
      type: 1,
      contacts: [{ name: "Jamie Rivers", email: "jamie@example.com", is_primary: 1, ndis_no: "430111222" }],
    })?.data;
    expect(res.success).toBe(true);
    const clientId = res.data.client_id;
    const contacts = get(`/client/${clientId}`).data.contacts;
    expect(contacts[0]).toMatchObject({ ndis_no: "430111222" });
    expect(res.data.contacts[0].id).toBe(contacts[0].id);
  });

  it("serves the contact picker with the participant's NDIS number", () => {
    const rows = get("/contact/list", { type: 1 }).data;
    expect(rows.length).toBe(getSeedData().clients.length);
    expect(rows[0]).toMatchObject({ contact_id: 200, client_id: 100, name: "Sarah Henderson", client: { business_name: "Ava Henderson", currency: "AUD" } });
    expect(rows[0].ndis_no).toMatch(/^43\d{7}$/);
  });

  it("falls through for an unknown client id", () => {
    expect(direct("ndis", "AU", "/client/987654")).toBeNull();
  });
});

describe("NDIS proposals and quote defaults", () => {
  beforeEach(() => startVisit("ndis", "AU"));

  it("offers NDIS proposal templates", () => {
    const proposals = get("/proposal/templates", { template_type: "PROPOSAL" }).data;
    expect(proposals.map((t: any) => t.template_name)).toEqual(["NDIS Service Agreement", "Support Plan Proposal", "Support Coordination Proposal"]);
    for (const t of proposals) {
      expect(t).toMatchObject({ template_type: "PROPOSAL", id: expect.any(String), description: expect.any(String), created_at: expect.any(String) });
      expect(t.services_count).toBeGreaterThan(0);
    }
    const intro = get("/proposal/templates", { template_type: "INTRODUCTION" }).data;
    expect(intro).toHaveLength(1);
    expect(intro[0].template_name).toBe("Welcome to Harbourside Support Services");
    const all = get("/proposal/templates").data;
    expect(all.length).toBeGreaterThan(proposals.length);
  });

  it("serves a template's content by id", () => {
    const [agreement] = get("/proposal/templates", { template_type: "PROPOSAL" }).data;
    const full = get(`/proposal/templates/${agreement.id}`).data;
    expect(full.snapshot_data.services[0]).toMatchObject({ gst_percent: 0, amount: 735.8 });
    const [intro] = get("/proposal/templates", { template_type: "INTRODUCTION" }).data;
    const introFull = get(`/proposal/templates/${intro.id}`).data;
    expect(introFull.html_content).toContain("Harbourside Support Services");
    expect(introFull.lexical_content[0].type).toBe("text");
  });

  it("an electrical-style template id still falls through", () => {
    expect(direct("ndis", "AU", "/proposal/templates/1")).toBeNull();
  });

  it("has NDIS notes and terms on quotes, not electrical ones", () => {
    const res = get("/quote/default");
    expect(res.success).toBe(true);
    expect(res.data.notes).toMatch(/NDIS/);
    expect(res.data.notes).not.toMatch(/electrical|AS\/NZS/i);
    expect(res.data.expire_after).toBe(30);
  });
});

describe("outside the Australian NDIS story the handler passes through", () => {
  const routes: Array<[string, Record<string, unknown>]> = [
    ["/services/autocomplete", { query: "self-care" }],
    ["/services/all/autocomplete", { query: "a" }],
    ["/custom-product", { active_tab: "ndis" }],
    ["/invoice/default", { module: "invoice" }],
    ["/invoice/default/9001", {}],
    ["/invoice-default/preview", {}],
    ["/client/100", {}],
    ["/contact/list", {}],
    ["/proposal/templates", {}],
    ["/quote/default", {}],
  ];

  it("New Zealand NDIS (country feature off)", () => {
    for (const [path, params] of routes) expect(direct("ndis", "NZ", path, params), path).toBeNull();
  });

  it("a non-NDIS industry in Australia", () => {
    for (const [path, params] of routes) expect(direct("plumbing", "AU", path, params), path).toBeNull();
  });

  it("New Zealand: autocomplete is the generic empty answer", () => {
    startVisit("ndis", "NZ");
    expect(handleMockRequest("GET", "/services/autocomplete", { query: "self-care" })?.data).toEqual({ success: true, data: [] });
    expect(get("/quote/default").data.notes).not.toMatch(/NDIS/);
  });

  it("plumbing (AU): autocomplete is the generic empty answer and the catalogue tab is not intercepted", () => {
    startVisit("plumbing", "AU");
    expect(handleMockRequest("GET", "/services/autocomplete", { query: "self-care" })?.data).toEqual({ success: true, data: [] });
    const generic = get("/custom-product", { active_tab: "ndis", limit: 3 });
    expect(generic.data.every((r: any) => !r.support_item_number)).toBe(true);
    expect(get("/quote/default").data.notes).not.toMatch(/NDIS/);
  });
});
