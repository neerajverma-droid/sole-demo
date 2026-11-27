import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleMockRequest, getSeedData, resetSeedData } from "@/lib/demo-seed/mock-server";
import {
  DEMO_IDLE_MINUTES,
  DEMO_SESSION_MINUTES,
  __resetSessionForTests,
  endDemoSession,
  getActiveSession,
  isExpired,
  startDemoSession,
  touchSession,
} from "@/lib/demo-seed/session";

const login = (industry = "plumbing", country: "AU" | "NZ" = "AU") =>
  handleMockRequest("POST", "/demo/login", {}, { industry, country });
const get = (path: string, params: Record<string, any> = {}) => handleMockRequest("GET", path, params)!;

beforeEach(() => {
  endDemoSession();
  __resetSessionForTests();
});
afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

describe("demo session lifecycle", () => {
  it("a visit starts on login and ends on logout, dropping everything", () => {
    login("plumbing", "NZ");
    expect(getActiveSession()?.industry).toBe("plumbing");
    expect(getSeedData().story.slug).toBe("plumbing");

    handleMockRequest("POST", "/auth/logout");
    expect(getActiveSession()).toBeNull();
    expect(getSeedData().story.business.name).toBe("Coastal Spark Electrical");
  });

  it("every new visit starts from clean books", () => {
    login();
    handleMockRequest("POST", "/client/", {}, { name: "Temporary Customer Ltd", email: "t@example.com", type: 1 });
    expect(get("/client/v2", { type: "1" }).data.pagination.total).toBe(17);

    handleMockRequest("POST", "/auth/logout");
    login();
    expect(get("/client/v2", { type: "1" }).data.pagination.total).toBe(16);
  });

  it("a login that names no industry resumes the live visit instead of replacing it", () => {
    // The app signs in again on every page load without stored tokens; that must not wipe a chosen demo.
    const first = login("hairdressers", "NZ")!;
    handleMockRequest("POST", "/client/", {}, { name: "Resumed Customer", type: 1 });
    const again = handleMockRequest("POST", "/demo/login", {}, {})!;
    expect(again.data.data.user.demo_industry).toBe("hairdressers");
    expect(again.data.data.user.demo_country).toBe("NZ");
    expect(get("/client/v2", { type: "1", searchQuery: "resumed" }).data.data).toHaveLength(1);
    expect(first.data.data.user.business_name).toBe(again.data.data.user.business_name);

    // Naming an industry (the /au and /nz entry) is a deliberate fresh start.
    login("cleaning", "AU");
    expect(get("/client/v2", { type: "1", searchQuery: "resumed" }).data.data).toHaveLength(0);

    // And with no visit in progress, a bare login starts the default flagship demo.
    handleMockRequest("POST", "/auth/logout");
    const bare = handleMockRequest("POST", "/demo/login", {}, {})!;
    expect(bare.data.data.user.business_name).toBe("Coastal Spark Electrical");
  });

  it("a heartbeat keeps the visit alive and reports when it ends", () => {
    login();
    const beat = handleMockRequest("POST", "/demo/heartbeat");
    expect(beat?.status).toBe(200);
    expect(beat?.data.data.demo_expires_at).toBeTruthy();

    endDemoSession();
    const dead = handleMockRequest("POST", "/demo/heartbeat");
    expect(dead?.status).toBe(401);
    expect(dead?.data.success).toBe(false);
  });

  it("expires at the hard cap and after going idle", () => {
    const t0 = 1_800_000_000_000;
    const state = startDemoSession({ industry: "plumbing", country: "AU" }, t0);
    expect(DEMO_SESSION_MINUTES).toBeGreaterThan(0);
    expect(isExpired(state, t0 + 60_000)).toBe(false);
    // Idle: nothing heard for longer than the idle limit.
    expect(isExpired(state, t0 + (DEMO_IDLE_MINUTES + 1) * 60_000)).toBe(true);
    // A heartbeat resets the idle clock but never the hard cap.
    touchSession(t0 + (DEMO_IDLE_MINUTES - 1) * 60_000);
    expect(isExpired(state, t0 + (DEMO_IDLE_MINUTES + 1) * 60_000)).toBe(false);
    expect(isExpired(state, t0 + (DEMO_SESSION_MINUTES + 1) * 60_000)).toBe(true);
  });

  it("an expired visit is dropped the next time anything asks", () => {
    const state = startDemoSession({ industry: "plumbing", country: "AU" }, Date.now() - 24 * 3_600_000);
    expect(state.expiresAt).toBeLessThan(Date.now());
    expect(getActiveSession()).toBeNull();
    expect(handleMockRequest("POST", "/demo/heartbeat")?.status).toBe(401);
  });

  it("a reload replays the visitor's changes onto fresh books", () => {
    // A browser tab: window.name survives a reload, in-memory state does not.
    (globalThis as any).window = { name: "" };
    try {
      login();
      handleMockRequest("POST", "/client/", {}, { name: "Kept Customer", email: "k@example.com", type: 1 });
      expect(get("/client/v2", { type: "1" }).data.pagination.total).toBe(17);
      expect((globalThis as any).window.name).toContain("sole.demo.session");

      // "Reload": everything held in memory is lost; the tab keeps its name, and with it the session.
      __resetSessionForTests();
      resetSeedData();

      expect(getActiveSession()?.industry).toBe("plumbing");
      expect(get("/client/v2", { type: "1", searchQuery: "kept" }).data.data).toHaveLength(1);
      expect(get("/client/v2", { type: "1" }).data.pagination.total).toBe(17);

      // Signing out removes the stored session, so the next visit starts clean.
      handleMockRequest("POST", "/auth/logout");
      expect((globalThis as any).window.name).toBe("");
    } finally {
      delete (globalThis as any).window;
    }
  });
});

