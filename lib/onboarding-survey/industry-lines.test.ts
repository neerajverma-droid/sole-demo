import { describe, expect, it } from "vitest";

import { INDUSTRIES } from "@/lib/settings";
import industryLine, {
  INDUSTRY_LINE_SOURCE,
} from "@/lib/onboarding-survey/industry-lines";

describe("industryLine", () => {
  it("covers every one of this app's industries with no gaps in the remap", () => {
    for (const industry of INDUSTRIES) {
      expect(Object.prototype.hasOwnProperty.call(INDUSTRY_LINE_SOURCE, industry)).toBe(
        true,
      );
    }
  });

  it("gives a real, non-generic line for an industry with a source match", () => {
    expect(industryLine("Trades")).toBe(
      "A tradie! Tools, materials and ute expenses are ready for you.",
    );
    expect(industryLine("NDIS (Health and Social Care)")).toBe(
      "Health and care work — I'll set you up for NDIS-style invoicing too.",
    );
    expect(industryLine("Make up")).toBe(
      "Lovely — products, tools and chair rent are all claimable.",
    );
    expect(industryLine("Admin Services")).toBe(
      "Admin it is — invoices, subscriptions and software, sorted.",
    );
    expect(industryLine("Transport & logistics")).toBe(
      "Transport — fuel, tolls and vehicle costs are set up.",
    );
    expect(industryLine("Influencers")).toBe(
      "Content creator — gear, subscriptions and travel are in.",
    );
  });

  it("gives 'Consulting' the generic fallback rather than inventing new copy", () => {
    expect(industryLine("Consulting")).toBe(
      "Got it — Consulting. I'll tune your categories for that.",
    );
  });

  it("falls back to the generic line for anything unrecognised", () => {
    expect(industryLine("Underwater basket weaving")).toBe(
      "Got it — Underwater basket weaving. I'll tune your categories for that.",
    );
  });

  it("doesn't throw on an empty name", () => {
    expect(industryLine()).toBe("Got it — . I'll tune your categories for that.");
  });

  it("every non-null remap entry resolves to a real, distinct line", () => {
    for (const industry of INDUSTRIES) {
      if (INDUSTRY_LINE_SOURCE[industry] === null) continue;
      const line = industryLine(industry);
      expect(line.startsWith("Got it —")).toBe(false);
    }
  });
});
