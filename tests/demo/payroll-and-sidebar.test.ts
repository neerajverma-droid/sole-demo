import { describe, expect, it } from "vitest";

import { handleMockRequest } from "@/lib/demo-seed/mock-server";
import { fetchPayrollSeats, fetchPayrollOverview, payrollLocked, payrollEnabled } from "@/lib/payroll";
import { fetchEmployeesPage, fetchEmployeeStats, fetchEmployeeDetail } from "@/lib/payroll-employees";
import { fetchPayruns, fetchPayrunStatusCounts, fetchPayrunDetail } from "@/lib/payroll-payruns";
import { fetchLeaveRequests, fetchLeaveCounts } from "@/lib/payroll-leave";
import { fetchPayrollReport } from "@/lib/payroll-reports";
import { fetchLiabilitiesPage, fetchLiabilitySubcategories } from "@/lib/liabilities";
import { fetchEquityPage, fetchEquitySubcategories } from "@/lib/equity";
import { fetchReputationOverview, fetchReputationFeedbacks } from "@/lib/reputation-api";
import { visibleNav, ADDITIONAL_NAV, addonRows } from "@/lib/nav";
import { idsForSlugs } from "@/lib/addon-entitlements";
import { DEFAULT_EXTRA_NAV_IDS } from "@/lib/atoms";

