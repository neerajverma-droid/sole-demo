import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const {
  collectionRateLabel,
  createPropertyApi,
  currentFinancialYearStart,
  deletePropertyApi,
  disposeIssues,
  earliestPurchaseDate,
  fetchAllPages,
  financialYearStartOf,
  isValueStale,
  propertyYearOptions,
  disposePropertyApi,
  draftFromProperty,
  emptyDisposeDraft,
  emptyPropertyDraft,
  fetchCapitalSnapshot,
  fetchExpenseBreakdown,
  fetchIncomeExpense,
  fetchKeyActions,
  fetchPortfolioSummary,
  fetchProperty,
  fetchPropertyComparison,
  fetchPropertiesPage,
  fetchPropertySummary,
  fetchRentCollection,
  financialYearLabel,
  financialYearOptions,
  formatPropertyDate,
  mapProperty,
  mapPropertyListItem,
  parseFinancialYearOption,
  parseMoney,
  propertyCostBase,
  propertyIssues,
  propertyWriteBody,
  updatePropertyApi,
} = await import("@/lib/investment-property");

import type { PropertyDraft } from "@/lib/investment-property";

const TODAY = new Date(2026, 9, 16);

function validDraft(overrides: Partial<PropertyDraft> = {}): PropertyDraft {
  return {
    ...emptyPropertyDraft(),
    name: "Hawthorn Unit",
    type: "unit",
    purchaseDate: "2022-03-15",
    purchasePrice: "650000",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseMoney", () => {
  it("returns null for blank input so optional fields can be omitted", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
  });

  it("accepts plain, comma-grouped and dollar-prefixed amounts", () => {
    expect(parseMoney("650000")).toBe(650000);
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney("0.5")).toBe(0.5);
  });

  it("returns NaN for anything the DECIMAL(15,2) column would reject", () => {
    expect(parseMoney("abc")).toBeNaN();
    expect(parseMoney("-5")).toBeNaN();
    expect(parseMoney("1.234")).toBeNaN();
    expect(parseMoney("1e5")).toBeNaN();
  });
});

describe("mapPropertyListItem / mapProperty", () => {
  it("coerces the DECIMAL strings Sequelize returns into numbers", () => {
    const item = mapPropertyListItem({
      id: 12,
      property_name: "Richmond Terrace",
      address: "8 Church St",
      purchase_date: "2021-07-02",
      purchase_price: "900000.00",
      current_value: "1150000.00",
      effective_loan_amount: "720000.00",
      equity: "430000.00",
      status: "active",
    });

    expect(item).toEqual({
      id: "12",
      name: "Richmond Terrace",
      address: "8 Church St",
      purchaseDate: "2021-07-02",
      purchasePrice: 900000,
      currentValue: 1150000,
      hasCurrentValue: true,
      loanBalance: 720000,
      equity: 430000,
      status: "active",
    });
  });

  it("marks a list item with no value as unset rather than worth $0", () => {
    expect(mapPropertyListItem({ id: 1, current_value: null }).hasCurrentValue).toBe(false);
    expect(mapPropertyListItem({ id: 1, current_value: "0.00" }).hasCurrentValue).toBe(true);
  });

  it("derives equity when the server omits it, and tolerates null columns", () => {
    const item = mapPropertyListItem({
      id: "3",
      property_name: null,
      address: null,
      purchase_price: "100",
      current_value: "500",
      effective_loan_amount: "200",
    });

    expect(item.equity).toBe(300);
    expect(item.name).toBe("");
    expect(item.address).toBe("");
    expect(item.status).toBe("active");
  });

  it("treats a missing current value as 0 but remembers it was unset", () => {
    const property = mapProperty({ id: 1, purchase_price: "1", current_value: null });
    expect(property.currentValue).toBe(0);
    expect(property.hasCurrentValue).toBe(false);

    const set = mapProperty({ id: 1, purchase_price: "1", current_value: "0.00" });
    expect(set.hasCurrentValue).toBe(true);
  });

  it("falls back to safe enum defaults for values the UI doesn't know", () => {
    const property = mapProperty({
      id: 1,
      property_type: "castle",
      ownership_entity: "trust",
      property_tax_treatment: "weird",
      status: "archived",
    });

    expect(property.type).toBe("other");
    expect(property.ownershipEntity).toBe("individual");
    expect(property.taxTreatment).toBe("investment");
    expect(property.status).toBe("active");
  });

  it("keeps disposal figures only when the server returned them", () => {
    const active = mapProperty({ id: 1 });
    expect(active.disposalDate).toBeNull();
    expect(active.disposalSalePrice).toBeNull();

    const sold = mapProperty({
      id: 2,
      status: "disposed",
      disposal_date: "2026-05-01",
      disposal_sale_price: "700000.00",
      disposal_selling_costs: "15000.00",
    });
    expect(sold.status).toBe("disposed");
    expect(sold.disposalDate).toBe("2026-05-01");
    expect(sold.disposalSalePrice).toBe(700000);
    expect(sold.disposalSellingCosts).toBe(15000);
  });

  it("sums acquisition costs into a cost base", () => {
    const property = mapProperty({
      id: 1,
      purchase_price: "650000",
      stamp_duty: "34000",
      legal_costs: "2500",
      buyer_agent_costs: "9000",
    });
    expect(propertyCostBase(property)).toBe(695500);
  });
});

