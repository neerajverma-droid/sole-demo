import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const loan = await import("@/lib/investment-property-loan");
const income = await import("@/lib/investment-property-income");
const expenses = await import("@/lib/investment-property-expenses");
const maintenance = await import("@/lib/investment-property-maintenance");
const rental = await import("@/lib/investment-property-rental");
const costBase = await import("@/lib/investment-property-cost-base");
const documents = await import("@/lib/investment-property-documents");
const history = await import("@/lib/investment-property-use-history");
const cgt = await import("@/lib/investment-property-cgt");
const base = await import("@/lib/investment-property");

const TODAY = new Date(2026, 9, 16);
const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({
  data: { success: true, data, ...extra },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shared helpers", () => {
  it("validates real calendar dates only", () => {
    expect(base.isValidIsoDate("2026-02-28")).toBe(true);
    expect(base.isValidIsoDate("2026-02-30")).toBe(false);
    expect(base.isValidIsoDate("2026-13-01")).toBe(false);
    expect(base.isValidIsoDate("26-01-01")).toBe(false);
    expect(base.isValidIsoDate("")).toBe(false);
  });

  it("computes a clamped page window", () => {
    expect(base.pageInfoFor(1, 10, 0)).toEqual({ page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
    expect(base.pageInfoFor(2, 10, 25)).toEqual({ page: 2, pageCount: 3, total: 25, from: 11, to: 20 });
    expect(base.pageInfoFor(9, 10, 25).page).toBe(3);
  });

  it("reads booleans the way MySQL and JSON both send them", () => {
    expect(base.toBool(1)).toBe(true);
    expect(base.toBool("1")).toBe(true);
    expect(base.toBool("true")).toBe(true);
    expect(base.toBool(0)).toBe(false);
    expect(base.toBool("0")).toBe(false);
    expect(base.toBool(null)).toBe(false);
  });
});

describe("loan", () => {
  const valid = (overrides: Partial<ReturnType<typeof loan.emptyLoanDraft>> = {}) => ({
    ...loan.emptyLoanDraft(),
    lenderName: "CBA",
    startDate: "2022-03-15",
    originalAmount: "500000",
    ...overrides,
  });

  it("maps a stored loan and prefers the effective balance", () => {
    const mapped = loan.mapLoan({
      lender_name: "CBA",
      loan_start_date: "2022-03-15",
      original_loan_amount: "500000.00",
      current_loan_balance: "480000.00",
      effective_loan_amount: "480000.00",
      interest_rate: "6.2500",
      repayment_frequency: "monthly",
      repayment_amount: "3100.00",
      loan_term_value: 30,
      loan_term_unit: "years",
      loan_type: "interest_only",
      interest_type: "variable",
      interest_only_end_date: "2027-03-15",
    });
    expect(mapped).toMatchObject({
      originalAmount: 500000,
      currentBalance: 480000,
      hasCurrentBalance: true,
      interestRate: 6.25,
      repaymentFrequency: "monthly",
      repaymentAmount: 3100,
      termValue: 30,
      termUnit: "years",
      loanType: "interest_only",
    });
  });

  it("falls back to the original amount when no balance was entered", () => {
    const mapped = loan.mapLoan({ original_loan_amount: "250000.00", current_loan_balance: null });
    expect(mapped.currentBalance).toBe(250000);
    expect(mapped.hasCurrentBalance).toBe(false);
    expect(loan.draftFromLoan(mapped).currentBalance).toBe("");
  });

  it("accepts a minimal valid loan", () => {
    expect(loan.loanIssues(valid(), TODAY)).toEqual([]);
  });

  it("requires lender, start date and original amount", () => {
    const keys = loan.loanIssues(loan.emptyLoanDraft(), TODAY).map((issue) => issue.key);
    expect(keys).toEqual(["lenderName", "startDate", "originalAmount"]);
  });

  it("rejects a future start date and a zero amount, as the backend does", () => {
    const keys = loan.loanIssues(valid({ startDate: "2026-10-17", originalAmount: "0" }), TODAY).map((i) => i.key);
    expect(keys).toEqual(["startDate", "originalAmount"]);
  });

  it("requires both rates and a valid portion for split loans", () => {
    const keys = loan.loanIssues(valid({ interestType: "split" }), TODAY).map((issue) => issue.key);
    expect(keys).toEqual(["fixedRate", "variableRate", "fixedPortion"]);
  });

  it("bounds the fixed portion: <100% for percentages, >0 for dollars", () => {
    const base = valid({ interestType: "split", fixedRate: "5", variableRate: "6" });
    expect(loan.loanIssues({ ...base, splitType: "percentage", fixedPortion: "100" }, TODAY).map((i) => i.key)).toEqual([
      "fixedPortion",
    ]);
    expect(loan.loanIssues({ ...base, splitType: "percentage", fixedPortion: "50" }, TODAY)).toEqual([]);
    expect(loan.loanIssues({ ...base, splitType: "dollar", fixedPortion: "250000" }, TODAY)).toEqual([]);
    expect(loan.loanIssues({ ...base, splitType: "dollar", fixedPortion: "0" }, TODAY).map((i) => i.key)).toEqual([
      "fixedPortion",
    ]);
  });

  it("limits rates to 4 decimals and 100%", () => {
    expect(loan.loanIssues(valid({ interestRate: "6.12345" }), TODAY).map((i) => i.key)).toEqual(["interestRate"]);
    expect(loan.loanIssues(valid({ interestRate: "101" }), TODAY).map((i) => i.key)).toEqual(["interestRate"]);
    expect(loan.loanIssues(valid({ interestRate: "6.2%" }), TODAY)).toEqual([]);
  });

  it("needs a frequency once a repayment is entered", () => {
    expect(loan.loanIssues(valid({ repaymentAmount: "3000" }), TODAY).map((i) => i.key)).toEqual([
      "repaymentFrequency",
    ]);
    expect(loan.loanIssues(valid({ repaymentAmount: "3000", repaymentFrequency: "monthly" }), TODAY)).toEqual([]);
  });

  it("checks the interest-only end date is not before the start", () => {
    const keys = loan
      .loanIssues(valid({ loanType: "interest_only", interestOnlyEndDate: "2021-01-01" }), TODAY)
      .map((i) => i.key);
    expect(keys).toEqual(["interestOnlyEndDate"]);
  });

  it("only sends the rate fields that match the interest type", () => {
    const variable = loan.loanWriteBody(valid({ interestRate: "6.25", fixedRate: "9", variableRate: "9", fixedPortion: "40" }));
    expect(variable).toMatchObject({
      interest_rate: 6.25,
      fixed_interest_rate: null,
      variable_interest_rate: null,
      fixed_portion_percentage: null,
      split_type: "percentage",
    });

    const split = loan.loanWriteBody(
      valid({ interestType: "split", interestRate: "9", fixedRate: "5.99", variableRate: "6.34", fixedPortion: "50", splitType: "dollar" }),
    );
    expect(split).toMatchObject({
      interest_rate: null,
      fixed_interest_rate: 5.99,
      variable_interest_rate: 6.34,
      fixed_portion_percentage: 50,
      split_type: "dollar",
    });
  });

  it("drops the interest-only date for a principal & interest loan, and the term unit with no term", () => {
    const body = loan.loanWriteBody(valid({ interestOnlyEndDate: "2027-01-01", termValue: "" }));
    expect(body.interest_only_end_date).toBeNull();
    expect(body.loan_term_value).toBeNull();
    expect(body.loan_term_unit).toBeNull();
    expect(body.current_loan_balance).toBeNull();
  });

  it("GETs the loan and returns null when none exists", async () => {
    apiMock.get.mockResolvedValue(ok({ property_id: 1, loan: null }));
    expect(await loan.fetchPropertyLoan("1")).toBeNull();
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.loan}1`);
  });

  it("PUTs the loan (upsert) and DELETEs it by property id", async () => {
    apiMock.put.mockResolvedValue(ok({}));
    await loan.savePropertyLoanApi("4", valid());
    expect(apiMock.put.mock.calls[0][0]).toBe(`${apiRoutes.investment.loan}4`);
    expect(apiMock.put.mock.calls[0][1]).toMatchObject({ lender_name: "CBA", original_loan_amount: 500000 });

    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await loan.deletePropertyLoanApi("4");
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.investment.loan}4`);

    apiMock.delete.mockResolvedValue({ data: { success: false, message: "Disposed properties are read-only" } });
    await expect(loan.deletePropertyLoanApi("4")).rejects.toThrow("Disposed properties are read-only");
  });
});

