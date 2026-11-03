import { describe, expect, it } from "vitest";

import { buildInvoicePayload, depositPayload } from "@/lib/invoice-submit";
import { emptyInvoiceDraft, isForeignCurrency, newLineItem } from "@/lib/invoices";

/** A New Zealand business: its books are NZD, so NZD is the base, not AUD. */
const NZ_CONTEXT = {
  gstPercent: 15,
  gstEnabled: true,
  templateId: "1",
  rails: { stripeConnected: false, payrixConnected: false, payrixAutomate: false, paymentType: "direct_payment", showBankDetails: true },
  exchangeRate: null as number | null,
  baseCurrency: "NZD",
  files: [] as File[],
};

const draft = (over: Record<string, unknown> = {}) => ({
  ...emptyInvoiceDraft("INV-1", "2026-03-01"),
  due: "2026-03-15",
  clientId: "7",
  items: [{ ...newLineItem(), description: "Work", quantity: "1", price: "100", gst: false }],
  ...over,
});

describe("invoice payload for a business whose base currency is NZD", () => {
  it("converts an INR invoice into NZD with the NZD-base rate", () => {
    const payload = buildInvoicePayload(draft({ convertCurrency: true, currency: "INR" }), "draft", { ...NZ_CONTEXT, exchangeRate: 47.6 });
    expect(payload).toMatchObject({
      currency_code: "INR",
      is_multicurrency: 1,
      exchange_rate: 47.6,
      total: 2.1, // 100 INR ÷ 47.6 INR per NZD
      exchange_total: 100,
    });
  });

  it("is not multi-currency when the document is in the business's own currency", () => {
    const payload = buildInvoicePayload(draft(), "draft", NZ_CONTEXT);
    expect(payload).toMatchObject({ currency_code: "NZD", is_multicurrency: 0, total: 100 });
  });

  it("ignores a stale NZD 'conversion' — the base is never converted into itself", () => {
    const payload = buildInvoicePayload(draft({ convertCurrency: true, currency: "NZD" }), "draft", { ...NZ_CONTEXT, exchangeRate: 1 });
    expect(payload).toMatchObject({ currency_code: "NZD", is_multicurrency: 0 });
  });

  it("treats AUD as a foreign currency for a New Zealand business", () => {
    const payload = buildInvoicePayload(draft({ convertCurrency: true, currency: "AUD" }), "draft", { ...NZ_CONTEXT, exchangeRate: 0.92 });
    expect(payload).toMatchObject({ currency_code: "AUD", is_multicurrency: 1 });
  });

  it("states the deposit's currency as the base, not AUD", () => {
    const sent = depositPayload({ deposit: { mode: "amount", value: "20", dueDate: "2026-03-10" } as never, items: [] }, { subTotal: 100, discount: 0, extraDiscount: 0, gst: 0, total: 100 }, 15, null, new Map(), "NZD");
    expect(sent.deposit_value_currency).toBe("NZD");
  });

  it("falls back to AUD when no base is given, as before", () => {
    const legacy: Partial<typeof NZ_CONTEXT> = { ...NZ_CONTEXT };
    delete legacy.baseCurrency;
    expect(buildInvoicePayload(draft(), "draft", legacy as typeof NZ_CONTEXT)).toMatchObject({ currency_code: "AUD" });
  });
});

describe("isForeignCurrency with a base", () => {
  it("compares against the given base", () => {
    expect(isForeignCurrency("AUD", "NZD")).toBe(true);
    expect(isForeignCurrency("NZD", "NZD")).toBe(false);
    expect(isForeignCurrency("NZD")).toBe(true); // default base is AUD
  });
});
