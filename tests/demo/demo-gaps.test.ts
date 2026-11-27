import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { INDUSTRY_CATALOG } from "@/lib/demo-seed/industries/catalog";
import { handleMockRequest } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { mapApiMatchCandidate } from "@/lib/bank-match";

/* eslint-disable @typescript-eslint/no-explicit-any */
const get = (path: string, params: Record<string, any> = {}) => handleMockRequest("GET", path, params)!;
const login = (industry: string, country: "AU" | "NZ") => handleMockRequest("POST", "/demo/login", {}, { industry, country });

beforeEach(() => {
  endDemoSession();
  __resetSessionForTests();
});
afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

describe("logos", () => {
  it("every industry has its own logo, on the business, the branding and the documents", async () => {
    const seen = new Set<string>();
    for (const entry of INDUSTRY_CATALOG) {
      login(entry.slug, "AU");
      const business = get("/businesses").data.data[0];
      expect(business.logo, entry.slug).toMatch(/^data:image\/svg\+xml/);
      const svg = decodeURIComponent(business.logo.split(",")[1]);
      expect(svg).toContain("<svg");
      seen.add(business.logo);
      expect(get("/v2/settings/get-branding").data.data.logo).toBe(business.logo);
    }
    // Same-looking industries may share a colour, but the monograms differ.
    expect(seen.size).toBeGreaterThan(30);

    login("plumbing", "NZ");
    const logo = get("/businesses").data.data[0].logo as string;
    const preview = get("/quote/preview/11", { quoteId: get("/quote/quotes").data.data.quotes?.[0]?.id ?? 2001, render_type: "pdf" });
    // The quote layout prints the business's logo as an image.
    expect(await (preview.data as Blob).text()).toContain(logo.slice(0, 40));
  });
});

describe("invoice and quote numbers", () => {
  it("the editors get the next number in the sequence", () => {
    login("plumbing", "AU");
    const invoices = get("/invoice/invoices", { page_size: 500 }).data.data.invoice_details;
    const highest = Math.max(...invoices.map((i: any) => Number(String(i.invoice_no).replace(/\D/g, ""))));
    const next = get("/invoice/invoice-no").data.data;
    expect(next.no).toBe(`INV-${highest + 1}`);
    expect(typeof next.note).toBe("string");

    const quotes = get("/quote/quotes", { page_size: 500 });
    expect(quotes.data.success).toBe(true);
    const q = get("/v2/quote-no").data.data;
    expect(q.no).toMatch(/^Q-\d+$/);
  });

  it("saving an invoice moves the sequence on, and a taken number is flagged", () => {
    login("hairdressers", "NZ");
    const before = get("/invoice/invoice-no").data.data.no as string;
    const client = get("/client/v2", { type: "1" }).data.data[0];
    handleMockRequest("POST", "/invoice/add", {}, JSON.stringify(buildEncryptedRequestBody({ invoice_no: before, client_id: client.id, invoice_date: "2026-11-20", due_date: "2099-01-01", total: 115, sub_total: 100, total_gst: 15, item: [{ description: "Cut", price: 100, qty: 1, gst: true }] })));
    const after = get("/invoice/invoice-no").data.data.no as string;
    expect(after).not.toBe(before);
    expect(Number(after.replace(/\D/g, ""))).toBe(Number(before.replace(/\D/g, "")) + 1);
    expect(get("/invoice/invoice-no/check", { invoice_no: before }).data.data.exists).toBe(true);
    expect(get("/invoice/invoice-no/check", { invoice_no: "INV-NEW-1" }).data.data.exists).toBe(false);
    expect(get("/v2/settings/get-seq-numbers").data.data.invoice_next_number).toBe(Number(after.replace(/\D/g, "")));
  });
});