describe("income", () => {
  const valid = (overrides: Partial<ReturnType<typeof income.emptyIncomeDraft>> = {}) => ({
    ...income.emptyIncomeDraft(),
    date: "2026-10-01",
    amount: "650",
    ...overrides,
  });

  it("maps reconciled flags from 0/1 and builds a schedule label", () => {
    const row = income.mapIncome({
      id: 9,
      date: "2026-10-01",
      amount: "650.00",
      income_source: "rental_schedule",
      rental_schedule_id: 3,
      is_reconciled: 1,
      remainingAmount: "0",
      possible_match: 2,
      rentalSchedule: { rent_frequency: "weekly", rent_amount: "650.00" },
    });
    expect(row).toMatchObject({
      id: "9",
      amount: 650,
      source: "rental_schedule",
      scheduleId: "3",
      scheduleRent: 650,
      scheduleFrequency: "weekly",
      reconciled: true,
      possibleMatches: 2,
    });
  });

  it("treats unknown sources as manual", () => {
    expect(income.mapIncome({ id: 1, income_source: "weird" }).source).toBe("manual");
  });

  it("validates date, amount and the schedule link", () => {
    expect(income.incomeIssues(valid())).toEqual([]);
    expect(income.incomeIssues(income.emptyIncomeDraft()).map((i) => i.key)).toEqual(["date", "amount"]);
    expect(income.incomeIssues(valid({ amount: "0" })).map((i) => i.key)).toEqual(["amount"]);
    expect(income.incomeIssues(valid({ source: "rental_schedule" })).map((i) => i.key)).toEqual(["scheduleId"]);
    expect(income.incomeIssues(valid({ source: "rental_schedule", scheduleId: "3" }))).toEqual([]);
  });

  it("sends the schedule id only for rental-schedule income", () => {
    expect(income.incomeWriteBody(valid({ source: "manual", scheduleId: "3" }))).toMatchObject({
      income_source: "manual",
      rental_schedule_id: null,
    });
    expect(income.incomeWriteBody(valid({ source: "rental_schedule", scheduleId: "3", notes: " n " }))).toMatchObject({
      income_source: "rental_schedule",
      rental_schedule_id: 3,
      notes: "n",
    });
  });

  it("lists with backend filter names and totals", async () => {
    apiMock.get.mockResolvedValue(
      ok([{ id: 1, amount: "10" }], { pagination: { total: 31 }, summary: { total_amount: "310.00" } }),
    );
    const page = await income.fetchPropertyIncome("5", { page: 2, limit: 10, source: "manual", match: "matched" });
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.income}5`, {
      params: { page: 2, limit: 10, income_source: "manual", is_reconciled: 1 },
    });
    expect(page).toMatchObject({ total: 31, totalAmount: 310 });

    await income.fetchPropertyIncome("5", { page: 1, limit: 10, source: "all", match: "unmatched" });
    expect(apiMock.get.mock.calls[1][1].params).toEqual({ page: 1, limit: 10, is_reconciled: 0 });
  });

  it("POSTs, PUTs and DELETEs on the right URLs", async () => {
    apiMock.post.mockResolvedValue(ok({}));
    apiMock.put.mockResolvedValue(ok({}));
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await income.createIncomeApi("5", valid());
    await income.updateIncomeApi("5", "8", valid());
    await income.deleteIncomeApi("5", "8");
    expect(apiMock.post.mock.calls[0][0]).toBe(`${apiRoutes.investment.income}5`);
    expect(apiMock.put.mock.calls[0][0]).toBe(`${apiRoutes.investment.income}5/8`);
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.investment.income}5/8`);
  });
});