describe("formatPropertyDate", () => {
  it("renders DD-MM-YYYY, as the portfolio screens do", () => {
    expect(formatPropertyDate("2026-07-31")).toBe("31-07-2026");
    expect(formatPropertyDate("2026-07-31T00:00:00.000Z")).toBe("31-07-2026");
  });

  it("shows a dash for nothing", () => {
    expect(formatPropertyDate("")).toBe("—");
    expect(formatPropertyDate(null)).toBe("—");
  });
});

describe("propertyIssues", () => {
  it("accepts a minimal valid draft", () => {
    expect(propertyIssues(validDraft(), TODAY)).toEqual([]);
  });

  it("requires name, type, purchase date and purchase price", () => {
    const keys = propertyIssues(emptyPropertyDraft(), TODAY).map((issue) => issue.key);
    expect(keys).toEqual(["name", "type", "purchaseDate", "purchasePrice"]);
  });

  it("rejects a blank-only name", () => {
    expect(propertyIssues(validDraft({ name: "   " }), TODAY).map((i) => i.key)).toContain("name");
  });

  it("rejects a future purchase date the backend would 400 on, but allows today", () => {
    expect(
      propertyIssues(validDraft({ purchaseDate: "2026-10-17" }), TODAY).map((i) => i.key),
    ).toContain("purchaseDate");
    expect(propertyIssues(validDraft({ purchaseDate: "2026-10-16" }), TODAY)).toEqual([]);
  });

  it("rejects a zero, negative or malformed purchase price", () => {
    for (const price of ["0", "-1", "abc", "1.999"]) {
      expect(
        propertyIssues(validDraft({ purchasePrice: price }), TODAY).map((i) => i.key),
      ).toContain("purchasePrice");
    }
  });

  it("rejects amounts too large for DECIMAL(15,2)", () => {
    const issues = propertyIssues(validDraft({ purchasePrice: "99999999999999" }), TODAY);
    expect(issues.map((i) => i.key)).toContain("purchasePrice");
  });

  it("validates optional money fields only when filled in", () => {
    expect(propertyIssues(validDraft({ stampDuty: "" }), TODAY)).toEqual([]);
    expect(
      propertyIssues(validDraft({ stampDuty: "x", currentValue: "y" }), TODAY).map((i) => i.key),
    ).toEqual(["stampDuty", "currentValue"]);
  });

  it("enforces the column lengths", () => {
    expect(
      propertyIssues(validDraft({ name: "a".repeat(256) }), TODAY).map((i) => i.key),
    ).toContain("name");
    expect(
      propertyIssues(validDraft({ address: "a".repeat(501) }), TODAY).map((i) => i.key),
    ).toContain("address");
  });
});

