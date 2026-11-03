import { describe, expect, it } from "vitest";

import { INDUSTRIES } from "@/lib/settings";
import firstActions from "@/lib/onboarding-survey/first-actions";

describe("firstActions", () => {
  it("quote-leads for a quote-led trade", () => {
    const actions = firstActions("Trades");
    expect(actions[0].key).toBe("quote");
    expect(actions.map((a) => a.key)).toEqual(["quote", "invoice", "expense"]);
  });

  it("stock-leads for a stock-led trade", () => {
    const actions = firstActions("Retail");
    expect(actions[0].key).toBe("products");
    expect(actions.map((a) => a.key)).toEqual([
      "products",
      "invoice",
      "expense",
    ]);
  });

  it("invoice-leads for anything else", () => {
    const actions = firstActions("Finance");
    expect(actions.map((a) => a.key)).toEqual(["invoice", "expense", "quote"]);
  });

  it("gives Consulting the same ordering as Professional services", () => {
    expect(firstActions("Consulting").map((a) => a.key)).toEqual(
      firstActions("Professional services").map((a) => a.key),
    );
  });

  it("never returns more than three actions", () => {
    for (const industry of [...INDUSTRIES, "", "Nonsense"]) {
      expect(firstActions(industry).length).toBeLessThanOrEqual(3);
    }
  });

  it("uses this app's real routes, not source's Pages Router ones", () => {
    const actions = firstActions("Trades");
    const quote = actions.find((a) => a.key === "quote");
    const invoice = firstActions("Finance").find((a) => a.key === "invoice");
    const expense = firstActions("Finance").find((a) => a.key === "expense");
    const products = firstActions("Retail").find((a) => a.key === "products");

    expect(quote?.href).toBe("/quotes/new");
    expect(invoice?.href).toBe("/invoices/new");
    expect(expense?.href).toBe("/expenses/new");
    expect(products?.href).toBe("/sales/products");
  });

  it("filters out anything canUse rejects", () => {
    const actions = firstActions("Retail", () => false);
    // Every action in ACTIONS currently has no `feature`, so canUse is called
    // with `undefined` for each — a caller that rejects everything (including
    // undefined) should end up with nothing offered.
    expect(actions).toEqual([]);
  });

  it("defaults canUse to always-allow", () => {
    expect(firstActions("Retail").length).toBeGreaterThan(0);
  });
});