describe("expenses", () => {
  it("maps the effective price, category and receipt/match flags", () => {
    expect(
      expenses.mapExpense({
        expense_id: 12,
        name: " Plumber ",
        date: "2026-09-01",
        price: 220.5,
        is_reconciled: 1,
        image: "https://x/y.png",
        account_subcategory: { name: "Repairs" },
      }),
    ).toEqual({
      id: "12",
      date: "2026-09-01",
      name: "Plumber",
      category: "Repairs",
      amount: 220.5,
      matched: true,
      hasReceipt: true,
    });
    expect(expenses.mapExpense({ id: 3 }).name).toBe("Untitled expense");
  });

  it("lists property expenses with the page/limit the backend reads", async () => {
    apiMock.get.mockResolvedValue(ok([], { pagination: { total: 0 }, summary: { total_amount: 0 } }));
    await expenses.fetchPropertyExpenses("5", 3, 20);
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.expenses}5`, {
      params: { page: 3, limit: 20 },
    });
  });

  it("searches assignable expenses and omits a blank search", async () => {
    apiMock.get.mockResolvedValue(ok([]));
    await expenses.fetchAssignableExpenses(1, 8, "  ");
    expect(apiMock.get.mock.calls[0][1].params).toEqual({ page: 1, limit: 8 });
    await expenses.fetchAssignableExpenses(1, 8, " rates ");
    expect(apiMock.get.mock.calls[1][1].params).toEqual({ page: 1, limit: 8, search: "rates" });
    expect(apiMock.get.mock.calls[1][0]).toBe(apiRoutes.investment.assignableExpenses);
  });

  it("assigns by numeric id and returns the assigned count", async () => {
    apiMock.post.mockResolvedValue(ok({ assigned: 2 }));
    expect(await expenses.assignExpensesApi("5", ["10", "11"])).toBe(2);
    expect(apiMock.post).toHaveBeenCalledWith(`${apiRoutes.investment.assignExpenses}5`, {
      expense_ids: [10, 11],
    });
  });
});

describe("maintenance", () => {
  const valid = (overrides: Partial<ReturnType<typeof maintenance.emptyMaintenanceDraft>> = {}) => ({
    ...maintenance.emptyMaintenanceDraft(),
    title: "Fix gutter",
    issueDate: "2026-10-01",
    ...overrides,
  });

  it("maps a row, preferring the business name for the contractor", () => {
    const item = maintenance.mapMaintenance({
      id: 4,
      title: "Fix gutter",
      issue_date: "2026-10-01",
      status: "quote_requested",
      estimated_cost: "300.00",
      actual_cost: null,
      client_id: 9,
      linked_expense_id: null,
      client: { name: "Bob", business_name: "Bob's Roofing" },
    });
    expect(item).toMatchObject({
      id: "4",
      status: "quote_requested",
      estimatedCost: 300,
      actualCost: null,
      clientId: "9",
      clientName: "Bob's Roofing",
      linkedExpenseId: null,
    });
  });

  it("defaults unknown statuses to logged", () => {
    expect(maintenance.mapMaintenance({ id: 1, status: "mystery" }).status).toBe("logged");
  });

  it("validates title, date and cost formats", () => {
    expect(maintenance.maintenanceIssues(valid())).toEqual([]);
    expect(maintenance.maintenanceIssues(maintenance.emptyMaintenanceDraft()).map((i) => i.key)).toEqual([
      "title",
      "issueDate",
    ]);
    expect(
      maintenance.maintenanceIssues(valid({ estimatedCost: "x", actualCost: "-1" })).map((i) => i.key),
    ).toEqual(["estimatedCost", "actualCost"]);
  });

  it("maps statuses to badge tones", () => {
    expect(maintenance.maintenanceStatusTone("paid")).toBe("success");
    expect(maintenance.maintenanceStatusTone("cancelled")).toBe("danger");
    expect(maintenance.maintenanceStatusTone("logged")).toBe("secondary");
  });

  it("builds the write body with nulls for blank optional fields", () => {
    expect(maintenance.maintenanceWriteBody(valid({ clientId: "9", estimatedCost: "300" }))).toEqual({
      title: "Fix gutter",
      issue_date: "2026-10-01",
      status: "logged",
      client_id: 9,
      estimated_cost: 300,
      actual_cost: null,
      notes: null,
    });
  });

  it("links by re-sending the item's current fields plus the expense id, so nothing else is reset", async () => {
    apiMock.get.mockResolvedValue(
      ok({
        id: 4,
        title: "Fix gutter",
        issue_date: "2026-10-01",
        status: "completed",
        estimated_cost: "300.00",
        actual_cost: "250.00",
        client_id: 9,
        notes: "Quote attached",
        linked_expense_id: null,
      }),
    );
    apiMock.put.mockResolvedValue(ok({}));

    await maintenance.linkMaintenanceExpenseApi("5", "4", "77");

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.maintenance}5/4`);
    expect(apiMock.put).toHaveBeenCalledWith(`${apiRoutes.investment.maintenance}5/4`, {
      title: "Fix gutter",
      issue_date: "2026-10-01",
      status: "completed",
      client_id: 9,
      estimated_cost: 300,
      actual_cost: 250,
      notes: "Quote attached",
      linked_expense_id: 77,
    });
  });

  it("does not attempt the link if the current item can't be read", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Maintenance item not found" } });
    await expect(maintenance.linkMaintenanceExpenseApi("5", "4", "77")).rejects.toThrow("not found");
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it("filters by status and reads page totals", async () => {
    apiMock.get.mockResolvedValue(
      ok([{ id: 1 }], {
        pagination: { total: 1 },
        summary: { total_estimated_cost: "300.00", total_actual_cost: "250.00" },
      }),
    );
    const page = await maintenance.fetchPropertyMaintenance("5", { page: 1, limit: 10, status: "approved" });
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.maintenance}5`, {
      params: { page: 1, limit: 10, status: "approved" },
    });
    expect(page).toMatchObject({ total: 1, totalEstimated: 300, totalActual: 250 });
  });
});

describe("rental schedule", () => {
  const valid = (overrides: Partial<ReturnType<typeof rental.emptyScheduleDraft>> = {}) => ({
    ...rental.emptyScheduleDraft(),
    rentAmount: "650",
    startDate: "2026-01-05",
    ...overrides,
  });

  it("maps booleans from either 1/0 or true/false", () => {
    const schedule = rental.mapSchedule({
      id: 1,
      rent_amount: "650.00",
      rent_frequency: "fortnightly",
      rent_start_date: "2026-01-05",
      expected_payment_day: 5,
      agent_managed: 1,
      agent_name: "Ray White",
      is_active: true,
    });
    expect(schedule).toMatchObject({
      rentAmount: 650,
      frequency: "fortnightly",
      paymentDay: 5,
      agentManaged: true,
      agentName: "Ray White",
      active: true,
    });
  });

  it("validates amount, dates and payment day", () => {
    expect(rental.scheduleIssues(valid())).toEqual([]);
    expect(rental.scheduleIssues(rental.emptyScheduleDraft()).map((i) => i.key)).toEqual(["rentAmount", "startDate"]);
    expect(rental.scheduleIssues(valid({ endDate: "2025-12-31" })).map((i) => i.key)).toEqual(["endDate"]);
    for (const day of ["0", "32", "1.5", "abc"]) {
      expect(rental.scheduleIssues(valid({ paymentDay: day })).map((i) => i.key)).toEqual(["paymentDay"]);
    }
    expect(rental.scheduleIssues(valid({ paymentDay: "31" }))).toEqual([]);
  });

  it("only keeps the agent name for agent-managed schedules", () => {
    expect(rental.scheduleWriteBody(valid({ agentManaged: false, agentName: "Ray" })).agent_name).toBeNull();
    expect(rental.scheduleWriteBody(valid({ agentManaged: true, agentName: " Ray " })).agent_name).toBe("Ray");
  });

  it("creates under the property and updates/deletes by schedule id", async () => {
    apiMock.post.mockResolvedValue(ok({}));
    apiMock.patch.mockResolvedValue(ok({}));
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await rental.createScheduleApi("5", valid());
    expect(apiMock.post.mock.calls[0][0]).toBe(`${apiRoutes.investment.rentalScheduleByProperty}5/rental-schedule`);

    await rental.updateScheduleApi("8", valid());
    expect(apiMock.patch.mock.calls[0][0]).toBe(`${apiRoutes.investment.rentalScheduleItem}8`);

    await rental.setScheduleActiveApi("8", false);
    expect(apiMock.patch.mock.calls[1]).toEqual([`${apiRoutes.investment.rentalScheduleItem}8`, { is_active: false }]);

    await rental.deleteScheduleApi("8");
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.investment.rentalScheduleItem}8`);
  });

  it("describes frequencies for labels", () => {
    expect(rental.frequencyShort("weekly")).toBe("per week");
    expect(rental.frequencyShort("nope")).toBe("");
    expect(rental.rentFrequencyLabel("monthly")).toBe("Monthly");
  });
});