describe("writable overlay", () => {
  beforeEach(() => {
    login("plumbing", "NZ");
  });

  it("creates, edits and deletes a contact", () => {
    const created = handleMockRequest(
      "POST",
      "/client/",
      {},
      { name: "Fresh Client", email: "fresh@example.com", type: 1, contacts: [{ name: "Fresh Client", email: "fresh@example.com", is_primary: 1 }] },
    )!;
    expect(created.data.success).toBe(true);
    const id = String(created.data.data.client_id);

    const found = get("/client/v2", { type: "1", searchQuery: "fresh" }).data.data;
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(id);

    handleMockRequest("PUT", `/client/${id}`, {}, { name: "Renamed Client" });
    expect(get("/client/v2", { type: "1", searchQuery: "renamed" }).data.data).toHaveLength(1);

    handleMockRequest("DELETE", `/client/${id}`);
    expect(get("/client/v2", { type: "1", searchQuery: "renamed" }).data.data).toHaveLength(0);
  });

  it("a supplier is created as a supplier", () => {
    handleMockRequest("POST", "/client/", {}, { name: "New Supplier Co", type: 2 });
    expect(get("/client/v2", { type: "2", searchQuery: "new supplier" }).data.data[0].type).toBe("Supplier");
  });

  it("creates an invoice that shows up in the list, the counts and the detail", () => {
    const before = get("/invoice/invoices/status-counts").data.data;
    const client = get("/client/v2", { type: "1" }).data.data[0];
    const res = handleMockRequest(
      "POST",
      "/invoice/add",
      {},
      {
        invoice_no: "INV-9001",
        client_id: client.id,
        invoice_date: "2026-11-20",
        due_date: "2099-01-01",
        description: "Hot water system replacement",
        total: 115,
        sub_total: 100,
        total_gst: 15,
        item: [{ description: "Hot water system", price: 100, qty: 1, gst: true, gst_percentage: 15 }],
      },
    )!;
    expect(res.data.success).toBe(true);
    const id = res.data.data.invoice_id;

    const listed = get("/invoice/invoices", { search: "INV-9001" }).data.data.invoice_details;
    expect(listed).toHaveLength(1);
    expect(listed[0].total).toBe(115);
    expect(listed[0].client.name).toBe(client.business_name ?? listed[0].client.name);
    expect(listed[0].status).toBe("due");
    expect(get("/invoice/invoices/status-counts").data.data.all).toBe(before.all + 1);
    expect(get(`/invoice/invoices/${id}`).data.data.invoice_no).toBe("INV-9001");

    // Edit
    handleMockRequest("POST", "/invoice/edit", {}, { id, invoice_no: "INV-9001", client_id: client.id, due_date: "2020-01-01", total: 230, sub_total: 200, total_gst: 30, item: [{ description: "Two systems", price: 100, qty: 2, gst: true }] });
    const edited = get("/invoice/invoices", { search: "INV-9001" }).data.data.invoice_details[0];
    expect(edited.total).toBe(230);
    expect(edited.status).toBe("overdue");

    // Delete
    handleMockRequest("POST", "/invoice/bulk-delete", {}, { invoices: [String(id)] });
    expect(get("/invoice/invoices", { search: "INV-9001" }).data.data.invoice_details).toHaveLength(0);
    expect(get("/invoice/invoices/status-counts").data.data.all).toBe(before.all);
  });

  it("creates and deletes a quote", () => {
    const client = get("/client/v2", { type: "1" }).data.data[0];
    const before = get("/quote/quotes").data.data.total ?? get("/quote/quotes").data.data.quotes?.length;
    const res = handleMockRequest("POST", "/v2/quote", {}, { quote_no: "Q-9001", client_id: client.id, total: 575, sub_total: 500, total_gst: 75, item: [{ description: "Bathroom rough-in", price: 500, qty: 1, gst: true }] })!;
    expect(res.data.success).toBe(true);
    const text = JSON.stringify(get("/quote/quotes").data);
    expect(text).toContain("Q-9001");
    handleMockRequest("DELETE", `/quote/bulk-delete`, {}, { quotes: [String(res.data.data.quote_id)] });
    expect(JSON.stringify(get("/quote/quotes").data)).not.toContain("Q-9001");
    expect(before).toBeDefined();
  });

  it("creates, edits and deletes an expense, and protects reconciled ones", () => {
    const supplier = get("/client/v2", { type: "2" }).data.data[0];
    const before = get("/expense/list").data.data.expense_details.length;
    const res = handleMockRequest("POST", "/v2/expense/", {}, { name: "Pipe fittings", price: 230, date: "2026-11-25", client_id: supplier.id, account_subcategory_id: 141, gst: 1 })!;
    expect(res.data.success).toBe(true);
    const id = res.data.data.id;
    const all = () => JSON.stringify(get("/expense/list", { limit: 500, page_size: 500 }).data);
    expect(all()).toContain("Pipe fittings");

    handleMockRequest("POST", "/v2/expense/edit", {}, { id, name: "Pipe fittings (edited)", price: 250 });
    expect(all()).toContain("Pipe fittings (edited)");

    handleMockRequest("POST", "/v2/expense/bulk-delete", {}, { expenses: [String(id)] });
    expect(all()).not.toContain("Pipe fittings (edited)");
    expect(get("/expense/list").data.data.expense_details.length).toBeLessThanOrEqual(before);

    const reconciled = getSeedData().expenses.find((e: any) => Number(e.is_reconciled) === 1)!;
    const skipped = handleMockRequest("POST", "/v2/expense/bulk-delete", {}, { expenses: [String(reconciled.expense_id)] })!;
    expect(skipped.data.message).toContain("reconciled");
    expect(getSeedData().expenses.some((e: any) => e.expense_id === reconciled.expense_id)).toBe(true);
  });

  it("creates, edits and deletes a price-list item", () => {
    const created = handleMockRequest("POST", "/custom-product", {}, { item_name: "Emergency call-out", selling_price: 220, qty_type: "items" })!;
    expect(created.data.success).toBe(true);
    const id = created.data.data.id;
    expect(JSON.stringify(get("/custom-product").data)).toContain("Emergency call-out");

    handleMockRequest("PATCH", `/custom-product/${id}`, {}, { selling_price: 250 });
    const row = get("/custom-product").data.data.find((p: any) => p.id === id);
    expect(row.selling_price).toBe(250);

    handleMockRequest("DELETE", `/custom-product/${id}`);
    expect(get("/custom-product").data.data.find((p: any) => p.id === id)).toBeUndefined();
  });

  it("refuses a write on something the overlay doesn't keep", () => {
    const res = handleMockRequest("POST", "/subscription/change-plan", {}, { plan: "bundle" })!;
    expect(res.data.success).toBe(false);
  });
});

describe("isolation", () => {
  it("one visit's changes never appear in the next, or in the default demo", () => {
    login("plumbing", "NZ");
    handleMockRequest("POST", "/client/", {}, { name: "Leaky Customer", type: 1 });
    expect(JSON.stringify(get("/client/v2", { type: "1", searchQuery: "leaky" }).data)).toContain("Leaky Customer");
    endDemoSession();

    // Default demo (no session) and a brand-new visit both start clean.
    expect(get("/client/v2", { type: "1", searchQuery: "leaky" }).data.data).toHaveLength(0);
    login("plumbing", "NZ");
    expect(get("/client/v2", { type: "1", searchQuery: "leaky" }).data.data).toHaveLength(0);
  });

  it("the demo never talks to a real backend: every call is answered in memory", () => {
    login("cleaning", "AU");
    for (const path of ["/businesses", "/client/v2", "/invoice/invoices", "/expense/list"]) {
      expect(handleMockRequest("GET", path)).not.toBeNull();
    }
  });
});