describe("propertyWriteBody", () => {
  it("maps the draft to the backend's snake_case contract", () => {
    const body = propertyWriteBody(
      validDraft({
        name: "  Hawthorn Unit  ",
        ownershipEntity: "company",
        taxTreatment: "mixed_use",
        address: " 12 Burwood Rd ",
        stampDuty: "34,000",
        legalCosts: "2500.50",
        buyerAgentCosts: "9000",
        currentValue: "820000",
        notes: " renovated ",
      }),
    );

    expect(body).toEqual({
      property_name: "Hawthorn Unit",
      property_type: "unit",
      ownership_entity: "company",
      property_tax_treatment: "mixed_use",
      address: "12 Burwood Rd",
      purchase_date: "2022-03-15",
      purchase_price: 650000,
      stamp_duty: 34000,
      legal_costs: 2500.5,
      buyer_agent_costs: 9000,
      current_value: 820000,
      notes: "renovated",
    });
  });

  it("sends null for a blank current value and address, and 0 for blank costs", () => {
    const body = propertyWriteBody(validDraft());
    expect(body.current_value).toBeNull();
    expect(body.address).toBeNull();
    expect(body.notes).toBeNull();
    expect(body.stamp_duty).toBe(0);
    expect(body.legal_costs).toBe(0);
    expect(body.buyer_agent_costs).toBe(0);
  });

  it("never sends fields the backend would mass-assign (status, disposal, tenancy)", () => {
    const keys = Object.keys(propertyWriteBody(validDraft()));
    for (const forbidden of [
      "status",
      "user_id",
      "tenant_id",
      "business_id",
      "disposal_date",
      "disposal_sale_price",
      "disposal_selling_costs",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("round-trips through draftFromProperty without changing the payload", () => {
    const property = mapProperty({
      id: 1,
      property_name: "Round trip",
      property_type: "house",
      ownership_entity: "company",
      property_tax_treatment: "ppor",
      address: "1 Test St",
      purchase_date: "2020-01-02",
      purchase_price: "500000.00",
      stamp_duty: "0.00",
      legal_costs: "1500.00",
      buyer_agent_costs: "0.00",
      current_value: "600000.00",
      notes: "n",
    });
    const draft = draftFromProperty(property);
    expect(propertyIssues(draft, TODAY)).toEqual([]);
    expect(propertyWriteBody(draft)).toMatchObject({
      property_name: "Round trip",
      purchase_price: 500000,
      stamp_duty: 0,
      legal_costs: 1500,
      current_value: 600000,
    });
  });

  it("keeps an explicit current value of 0 distinct from unset", () => {
    const withZero = draftFromProperty(
      mapProperty({ id: 1, purchase_price: "1", current_value: "0.00" }),
    );
    expect(withZero.currentValue).toBe("0");
    const unset = draftFromProperty(
      mapProperty({ id: 1, purchase_price: "1", current_value: null }),
    );
    expect(unset.currentValue).toBe("");
  });
});

describe("disposeIssues", () => {
  const valid = { salePrice: "700000", sellingCosts: "", disposalDate: "2026-05-01" };

  it("accepts a sale with no selling costs", () => {
    expect(disposeIssues(valid, "2022-03-15")).toEqual([]);
  });

  it("requires a positive sale price", () => {
    for (const price of ["", "0", "-3"]) {
      expect(
        disposeIssues({ ...valid, salePrice: price }, "2022-03-15").map((i) => i.key),
      ).toContain("salePrice");
    }
  });

  it("rejects a sale dated before the purchase", () => {
    expect(
      disposeIssues({ ...valid, disposalDate: "2022-03-14" }, "2022-03-15").map((i) => i.key),
    ).toContain("disposalDate");
    expect(disposeIssues({ ...valid, disposalDate: "2022-03-15" }, "2022-03-15")).toEqual([]);
  });

  it("rejects malformed selling costs", () => {
    expect(
      disposeIssues({ ...valid, sellingCosts: "lots" }, "2022-03-15").map((i) => i.key),
    ).toEqual(["sellingCosts"]);
  });

  it("defaults the sale date to today", () => {
    expect(emptyDisposeDraft(TODAY).disposalDate).toBe("2026-10-16");
  });
});

describe("financial year helpers", () => {
  it("rolls the Australian financial year over on 1 July", () => {
    expect(currentFinancialYearStart(new Date(2026, 5, 30))).toBe(2025);
    expect(currentFinancialYearStart(new Date(2026, 6, 1))).toBe(2026);
    expect(currentFinancialYearStart(new Date(2026, 0, 1))).toBe(2025);
    expect(currentFinancialYearStart(new Date(2026, 11, 31))).toBe(2026);
  });

  it("labels a year the way the dashboard does", () => {
    expect(financialYearLabel(2026)).toBe("FY 2026–27");
    expect(financialYearLabel(1999)).toBe("FY 1999–00");
  });

  it("lists years back to the earliest purchase, then All time", () => {
    expect(financialYearOptions("2024-08-01", TODAY)).toEqual([
      { value: "2026", label: "FY 2026–27" },
      { value: "2025", label: "FY 2025–26" },
      { value: "2024", label: "FY 2024–25" },
      { value: "all", label: "All time" },
    ]);
  });

  it("starts the first year in the previous calendar year for a purchase before July", () => {
    const options = financialYearOptions("2024-05-10", TODAY).map((option) => option.value);
    expect(options).toEqual(["2026", "2025", "2024", "2023", "all"]);
  });

  it("offers just the current year when there are no properties", () => {
    expect(financialYearOptions(null, TODAY).map((option) => option.value)).toEqual(["2026", "all"]);
  });

  it("never offers years before the current one for a purchase in the future", () => {
    expect(financialYearOptions("2030-01-01", TODAY).map((option) => option.value)).toEqual(["2026", "all"]);
  });

  it("finds the earliest purchase across properties, ignoring bad dates", () => {
    expect(
      earliestPurchaseDate([{ purchaseDate: "2022-03-15" }, { purchaseDate: "" }, { purchaseDate: "2019-05-20" }]),
    ).toBe("2019-05-20");
    expect(earliestPurchaseDate([])).toBeNull();
  });

  it("parses an option value back to a year, or null for all time", () => {
    expect(parseFinancialYearOption("2025")).toBe(2025);
    expect(parseFinancialYearOption("all")).toBeNull();
    expect(parseFinancialYearOption("nonsense")).toBeNull();
  });
});

describe("property list + detail API", () => {
  it("requests a page with pagination and filters, omitting 'all' and blank search", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            property_name: "A",
            purchase_price: "10.00",
            current_value: "20.00",
            effective_loan_amount: "5.00",
            equity: "15.00",
            status: "active",
          },
        ],
        pagination: { total: 31, page: 2, limit: 10 },
        meta: { all: 31, active: 28, disposed: 3 },
      },
    });

    const page = await fetchPropertiesPage({ page: 2, limit: 10, name: "  ", status: "all" });

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.investment.list, {
      params: { page: 2, limit: 10 },
    });
    expect(page.total).toBe(31);
    expect(page.meta).toEqual({ all: 31, active: 28, disposed: 3 });
    expect(page.properties[0]).toMatchObject({ id: "1", equity: 15 });
  });

  it("passes a trimmed search term and a concrete status through", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });

    await fetchPropertiesPage({ page: 1, limit: 25, name: " hawthorn ", status: "disposed" });

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.investment.list, {
      params: { page: 1, limit: 25, name: "hawthorn", status: "disposed" },
    });
  });

  it("falls back to the row count when pagination is absent", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 1 }, { id: 2 }] } });
    const page = await fetchPropertiesPage({ page: 1, limit: 10 });
    expect(page.total).toBe(2);
    expect(page.meta).toEqual({ all: 0, active: 0, disposed: 0 });
  });

  it("surfaces the server's message when success is false", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Tenant mismatch" } });
    await expect(fetchPropertiesPage({ page: 1, limit: 10 })).rejects.toThrow("Tenant mismatch");
  });

  it("fetches one property by encoded id", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { id: 7, property_name: "Seven", purchase_price: "1" } },
    });

    const property = await fetchProperty("7");

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.info}7`);
    expect(property.name).toBe("Seven");
  });

  it("encodes ids so a crafted route param can't alter the path", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await fetchProperty("1/../../admin");
    expect(apiMock.get).toHaveBeenCalledWith(
      `${apiRoutes.investment.info}${encodeURIComponent("1/../../admin")}`,
    );
  });

  it("loads the per-property summary for the given year", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          costBase: "705500.00",
          capitalImprovements: "10000.00",
          ytdRentalIncome: 1,
          ytdExpenses: 2,
          ytdNetReturn: -1,
        },
      },
    });

    const summary = await fetchPropertySummary("7", 2026);

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.summary}7`, {
      params: { year: 2026 },
    });
    expect(summary).toEqual({
      costBase: 705500,
      capitalImprovements: 10000,
      ytdRentalIncome: 1,
      ytdExpenses: 2,
      ytdNetReturn: -1,
    });
  });
});

