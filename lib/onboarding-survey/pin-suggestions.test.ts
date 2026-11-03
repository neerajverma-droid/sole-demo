import { describe, expect, it } from "vitest";

import { INDUSTRIES } from "@/lib/settings";
import suggestedPinIds from "@/lib/onboarding-survey/pin-suggestions";

const CORE = ["invoices", "expenses-list", "all-transactions", "contacts"];

describe("suggestedPinIds", () => {
  it("gives everyone the core four, regardless of industry", () => {
    for (const id of CORE) {
      expect(suggestedPinIds("Trades")).toContain(id);
      expect(suggestedPinIds("")).toContain(id);
    }
  });

  it("leads with the trade-specific extras before the core four", () => {
    const ids = suggestedPinIds("Trades");
    expect(ids.indexOf("quotes")).toBeLessThan(ids.indexOf("invoices"));
  });

  it("never returns an id that isn't a real nav id (defensive filter)", () => {
    // A renamed/removed nav id, or a source id that was never a real nav id
    // to begin with (an add-on, or something with no equivalent) must never
    // leak through.
    for (const industry of [...INDUSTRIES, "", "Nonsense industry"]) {
      const ids = suggestedPinIds(industry);
      expect(ids).not.toContain("km-tracker");
      expect(ids).not.toContain("time-tracker");
      expect(ids).not.toContain("scheduling");
      expect(ids).not.toContain("booking-links");
      expect(ids).not.toContain("all-projects");
      expect(ids).not.toContain("proposal");
      expect(ids).not.toContain("all-trips");
      expect(ids).not.toContain("investment-property");
      expect(ids).not.toContain("property-portfolio");
      expect(ids).not.toContain("reputation");
      expect(ids).not.toContain("super-contributions");
      // "assets" (the paid add-on id) is never suggested — only its free
      // nav equivalent, "asset-register", is.
      expect(ids).not.toContain("assets");
    }
  });

  it("maps source's remapped ids to this app's real nav ids", () => {
    expect(suggestedPinIds("Trades")).toContain("asset-register");
    expect(suggestedPinIds("Retail")).toEqual(
      expect.arrayContaining(["inventory", "products", "cust-supplier"]),
    );
    expect(suggestedPinIds("Finance")).toContain("bas");
  });

  it("dedupes when an extra overlaps a core id", () => {
    const ids = suggestedPinIds("Trades");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back to CORE only for an industry with nothing left after filtering", () => {
    // "NDIS (Health and Social Care)" mapped from source's "Health and Social
    // Care" whose whole extras list (scheduling, booking-links, time-tracker)
    // has no pinnable equivalent here.
    expect(suggestedPinIds("NDIS (Health and Social Care)")).toEqual(
      expect.arrayContaining(CORE),
    );
    expect(suggestedPinIds("NDIS (Health and Social Care)").length).toBe(
      CORE.length,
    );
  });

  it("covers every one of this app's industries without throwing", () => {
    for (const industry of INDUSTRIES) {
      expect(() => suggestedPinIds(industry)).not.toThrow();
    }
  });
});
