import { describe, expect, it } from "vitest";

import {
  COUNTRY_STATUSES,
  countryStatusPill,
  describeFiscalYear,
  formatMoney,
  formatRate,
  formatRegistryDate,
  isBackdated,
  isRowEditable,
  mapCountrySummary,
  mapImpact,
  mapPreview,
  mapTaxRate,
  mapThreshold,
  publishNoteIssue,
  rowStatePill,
  scheduleRateIssues,
  scheduleThresholdIssues,
  thresholdLabel,
  todayIso,
  type ScheduleRateInput,
  type ScheduleThresholdInput,
  type TaxRate,
} from "@/lib/admin/countries";

const rateInput = (over: Partial<ScheduleRateInput> = {}): ScheduleRateInput => ({
  taxCode: "GST",
  name: "",
  category: "standard",
  rate: "12.5",
  appliesTo: "both",
  effectiveFrom: "2099-04-01",
  isDefault: true,
  isCapital: false,
  ...over,
});

const thresholdInput = (over: Partial<ScheduleThresholdInput> = {}): ScheduleThresholdInput => ({
  key: "tax_registration",
  amount: "60000",
  effectiveFrom: "2099-04-01",
  notes: "",
  ...over,
});

const existingRate = (over: Partial<TaxRate> = {}): TaxRate => ({
  id: 1,
  taxCode: "GST",
  name: "GST",
  category: "standard",
  rate: 10,
  appliesTo: "both",
  effectiveFrom: "2000-07-01",
  effectiveTo: null,
  isDefault: true,
  isCapital: false,
  returnBoxMap: null,
  state: "current",
  ...over,
});

describe("mapping", () => {
  it("reads a country summary, upper-casing the code", () => {
    expect(
      mapCountrySummary({
        country_iso2: "nz",
        name: "New Zealand",
        status: "draft",
        currency: "NZD",
        tax_type: "GST",
        version: "2",
        has_draft: 1,
        businesses: 7,
      }),
    ).toMatchObject({ iso2: "NZ", status: "draft", version: 2, hasDraft: true, businesses: 7 });
  });

  it("falls back to draft for a status this build doesn't know", () => {
    expect(mapCountrySummary({ country_iso2: "AU", status: "retired" }).status).toBe("draft");
  });

  it("reads a rate, with its booleans and its open-ended period", () => {
    expect(
      mapTaxRate({
        id: 4,
        tax_code: "GST",
        rate: "12.5000",
        category: "standard",
        applies_to: "both",
        effective_from: "2027-04-01",
        effective_to: null,
        is_default: 1,
        is_capital: 0,
        state: "scheduled",
      }),
    ).toMatchObject({ id: 4, rate: 12.5, isDefault: true, isCapital: false, effectiveTo: null });
  });

  it("reads a threshold's amount as a number", () => {
    expect(mapThreshold({ id: 2, threshold_key: "tax_registration", amount: "60000.0000" })).toMatchObject({
      key: "tax_registration",
      amount: 60000,
    });
  });

  it("treats a missing impact block as zeroes rather than NaN", () => {
    expect(mapImpact(undefined)).toEqual({
      businesses: 0,
      followingCountryRate: 0,
      customRate: 0,
      draftInvoices: 0,
      draftQuotes: 0,
      recurringTemplates: 0,
    });
  });

  it("reads a preview, including what publishing will end", () => {
    const preview = mapPreview({
      country_iso2: "nz",
      current_version: 3,
      next_version: 4,
      can_publish: true,
      errors: [],
      changes: [{ field: "labels", from: {}, to: {} }],
      staged_tax_rates: [{ id: 9, tax_code: "GST", rate: 12.5, effective_from: "2027-04-01" }],
      staged_thresholds: [],
      supersedes: [{ entity: "tax_rate", id: 1, effective_to: "2027-03-31" }],
      takes_effect: [{ entity: "tax_rate", key: "GST", effective_from: "2027-04-01" }],
      impact: { businesses: 40, following_country_rate: 37, custom_rate: 3 },
    });
    expect(preview).toMatchObject({ iso2: "NZ", nextVersion: 4, canPublish: true });
    expect(preview.supersedes).toEqual([{ entity: "tax_rate", id: 1, effectiveTo: "2027-03-31", isDefault: undefined }]);
    expect(preview.impact.followingCountryRate).toBe(37);
  });
});

