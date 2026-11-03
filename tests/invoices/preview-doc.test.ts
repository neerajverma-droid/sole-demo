import { describe, expect, it } from "vitest";

import {
  footerParts,
  invoicePreviewDoc,
  samplePreviewDoc,
} from "@/lib/preview-doc";
import { DEFAULT_SALES_SETTINGS, type SalesSettings } from "@/lib/sales-settings";
import { emptyInvoiceDraft, newLineItem, type Invoice } from "@/lib/invoices";

const BUSINESS = {
  businessName: "Sole Plumbing",
  address: "1 George St, Sydney NSW 2000",
  abn: "12 345 678 901",
};

const CLIENT = {
  name: "Priya Shah",
  businessName: "Acme Pty Ltd",
  address: "88 Bourke St",
  abn: "98 765 432 109",
};

function settings(over: Partial<SalesSettings> = {}): SalesSettings {
  return { ...DEFAULT_SALES_SETTINGS, ...over };
}

/** No footer at all, so a test can switch on exactly what it's checking. */
const NO_FOOTER: Partial<SalesSettings> = {
  footerPhone: { enabled: false, countryCode: "+61", value: "" },
  footerLinks: {
    website: { enabled: false, value: "" },
    facebook: { enabled: false, value: "" },
    instagram: { enabled: false, value: "" },
    linkedin: { enabled: false, value: "" },
    tiktok: { enabled: false, value: "" },
  },
};

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    ...emptyInvoiceDraft("INV-0042", "2026-03-01"),
    id: "1",
    status: "Outstanding",
    paidAmount: 0,
    sentAt: null,
    possibleMatch: 0,
    isRecurring: false,
    paidWithCash: false,
    ...over,
  } as Invoice;
}

describe("footerParts", () => {
  it("lists the phone first, then each enabled link in the configured order, trimmed", () => {
    const parts = footerParts(
      settings({
        footerPhone: { enabled: true, countryCode: "+64", value: " 21 555 0101 " },
        footerLinks: {
          website: { enabled: true, value: " https://sole.test " },
          facebook: { enabled: false, value: "facebook.com/hidden" },
          instagram: { enabled: true, value: "@sole" },
          linkedin: { enabled: true, value: "   " },
          tiktok: { enabled: true, value: "@sole.tt" },
        },
      }),
    );
    expect(parts).toEqual(["+64 21 555 0101", "https://sole.test", "@sole", "@sole.tt"]);
  });

  it("skips a phone that's enabled but blank", () => {
    expect(
      footerParts(
        settings({
          ...NO_FOOTER,
          footerPhone: { enabled: true, countryCode: "+61", value: "  " },
        }),
      ),
    ).toEqual([]);
  });
});

describe("invoicePreviewDoc", () => {
  it("prints the invoice's number, DD/MM/YYYY date, parties and notes", () => {
    const doc = invoicePreviewDoc(
      invoice({ notes: "Thanks!" }),
      settings({ ...NO_FOOTER, logo: "data:logo" }),
      BUSINESS,
      CLIENT,
    );
    expect(doc).toMatchObject({
      kind: "Invoice",
      number: "INV-0042",
      date: "01/03/2026",
      businessName: "Sole Plumbing",
      businessPerson: "Sole Plumbing",
      businessAddress: BUSINESS.address,
      businessAbn: BUSINESS.abn,
      customerName: "Priya Shah",
      customerBusinessName: "Acme Pty Ltd",
      customerAddress: "88 Bourke St",
      customerAbn: "98 765 432 109",
      notes: "Thanks!",
      logo: "data:logo",
      footer: [],
    });
  });

  it("drops lines that come to nothing", () => {
    const doc = invoicePreviewDoc(
      invoice({
        items: [
          { ...newLineItem(), description: "Labour", quantity: "2", price: "50" },
          { ...newLineItem(), description: "", quantity: "", price: "" },
          // Fully discounted — net 0.
          { ...newLineItem(), description: "Freebie", quantity: "1", price: "40", discountPercent: "100" },
        ],
      }),
      settings(NO_FOOTER),
      BUSINESS,
      CLIENT,
    );
    expect(doc.lines.map((line) => line.name)).toEqual(["Labour"]);
  });

  it("folds a line's discount into the ex-GST unit price, so GST isn't charged twice", () => {
    const doc = invoicePreviewDoc(
      invoice({
        items: [
          // 4 × $100 less 25% = $300 net → $75 per unit; GST is on but not added here.
          { ...newLineItem(), description: "Consulting", quantity: "4", price: "100", discountPercent: "25", gst: true },
          // 2 × $50 less a flat $20 = $80 net → $40 per unit.
          { ...newLineItem(), description: "Travel", quantity: "2", price: "50", discountPercent: "20", discountType: "amount" },
        ],
      }),
      settings(NO_FOOTER),
      BUSINESS,
      CLIENT,
    );
    expect(doc.lines).toEqual([
      { name: "Consulting", description: "", quantity: "4", quantityType: "Items", price: 75 },
      { name: "Travel", description: "", quantity: "2", quantityType: "Items", price: 40 },
    ]);
  });

  it("uses the footer the settings switch on", () => {
    const doc = invoicePreviewDoc(invoice(), settings(), BUSINESS, CLIENT);
    expect(doc.footer).toEqual(footerParts(settings()));
  });
});

describe("samplePreviewDoc", () => {
  it("joins prefix and number as typed, at the width the number was typed", () => {
    const doc = samplePreviewDoc(
      "Invoice",
      settings({ invoicePrefix: "SOLE-", nextInvoiceNumber: "0025" }),
      BUSINESS,
    );
    expect(doc.number).toBe("SOLE-0025");
    expect(doc.kind).toBe("Invoice");
    expect(doc.notes).toBe(DEFAULT_SALES_SETTINGS.invoiceNotes);
  });

  it("adds no separator of its own, and uses the quote notes", () => {
    const doc = samplePreviewDoc(
      "Quote",
      settings({ quotePrefix: "Q", nextQuoteNumber: "7", quoteNotes: "Valid 30 days" }),
      BUSINESS,
    );
    expect(doc.number).toBe("Q7");
    expect(doc.notes).toBe("Valid 30 days");
  });

  it("falls back to INV/QUO and number 1 for a blank prefix or unreadable number", () => {
    const blank = settings({
      invoicePrefix: "",
      nextInvoiceNumber: "",
      quotePrefix: "",
      nextQuoteNumber: "",
    });
    expect(samplePreviewDoc("Invoice", blank, BUSINESS).number).toBe("INV-1");
    expect(samplePreviewDoc("Quote", blank, BUSINESS).number).toBe("QUO-1");
  });

  it("puts the real business on the sample, alongside the fixed sample client and lines", () => {
    const doc = samplePreviewDoc("Invoice", settings(), BUSINESS);
    expect(doc).toMatchObject({
      businessName: "Sole Plumbing",
      businessAddress: BUSINESS.address,
      businessAbn: BUSINESS.abn,
      customerName: "Alex Turner",
    });
    expect(doc.lines).toHaveLength(3);
  });
});