describe("property write API", () => {
  it("POSTs plain JSON (the investment endpoints don't decrypt bodies) and returns the new id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 44 } } });

    const result = await createPropertyApi(validDraft());

    expect(result).toEqual({ id: "44" });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.investment.create);
    expect(body).not.toBeInstanceOf(FormData);
    expect(body).toMatchObject({
      property_name: "Hawthorn Unit",
      purchase_price: 650000,
    });
    expect(body).not.toHaveProperty("data");
  });

  it("PUTs the edit to the property's own URL", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true, data: { id: 5 } } });

    await updatePropertyApi("5", validDraft({ name: "Renamed" }));

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.investment.update}5`);
    expect(body.property_name).toBe("Renamed");
  });

  it("raises the backend's message when a save is rejected", async () => {
    apiMock.put.mockResolvedValue({
      data: { success: false, message: "Disposed properties cannot be edited" },
    });
    await expect(updatePropertyApi("5", validDraft())).rejects.toThrow(
      "Disposed properties cannot be edited",
    );
  });

  it("DELETEs by id and treats success:false as a failure", async () => {
    apiMock.delete.mockResolvedValueOnce({ data: { success: true } });
    await deletePropertyApi("9");
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.investment.delete}9`);

    apiMock.delete.mockResolvedValueOnce({
      data: { success: false, message: "Disposed properties cannot be deleted" },
    });
    await expect(deletePropertyApi("9")).rejects.toThrow("Disposed properties cannot be deleted");
  });

  it("records a sale with the contract's field names and maps the CGT result", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          sale_price: 700000,
          selling_costs: 15000,
          disposal_date: "2026-05-01",
          total_cost_base: 710500,
          capital_gain: -10500,
          is_gain: false,
        },
      },
    });

    const result = await disposePropertyApi("3", {
      salePrice: "700,000",
      sellingCosts: "15000",
      disposalDate: "2026-05-01",
    });

    expect(apiMock.post).toHaveBeenCalledWith(`${apiRoutes.investment.dispose}3`, {
      sale_price: 700000,
      selling_costs: 15000,
      disposal_date: "2026-05-01",
    });
    expect(result).toEqual({
      salePrice: 700000,
      sellingCosts: 15000,
      disposalDate: "2026-05-01",
      totalCostBase: 710500,
      capitalGain: -10500,
      isGain: false,
    });
  });

  it("sends 0 selling costs when none are entered", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { capital_gain: 5 } } });
    await disposePropertyApi("3", { salePrice: "10", sellingCosts: "", disposalDate: "2026-05-01" });
    expect(apiMock.post.mock.calls[0][1].selling_costs).toBe(0);
  });
});

