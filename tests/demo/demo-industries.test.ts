import { afterEach, describe, expect, it } from "vitest";

import { buildStory } from "@/lib/demo-seed/build-story";
import { mapCountryContext } from "@/lib/country-context";
import { generateSeedData } from "@/lib/demo-seed/generator";
import { INDUSTRY_CATALOG } from "@/lib/demo-seed/industries/catalog";
import { getSeedData, handleMockRequest } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";

const COUNTRIES = ["AU", "NZ"] as const;
const rate = { AU: 10, NZ: 15 } as const;
const currency = { AU: "AUD", NZ: "NZD" } as const;

afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

function startVisit(industry: string, country: "AU" | "NZ") {
  const res = handleMockRequest("POST", "/demo/login", {}, { industry, country });
  expect(res?.data.success).toBe(true);
  return res!.data.data.user;
}

describe("every industry generates sound books in both countries", () => {
  for (const entry of INDUSTRY_CATALOG) {
    for (const country of COUNTRIES) {
      it(`${entry.slug} / ${country}`, () => {
        const story = buildStory(entry.slug, country);
        const seed = generateSeedData(story);

        expect(story.business.name.trim()).not.toBe("");
        expect(seed.clients).toHaveLength(16);
        expect(seed.invoices.length).toBeGreaterThan(20);
        expect(seed.expenses.length).toBeGreaterThan(20);
        expect(seed.quotes.length).toBeGreaterThan(5);
        expect(seed.bills).toHaveLength(6);
        expect(seed.projects).toHaveLength(4);
        expect(seed.employees).toHaveLength(2);
        expect(seed.calendarEvents.length).toBeGreaterThanOrEqual(5);
        expect(seed.matchingRules).toHaveLength(4);
        expect(seed.proposalTemplates).toHaveLength(4);
        expect(seed.creditNotes).toHaveLength(6);
        expect(seed.notifications).toHaveLength(5);

        for (const inv of seed.invoices) {
          expect(inv.currency_code).toBe(currency[country]);
          // Tax is the country's rate on the sub-total, and the total adds up.
          expect(inv.tax_amount).toBeCloseTo(inv.sub_total * (rate[country] / 100), 1);
          expect(inv.total).toBeCloseTo(inv.sub_total + inv.tax_amount, 1);
        }
        for (const bill of seed.bills) {
          expect(bill.total_gst).toBeCloseTo(bill.sub_total * (rate[country] / 100), 1);
          expect(bill.total).toBeCloseTo(bill.sub_total + bill.total_gst, 1);
        }

        // Every record points at a client/supplier that exists.
        const clientIds = new Set(seed.clients.map((c) => Number(c.id)));
        for (const inv of seed.invoices) expect(clientIds.has(inv.client_id)).toBe(true);
        const supplierIds = new Set(seed.suppliers.map((s) => Number(s.id)));
        for (const exp of seed.expenses) expect(supplierIds.has(exp.client_id)).toBe(true);
        for (const bill of seed.bills) expect(supplierIds.has(bill.client_id)).toBe(true);

        // Stock only exists for inventory industries.
        expect(seed.customProducts.some((p) => p.inventory_flag === 1)).toBe(story.inventory.length > 0);
      });
    }
  }

  it("the same industry and country always produce the same books", () => {
    const anchor = new Date("2026-11-27T10:00:00Z");
    const a = generateSeedData(buildStory("plumbing", "NZ"), anchor);
    const b = generateSeedData(buildStory("plumbing", "NZ"), anchor);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("different industries do not share their books", () => {
    const plumber = generateSeedData(buildStory("plumbing", "AU"));
    const baker = generateSeedData(buildStory("hospitality", "AU"));
    expect(plumber.business.name).not.toBe(baker.business.name);
    expect(plumber.customProducts.map((p) => p.item_name)).not.toEqual(baker.customProducts.map((p) => p.item_name));
  });

  it("an unknown industry falls back to the default demo", () => {
    expect(buildStory("not-a-real-industry", "AU").slug).toBe("electrical");
    expect(buildStory(null, "AU").business.name).toBe("Coastal Spark Electrical");
  });
});

describe("demo login picks the industry and country", () => {
  it("returns a user for the chosen business, in the chosen country", () => {
    const user = startVisit("plumbing", "NZ");
    expect(user.business_name).toMatch(/Plumbing/);
    expect(user.demo_industry).toBe("plumbing");
    expect(user.demo_country).toBe("NZ");
    expect(user.businesses[0].currency).toBe("NZD");
    expect(user.businesses[0].country_iso2).toBe("NZ");
    expect(user.is_demo).toBe(true);
    expect(user.token.startsWith("demo_")).toBe(true);
  });

  it("serves that business and its industry id", () => {
    startVisit("ndis", "AU");
    const business = handleMockRequest("GET", "/businesses")?.data.data[0];
    expect(business.industry_id).toBe(9);
    expect(business.country_iso2).toBe("AU");

    const list = handleMockRequest("GET", "/industry")?.data.data;
    expect(list.find((i: any) => i.id === 9)?.name).toMatch(/NDIS/);
    expect(list.length).toBe(INDUSTRY_CATALOG.length);
  });

  it("opens every plan module for every industry, so a prospect can visit them all", () => {
    for (const slug of ["personal-trainer", "hospitality", "ndis", "plumbing"]) {
      startVisit(slug, "AU");
      const features: string[] = handleMockRequest("POST", "/user/getProfile")?.data.data.user.allowed_features;
      for (const f of ["dashboard", "booking", "payroll", "inventory", "projects", "km-tracker", "proposals", "assets-advanced", "time-tracking", "investment", "tax-estimator"]) {
        expect(features, `${slug} should have ${f}`).toContain(f);
      }
    }
  });
});

describe("country context", () => {
  it("Australia: GST 10%, BAS, ABN, BSB, super and the AU features", () => {
    startVisit("plumbing", "AU");
    const ctx = mapCountryContext(handleMockRequest("GET", "/country-context")?.data.data);
    expect(ctx.iso2).toBe("AU");
    expect(ctx.currency).toBe("AUD");
    expect(ctx.standardRate).toBe(10);
    expect(ctx.effectiveTax.rate).toBe(10);
    expect(ctx.returnName).toBe("BAS");
    expect(ctx.labels.business_id).toBe("ABN");
    expect(ctx.bankAccountSchema.map((f) => f.key)).toEqual(["bsb", "account_number"]);
    expect(ctx.features.super_contributions).toBe(true);
    expect(ctx.features.ndis).toBe(true);
    expect(ctx.bankFeed?.key).toBe("fiskil");
    expect(ctx.currentFiscalYear?.startDate.slice(5)).toBe("07-01");
  });

  it("New Zealand: GST 15%, GST return, NZBN, one account number, no super/NDIS/tax estimator", () => {
    startVisit("plumbing", "NZ");
    const ctx = mapCountryContext(handleMockRequest("GET", "/country-context")?.data.data);
    expect(ctx.iso2).toBe("NZ");
    expect(ctx.currency).toBe("NZD");
    expect(ctx.currencySymbol).toBe("NZ$");
    expect(ctx.standardRate).toBe(15);
    expect(ctx.effectiveTax.rate).toBe(15);
    expect(ctx.returnName).toBe("GST return");
    expect(ctx.taxAuthority).toBe("Inland Revenue");
    expect(ctx.labels.business_id).toBe("NZBN");
    expect(ctx.labels.bank_branch).toBeNull();
    expect(ctx.bankAccountSchema.map((f) => f.key)).toEqual(["account_number"]);
    expect(ctx.features.super_contributions).toBe(false);
    expect(ctx.features.ndis).toBe(false);
    expect(ctx.features.income_tax_estimator).toBe(false);
    expect(ctx.features.investment_property).toBe(false);
    expect(ctx.bankFeed?.key).toBe("akahu");
    expect(ctx.filingFrequency).toBe("bimonthly");
    expect(ctx.currentFiscalYear?.startDate.slice(5)).toBe("04-01");
    // Address form offers NZ regions, not Australian states.
    const address = ctx.forms.address?.fields ?? [];
    expect(address.find((f) => f.key === "state")?.options).toContain("Canterbury");
    expect(address.find((f) => f.key === "state")?.options).not.toContain("NSW");
  });

  it("NZ still hides the modules the registry doesn't offer there", () => {
    startVisit("investment-property", "NZ");
    const features: string[] = handleMockRequest("POST", "/user/getProfile")?.data.data.user.allowed_features;
    expect(features).not.toContain("investment");
    expect(features).not.toContain("tax-estimator");
    expect(features).toContain("payroll");

    startVisit("cleaning", "AU");
    const au: string[] = handleMockRequest("POST", "/user/getProfile")?.data.data.user.allowed_features;
    expect(au).toContain("investment");
  });

  it("the subscription has every add-on the country offers, so nothing shows as locked", () => {
    startVisit("hairdressers", "NZ");
    const nz = handleMockRequest("GET", "/subscription/my-subscription")?.data.data.subscription_detail.addons as string[];
    expect(nz).toContain("booking");
    expect(nz).toContain("inventory");
    expect(nz).not.toContain("investment");
    expect(nz).not.toContain("tax-estimator");
    expect(nz).toContain("km");
    expect(nz).toContain("payroll");
    expect(nz).toContain("proposals");
    const catalogue = handleMockRequest("GET", "/subscription/plans")?.data.data.addons as { slug: string }[];
    expect(catalogue.some((a) => a.slug === "investment")).toBe(false);

    startVisit("hairdressers", "AU");
    const au = handleMockRequest("GET", "/subscription/my-subscription")?.data.data.subscription_detail.addons as string[];
    expect(au).toContain("tax-estimator");
  });

  it("NZ business tax settings use 15%", () => {
    startVisit("cleaning", "NZ");
    const tax = handleMockRequest("GET", "/v2/settings/tax-settings")?.data.data;
    expect(tax.tax_settings.tax_percentage).toBe("15");
  });
});

/* -------------------------------------------------------------------------- *
 * Nothing from the hand-built default business may show through in another
 * industry's demo: the mock's long tail of hand-written responses is re-skinned.
 * -------------------------------------------------------------------------- */

const SWEEP: [string, Record<string, any>?][] = [
  ["/businesses"],
  ["/user/getProfile"],
  ["/client/v2", { type: "1" }],
  ["/client/v2", { type: "2" }],
  ["/invoice/invoices"],
  ["/quote/quotes"],
  ["/expense/list"],
  ["/custom-product"],
  ["/project"],
  ["/km-tracker"],
  ["/assets"],
  ["/calendar"],
  ["/bank/accounts"],
  ["/v2/bank/bank-transactions"],
  ["/v2/bank/sole-saved-transactions"],
  ["/v2/bill"],
  ["/v2/bill/upcoming"],
  ["/proposal"],
  ["/proposal/templates", { template_type: "PROPOSAL" }],
  ["/credit-note", { type: "client" }],
  ["/credit-note", { type: "vendor" }],
  ["/employees"],
  ["/payruns"],
  ["/v2/matching-rules"],
  ["/v2/settings/audit-logs"],
  ["/v2/settings/get-branding"],
  ["/v2/planner/goals"],
  ["/time-tracking"],
  ["/v2/tasks/time-logs"],
  ["/feedbacks"],
  ["/report/gst-extract"],
  ["/user/notification"],
  ["/dashboard/geographic-insights"],
  ["/investment-property/list"],
  ["/fund"],
  ["/v2/super-contribution"],
  ["/country-context"],
];

/** Wording that only ever belonged to the hand-built electrician. */
const LEGACY_GENERAL = [
  "Coastal Spark",
  "Middy",
  "Bunnings",
  "Rexel",
  "Switchboard",
  "switchboard",
  "Smoke Alarm",
  "Smoke alarm",
  "Jake Morrison",
  "Olivia Grant",
  "Gold Coast",
  "Burleigh",
  "Southport",
  "Broadbeach",
  "Ray White",
  "coastalspark",
  "Palm Grove",
];
/** Only the household/trades client pool legitimately shares these with the default business. */
const NZ_ONLY_LEAKS = ["Ampol", "Hostplus", "Telstra", "Tradie Insurance", "AustralianSuper", "ABN", "ATO", "QLD", "Superannuation", "Pty Ltd", "Australia"];

describe("no hand-built electrician data leaks into other demos", () => {
  const cases: [string, "AU" | "NZ"][] = [
    ["hairdressers", "AU"],
    ["ndis", "AU"],
    ["hospitality", "NZ"],
    ["agriculture", "NZ"],
    ["real-estate", "NZ"],
    ["photographers-videographers", "AU"],
    ["transport-owner-driver", "NZ"],
    ["plumbing", "NZ"],
  ];
  for (const [industry, country] of cases) {
    it(`${industry} / ${country}`, () => {
      startVisit(industry, country);
      const story = getSeedData().story;
      const ownText = JSON.stringify([story.clients, story.suppliers, story.employees, story.services]);
      const hits: string[] = [];
      for (const [path, params] of SWEEP) {
        const res = handleMockRequest("GET", path, params ?? {});
        expect(res, path).not.toBeNull();
        const text = JSON.stringify(res!.data);
        const words = country === "NZ" ? [...LEGACY_GENERAL, ...NZ_ONLY_LEAKS] : LEGACY_GENERAL;
        for (const word of words) {
          // A word the active business legitimately uses (e.g. the households client pool) isn't a leak.
          if (ownText.includes(word)) continue;
          if (text.includes(word)) hits.push(`${path} → ${word}`);
        }
      }
      expect(hits).toEqual([]);
    });
  }
});