describe("default templates for every industry", () => {
  it("each non-NDIS industry gets 8 invoice and 8 quote templates built from its own price list", () => {
    for (const slug of ["plumbing", "hairdressers", "agriculture", "consulting"]) {
      login(slug, "AU");
      const invoices = get("/invoice/default", { module: "invoice", page_size: 100 }).data.data.invoices;
      const quotes = get("/invoice/default", { module: "quote", page_size: 100 }).data.data.invoices;
      expect(invoices, slug).toHaveLength(8);
      expect(quotes, slug).toHaveLength(8);
      expect(invoices.every((t: any) => t.type === "general" && t.user_id === 0 && t.item_count > 0 && t.total > 0)).toBe(true);
      const detail = get(`/invoice/default/${invoices[0].id}`).data.data;
      expect(detail.invoice_item.length).toBe(invoices[0].item_count);
      expect(detail.invoice_item[0].gst_percentage).toBe(10);
    }
  });

  it("NZ templates carry NZ GST; favourite toggles; the preview renders a real layout", async () => {
    login("cleaning", "NZ");
    const [first] = get("/invoice/default", { module: "invoice" }).data.data.invoices;
    expect(get(`/invoice/default/${first.id}`).data.data.invoice_item[0].gst_percentage).toBe(15);
    const fav = handleMockRequest("POST", `/invoice/default/${first.id}/favourite`)!;
    expect(fav.data.data.is_favourite).toBe(true);
    expect(get("/invoice/default", { module: "invoice" }).data.data.invoices[0].is_favourite).toBe(true);
    const html = get("/invoice-default/preview", { invoiceId: first.id }).data.data as string;
    expect(html).toContain("<html");
    expect(html).toContain("GST");
  });

  it("NDIS still uses its own set", () => {
    login("ndis", "AU");
    const rows = get("/invoice/default", { module: "invoice" }).data.data.invoices;
    expect(rows.every((t: any) => t.type === "ndis")).toBe(true);
  });
});

describe("assets and bank matching", () => {
  it("the register has matched and unmatched assets with the fields the app reads", () => {
    login("construction", "AU");
    const rows = get("/assets").data.data.asset_details;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const matched = rows.filter((a: any) => a.is_reconciled === 1);
    const open = rows.filter((a: any) => a.is_reconciled === 0);
    expect(matched.length).toBeGreaterThanOrEqual(2);
    expect(open.length).toBeGreaterThanOrEqual(1);
    for (const a of matched) {
      expect(a.remainingAmount).toBe(0);
      expect(a.matched_journal_entries[0].matched_amount).toBe(a.price);
    }
    for (const a of open) {
      expect(a.possible_match).toBe(1);
      expect(a.remainingAmount).toBe(a.price);
    }
    for (const a of rows) {
      expect(a.date_of_purchase).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.asset_status).toBe("active");
    }
  });

  it("the match dialog lists candidates, and matching an asset reconciles it", () => {
    login("construction", "AU");
    const open = get("/assets").data.data.asset_details.find((a: any) => a.is_reconciled === 0);
    const found = get(`/possible-matches/asset/${open.id}`).data.data;
    expect(found.asset_remaining_amount).toBe(open.price);
    expect(found.list.length).toBeGreaterThan(0);
    const candidate = mapApiMatchCandidate(found.list[0]);
    expect(candidate.amount).toBeGreaterThan(0);

    const res = handleMockRequest("POST", "/v2/bank-transaction/match-asset-expense", {}, JSON.stringify(buildEncryptedRequestBody({ bank_transaction_id: String(candidate.id), assets: [String(open.id)] })))!;
    expect(res.data.success).toBe(true);
    const after = get("/assets").data.data.asset_details.find((a: any) => a.id === open.id);
    expect(after.is_reconciled).toBe(1);
    expect(after.matched_journal_entries).toHaveLength(1);
    expect(get("/unibox/assets").data.data.some((a: any) => a.id === open.id)).toBe(false);
  });

  it("works in every industry, AU and NZ", () => {
    for (const entry of INDUSTRY_CATALOG) {
      for (const country of ["AU", "NZ"] as const) {
        login(entry.slug, country);
        const rows = get("/assets").data.data.asset_details;
        expect(rows.length, `${entry.slug}/${country}`).toBeGreaterThan(0);
        expect(rows.some((a: any) => a.is_reconciled === 1)).toBe(true);
      }
    }
  });
});