describe("portfolio dashboard API", () => {
  const ALL_TIME = { financialYearStart: null, status: "all" as const };

  it("sends no scoping params for all-time, all-status", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    await fetchPortfolioSummary(ALL_TIME);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.investment.portfolioSummary, {
      params: {},
    });
  });

  it("sends financial_year_start, status and name using the backend's names", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    await fetchPropertyComparison({ financialYearStart: 2025, status: "active", name: " rich " });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.investment.portfolioPropertyComparison, {
      params: { financial_year_start: 2025, status: "active", name: "rich" },
    });
  });

  it("keeps a financial year of 0 distinct from all-time", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    await fetchPortfolioSummary({ financialYearStart: 0, status: "all" });
    expect(apiMock.get.mock.calls[0][1].params).toEqual({ financial_year_start: 0 });
  });

  it("maps the summary's ytd_* fields", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          total_properties: 3,
          active_properties: 2,
          disposed_properties: 1,
          total_current_value: 1970000,
          total_loan_amount: "1200000.00",
          total_equity: 770000,
          ytd_rental_income_received: 87000,
          ytd_property_expenses: 29700,
          ytd_net_rental_result: 57300,
          ytd_loan_repayments: 54000,
          estimated_cash_flow_ytd: 3300,
          total_cost_base: "1745000.00",
        },
      },
    });

    expect(await fetchPortfolioSummary(ALL_TIME)).toEqual({
      totalProperties: 3,
      activeProperties: 2,
      disposedProperties: 1,
      totalValue: 1970000,
      totalLoan: 1200000,
      totalEquity: 770000,
      rentReceived: 87000,
      propertyExpenses: 29700,
      netRentalResult: 57300,
      loanRepayments: 54000,
      estimatedCashFlow: 3300,
      totalCostBase: 1745000,
    });
  });

  it("returns zeros, not NaN, when the backend sends an empty summary", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    const summary = await fetchPortfolioSummary(ALL_TIME);
    expect(Object.values(summary).every((value) => value === 0)).toBe(true);
  });

  it("keeps only the three known expense segments", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          totals: { total: 100 },
          properties_in_scope: 2,
          breakdown: [
            { key: "property_expenses", label: "Property Expenses", amount: 60 },
            { key: "capital_improvements", label: "Capital Improvements", amount: 30 },
            { key: "selling_costs", label: "Selling Costs", amount: 10 },
            { key: "mystery", label: "Mystery", amount: 999 },
          ],
        },
      },
    });

    const result = await fetchExpenseBreakdown(ALL_TIME);

    expect(result.total).toBe(100);
    expect(result.propertiesInScope).toBe(2);
    expect(result.segments.map((segment) => segment.key)).toEqual([
      "property_expenses",
      "capital_improvements",
      "selling_costs",
    ]);
  });

  it("maps income vs expenses totals", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { totals: { rental_income: 100, property_expenses: 40, net_result: 60 } },
      },
    });
    expect(await fetchIncomeExpense(ALL_TIME)).toEqual({
      rentalIncome: 100,
      propertyExpenses: 40,
      netResult: 60,
    });
  });

  it("clamps the collection rate into 0–100 so the progress bar can't overflow", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { totals: { collection_rate: 140.5, received_rent: 1 } } },
    });
    expect((await fetchRentCollection(ALL_TIME)).collectionRate).toBe(100);

    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { totals: { collection_rate: -3 } } },
    });
    expect((await fetchRentCollection(ALL_TIME)).collectionRate).toBe(0);
  });

  it("maps rent collection buckets", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          totals: {
            received_rent: 80,
            outstanding_rent: 20,
            overdue_rent: 5,
            upcoming_rent: 15,
            total_scheduled_rent: 100,
            collection_rate: 80,
          },
        },
      },
    });
    expect(await fetchRentCollection(ALL_TIME)).toEqual({
      received: 80,
      outstanding: 20,
      overdue: 5,
      upcoming: 15,
      scheduled: 100,
      collectionRate: 80,
    });
  });

  it("keeps the five known key actions and drops unknown ones", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          properties_in_scope: 4,
          actions: [
            { key: "property_value_review_due", label: "Value Update Needed", count: 2, description: "d" },
            { key: "recent_disposals", label: "Sold", count: "1", description: "d" },
            { key: "brand_new_action", label: "?", count: 9 },
          ],
        },
      },
    });

    const result = await fetchKeyActions(ALL_TIME);

    expect(result.propertiesInScope).toBe(4);
    expect(result.actions).toEqual([
      { key: "property_value_review_due", label: "Value Update Needed", count: 2, description: "d" },
      { key: "recent_disposals", label: "Sold", count: 1, description: "d" },
    ]);
  });

  it("maps the capital snapshot metrics", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          properties_in_scope: 3,
          metrics: {
            total_cost_base: 10,
            capital_improvements: 2,
            selling_costs: 3,
            disposal_sale_proceeds: 4,
            disposed_properties: 1,
          },
        },
      },
    });
    expect(await fetchCapitalSnapshot(ALL_TIME)).toEqual({
      propertiesInScope: 3,
      totalCostBase: 10,
      capitalImprovements: 2,
      sellingCosts: 3,
      saleProceeds: 4,
      disposedProperties: 1,
    });
  });

  it("maps comparison rows and stringifies ids", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          properties_in_scope: 1,
          rows: [
            {
              property_id: 8,
              property_name: "Carlton Flat",
              purchase_date: "2019-05-20",
              status: "disposed",
              current_value: 0,
              loan_balance: 0,
              equity: 0,
              rental_income: 7800,
              property_expenses: 3100,
              net_rental_result: 4700,
              cost_base: 429000,
            },
          ],
        },
      },
    });

    const result = await fetchPropertyComparison(ALL_TIME);

    expect(result.rows[0]).toEqual({
      id: "8",
      name: "Carlton Flat",
      purchaseDate: "2019-05-20",
      status: "disposed",
      currentValue: 0,
      loanBalance: 0,
      equity: 0,
      rentalIncome: 7800,
      propertyExpenses: 3100,
      netRentalResult: 4700,
      costBase: 429000,
    });
  });

  it("rejects when a dashboard section fails, so only that section shows an error", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "boom" } });
    await expect(fetchKeyActions(ALL_TIME)).rejects.toThrow("boom");
    await expect(fetchCapitalSnapshot(ALL_TIME)).rejects.toThrow("boom");
  });

  it("formats the collection rate to one decimal place", () => {
    expect(collectionRateLabel(66.666)).toBe("66.7%");
    expect(collectionRateLabel(0)).toBe("0.0%");
  });
});