describe("cost base", () => {
  const valid = { date: "2025-06-01", amount: "12000", description: "Kitchen" };

  it("validates against the purchase date and today", () => {
    expect(costBase.adjustmentIssues(valid, "2022-03-15", TODAY)).toEqual([]);
    expect(costBase.adjustmentIssues({ ...valid, date: "2022-03-14" }, "2022-03-15", TODAY).map((i) => i.key)).toEqual(["date"]);
    expect(costBase.adjustmentIssues({ ...valid, date: "2026-10-17" }, "2022-03-15", TODAY).map((i) => i.key)).toEqual(["date"]);
    expect(costBase.adjustmentIssues({ date: "", amount: "", description: "" }, "", TODAY).map((i) => i.key)).toEqual([
      "date",
      "amount",
      "description",
    ]);
  });

  it("always writes the only supported type, capital_improvement", () => {
    expect(costBase.adjustmentWriteBody(valid)).toEqual({
      date: "2025-06-01",
      amount: 12000,
      type: "capital_improvement",
      description: "Kitchen",
    });
  });

  it("maps stats and posts/puts/deletes under the property", async () => {
    apiMock.get.mockResolvedValue(
      ok({ total_adjustments: 2, capital_improvements_total: "20000.00", selling_costs_total: "0.00", cost_base_total: "715500.00" }),
    );
    expect(await costBase.fetchCostBaseStats("5")).toEqual({
      totalAdjustments: 2,
      capitalImprovements: 20000,
      sellingCosts: 0,
      costBaseTotal: 715500,
    });
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.costBaseStats}5`);

    apiMock.post.mockResolvedValue(ok({}));
    apiMock.put.mockResolvedValue(ok({}));
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await costBase.createAdjustmentApi("5", valid);
    await costBase.updateAdjustmentApi("5", "9", valid);
    await costBase.deleteAdjustmentApi("5", "9");
    expect(apiMock.post.mock.calls[0][0]).toBe(`${apiRoutes.investment.costBase}5`);
    expect(apiMock.put.mock.calls[0][0]).toBe(`${apiRoutes.investment.costBase}5/9`);
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.investment.costBase}5/9`);
  });
});

