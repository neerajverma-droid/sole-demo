import { describe, expect, it } from "vitest";

import {
  AREA_LEVELS,
  UNSPECIFIED_AREA,
  areaDisplayName,
  areaLabelFor,
  areaLevelLabel,
  areaPredicate,
  areaState,
  customerAreaDetail,
  customerAreas,
  isAreaLevel,
} from "@/lib/customer-areas";
import type { Contact } from "@/lib/contacts";
import type { Invoice, InvoiceStatus } from "@/lib/invoices";
import type { Quote, QuoteStatus } from "@/lib/quotes";

/** A Client-tab contact as `fetchAllContacts` maps it. `id` is the CLIENT id. */
function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    businessName: "Acme Pty Ltd",
    personName: "Jo Bloggs",
    email: "jo@acme.test",
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

/**
 * Only the fields the area maths reads. `amount` becomes a single GST-free
 * line, so `invoiceAmount(invoice)` is exactly `amount`.
 */
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
    clientName: extra.clientName ?? "Someone",
    issued: "2026-08-01",
    due: "2026-08-31",
    status,
    description: "",
    items: [
      { id: "l1", description: "Work", quantity: "1", price: String(amount), discountPercent: "0", gst: false },
    ],
    extraDiscount: "",
    notes: "",
    paidAmount: 0,
    ...extra,
  } as unknown as Invoice;
}

function quote(clientId: string | null, amount: number, status: QuoteStatus, clientName = "Someone"): Quote {
  return {
    id: `q-${Math.random()}`,
    number: "Q-1",
    clientId,
    clientName,
    issued: "2026-08-01",
    expiry: "2026-09-01",
    status,
    description: "",
    items: [
      { id: "l1", description: "Work", quantity: "1", price: String(amount), discountPercent: "0", gst: false },
    ],
    extraDiscount: "",
  } as unknown as Quote;
}

describe("isAreaLevel / areaLevelLabel", () => {
  it("accepts exactly the three level keys", () => {
    expect(AREA_LEVELS.map((l) => l.key)).toEqual(["suburb", "state", "postcode"]);
    expect(isAreaLevel("suburb")).toBe(true);
    expect(isAreaLevel("postcode")).toBe(true);
    expect(isAreaLevel("country")).toBe(false);
    expect(isAreaLevel(undefined)).toBe(false);
  });

  it("labels each level for the toggle", () => {
    expect(areaLevelLabel("suburb")).toBe("Suburb/City");
    expect(areaLevelLabel("state")).toBe("State");
    expect(areaLevelLabel("postcode")).toBe("Postcode");
  });
});

describe("areaLabelFor", () => {
  it("is the city at suburb level (the default) for an Australian client", () => {
    expect(areaLabelFor(contact({ city: " Melbourne " }))).toBe("Melbourne");
    expect(areaLabelFor(contact({ city: "Brisbane", country: "" }), "suburb")).toBe("Brisbane");
  });

  it("is Unspecified for no contact, or a blank city", () => {
    expect(areaLabelFor(undefined)).toBe(UNSPECIFIED_AREA);
    expect(areaLabelFor(contact({ city: "   " }))).toBe(UNSPECIFIED_AREA);
    expect(areaLabelFor(contact({ city: "" }), "state")).toBe(UNSPECIFIED_AREA);
  });

  it("disambiguates an overseas city with its country at suburb level", () => {
    expect(areaLabelFor(contact({ city: "Auckland", country: "New Zealand" }))).toBe("Auckland, New Zealand");
  });

  it("treats 'australia' case-insensitively as domestic", () => {
    expect(areaLabelFor(contact({ city: "Sydney", country: "AUSTRALIA" }))).toBe("Sydney");
  });

  it("keeps an overseas client's country at state and postcode level", () => {
    const nz = contact({ city: "Auckland", country: "New Zealand" });
    expect(areaLabelFor(nz, "state")).toBe("New Zealand");
    expect(areaLabelFor(nz, "postcode")).toBe("New Zealand");
  });

  it("groups by the sample state/postcode lookup, case-insensitively", () => {
    expect(areaLabelFor(contact({ city: "GOLD COAST" }), "state")).toBe("QLD");
    expect(areaLabelFor(contact({ city: "Fremantle" }), "postcode")).toBe("6160");
    expect(areaLabelFor(contact({ city: "Darwin" }), "postcode")).toBe("0800");
  });

  it("puts a city the sample doesn't know under Unspecified at state/postcode level", () => {
    const unknown = contact({ city: "Ballarat" });
    expect(areaLabelFor(unknown, "suburb")).toBe("Ballarat");
    expect(areaLabelFor(unknown, "state")).toBe(UNSPECIFIED_AREA);
    expect(areaLabelFor(unknown, "postcode")).toBe(UNSPECIFIED_AREA);
  });
});