describe("Payroll and Sidebar in Demo Mode", () => {
  it("enables payroll with active seats and connected microkeeper", async () => {
    const seatsRes = handleMockRequest("GET", "/payroll/subscription");
    expect(seatsRes?.status).toBe(200);
    expect(seatsRes?.data.success).toBe(true);
    expect(seatsRes?.data.data.status).toBe("ACTIVE");
    expect(seatsRes?.data.data.isActive).toBe(true);
    expect(seatsRes?.data.data.employeeLimit).toBe(5);
    expect(seatsRes?.data.data.availableSeats).toBe(3);

    const seats = await fetchPayrollSeats();
    expect(payrollLocked(seats)).toBe(false);
    expect(payrollEnabled(seats)).toBe(true);

    const overview = await fetchPayrollOverview();
    expect(overview.connection.connected).toBe(true);
    expect(overview.connection.status).toBe("CONNECTED");
    expect(overview.stats.activeEmployees).toBe(2);
    expect(overview.latestPayrun?.status).toBe("COMPLETED");
  });

  it("provides complete employee data and stats", async () => {
    const page = await fetchEmployeesPage({ page: 1, limit: 10, search: "", employmentType: "all", status: "all" });
    expect(page.total).toBe(2);
    expect(page.employees).toHaveLength(2);

    const jake = page.employees.find((e) => e.givenName === "Jake");
    expect(jake).toBeDefined();
    expect(jake?.surname).toBe("Morrison");
    expect(jake?.employmentType).toBe("FULL_TIME");
    expect(jake?.status).toBe("SYNCED");

    const olivia = page.employees.find((e) => e.givenName === "Olivia");
    expect(olivia).toBeDefined();
    expect(olivia?.surname).toBe("Grant");
    expect(olivia?.employmentType).toBe("PART_TIME");

    const stats = await fetchEmployeeStats();
    expect(stats.totalEmployees).toBe(2);
    expect(stats.activeEmployees).toBe(2);
    expect(stats.profileIncomplete).toBe(0);

    const detail = await fetchEmployeeDetail("1");
    expect(detail.profile.givenName).toBe("Jake");
    expect(detail.profile.employment.defaultHourlyRate).toBe("24.50");
    expect(detail.profile.super.employerSuperFund).toBe("AustralianSuper");
  });

  it("provides payruns, details, and status counts", async () => {
    const payrunsPage = await fetchPayruns({ page: 1, limit: 10, search: "" });
    expect(payrunsPage.total).toBeGreaterThanOrEqual(1);
    expect(payrunsPage.rows[0].status).toBe("COMPLETED");

    const counts = await fetchPayrunStatusCounts();
    expect(counts.all).toBeGreaterThanOrEqual(1);
    expect(counts.completed).toBeGreaterThanOrEqual(1);

    const detail = await fetchPayrunDetail({ mkRunId: "14", mkYear: "2026" });
    expect(detail.status).toBe("COMPLETED");
    expect(detail.payslips.length).toBe(2);
    expect(detail.summary.totalGross).toBe(2840.5);
  });

  it("provides leave requests and leave counts", async () => {
    const leavePage = await fetchLeaveRequests({ page: 1, limit: 10, status: "APPROVED" });
    expect(leavePage.total).toBe(1);
    expect(leavePage.requests[0].employeeName).toBe("Jake Morrison");
    expect(leavePage.requests[0].status).toBe("APPROVED");

    const counts = await fetchLeaveCounts();
    expect(counts.approved).toBe(1);
  });

  it("provides payroll reports", async () => {
    const summary = (await fetchPayrollReport("payroll-summary", { year: "2026", page: 1, limit: 10 })) as { employees: unknown[] };
    expect(summary.employees.length).toBe(2);

    const breakdown = (await fetchPayrollReport("payroll-breakdown", { year: "2026", page: 1, limit: 10 })) as { employees: unknown[] };
    expect(breakdown.employees.length).toBe(2);

    const accounting = (await fetchPayrollReport("accounting-export", { year: "2026", page: 1, limit: 10 })) as { totalGrossTaxable: number };
    expect(accounting.totalGrossTaxable).toBeGreaterThan(0);
  });

  it("provides liabilities and equity data", async () => {
    const liabilities = await fetchLiabilitiesPage(1, 10);
    expect(liabilities.total).toBe(2);
    expect(liabilities.liabilities[0].name).toContain("Van");

    const liabCats = await fetchLiabilitySubcategories();
    expect(liabCats.length).toBeGreaterThan(0);

    const equity = await fetchEquityPage(1, 10);
    expect(equity.total).toBe(2);
    expect(equity.equity[0].name).toContain("Capital");

    const equityCats = await fetchEquitySubcategories();
    expect(equityCats.length).toBeGreaterThan(0);
  });

  it("provides reputation reviews and overview", async () => {
    const overview = await fetchReputationOverview();
    expect(overview.averageStarRating).toBe(4.9);
    expect(overview.totalResponses).toBe(18);

    const feedbacks = await fetchReputationFeedbacks();
    expect(feedbacks.length).toBe(3);
    expect(feedbacks[0].starRating).toBe(5);
  });

  it("renders core books in Main and moved add-ons in the Add-ons section", () => {
    const allExtras = Array.from(new Set([...DEFAULT_EXTRA_NAV_IDS, ...ADDITIONAL_NAV.map((i) => i.id)]));
    const sections = visibleNav({ extras: allExtras });
    const mainSection = sections.find((s) => s.section === "Main");
    expect(mainSection).toBeDefined();

    const ids = (mainSection?.items ?? []).map((i) => i.id);
    expect(ids).toContain("transactions");
    expect(ids).toContain("contacts");
    expect(ids).toContain("sales");
    expect(ids).toContain("expenses");
    expect(ids).toContain("asset-register");
    expect(ids).toContain("reporting");
    expect(ids).toContain("liabilities");
    expect(ids).toContain("migrations");

    // Add-on modules moved out of Main and More
    expect(ids).not.toContain("proposals-group");
    expect(ids).not.toContain("payroll-group");
    expect(ids).not.toContain("km-tracker-group");
    expect(ids).not.toContain("reputation");
    expect(ids).not.toContain("tax-estimator");

    // Add-ons section contains all 9 add-on modules
    const allAddonIds = [
      "projects",
      "scheduling",
      "time-tracker",
      "investment",
      "payroll",
      "km-tracker",
      "proposals",
      "reputation",
      "tax-estimator",
    ];
    const rows = addonRows(allAddonIds);
    const addonNavIds = rows.map((r) => r.id);
    expect(addonNavIds).toContain("projects");
    expect(addonNavIds).toContain("scheduling");
    expect(addonNavIds).toContain("time-tracker");
    expect(addonNavIds).toContain("investment");
    expect(addonNavIds).toContain("payroll");
    expect(addonNavIds).toContain("km-tracker");
    expect(addonNavIds).toContain("proposals");
    expect(addonNavIds).toContain("reputation");
    expect(addonNavIds).toContain("tax-estimator");
  });
});
