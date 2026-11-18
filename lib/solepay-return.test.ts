import { describe, expect, it } from "vitest";

import { invoiceEditHref, solePayOnboardingHref } from "@/lib/solepay-return";

describe("solePayOnboardingHref", () => {
  it("carries the saved draft's id", () => {
    expect(solePayOnboardingHref({ invoiceId: "42" })).toBe(
      "/payments/solepay/onboarding?returnInvoice=42",
    );
  });

  it("carries an in-app path when there is no invoice", () => {
    expect(solePayOnboardingHref({ returnTo: "/invoices/new" })).toBe(
      "/payments/solepay/onboarding?returnTo=%2Finvoices%2Fnew",
    );
  });

  it("refuses a path that leaves the app", () => {
    expect(solePayOnboardingHref({ returnTo: "https://evil.example" })).toBe(
      "/payments/solepay/onboarding",
    );
    expect(solePayOnboardingHref({ returnTo: "//evil.example" })).toBe(
      "/payments/solepay/onboarding",
    );
  });

  it("goes plain when opened with nothing to return to", () => {
    expect(solePayOnboardingHref()).toBe("/payments/solepay/onboarding");
  });
});

describe("invoiceEditHref", () => {
  it("is the invoice's own page, which opens a draft for editing", () => {
    expect(invoiceEditHref("42")).toBe("/invoices/42");
  });
});