describe("financialYearStartOf", () => {
  it("puts July onwards in the year that starts that July", () => {
    expect(financialYearStartOf("2024-06-30")).toBe(2023);
    expect(financialYearStartOf("2024-07-01")).toBe(2024);
    expect(financialYearStartOf("2024-12-31")).toBe(2024);
    expect(financialYearStartOf("2025-01-01")).toBe(2024);
  });

  it("returns null for dates it can't read", () => {
    expect(financialYearStartOf("")).toBeNull();
    expect(financialYearStartOf("2024-13-01")).toBeNull();
  });
});

describe("isValueStale", () => {
  const NOW = new Date("2026-10-16T00:00:00Z");

  it("flags a property with no value or no update date", () => {
    expect(isValueStale({ hasCurrentValue: false, valueUpdatedAt: "2026-10-01T00:00:00Z" }, NOW)).toBe(true);
    expect(isValueStale({ hasCurrentValue: true, valueUpdatedAt: null }, NOW)).toBe(true);
    expect(isValueStale({ hasCurrentValue: true, valueUpdatedAt: "garbage" }, NOW)).toBe(true);
  });

  it("matches the dashboard's 365-day rule at the boundary", () => {
    expect(isValueStale({ hasCurrentValue: true, valueUpdatedAt: "2025-10-17T00:00:00Z" }, NOW)).toBe(false);
    expect(isValueStale({ hasCurrentValue: true, valueUpdatedAt: "2025-10-16T00:00:00Z" }, NOW)).toBe(true);
  });
});