describe("documents", () => {
  it("rejects files the backend's multer filter would refuse, and oversize files", () => {
    expect(documents.documentFileIssue(null)).toMatch(/choose a file/i);
    expect(documents.documentFileIssue({ type: "application/zip", size: 10 })).toMatch(/only pdf/i);
    expect(documents.documentFileIssue({ type: "application/pdf", size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
    expect(documents.documentFileIssue({ type: "application/pdf", size: 0 })).toMatch(/empty/i);
    expect(documents.documentFileIssue({ type: "image/png", size: 1024 })).toBeNull();
    expect(
      documents.documentFileIssue({
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 1024,
      }),
    ).toBeNull();
  });

  it("derives a default name from the file name and requires a name", () => {
    expect(documents.defaultDocumentName("Contract of sale.final.pdf")).toBe("Contract of sale.final");
    expect(documents.documentNameIssue("  ")).toMatch(/required/i);
    expect(documents.documentNameIssue("a".repeat(256))).toMatch(/255/);
    expect(documents.documentNameIssue("OK")).toBeNull();
  });

  it("formats sizes", () => {
    expect(documents.formatBytes(512)).toBe("512 B");
    expect(documents.formatBytes(2048)).toBe("2.0 KB");
    expect(documents.formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("maps the backend's document_id/file_path/file_name", () => {
    expect(
      documents.mapDocument({ document_id: 3, file_name: " Contract ", file_path: "https://s3/x.pdf", created_at: "2026-01-01" }),
    ).toEqual({ id: "3", name: "Contract", url: "https://s3/x.pdf", uploadedAt: "2026-01-01" });
  });

  it("uploads multipart with document_name and file, without the JSON/encrypted wrapper", async () => {
    apiMock.post.mockResolvedValue(ok(42));
    const file = new File(["x"], "contract.pdf", { type: "application/pdf" });
    await documents.uploadPropertyDocumentApi("5", " Contract ", file);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(`${apiRoutes.investment.documents}5`);
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("document_name")).toBe("Contract");
    expect((body.get("file") as File).name).toBe("contract.pdf");
  });

  it("deletes through the shared /documents/:id endpoint", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await documents.deletePropertyDocumentApi("3");
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.fileUpload.document}/3`);
  });
});

describe("use history", () => {
  const entries = [
    { id: "1", useType: "ppor" as const, startDate: "2020-01-01", endDate: "2022-12-31", otherResidenceNominated: null, notes: "" },
    { id: "2", useType: "investment" as const, startDate: "2023-01-01", endDate: "", otherResidenceNominated: null, notes: "" },
  ];
  const draft = (overrides: Partial<ReturnType<typeof history.emptyUseHistoryDraft>> = {}) => ({
    ...history.emptyUseHistoryDraft("2019-01-01"),
    endDate: "2019-12-31",
    ...overrides,
  });

  it("maps entries and sorts the timeline by start date", async () => {
    apiMock.get.mockResolvedValue(
      ok({
        entries: [
          { id: 2, use_type: "investment", start_date: "2023-01-01", end_date: null },
          { id: 1, use_type: "ppor", start_date: "2020-01-01", end_date: "2022-12-31", another_main_residence_nominated: 0 },
        ],
        summary: { accountant_review_required: true, history_gap_count: "1" },
        notifications: { ppor_warning: "p", absence_rule_warning: null, history_gap_warning: "g" },
      }),
    );
    const result = await history.fetchUseHistory("5");
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.investment.useHistoryByProperty}5/use-history`);
    expect(result.entries.map((entry) => entry.id)).toEqual(["1", "2"]);
    expect(result.entries[0].otherResidenceNominated).toBe(false);
    expect(result.entries[1].otherResidenceNominated).toBeNull();
    expect(result).toMatchObject({ reviewRequired: true, gapCount: 1, pporWarning: "p", gapWarning: "g", absenceWarning: null });
  });

  it("hides PPOR for company-owned properties and rejects it if forced", () => {
    expect(history.availableUseTypes("company").map((type) => type.value)).toEqual(["investment", "vacant"]);
    expect(history.availableUseTypes("individual")).toHaveLength(3);
    expect(history.usagePeriodIssues(draft({ useType: "ppor" }), "company", [], null).map((i) => i.key)).toContain(
      "useType",
    );
  });

  it("detects overlaps the backend would 409 on, including open-ended periods", () => {
    expect(history.usagePeriodIssues(draft(), "individual", entries, null)).toEqual([]);
    expect(
      history.usagePeriodIssues(draft({ startDate: "2022-06-01", endDate: "2023-06-01" }), "individual", entries, null).map((i) => i.key),
    ).toEqual(["startDate"]);
    expect(
      history.usagePeriodIssues(draft({ startDate: "2030-01-01", endDate: "" }), "individual", entries, null).map((i) => i.key),
    ).toEqual(["startDate"]);
  });

  it("treats a shared boundary day as an overlap, but the next day as clear", () => {
    const keys = (start: string, end: string) =>
      history.usagePeriodIssues(draft({ startDate: start, endDate: end }), "individual", entries, null).map((i) => i.key);
    expect(keys("2019-06-01", "2020-01-01")).toEqual(["startDate"]);
    expect(keys("2019-06-01", "2019-12-31")).toEqual([]);
    expect(keys("2022-12-31", "2022-12-31")).toEqual(["startDate"]);
    expect(keys("2023-01-01", "2023-01-01")).toEqual(["startDate"]);
  });

  it("ignores the entry being edited when checking overlap", () => {
    expect(
      history.usagePeriodIssues(
        draft({ useType: "ppor", startDate: "2020-01-01", endDate: "2022-12-31" }),
        "individual",
        entries,
        "1",
      ),
    ).toEqual([]);
  });

  it("requires a start date and orders start before end", () => {
    expect(history.usagePeriodIssues(history.emptyUseHistoryDraft(), "individual", [], null).map((i) => i.key)).toEqual([
      "startDate",
    ]);
    expect(
      history.usagePeriodIssues(draft({ startDate: "2020-05-01", endDate: "2020-04-01" }), "individual", [], null).map((i) => i.key),
    ).toEqual(["endDate"]);
  });

  it("sends the nomination only for PPOR and investment periods", () => {
    expect(history.usagePeriodWriteBody(draft({ useType: "ppor", nomination: "yes" })).another_main_residence_nominated).toBe(true);
    expect(history.usagePeriodWriteBody(draft({ useType: "investment", nomination: "no" })).another_main_residence_nominated).toBe(false);
    expect(history.usagePeriodWriteBody(draft({ useType: "vacant", nomination: "yes" })).another_main_residence_nominated).toBeNull();
    expect(history.usagePeriodWriteBody(draft({ useType: "ppor", nomination: "unset" })).another_main_residence_nominated).toBeNull();
  });

  it("posts, puts and deletes under /:id/use-history", async () => {
    apiMock.post.mockResolvedValue(ok({}));
    apiMock.put.mockResolvedValue(ok({}));
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await history.createUseHistoryApi("5", draft());
    await history.updateUseHistoryApi("5", "2", draft());
    await history.deleteUseHistoryApi("5", "2");
    expect(apiMock.post.mock.calls[0][0]).toBe(`${apiRoutes.investment.useHistoryByProperty}5/use-history`);
    expect(apiMock.put.mock.calls[0][0]).toBe(`${apiRoutes.investment.useHistoryByProperty}5/use-history/2`);
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.investment.useHistoryByProperty}5/use-history/2`);

    apiMock.delete.mockResolvedValue({
      data: { success: false, message: "At least one property use history period must remain on the timeline" },
    });
    await expect(history.deleteUseHistoryApi("5", "1")).rejects.toThrow(/at least one/i);
  });
});

describe("cgt", () => {
  const payload = {
    property_name: "Hawthorn",
    property_tax_treatment: "investment",
    disposal: { disposal_date: "2026-05-01", sale_price: 900000, selling_costs: 20000, net_sale_proceeds: 880000 },
    cost_base: {
      purchase_price: 650000,
      stamp_duty: 34000,
      legal_costs: 2500,
      buyer_agent_costs: 9000,
      capital_improvements: 10000,
      total_cost_base: 705500,
    },
    capital_gain: { gross_capital_gain: 174500, gross_capital_loss: 0 },
    discount: {
      held_longer_than_12_months: true,
      entity_eligible: true,
      eligible: true,
      discount_percentage: 50,
      discount_amount: 87250,
      reason: "ok",
    },
    taxable_gain: { estimated_taxable_capital_gain: 87250 },
    review_flags: { accountant_review_required: true },
    notifications: { ppor_warning: "ppor", absence_rule_warning: null, history_gap_warning: "gap" },
    disclaimers: { message: "estimate", calculation_limited: false },
  };

  it("maps the breakdown", () => {
    expect(cgt.mapCgt(payload)).toMatchObject({
      propertyName: "Hawthorn",
      salePrice: 900000,
      netProceeds: 880000,
      totalCostBase: 705500,
      grossGain: 174500,
      grossLoss: 0,
      discountEligible: true,
      discountAmount: 87250,
      taxableGain: 87250,
      reviewRequired: true,
      warnings: ["ppor", "gap"],
      calculationLimited: false,
    });
  });

  it("keeps a null taxable gain as null rather than 0", () => {
    const mapped = cgt.mapCgt({ ...payload, taxable_gain: { estimated_taxable_capital_gain: null } });
    expect(mapped.taxableGain).toBeNull();
  });

  it("fetches breakdown, tax impact and export from the right endpoints", async () => {
    apiMock.get.mockResolvedValueOnce(ok(payload));
    await cgt.fetchCgtBreakdown("5");
    expect(apiMock.get).toHaveBeenLastCalledWith(`${apiRoutes.investment.cgtBreakdown}5`);

    apiMock.get.mockResolvedValueOnce(
      ok({ calculation_available: true, estimated_tax_impact: "31400.00", tax_rate_percentage: "36", message: "m", disclaimer: "d" }),
    );
    expect(await cgt.fetchCgtTaxImpact("5")).toEqual({
      available: true,
      estimatedTax: 31400,
      ratePercentage: 36,
      message: "m",
      disclaimer: "d",
    });
    expect(apiMock.get).toHaveBeenLastCalledWith(`${apiRoutes.investment.cgtTaxImpact}5`);

    apiMock.get.mockResolvedValueOnce(ok({ export_type: "x" }));
    expect(await cgt.fetchAccountantExport("5")).toEqual({ export_type: "x" });
    expect(apiMock.get).toHaveBeenLastCalledWith(`${apiRoutes.investment.accountantExport}5`);
  });

  it("surfaces the backend's 404 for a property that isn't sold", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Disposed investment property not found" } });
    await expect(cgt.fetchCgtBreakdown("5")).rejects.toThrow("Disposed investment property not found");
  });

  it("builds a safe export file name", () => {
    expect(cgt.accountantExportFileName("12 Burwood Rd / Unit #3", new Date("2026-10-16T00:00:00Z"))).toBe(
      "12-burwood-rd-unit-3-cgt-accountant-export-2026-10-16.json",
    );
    expect(cgt.accountantExportFileName("!!!", new Date("2026-10-16T00:00:00Z"))).toBe(
      "property-cgt-accountant-export-2026-10-16.json",
    );
  });
});
