import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { lineItemPatchFromSuggestion, searchInvoiceItems } = await import(
  "@/lib/invoice-item-search"
);
const {
  NDIS_CLAIM_TYPES,
  NDIS_PRICE_TIERS,
  NDIS_QTY_TYPES,
  QTY_TYPES,
  claimTypeFromCatalogue,
  newLineItem,
  newNdisLineItem,
  ndisPriceTierOf,
  toNdisClaimType,
  toQtyType,
} = await import("@/lib/invoices");

type ApiRow = Record<string, unknown>;

/** A catalogue row as `/services/autocomplete` now returns it. */
function catalogueRow(over: ApiRow = {}): ApiRow {
  return {
    support_item_number: "01_011_0107_1_1",
    support_item_name: "Assistance With Self-Care Activities - Standard - Weekday Daytime",
    price_tooltip: null,
    price_national: 73.58,
    price_remote: 103.01,
    price_very_remote: 110.37,
    unit: "Hour",
    qty_type: "hours",
    claim_type: "Weekday Daytime",
    price_schedule: "2026-27",
    is_legacy: false,
    end_date: null,
    ...over,
  };
}

async function pick(row: ApiRow) {
  apiMock.get.mockResolvedValue({ data: [row] });
  const [suggestion] = await searchInvoiceItems("x", true);
  return suggestion;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("units", () => {
  it("keeps the general invoice's four units, and gives NDIS those four plus weeks, months and years", () => {
    expect(QTY_TYPES.map((entry) => entry.value)).toEqual(["items", "hours", "days", "km"]);
    expect(NDIS_QTY_TYPES.map((entry) => entry.value)).toEqual([
      "items",
      "hours",
      "days",
      "km",
      "weeks",
      "months",
      "years",
    ]);
    expect(NDIS_QTY_TYPES.map((entry) => entry.label)).toEqual([
      "Items",
      "Hours",
      "Days",
      "Km",
      "Weeks",
      "Months",
      "Years",
    ]);
  });

  it("never offers weeks, months or years on an ordinary line", () => {
    const general = QTY_TYPES.map((entry) => entry.value) as string[];
    for (const unit of ["weeks", "months", "years"]) expect(general).not.toContain(unit);
  });

  it("reads the NDIS-only units back, so a saved claim keeps its unit", () => {
    expect(toQtyType("weeks")).toBe("weeks");
    expect(toQtyType("months")).toBe("months");
    expect(toQtyType("years")).toBe("years");
    expect(toQtyType("bananas")).toBe("items");
  });
});

describe("claim types", () => {
  it("adds Telehealth to the fixed list, after the existing eight", () => {
    expect(NDIS_CLAIM_TYPES).toHaveLength(9);
    expect(NDIS_CLAIM_TYPES[8]).toBe("Telehealth");
    expect(toNdisClaimType("Telehealth")).toBe("Telehealth");
  });

  it.each([
    ["Direct Service", "Standard Service"],
    ["Cancellation", "Cancellation"],
    ["Non-Face-to-Face", "Non-Face-to-Face (NF2F)"],
    ["Provider Travel", "Travel – Time"],
    ["NDIA Requested Reports", "NDIA Requested Reports"],
    ["Telehealth", "Telehealth"],
    ["non-labour costs", "Travel – Non-Labour Costs"],
  ])("maps the catalogue's %s onto the fixed list as %s", (catalogue, claim) => {
    expect(claimTypeFromCatalogue(catalogue)).toBe(claim);
  });

  it.each(["Weekday Daytime", "Saturday", "Sleepover", "Wheeled", "", null, undefined])(
    "does not treat %s as a claim type",
    (value) => {
      expect(claimTypeFromCatalogue(value)).toBeUndefined();
    },
  );
});

describe("ndisPriceTierOf", () => {
  const options = { national: "73.58", remote: "103.01", veryRemote: "110.37" };

  it("names the tier the price equals, comparing as numbers", () => {
    expect(ndisPriceTierOf("73.58", options)).toBe("national");
    expect(ndisPriceTierOf("103.010", options)).toBe("remote");
    expect(ndisPriceTierOf("110.37", options)).toBe("very_remote");
  });

  it("calls anything else a custom price", () => {
    expect(ndisPriceTierOf("80", options)).toBe("custom");
    expect(ndisPriceTierOf("", options)).toBe("custom");
    expect(ndisPriceTierOf("73.58", undefined)).toBe("custom");
  });

  it("offers the tiers National, Remote, Very remote in that order", () => {
    expect(NDIS_PRICE_TIERS.map((tier) => tier.label)).toEqual(["National", "Remote", "Very remote"]);
  });
});

describe("picking an NDIS catalogue support", () => {
  it("asks the NDIS catalogue only — never the general dictionary", async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    await searchInvoiceItems("self care", true);
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.services.autocomplete);
  });

  it("defaults the price to National and keeps all three as the tier options", async () => {
    const suggestion = await pick(catalogueRow());

    expect(suggestion.price).toBe("73.58");
    expect(suggestion.priceOptions).toEqual({ national: "73.58", remote: "103.01", veryRemote: "110.37" });
    expect(suggestion.priceSchedule).toBe("2026-27");
  });

  it("fills the line: national price, unit, number, schedule", async () => {
    const suggestion = await pick(catalogueRow({ unit: "Week", qty_type: "weeks" }));
    const patch = lineItemPatchFromSuggestion(suggestion, newNdisLineItem(), { ndis: true, gstDefault: false });

    expect(patch).toMatchObject({
      price: "73.58",
      qtyType: "weeks",
      supportItemNumber: "01_011_0107_1_1",
      priceSchedule: "2026-27",
      gst: false,
      quantity: "1",
    });
    expect(patch.priceOptions).toEqual({ national: "73.58", remote: "103.01", veryRemote: "110.37" });
  });

  it("sets the claim type from the support's name when it states one", async () => {
    const suggestion = await pick(
      catalogueRow({
        support_item_number: "15_054_0128_1_3_CA",
        support_item_name: "Therapy - Psychologist - Cancellation",
        claim_type: "Cancellation",
      }),
    );
    const patch = lineItemPatchFromSuggestion(suggestion, newNdisLineItem(), { ndis: true, gstDefault: false });

    expect(patch.claimType).toBe("Cancellation");
  });

  it("leaves the claim type alone when the name only gives a rate band", async () => {
    const suggestion = await pick(catalogueRow({ claim_type: "Weekday Daytime" }));
    const line = { ...newNdisLineItem(), claimType: "Cancellation" as const };
    const patch = lineItemPatchFromSuggestion(suggestion, line, { ndis: true, gstDefault: false });

    expect("claimType" in patch).toBe(false);
  });

  it("treats a $1 item's three equal prices as three tiers", async () => {
    const suggestion = await pick(
      catalogueRow({ price_national: 1, price_remote: 1, price_very_remote: 1, unit: "Each", qty_type: "items" }),
    );
    expect(suggestion.priceOptions).toEqual({ national: "1", remote: "1", veryRemote: "1" });
  });

  it("offers no tiers for a quotable support, and keeps the price the user already typed", async () => {
    const suggestion = await pick(
      catalogueRow({ price_national: null, price_remote: null, price_very_remote: null, price_schedule: "2026-27" }),
    );
    expect(suggestion.priceOptions).toBeUndefined();
    expect(suggestion.priceSchedule).toBeUndefined();

    const typed = { ...newNdisLineItem(), price: "250" };
    const patch = lineItemPatchFromSuggestion(suggestion, typed, { ndis: true, gstDefault: false });
    expect(patch.price).toBe("250");
  });

  it("clears the previous support's tiers when the next pick has none", async () => {
    const suggestion = await pick(catalogueRow({ price_national: null, price_remote: null, price_very_remote: null }));
    const withTiers = {
      ...newNdisLineItem(),
      priceOptions: { national: "1" },
      priceSchedule: "2026-27",
    };
    const patch = lineItemPatchFromSuggestion(suggestion, withTiers, { ndis: true, gstDefault: false });

    expect("priceOptions" in patch).toBe(true);
    expect(patch.priceOptions).toBeUndefined();
    expect(patch.priceSchedule).toBeUndefined();
  });

  it("says when a legacy support can still be claimed until", async () => {
    const suggestion = await pick(catalogueRow({ is_legacy: true, end_date: "2027-06-30" }));
    expect(suggestion.detail).toContain("Legacy, until 30 Jun 2027");
  });

  it("shows a current support without any legacy note", async () => {
    const suggestion = await pick(catalogueRow());
    expect(suggestion.detail).toBe("Support item 01_011_0107_1_1");
  });

  it("keeps one of the business's own products as it was — its own price, no tiers", async () => {
    const suggestion = await pick({
      support_item_number: "",
      support_item_name: "My support",
      qty_type: "hours",
      gst: false,
      price: "60.00",
    });

    expect(suggestion.price).toBe("60");
    expect(suggestion.priceOptions).toBeUndefined();
    expect(suggestion.priceSchedule).toBeUndefined();
  });
});

describe("a general invoice is unaffected", () => {
  it("never receives NDIS fields from a pick", async () => {
    apiMock.get.mockResolvedValue({
      data: [{ item_name: "Tap install", price: "180", gst: true, qty_type: "hours", price_national: 5, price_schedule: "2026-27" }],
    });
    const [suggestion] = await searchInvoiceItems("tap", false);
    const patch = lineItemPatchFromSuggestion(suggestion, newLineItem(), { ndis: false, gstDefault: true });

    expect(suggestion.priceOptions).toBeUndefined();
    expect(suggestion.claimType).toBeUndefined();
    expect(patch.price).toBe("180");
    expect("priceOptions" in patch).toBe(false);
    expect("priceSchedule" in patch).toBe(false);
    expect("claimType" in patch).toBe(false);
  });
});
