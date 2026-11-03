import { describe, expect, it } from "vitest";

import {
  ALL_INDUSTRIES,
  GEOGRAPHIC_INSIGHTS_HREF,
  areaInvoicesHref,
  areaOverdueHref,
  areaQuotesHref,
  contactIndustry,
  geoLeaders,
  geographicInsights,
  metricMeta,
  metricValue,
  type GeoArea,
} from "@/lib/geographic-insights";
import { UNSPECIFIED_AREA } from "@/lib/customer-areas";
import type { Contact } from "@/lib/contacts";
import type { Invoice, InvoiceStatus } from "@/lib/invoices";
import type { Quote, QuoteStatus } from "@/lib/quotes";

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    businessName: "Acme Pty Ltd",
    personName: "Jo Bloggs",
    email: "",
    countryCode: "+61",
    phone: "",
    abn: "",
    website: "",
    currency: "AUD",
    division: "",
    position: "",
    addressLine1: "",
    city: "Melbourne",
    country: "Australia",
    notes: "",
    isPrimary: true,
    type: "Client",
    businessType: "Business",
    created: "",
    isDefault: false,
    ...overrides,
  };
}

/** A single GST-free line, so `invoiceAmount` is exactly `amount`. */
function invoice(
  clientId: string | null,
  amount: number,
  status: InvoiceStatus = "Outstanding",
  extra: Partial<Invoice> = {},
): Invoice {
  return {
    id: `inv-${Math.random()}`,
    number: "INV-1",
    clientId,
    clientName: "Someone",
    issued: "2026-08-01",
    due: "2026-08-31",
    status,
    description: "",
    items: [{ id: "l1", description: "", quantity: "1", price: String(amount), discountPercent: "0", gst: false }],
    extraDiscount: "",
    notes: "",
    paidAmount: 0,
    ...extra,
  } as unknown as Invoice;
}

function quote(clientId: string | null, amount: number, status: QuoteStatus): Quote {
  return {
    id: `q-${Math.random()}`,
    number: "Q-1",
    clientId,
    clientName: "Someone",
    issued: "2026-08-01",
    expiry: "2026-09-01",
    status,
    description: "",
    items: [{ id: "l1", description: "", quantity: "1", price: String(amount), discountPercent: "0", gst: false }],
    extraDiscount: "",
  } as unknown as Quote;
}

describe("contactIndustry", () => {
  it.each([
    ["Turner Consulting", "Professional services"],
    ["Bayside Dental", "Health & community"],
    ["Fast Freight Co", "Transport & logistics"],
    ["Joe's Plumbing", "Trades & construction"],
    ["Corner Bakery", "Hospitality"],
    ["The Book Shop", "Retail"],
    ["Zenith Holdings", "Other services"],
  ])("reads %j as %j", (businessName, industry) => {
    expect(contactIndustry(contact({ businessName }))).toBe(industry);
  });

  it("falls back to the person's name for an Individual", () => {
    expect(contactIndustry(contact({ businessName: "", personName: "Sam the Electrician" }))).toBe(
      "Trades & construction",
    );
  });
});

describe("metricMeta / metricValue", () => {
  const area = {
    invoiced: 1,
    paid: 2,
    overdue: 3,
    quotePipeline: 4,
    customerCount: 5,
  } as GeoArea;

  it("reads the right figure per metric", () => {
    expect(metricValue(area, "invoiced")).toBe(1);
    expect(metricValue(area, "paid")).toBe(2);
    expect(metricValue(area, "overdue")).toBe(3);
    expect(metricValue(area, "quotes")).toBe(4);
    expect(metricValue(area, "customers")).toBe(5);
  });

  it("knows which metrics are money", () => {
    expect(metricMeta("quotes")).toMatchObject({ label: "Quotes", money: true });
    expect(metricMeta("customers")).toMatchObject({ label: "Client count", money: false });
  });
});

