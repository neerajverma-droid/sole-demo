/**
 * The dashboard's period filter — Monthly, Yearly, Previous Year — as
 * sole-webapp's dashboard had it, on the business's own financial year.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  DASHBOARD_PERIODS,
  DEFAULT_DASHBOARD_PERIOD,
  dashboardPeriodLabel,
  dashboardPeriodParams,
  dashboardWindow,
  inWindow,
} = await import("@/lib/dashboard-period");
const { fetchDashboardTopExpenses, fetchDashboardTopIncomes } = await import("@/lib/dashboard");
const { financialYearRevenue } = await import("@/lib/invoices");

const AU = { month: 7, day: 1 };
const NZ = { month: 4, day: 1 };
/** 8 October 2026, midday local. */
const OCT_8 = new Date(2026, 9, 8, 12);

beforeEach(() => vi.clearAllMocks());

describe("the dropdown", () => {
  it("offers Monthly, Yearly and Previous Year, in the old order", () => {
    expect(DASHBOARD_PERIODS).toEqual([
      { value: "month", label: "Monthly" },
      { value: "year", label: "Yearly" },
      { value: "previous year", label: "Previous Year" },
    ]);
  });

  it("opens on Yearly", () => {
    expect(DEFAULT_DASHBOARD_PERIOD).toBe("year");
    expect(dashboardPeriodLabel(DEFAULT_DASHBOARD_PERIOD)).toBe("Yearly");
  });

  it("labels each choice for the button", () => {
    expect(dashboardPeriodLabel("month")).toBe("Monthly");
    expect(dashboardPeriodLabel("previous year")).toBe("Previous Year");
  });
});

describe("Yearly", () => {
  it("covers the Australian financial year the date is in", () => {
    expect(dashboardWindow("year", OCT_8, AU)).toMatchObject({
      startIso: "2026-07-01",
      endIso: "2027-06-30",
      label: "Financial year 2026",
      isPast: false,
      phrase: "this year",
    });
  });

  it("before 1 July, is the year that started the July before", () => {
    expect(dashboardWindow("year", new Date(2026, 2, 15, 12), AU)).toMatchObject({
      startIso: "2025-07-01",
      endIso: "2026-06-30",
    });
  });

  it("follows the business's own year start — 1 April in New Zealand", () => {
    expect(dashboardWindow("year", OCT_8, NZ)).toMatchObject({
      startIso: "2026-04-01",
      endIso: "2027-03-31",
    });
  });

  it("measures the goal against the same year", () => {
    const span = dashboardWindow("year", OCT_8, AU);
    expect(span.financialYear).toMatchObject({ startIso: "2026-07-01", endIso: "2027-06-30" });
  });
});

describe("Previous Year", () => {
  it("is the financial year before the current one", () => {
    expect(dashboardWindow("previous year", OCT_8, AU)).toMatchObject({
      startIso: "2025-07-01",
      endIso: "2026-06-30",
      label: "Financial year 2025",
      phrase: "last financial year",
    });
  });

  it("is history — the goal can't be edited from it", () => {
    expect(dashboardWindow("previous year", OCT_8, AU).isPast).toBe(true);
    expect(dashboardWindow("year", OCT_8, AU).isPast).toBe(false);
    expect(dashboardWindow("month", OCT_8, AU).isPast).toBe(false);
  });

  it("measures the goal against last year too", () => {
    expect(dashboardWindow("previous year", OCT_8, AU).financialYear).toMatchObject({
      startIso: "2025-07-01",
      endIso: "2026-06-30",
    });
  });

  it("uses New Zealand's year in New Zealand", () => {
    expect(dashboardWindow("previous year", OCT_8, NZ)).toMatchObject({
      startIso: "2025-04-01",
      endIso: "2026-03-31",
    });
  });
});

describe("Monthly", () => {
  it("covers the current calendar month", () => {
    expect(dashboardWindow("month", OCT_8, AU)).toMatchObject({
      startIso: "2026-10-01",
      endIso: "2026-10-31",
      label: "October 2026",
      phrase: "this month",
    });
  });

  it("ends on the month's real last day", () => {
    expect(dashboardWindow("month", new Date(2026, 1, 10, 12), AU).endIso).toBe("2026-02-28");
    expect(dashboardWindow("month", new Date(2028, 1, 10, 12), AU).endIso).toBe("2028-02-29");
    expect(dashboardWindow("month", new Date(2026, 3, 10, 12), AU).endIso).toBe("2026-04-30");
  });

  it("still measures the yearly goal against the current financial year", () => {
    expect(dashboardWindow("month", OCT_8, AU).financialYear).toMatchObject({
      startIso: "2026-07-01",
      endIso: "2027-06-30",
    });
  });
});

describe("what falls in a period", () => {
  const october = dashboardWindow("month", OCT_8, AU);

  it("includes both ends", () => {
    expect(inWindow("2026-10-01", october)).toBe(true);
    expect(inWindow("2026-10-31", october)).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(inWindow("2026-09-30", october)).toBe(false);
    expect(inWindow("2026-11-01", october)).toBe(false);
  });

  it("drives the billed figure — only invoices issued in the period, never drafts", () => {
    // Only which invoices count is under test, so they carry no lines.
    const invoice = (status: string, issued: string) => ({ status, issued, items: [], extraDiscount: "" });
    const invoices = [
      invoice("Paid", "2026-10-03"),
      invoice("Outstanding", "2026-09-20"),
      invoice("Draft", "2026-10-05"),
      invoice("Paid", "2025-08-01"),
    ] as unknown as Parameters<typeof financialYearRevenue>[0];

    expect(financialYearRevenue(invoices, october).count).toBe(1);
    expect(financialYearRevenue(invoices, dashboardWindow("year", OCT_8, AU)).count).toBe(2);
    expect(financialYearRevenue(invoices, dashboardWindow("previous year", OCT_8, AU)).count).toBe(1);
  });
});

describe("what the server is asked for", () => {
  it("sends period=month and the month's bounds for Monthly", () => {
    expect(dashboardPeriodParams(dashboardWindow("month", OCT_8, AU))).toEqual({
      period: "month",
      start: "2026-10-01",
      end: "2026-10-31",
    });
  });

  it("sends period=year and the year's bounds for Yearly and Previous Year", () => {
    expect(dashboardPeriodParams(dashboardWindow("year", OCT_8, AU))).toEqual({
      period: "year",
      start: "2026-07-01",
      end: "2027-06-30",
    });
    expect(dashboardPeriodParams(dashboardWindow("previous year", OCT_8, AU))).toEqual({
      period: "year",
      start: "2025-07-01",
      end: "2026-06-30",
    });
  });

  it("top income and expenses report over the chosen period", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    const query = dashboardPeriodParams(dashboardWindow("previous year", OCT_8, AU));

    await fetchDashboardTopIncomes(AU, query);
    await fetchDashboardTopExpenses(AU, query);

    expect(apiMock.get).toHaveBeenNthCalledWith(1, apiRoutes.dashboard.topIncomes, { params: query });
    expect(apiMock.get).toHaveBeenNthCalledWith(2, apiRoutes.dashboard.topExpenses, { params: query });
  });
});
