import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";

const apiMock = { get: vi.fn(), post: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const { DEFAULT_TAX_RATE, fetchTaxRate, saveTaxRate, taxPercentageError } =
  await import("@/lib/tax-settings");

const sentBody = () =>
  decryptPayload((apiMock.post.mock.calls[0][1] as { data: string }).data);

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 7 } } });
});

describe("fetchTaxRate", () => {
  it("reads whether the record follows the country, and the country's rate", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          tax_settings: [
            {
              id: 7,
              tax_name: "GST",
              tax_percentage: "15.00",
              follow_country_rate: 1,
              country_rate: 15,
              is_default: 1,
            },
          ],
        },
      },
    });
    expect(await fetchTaxRate()).toEqual({
      id: 7,
      name: "GST",
      percentage: "15",
      isDefault: true,
      followsCountry: true,
      countryRate: 15,
    });
  });

  it("reads a custom rate", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          tax_settings: [
            {
              id: 8,
              tax_name: "GST",
              tax_percentage: "12.50",
              follow_country_rate: 0,
              country_rate: 15,
              is_default: 1,
            },
          ],
        },
      },
    });
    expect(await fetchTaxRate()).toMatchObject({
      percentage: "12.5",
      followsCountry: false,
    });
  });

  it("treats a record from a server without the flag as following the country", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: { tax_settings: [{ id: 9, tax_percentage: 10, is_default: 0 }] },
      },
    });
    expect(await fetchTaxRate()).toMatchObject({
      followsCountry: true,
      countryRate: null,
      isDefault: false,
    });
  });
});

describe("saveTaxRate", () => {
  it("says outright whether the rate follows the country", async () => {
    await saveTaxRate({
      ...DEFAULT_TAX_RATE,
      id: 7,
      isDefault: true,
      followsCountry: true,
    });
    expect(sentBody()).toMatchObject({
      id: 7,
      tax_percentage: 10,
      is_default: 1,
      follow_country_rate: 1,
    });
    expect(sentBody()).not.toHaveProperty("tax_registered");
  });

  it("sends a custom rate pinned, and registration only when chosen", async () => {
    await saveTaxRate(
      {
        ...DEFAULT_TAX_RATE,
        percentage: "12.5",
        isDefault: false,
        followsCountry: false,
      },
      { taxRegistered: false },
    );
    expect(sentBody()).toMatchObject({
      tax_percentage: 12.5,
      follow_country_rate: 0,
      is_default: 0,
      tax_registered: 0,
    });
  });
});

describe("taxPercentageError", () => {
  it("accepts 1–100 and names the country's tax", () => {
    expect(taxPercentageError("15")).toBeUndefined();
    expect(taxPercentageError("0", "VAT")).toBe(
      "VAT rate must be a number between 1 and 100.",
    );
    expect(taxPercentageError("", "GST")).toBe("GST rate is required.");
    expect(taxPercentageError("101")).toBe(
      "GST rate must be a number between 1 and 100.",
    );
  });
});