describe("geographicInsights", () => {
  const contacts = [
    contact({ id: "mel", businessName: "Melb Consulting", city: "Melbourne", addressLine1: "1 Collins St" }),
    contact({ id: "syd", businessName: "Sydney Plumbing", city: "Sydney" }),
    contact({ id: "bne", businessName: "Brisbane Bakery", city: "Brisbane" }),
    contact({ id: "sup", businessName: "Supplier Retail", city: "Perth", type: "Supplier" }),
  ];

  it("ranks areas by invoiced value, each built by the drill-in's own calculation", () => {
    const result = geographicInsights({
      contacts,
      invoices: [
        invoice("mel", 500, "Paid", { paidAmount: 500 }),
        invoice("syd", 2000, "Overdue"),
        invoice("bne", 999, "Draft"),
      ],
      quotes: [quote("mel", 1000, "Accepted"), quote("bne", 300, "Sent"), quote("syd", 1000, "Declined")],
    });

    expect(result.areas.map((a) => [a.key, a.invoiced, a.state])).toEqual([
      ["Sydney", 2000, "NSW"],
      ["Melbourne", 500, "VIC"],
      ["Brisbane", 0, "QLD"],
    ]);
    expect(result.totals).toEqual({
      customers: 3,
      invoiced: 2500,
      paid: 500,
      overdue: 2000,
      quotePipeline: 300,
      openQuoteCount: 1,
      // Off summed values (1000 accepted / 2300 quoted), not an average of per-area %.
      conversion: 43,
    });
    expect(result.addresses).toEqual({ verified: 1, total: 3 });
    expect(result.leadingState).toBe("NSW");
  });

  it("never makes a supplier-only city an area", () => {
    const result = geographicInsights({ contacts, invoices: [], quotes: [] });
    expect(result.areas.map((a) => a.key)).not.toContain("Perth");
  });

  it("lists every client industry (suppliers excluded), sorted", () => {
    const result = geographicInsights({ contacts, invoices: [], quotes: [] });
    expect(result.industries).toEqual(["Hospitality", "Professional services", "Trades & construction"]);
  });

  it("filters documents and contacts to one industry, dropping deleted-client documents", () => {
    const result = geographicInsights({
      contacts,
      invoices: [invoice("syd", 2000), invoice("mel", 500), invoice(null, 50)],
      quotes: [],
      industry: "Professional services",
    });
    expect(result.areas.map((a) => a.key)).toEqual(["Melbourne"]);
    expect(result.totals.invoiced).toBe(500);
  });

  it("keeps a deleted client's documents under Unspecified for all industries", () => {
    const result = geographicInsights({
      contacts,
      invoices: [invoice(null, 50)],
      quotes: [],
      industry: ALL_INDUSTRIES,
    });
    expect(result.areas.find((a) => a.key === UNSPECIFIED_AREA)?.invoiced).toBe(50);
  });

  it("at state level, the key is the state", () => {
    const result = geographicInsights({
      contacts,
      invoices: [invoice("mel", 100), invoice("syd", 300)],
      quotes: [],
      level: "state",
    });
    expect(result.areas.map((a) => [a.key, a.state])).toEqual([
      ["NSW", "NSW"],
      ["VIC", "VIC"],
      ["QLD", "QLD"],
    ]);
  });

  it("has null conversion and leading state with nothing to go on", () => {
    const result = geographicInsights({ contacts: [], invoices: [], quotes: [] });
    expect(result.areas).toEqual([]);
    expect(result.totals.conversion).toBeNull();
    expect(result.leadingState).toBeNull();
  });
});

describe("geoLeaders", () => {
  const area = (key: string, invoiced: number, overdue: number, quotePipeline: number) =>
    ({ key, invoiced, overdue, quotePipeline }) as GeoArea;

  it("picks the top area per question, ignoring zeros", () => {
    const a = area("A", 100, 0, 50);
    const b = area("B", 300, 20, 0);
    const c = area("C", 200, 40, 10);
    expect(geoLeaders([a, b, c])).toEqual({ value: b, collect: c, pipeline: a });
  });

  it("is null for a question whose figure is zero everywhere", () => {
    expect(geoLeaders([area("A", 0, 0, 0)])).toEqual({ value: null, collect: null, pipeline: null });
    expect(geoLeaders([])).toEqual({ value: null, collect: null, pipeline: null });
  });
});

describe("area links", () => {
  it("scopes each list to the area, with the status the figure is about", () => {
    expect(GEOGRAPHIC_INSIGHTS_HREF).toBe("/dashboard/geographic-insights");
    expect(areaInvoicesHref("Gold Coast")).toBe("/invoices?area=Gold+Coast");
    expect(areaOverdueHref("Melbourne")).toBe("/invoices?area=Melbourne&status=Overdue");
    expect(areaQuotesHref("Auckland, New Zealand")).toBe("/quotes?area=Auckland%2C+New+Zealand&status=Sent");
  });
});