describe("customerAreas", () => {
  const contacts = [
    contact({ id: "mel", city: "Melbourne" }),
    contact({ id: "geel", city: "Geelong" }),
    contact({ id: "syd", city: "Sydney" }),
    contact({ id: "nocity", city: "" }),
  ];

  it("joins invoice.clientId against Contact.id and sums invoiced value per area, ranked", () => {
    const summary = customerAreas(
      [invoice("mel", 600), invoice("mel", 200), invoice("syd", 1000), invoice("geel", 200)],
      contacts,
    );
    expect(summary.total).toBe(2000);
    expect(summary.remaining).toBe(0);
    expect(summary.areas).toEqual([
      { key: "Sydney", label: "Sydney", amount: 1000, invoiceCount: 1, percent: 50 },
      { key: "Melbourne", label: "Melbourne", amount: 800, invoiceCount: 2, percent: 40 },
      { key: "Geelong", label: "Geelong", amount: 200, invoiceCount: 1, percent: 10 },
    ]);
  });

  it("skips drafts entirely", () => {
    const summary = customerAreas([invoice("mel", 500, "Draft"), invoice("mel", 100, "Paid")], contacts);
    expect(summary.total).toBe(100);
    expect(summary.areas).toEqual([expect.objectContaining({ label: "Melbourne", invoiceCount: 1 })]);
  });

  it("keeps money from a deleted contact, a null clientId and a blank city, under Unspecified", () => {
    const summary = customerAreas(
      [invoice("gone", 100), invoice(null, 50), invoice("nocity", 25)],
      contacts,
    );
    expect(summary.areas).toEqual([
      expect.objectContaining({ label: UNSPECIFIED_AREA, amount: 175, invoiceCount: 3, percent: 100 }),
    ]);
  });

  it("cuts at the limit (4 by default), counting what's past it and keeping it in the total", () => {
    const many = ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Hobart"].map((city, i) =>
      contact({ id: `x${i}`, city }),
    );
    const invoices = many.map((c, i) => invoice(c.id, 100 * (i + 1)));

    const byDefault = customerAreas(invoices, many);
    expect(byDefault.areas.map((a) => a.label)).toEqual(["Hobart", "Adelaide", "Perth", "Brisbane"]);
    expect(byDefault.remaining).toBe(2);
    expect(byDefault.total).toBe(2100);

    expect(customerAreas(invoices, many, { limit: 2 }).remaining).toBe(4);
  });

  it("groups by state when asked", () => {
    const summary = customerAreas(
      [invoice("mel", 300), invoice("geel", 100), invoice("syd", 100)],
      contacts,
      { level: "state" },
    );
    expect(summary.areas.map((a) => [a.label, a.amount])).toEqual([
      ["VIC", 400],
      ["NSW", 100],
    ]);
  });

  it("is empty with 0% rather than NaN when nothing has been invoiced", () => {
    expect(customerAreas([], contacts)).toEqual({ areas: [], total: 0, remaining: 0 });
    const zero = customerAreas([invoice("mel", 0)], contacts);
    expect(zero.areas[0].percent).toBe(0);
  });
});

describe("areaPredicate", () => {
  const contacts = [contact({ id: "mel", city: "Melbourne" }), contact({ id: "syd", city: "Sydney" })];

  it("filters nothing for a null area", () => {
    const keep = areaPredicate(null, contacts);
    expect(keep("mel")).toBe(true);
    expect(keep(null)).toBe(true);
  });

  it("keeps exactly the documents whose client falls in that area", () => {
    const inMelbourne = areaPredicate("Melbourne", contacts);
    expect(inMelbourne("mel")).toBe(true);
    expect(inMelbourne("syd")).toBe(false);
    expect(inMelbourne(null)).toBe(false);
  });

  it("matches the Unspecified bucket for deleted/unknown clients, at the chosen level", () => {
    const unspecified = areaPredicate(UNSPECIFIED_AREA, contacts);
    expect(unspecified(null)).toBe(true);
    expect(unspecified("deleted")).toBe(true);
    expect(areaPredicate("VIC", contacts, "state")("mel")).toBe(true);
  });
});

