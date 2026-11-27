/* eslint-disable @typescript-eslint/no-explicit-any -- reads loosely typed mock responses */
import { afterEach, describe, expect, it } from "vitest";

import { asDocumentBlob, documentFileName } from "@/lib/document-blob";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { INDUSTRY_CATALOG } from "@/lib/demo-seed/industries/catalog";
import { getSeedData, handleMockRequest } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";

afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

function login(industry: string, country: "AU" | "NZ") {
  const res = handleMockRequest("POST", "/demo/login", {}, { industry, country });
  expect(res?.data.success).toBe(true);
}

const money = (n: number) =>
  `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

async function pageOf(res: ReturnType<typeof handleMockRequest>): Promise<string> {
  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  expect(res!.data).toBeInstanceOf(Blob);
  expect((res!.data as Blob).type).toMatch(/^text\/html/);
  return (res!.data as Blob).text();
}

const invoicePage = (id: string | number, templateId: string, extra: Record<string, any> = {}) =>
  pageOf(
    handleMockRequest("GET", `/template/${templateId}/preview`, {
      invoiceId: String(id),
      useDemo: "false",
      type: "invoice",
      render_type: "pdf",
      ...extra,
    }),
  );

const quotePage = (id: string | number, templateId: string) =>
  pageOf(
    handleMockRequest("GET", `/quote/preview/${templateId}`, {
      quoteId: String(id),
      useDemo: "false",
      type: "quote",
      render_type: "pdf",
    }),
  );

const firstInvoice = (status?: string) => {
  const invoices = getSeedData().invoices as any[];
  return status ? invoices.find((i) => i.status === status) : invoices.find((i) => i.status !== "draft");
};

function expectCleanPage(page: string) {
  expect(page).not.toContain("{BRAND_COLOR}");
  expect(page).not.toContain("{CONTENT_COLOR}");
  expect(page).not.toMatch(/\bundefined\b/);
  expect(page).not.toMatch(/\bNaN\b/);
  expect(page).not.toContain("[object Object]");
}

describe("saved invoice preview", () => {
  it("renders the real classic layout from the books (AU)", async () => {
    login("electrical", "AU");
    const seed = getSeedData();
    const inv = firstInvoice()!;
    const page = await invoicePage(inv.invoice_id, "1");

    expect(page).toContain(inv.invoice_no);
    expect(page).toContain(esc(inv.client.name));
    expect(page).toContain(esc(seed.story.business.name));
    for (const line of inv.items) expect(page).toContain(esc(line.description));
    expect(page).toContain(money(inv.total));
    expect(page).toContain(money(inv.sub_total));
    expect(page).toContain("GST");
    expect(page).toContain("TAX INVOICE");
    expect(page).toContain("ABN");
    expect(page).toContain("BSB");
    expect(page).toContain(seed.story.business.bsb);
    expect(page.trimStart().toLowerCase().startsWith("<!doctype html>")).toBe(true);
    expectCleanPage(page);
  });

  it("prints NZ wording: GST, Tax Invoice, NZBN, no BSB, NZD", async () => {
    login("plumbing", "NZ");
    const seed = getSeedData();
    const inv = firstInvoice()!;
    expect(inv.currency_code).toBe("NZD");
    const page = await invoicePage(inv.invoice_id, "1");

    expect(page).toContain("GST");
    expect(page.toUpperCase()).toContain("TAX INVOICE");
    expect(page).toContain("NZBN");
    expect(page).not.toMatch(/\bABN\b/);
    expect(page).not.toContain("BSB");
    expect(page).toContain(seed.story.business.account_number);
    expect(page).toContain(money(inv.total));
    expect(page).toContain(esc(seed.story.business.name));
    expectCleanPage(page);
  });

  it("renders a paid invoice as a receipt", async () => {
    login("electrical", "AU");
    const paid = firstInvoice("paid")!;
    const receipt = await invoicePage(paid.invoice_id, "1", { type: "invoice-receipt" });
    const plain = await invoicePage(paid.invoice_id, "1");

    expect(receipt).toContain(paid.invoice_no);
    expect(receipt).toContain("Thank you for your payment!");
    expect(plain).not.toContain("Thank you for your payment!");
    expectCleanPage(receipt);
  });

  it("maps template ids onto the four classic layouts", async () => {
    login("electrical", "AU");
    const inv = firstInvoice()!;
    const pages = new Set<string>();
    for (const id of ["1", "2", "3", "4", "17", "20"]) {
      const page = await invoicePage(inv.invoice_id, id);
      expect(page).toContain(inv.invoice_no);
      pages.add(page);
    }
    // 1..4 are four different layouts; 17 is classic 1 again.
    expect(pages.size).toBeGreaterThanOrEqual(4);
    const one = await invoicePage(inv.invoice_id, "1");
    const five = await invoicePage(inv.invoice_id, "5");
    expect(five).toBe(one);
  });

  it("answers the Styling tab's details call with JSON carrying the html", async () => {
    login("electrical", "AU");
    const res = handleMockRequest("GET", "/template/17/details", { invoiceId: "", useDemo: "false" })!;
    expect(res.data.success).toBe(true);
    expect(res.data.data.html).toContain("<html");
  });
});

describe("saved quote preview", () => {
  it("contains the quote number, client, lines and total", async () => {
    login("plumbing", "AU");
    const seed = getSeedData();
    const quote = (seed.quotes as any[])[0];
    // Id 11 is the app's default quote layout: classic slot 3.
    const page = await quotePage(quote.quote_id, "11");

    expect(page).toContain(quote.quote_no);
    expect(page).toContain(esc(quote.client.name));
    expect(page).toContain(esc(seed.story.business.name));
    for (const line of quote.items) expect(page).toContain(esc(line.description));
    expect(page).toContain(money(quote.total));
    expect(page).toContain("GST");
    expectCleanPage(page);
  });

  it("prints NZ wording on a quote", async () => {
    login("plumbing", "NZ");
    const quote = (getSeedData().quotes as any[])[0];
    const page = await quotePage(quote.quote_id, "11");
    expect(page).toContain(quote.quote_no);
    expect(page).toContain("NZBN");
    expect(page).not.toContain("BSB");
    expect(page).toContain(money(quote.total));
    expectCleanPage(page);
  });
});

describe("NDIS businesses", () => {
  it("use the NDIS layouts (AU)", async () => {
    login("ndis", "AU");
    const inv = firstInvoice()!;
    const invoice = await invoicePage(inv.invoice_id, "1");
    expect(invoice).toContain("This invoice is for one NDIS participant only.");
    expect(invoice).toContain(inv.invoice_no);

    const quote = (getSeedData().quotes as any[])[0];
    // 13 is the General Style 3 slot; for an NDIS business it lands on NDIS Style 3.
    const quotePageHtml = await quotePage(quote.quote_id, "25");
    expect(quotePageHtml).toContain("This quote is for one NDIS participant only.");
    expect(quotePageHtml).toContain(quote.quote_no);
    expectCleanPage(invoice);
    expectCleanPage(quotePageHtml);
  });

  it("do not offer NDIS layouts to a non-NDIS business", async () => {
    login("electrical", "AU");
    const inv = firstInvoice()!;
    for (const id of ["1", "2", "8", "17"]) {
      const page = await invoicePage(inv.invoice_id, id);
      expect(page).not.toContain("This invoice is for one NDIS participant only.");
    }
  });

  it("stay on the classic layouts in New Zealand, where NDIS does not exist", async () => {
    login("ndis", "NZ");
    const inv = firstInvoice()!;
    const page = await invoicePage(inv.invoice_id, "1");
    expect(page).not.toContain("This invoice is for one NDIS participant only.");
    expect(page).toContain(inv.invoice_no);
  });
});

describe("runtime preview of an unsaved draft", () => {
  it("renders the invoice editor's draft from an encrypted body", async () => {
    login("electrical", "AU");
    const client = (handleMockRequest("GET", "/client/v2", { type: "1" })!.data.data as any[])[0];
    const payload = {
      invoice_no: "INV-DRAFT-77",
      client_id: client.id,
      invoice_date: "2026-11-20",
      due_date: "2026-12-04",
      description: "Draft job",
      notes: "Thanks for your business",
      sub_total: 300,
      total_gst: 30,
      total: 330,
      template_id: "2",
      show_bank_details: 1,
      item: [
        { description: "Unsaved widget fit-out", price: 100, qty: 2, gst: true, gst_percentage: 10, gst_amount: 20, disc_criteria: "percent", discount: 0, qty_type: "items" },
        { description: "Unsaved site visit", price: 100, qty: 1, gst: true, gst_percentage: 10, gst_amount: 10, disc_criteria: "percent", discount: 0, qty_type: "hours" },
      ],
    };
    const body = buildEncryptedRequestBody({ ...payload, items: payload.item, render_type: "pdf" });
    const page = await pageOf(handleMockRequest("POST", "/template/runtime-preview", {}, body));

    expect(page).toContain("INV-DRAFT-77");
    expect(page).toContain("Unsaved widget fit-out");
    expect(page).toContain("Unsaved site visit");
    expect(page).toContain(esc(client.business_name ?? client.name ?? ""));
    expect(page).toContain(money(330));
    expectCleanPage(page);
  });

  it("renders the quote editor's draft, naming the client from client_name", async () => {
    login("plumbing", "NZ");
    const payload = {
      quote_no: "Q-DRAFT-9",
      client_name: "Walk-in Customer Ltd",
      quoteDate: "2026-11-20",
      quoteExpDate: "2026-12-20",
      sub_total: 200,
      total_gst: 30,
      total: 230,
      template_id: "11",
      items: [{ description: "Unsaved hot water install", price: 200, qty: 1, gst: true, gst_percentage: 15, gst_amount: 30, disc_criteria: "percent", discount: 0 }],
    };
    const page = await pageOf(handleMockRequest("POST", "/quote/runtime-preview", {}, buildEncryptedRequestBody(payload)));
    expect(page).toContain("Q-DRAFT-9");
    expect(page).toContain("Walk-in Customer Ltd");
    expect(page).toContain("Unsaved hot water install");
    expect(page).toContain(money(230));
    expectCleanPage(page);
  });

  it("never throws on an empty body", async () => {
    login("electrical", "AU");
    const page = await pageOf(handleMockRequest("POST", "/template/runtime-preview", {}, {}));
    expect(page.length).toBeGreaterThan(100);
  });
});

describe("template catalogue", () => {
  const list = (res: ReturnType<typeof handleMockRequest>) => Object.values(res!.data.data as Record<string, any[]>).flat();

  it("offers classic and NDIS layouts for invoices and quotes to an NDIS business", () => {
    login("ndis", "AU");
    const items = list(handleMockRequest("GET", "/template/list", {}));
    for (const type of ["invoice", "quote"]) {
      expect(items.filter((t) => t.type === type && t.category_name === "CLASSIC")).toHaveLength(4);
      expect(items.filter((t) => t.type === type && t.category_name === "NDIS")).toHaveLength(4);
    }
    const sample = items.find((t) => t.template_id === "classic-template-1" && t.type === "invoice");
    expect(sample).toMatchObject({ file_path: "classic-template-1.js", category_name: "CLASSIC" });
    expect(typeof sample.thumbnail).toBe("string");
    expect(new Set(items.map((t) => `${t.type}:${t.id}`)).size).toBe(items.length);
  });

  it("hides the NDIS layouts from everyone else", () => {
    login("electrical", "AU");
    const items = list(handleMockRequest("GET", "/template/list", {}));
    expect(items.some((t) => t.category_name === "NDIS")).toBe(false);
    expect(items.filter((t) => t.category_name === "CLASSIC")).toHaveLength(8);

    login("ndis", "NZ");
    expect(list(handleMockRequest("GET", "/template/list", {})).some((t) => t.category_name === "NDIS")).toBe(false);
  });
});

describe("document blobs", () => {
  it("keeps an HTML blob and still labels everything else a PDF", () => {
    const page = new Blob(["<p>x</p>"], { type: "text/html" });
    expect(asDocumentBlob(page)).toBe(page);
    expect(asDocumentBlob(new Blob(["%PDF"], { type: "application/octet-stream" })).type).toBe("application/pdf");
    expect(asDocumentBlob("%PDF").type).toBe("application/pdf");
  });

  it("saves a page as .html and a PDF as .pdf", () => {
    expect(documentFileName(new Blob([""], { type: "text/html" }), "INV-1.pdf")).toBe("INV-1.html");
    expect(documentFileName(new Blob([""], { type: "application/pdf" }), "INV-1.pdf")).toBe("INV-1.pdf");
  });
});

describe("every industry renders in both countries", () => {
  for (const entry of INDUSTRY_CATALOG) {
    for (const country of ["AU", "NZ"] as const) {
      it(`${entry.slug} / ${country}`, async () => {
        login(entry.slug, country);
        const seed = getSeedData();
        const invoices = (seed.invoices as any[]).slice(0, 3);
        const paid = (seed.invoices as any[]).find((i) => i.status === "paid");
        const quotes = (seed.quotes as any[]).slice(0, 2);
        expect(invoices.length).toBeGreaterThan(0);
        expect(quotes.length).toBeGreaterThan(0);

        for (const templateId of ["1", "2", "3", "4"]) {
          for (const inv of invoices) {
            const page = await invoicePage(inv.invoice_id, templateId);
            expect(page).toContain(inv.invoice_no);
            expect(page).toContain(esc(inv.client.name));
            expectCleanPage(page);
          }
          for (const q of quotes) {
            // (Classic quote layouts 1 and 2 only print the number when an invoice_no is set, as on the server.)
            const page = await quotePage(q.quote_id, templateId);
            expect(page).toContain(esc(seed.story.business.name));
            expect(page).toContain(esc(q.client.name));
            expect(page).toContain(money(q.total));
            expectCleanPage(page);
          }
        }
        expectCleanPage(await invoicePage(paid.invoice_id, "1", { type: "invoice-receipt" }));
        expectCleanPage(await invoicePage(invoices[0].invoice_id, "17"));
        expectCleanPage(await quotePage(quotes[0].quote_id, "25"));
        expectCleanPage(await invoicePage(invoices[0].invoice_id, "8"));
      });
    }
  }
});