describe("scheduleRateIssues", () => {
  it("accepts a well-formed rate", () => {
    expect(scheduleRateIssues(rateInput())).toEqual({});
  });

  it("refuses a rate outside 0–100 or with too many decimals", () => {
    expect(scheduleRateIssues(rateInput({ rate: "120" })).rate).toMatch(/between 0 and 100/);
    expect(scheduleRateIssues(rateInput({ rate: "-1" })).rate).toMatch(/between 0 and 100/);
    expect(scheduleRateIssues(rateInput({ rate: "10.123456" })).rate).toMatch(/4 decimal places/);
    expect(scheduleRateIssues(rateInput({ rate: "" })).rate).toBeDefined();
  });

  it("refuses a tax code the backend's pattern would reject", () => {
    expect(scheduleRateIssues(rateInput({ taxCode: "gst rate!" })).taxCode).toBeDefined();
    expect(scheduleRateIssues(rateInput({ taxCode: "" })).taxCode).toBeDefined();
    // Lower case is fine — it's upper-cased before it's sent.
    expect(scheduleRateIssues(rateInput({ taxCode: "gst" })).taxCode).toBeUndefined();
  });

  it("catches a duplicate period before the request, matching on the upper-cased code", () => {
    const existing = [existingRate({ effectiveFrom: "2027-04-01" })];
    expect(scheduleRateIssues(rateInput({ effectiveFrom: "2027-04-01" }), existing).effectiveFrom).toMatch(
      /already has a period/,
    );
    expect(
      scheduleRateIssues(rateInput({ taxCode: "gst", effectiveFrom: "2027-04-01" }), existing).effectiveFrom,
    ).toMatch(/already has a period/);
    expect(scheduleRateIssues(rateInput({ effectiveFrom: "2028-04-01" }), existing).effectiveFrom).toBeUndefined();
  });

  it("refuses a date that isn't a date", () => {
    expect(scheduleRateIssues(rateInput({ effectiveFrom: "1 April 2027" })).effectiveFrom).toBeDefined();
  });
});

describe("scheduleThresholdIssues", () => {
  it("accepts a well-formed threshold", () => {
    expect(scheduleThresholdIssues(thresholdInput())).toEqual({});
  });

  it("refuses a malformed key and a negative amount", () => {
    expect(scheduleThresholdIssues(thresholdInput({ key: "Tax Registration" })).key).toBeDefined();
    expect(scheduleThresholdIssues(thresholdInput({ amount: "-5" })).amount).toBeDefined();
    expect(scheduleThresholdIssues(thresholdInput({ amount: "" })).amount).toBeDefined();
  });

  it("catches a duplicate period", () => {
    const existing = [
      { id: 1, key: "tax_registration", amount: 60000, currency: "NZD", effectiveFrom: "2099-04-01", effectiveTo: null, notes: null, state: "scheduled" as const },
    ];
    expect(scheduleThresholdIssues(thresholdInput(), existing).effectiveFrom).toMatch(/already has a period/);
  });
});

describe("back-dating", () => {
  it("is what the backend would refuse without an override", () => {
    expect(isBackdated("2000-01-01")).toBe(true);
    expect(isBackdated("2099-01-01")).toBe(false);
    // Today is not back-dating — the backend's rule is `effective_from < today`.
    expect(isBackdated(todayIso())).toBe(false);
    expect(isBackdated("not a date")).toBe(false);
  });
});

describe("row editability", () => {
  it("matches the backend: staged and scheduled rows can change, started ones can't", () => {
    expect(isRowEditable("staged")).toBe(true);
    expect(isRowEditable("scheduled")).toBe(true);
    expect(isRowEditable("current")).toBe(false);
    expect(isRowEditable("past")).toBe(false);
  });

  it("gives every state a pill", () => {
    for (const state of ["staged", "scheduled", "current", "past"] as const) {
      expect(rowStatePill(state).label).toBeTruthy();
    }
  });
});

describe("status pills", () => {
  it("explains every status a country can hold", () => {
    for (const status of COUNTRY_STATUSES) {
      const pill = countryStatusPill(status);
      expect(pill.label).toBeTruthy();
      expect(pill.help).toBeTruthy();
    }
  });

  it("shows an unknown status as itself rather than blank", () => {
    expect(countryStatusPill("retired")).toMatchObject({ label: "retired", tone: "neutral" });
  });
});

describe("publish note", () => {
  it("insists on something worth keeping in the version history", () => {
    expect(publishNoteIssue("")).toBeTruthy();
    expect(publishNoteIssue("fix")).toBeTruthy();
    expect(publishNoteIssue("IRD rate change 1 Apr 2027")).toBeNull();
  });
});

describe("formatting", () => {
  it("drops the trailing zeros a 4-decimal rate column carries", () => {
    expect(formatRate(10)).toBe("10%");
    expect(formatRate(12.5)).toBe("12.5%");
    expect(formatRate(0)).toBe("0%");
  });

  it("reads a registry date without letting a timezone move it", () => {
    expect(formatRegistryDate("2027-04-01")).toBe("1 Apr 2027");
    expect(formatRegistryDate("2027-01-01")).toBe("1 Jan 2027");
    expect(formatRegistryDate(null)).toBe("–");
  });

  it("formats money in the country's own currency", () => {
    expect(formatMoney(60000, "NZD")).toContain("60,000");
    expect(formatMoney(82.5, "AUD")).toContain("82.50");
    // An unknown code falls back rather than throwing inside a table cell.
    expect(formatMoney(100, "XXZ")).toContain("100");
  });

  it("describes a financial year from its start", () => {
    expect(describeFiscalYear(7, 1)).toBe("1 July – 30 June");
    expect(describeFiscalYear(4, 1)).toBe("1 April – 31 March");
    // February is named rather than numbered — it is the 28th or the 29th.
    expect(describeFiscalYear(3, 1)).toBe("1 March – the end of February");
    expect(describeFiscalYear(1, 1)).toBe("1 January – 31 December");
  });

  it("names the thresholds the product actually reads", () => {
    expect(thresholdLabel("tax_registration")).toBe("Registration turnover");
    expect(thresholdLabel("something_new")).toBe("something_new");
  });
});