describe("areaState / areaDisplayName", () => {
  it("knows the sample state for a domestic city, case-insensitively", () => {
    expect(areaState("Newstead")).toBe("QLD");
    expect(areaState(" canberra ")).toBe("ACT");
  });

  it("is null for the Unspecified bucket, an overseas area and an unknown city", () => {
    expect(areaState(UNSPECIFIED_AREA)).toBeNull();
    expect(areaState("Sydney, Canada")).toBeNull();
    expect(areaState("Ballarat")).toBeNull();
  });

  it("labels a suburb with its state where known, else as-is", () => {
    expect(areaDisplayName("Melbourne")).toBe("Melbourne, VIC");
    expect(areaDisplayName("Ballarat")).toBe("Ballarat");
    expect(areaDisplayName("Auckland, New Zealand")).toBe("Auckland, New Zealand");
    expect(areaDisplayName(UNSPECIFIED_AREA)).toBe(UNSPECIFIED_AREA);
  });

  it("leaves a state as-is and names a postcode's state", () => {
    expect(areaDisplayName("QLD", "state")).toBe("QLD");
    expect(areaDisplayName("4006", "postcode")).toBe("4006, QLD");
    expect(areaDisplayName("9999", "postcode")).toBe("9999");
  });
});

describe("customerAreaDetail", () => {
  const contacts = [
    contact({ id: "a", businessName: "Alpha Co", city: "Melbourne", addressLine1: "1 Collins St" }),
    contact({ id: "b", businessName: "", personName: "Bea Individual", city: "Melbourne" }),
    contact({ id: "s", businessName: "Supplier Co", city: "Melbourne", type: "Supplier" }),
    contact({ id: "syd", businessName: "Sydney Co", city: "Sydney" }),
  ];

  it("scopes every figure to the area and adds them up per customer", () => {
    const detail = customerAreaDetail("Melbourne", {
      contacts,
      invoices: [
        invoice("a", 1000, "Paid", { paidAmount: 1000 }),
        invoice("a", 400, "Overdue", { paidAmount: 100 }),
        invoice("b", 300, "Outstanding"),
        invoice("a", 999, "Draft"),
        invoice("syd", 5000, "Overdue"),
      ],
      quotes: [
        quote("a", 200, "Sent"),
        quote("a", 800, "Accepted"),
        quote("b", 1000, "Declined"),
        quote("b", 777, "Draft"),
        quote("syd", 9000, "Sent"),
      ],
    });

    expect(detail).toMatchObject({
      key: "Melbourne",
      displayName: "Melbourne, VIC",
      customerCount: 2,
      invoiced: 1700,
      paid: 1100,
      overdue: 300,
      overdueCount: 1,
      quotePipeline: 200,
      openQuoteCount: 1,
      quotedValue: 2000,
      acceptedValue: 800,
      conversion: 40,
      addresses: { verified: 1, total: 2 },
    });

    const alpha = detail.customers.find((c) => c.contactId === "a");
    expect(alpha).toEqual({
      key: "a",
      contactId: "a",
      name: "Alpha Co",
      invoiced: 1400,
      paid: 1100,
      overdue: 300,
      openQuotes: 200,
      openQuoteCount: 1,
    });
    // An Individual is named by its person.
    expect(detail.customers.find((c) => c.contactId === "b")?.name).toBe("Bea Individual");
  });

  it("counts a client on the books in the area even before they're billed, but never a supplier", () => {
    const detail = customerAreaDetail("Melbourne", { contacts, invoices: [], quotes: [] });
    expect(detail.customers.map((c) => c.contactId).sort()).toEqual(["a", "b"]);
    expect(detail.invoiced).toBe(0);
    expect(detail.conversion).toBeNull();
  });

  it("groups a deleted contact's documents by the name the document kept", () => {
    const detail = customerAreaDetail(UNSPECIFIED_AREA, {
      contacts,
      invoices: [
        invoice(null, 100, "Outstanding", { clientName: "Gone Ltd" }),
        invoice("deleted-id", 50, "Outstanding", { clientName: "Gone Ltd" }),
        invoice(null, 70, "Outstanding", { clientName: "Other Gone" }),
      ],
      quotes: [quote(null, 30, "Sent", "Gone Ltd")],
    });

    expect(detail.customers).toEqual([
      expect.objectContaining({ key: "name:Gone Ltd", contactId: null, name: "Gone Ltd", invoiced: 150, openQuotes: 30 }),
      expect.objectContaining({ key: "name:Other Gone", contactId: null, invoiced: 70 }),
    ]);
    // Name-only customers have no record to verify an address against.
    expect(detail.addresses).toEqual({ verified: 0, total: 0 });
  });
});