describe("propertyYearOptions", () => {
  it("lists calendar years from purchase to now, newest first", () => {
    expect(propertyYearOptions("2023-05-01", null, TODAY)).toEqual([2026, 2025, 2024, 2023]);
  });

  it("stops at the sale year for a sold property", () => {
    expect(propertyYearOptions("2023-05-01", "2025-11-01", TODAY)).toEqual([2025, 2024, 2023]);
  });

  it("always offers at least one year, even for odd dates", () => {
    expect(propertyYearOptions("", null, TODAY)).toEqual([2026]);
    expect(propertyYearOptions("2030-01-01", null, TODAY)).toEqual([2026]);
  });
});

describe("fetchAllPages", () => {
  it("walks pages until the total is reached", async () => {
    const pages: number[] = [];
    const rows = await fetchAllPages(async (page) => {
      pages.push(page);
      return { rows: Array.from({ length: page < 3 ? 2 : 1 }, (_, i) => `${page}-${i}`), total: 5 };
    }, 2);
    expect(rows).toHaveLength(5);
    expect(pages).toEqual([1, 2, 3]);
  });

  it("stops on an empty page even if the total is wrong", async () => {
    const rows = await fetchAllPages(async (page) => ({ rows: page === 1 ? ["a"] : [], total: 99 }));
    expect(rows).toEqual(["a"]);
  });

  it("is bounded so a bad total can't loop forever", async () => {
    let calls = 0;
    await fetchAllPages(
      async () => {
        calls += 1;
        return { rows: ["x"], total: 1_000_000 };
      },
      1,
      7,
    );
    expect(calls).toBe(7);
  });

  it("returns nothing for an empty list without a second request", async () => {
    let calls = 0;
    const rows = await fetchAllPages(async () => {
      calls += 1;
      return { rows: [], total: 0 };
    });
    expect(rows).toEqual([]);
    expect(calls).toBe(1);
  });
});
