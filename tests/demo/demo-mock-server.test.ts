import { describe, expect, it } from "vitest";
import { handleMockRequest, getSeedData, demoUser } from "@/lib/demo-seed/mock-server";

describe("Demo Mock Server", () => {
  it("provides demo login with Coastal Spark Electrical profile", () => {
    const res = handleMockRequest("POST", "/demo/login");
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.data.success).toBe(true);
    expect(res?.data.data.user.email).toBe("accounts.coastalspark@example.com");
    expect(res?.data.data.user.business_name).toBe("Coastal Spark Electrical");
  });

  it("serves business list as array and detail as object", () => {
    const listRes = handleMockRequest("GET", "/businesses");
    expect(listRes).not.toBeNull();
    expect(listRes?.data.success).toBe(true);
    expect(Array.isArray(listRes?.data.data)).toBe(true);
    expect(listRes?.data.data[0].business_name).toBe("Coastal Spark Electrical");
    expect(listRes?.data.data[0].abn).toBe("51 824 753 556");

    const detailRes = handleMockRequest("GET", "/businesses/1");
    expect(detailRes).not.toBeNull();
    expect(detailRes?.data.success).toBe(true);
    expect(detailRes?.data.data.business_name).toBe("Coastal Spark Electrical");
  });

  it("serves personal profile over POST /user/getProfile", () => {
    const res = handleMockRequest("POST", "/user/getProfile");
    expect(res).not.toBeNull();
    expect(res?.data.success).toBe(true);
    expect(res?.data.data.user.full_name).toBe("Sam Taylor");
    expect(res?.data.data.user.email).toBe("accounts.coastalspark@example.com");
    expect(res?.data.data.user.mobile_number).toBe("0491570006");
  });

  it("serves tax, branding, country, and subscription settings", () => {
    const taxRes = handleMockRequest("GET", "/v2/settings/tax-settings");
    expect(taxRes?.data.data.tax_settings.tax_percentage).toBe("10");

    const brandingRes = handleMockRequest("GET", "/v2/settings/get-branding");
    expect(brandingRes?.data.data.website).toBe("https://coastalspark.example.com");

    const countriesRes = handleMockRequest("GET", "/countries");
    expect(countriesRes?.data.data.length).toBeGreaterThan(0);

    const subRes = handleMockRequest("GET", "/subscription/plans");
    expect(subRes?.data.data.packages.length).toBeGreaterThan(0);
  });

  it("serves clients and suppliers list", () => {
    const clientsRes = handleMockRequest("GET", "/client/v2", { type: "1" });
    expect(clientsRes).not.toBeNull();
    expect(clientsRes?.data.success).toBe(true);
    expect(clientsRes?.data.data.length).toBeGreaterThanOrEqual(16);
    expect(clientsRes?.data.data[0].type).toBe("Client");

    const suppliersRes = handleMockRequest("GET", "/client/v2", { type: "2" });
    expect(suppliersRes).not.toBeNull();
    expect(suppliersRes?.data.success).toBe(true);
    expect(suppliersRes?.data.data.length).toBeGreaterThanOrEqual(8);
    expect(suppliersRes?.data.data[0].type).toBe("Supplier");
  });

  it("serves invoices and status counts", () => {
    const countsRes = handleMockRequest("GET", "/invoice/invoices/status-counts");
    expect(countsRes).not.toBeNull();
    expect(countsRes?.data.data.all).toBeGreaterThanOrEqual(40);

    const invoicesRes = handleMockRequest("GET", "/invoice/invoices");
    expect(invoicesRes).not.toBeNull();
    expect(invoicesRes?.data.data.invoice_details.length).toBeGreaterThan(0);
    expect(invoicesRes?.data.data.invoice_details[0].invoice_no).toMatch(/^INV-/);
  });

  it("serves quotes, expenses, projects, km tracker, assets, calendar", () => {
    const quotesRes = handleMockRequest("GET", "/quote/quotes");
    expect(quotesRes?.data.data.quote_details.length).toBeGreaterThanOrEqual(15);

    // Also test GET /quote directly
    const directQuotesRes = handleMockRequest("GET", "/quote");
    expect(directQuotesRes?.data.data.quote_details.length).toBeGreaterThanOrEqual(15);

    const expensesRes = handleMockRequest("GET", "/expense/list");
    expect(expensesRes?.data.data.total).toBeGreaterThanOrEqual(40);
    expect(expensesRes?.data.data.expense_details.length).toBe(25);

    // Test expense summary statistics
    const expenseStatsRes = handleMockRequest("GET", "/expense/statistics", { period: "month" });
    expect(expenseStatsRes?.data.success).toBe(true);
    expect(expenseStatsRes?.data.data.has_previous_data).toBe(true);
    expect(expenseStatsRes?.data.data.total_expenses.total_amount).toBeGreaterThan(0);
    expect(expenseStatsRes?.data.data.reconciled_expenses.total_amount).toBeGreaterThan(0);
    expect(expenseStatsRes?.data.data.pending_expenses.total_amount).toBeGreaterThan(0);

    const projectsRes = handleMockRequest("GET", "/project");
    expect(projectsRes?.data.data.length).toBe(4);

    const kmRes = handleMockRequest("GET", "/km-tracker");
    expect(kmRes?.data.data.length).toBeGreaterThanOrEqual(20);

    const assetsRes = handleMockRequest("GET", "/assets");
    expect(assetsRes?.data.data.asset_details.length).toBe(4);

    const calRes = handleMockRequest("GET", "/calendar");
    expect(calRes?.data.data.length).toBeGreaterThanOrEqual(3);
  });

  it("serves bank accounts and transactions data for Coastal Spark Electrical", () => {
    const bankRes = handleMockRequest("GET", "/bank/accounts");
    expect(bankRes?.data.success).toBe(true);
    expect(bankRes?.data.data.success).toBe(true);
    expect(bankRes?.data.data.accounts.length).toBeGreaterThanOrEqual(1);
    expect(bankRes?.data.data.accounts[0].bank_name).toBe("Coastal Community Bank");
    expect(bankRes?.data.data.total_balance).toBe(42850.5);

    const balancesRes = handleMockRequest("GET", "/transaction/balance-unmatched-saved");
    expect(balancesRes?.data.success).toBe(true);
    expect(balancesRes?.data.data.balances.total_unmatched).toBe(3840);
    expect(balancesRes?.data.data.balances.total_saved).toBe(68500);

    const unmatchedRes = handleMockRequest("GET", "/v2/bank/bank-transactions");
    expect(unmatchedRes?.data.success).toBe(true);
    expect(unmatchedRes?.data.data.bank_transactions.bank_transaction_details.length).toBeGreaterThan(0);

    const matchedRes = handleMockRequest("GET", "/v2/bank/sole-saved-transactions");
    expect(matchedRes?.data.success).toBe(true);
    expect(matchedRes?.data.sole_transaction_details.length).toBeGreaterThan(0);
  });

  it("serves matching rules and rule detail over POST", () => {
    const rulesRes = handleMockRequest("GET", "/v2/matching-rules");
    expect(rulesRes?.data.success).toBe(true);
    expect(rulesRes?.data.data.rules.length).toBe(4);
    expect(rulesRes?.data.data.rules[0].name).toBe("Middy's Electrical Supplies");

    const ruleDetailRes = handleMockRequest("POST", "/v2/matching-rules/get", {}, { id: "1" });
    expect(ruleDetailRes?.data.success).toBe(true);
    expect(ruleDetailRes?.data.data.rule.name).toBe("Middy's Electrical Supplies");
    expect(ruleDetailRes?.data.data.rule.condition_type).toBe("DESCRIPTION");
    expect(ruleDetailRes?.data.data.rule.condition).toBe("CONTAIN");

    const syncStatsRes = handleMockRequest("GET", "/v2/transactions-auto-match-count");
    expect(syncStatsRes?.data.success).toBe(true);
    expect(syncStatsRes?.data.data.total).toBe(24);
    expect(syncStatsRes?.data.data.matched_details.length).toBeGreaterThan(0);
  });

  it("serves bills, bill schedules, and summary figures", () => {
    const billsRes = handleMockRequest("GET", "/v2/bill");
    expect(billsRes?.data.success).toBe(true);
    expect(billsRes?.data.data.bills.length).toBeGreaterThanOrEqual(6);

    const summaryRes = handleMockRequest("GET", "/v2/bill/summary");
    expect(summaryRes?.data.success).toBe(true);
    expect(summaryRes?.data.data.owed.amount).toBeGreaterThan(0);
    expect(summaryRes?.data.data.overdue.amount).toBeGreaterThan(0);

    const upcomingRes = handleMockRequest("GET", "/v2/bill/upcoming");
    expect(upcomingRes?.data.success).toBe(true);
    expect(upcomingRes?.data.data.bills.length).toBeGreaterThan(0);
    expect(upcomingRes?.data.data.expected.length).toBeGreaterThan(0);
  });

  it("serves proposals, proposal templates, and credit notes", () => {
    const propRes = handleMockRequest("GET", "/proposal");
    expect(propRes?.data.success).toBe(true);
    expect(propRes?.data.data.rows.length).toBeGreaterThanOrEqual(2);

    const tmplRes = handleMockRequest("GET", "/proposal/templates", { template_type: "PROPOSAL" });
    expect(tmplRes?.data.success).toBe(true);
    expect(tmplRes?.data.data.length).toBe(3);

    const cnRes = handleMockRequest("GET", "/credit-note");
    expect(cnRes?.data.success).toBe(true);
    expect(cnRes?.data.data.credit_notes.length).toBeGreaterThanOrEqual(2);
  });

  it("serves unibox cards and merchant account statuses", () => {
    const uniboxInvoices = handleMockRequest("GET", "/unibox/invoices");
    expect(uniboxInvoices?.data.success).toBe(true);
    expect(uniboxInvoices?.data.data.length).toBeGreaterThan(0);

    const worldpayRes = handleMockRequest("GET", "/v1/worldpay/account/status");
    expect(worldpayRes?.data.success).toBe(true);
    expect(worldpayRes?.data.data.account_status).toBe("active");

    const nexxtapRes = handleMockRequest("GET", "/v2/nexxtap/account/status");
    expect(nexxtapRes?.data.success).toBe(true);
    expect(nexxtapRes?.data.data.using_nexxtap).toBe(true);

    const checkNoRes = handleMockRequest("GET", "/invoice/invoice-no/check");
    expect(checkNoRes?.data.is_unique).toBe(true);
  });

  it("serves super contributions and super matrix without undefined errors", () => {
    const matrixRes = handleMockRequest("GET", "/v2/super-contribution/matrix");
    expect(matrixRes?.data.success).toBe(true);
    expect(matrixRes?.data.data.has_previous_data).toBe(true);
    expect(Array.isArray(matrixRes?.data.data.cards_data)).toBe(true);
    expect(matrixRes?.data.data.cards_data.length).toBe(3);

    const contribRes = handleMockRequest("GET", "/v2/super-contribution");
    expect(contribRes?.data.success).toBe(true);
    expect(contribRes?.data.data.length).toBe(4);

    const fundsRes = handleMockRequest("GET", "/fund");
    expect(fundsRes?.data.success).toBe(true);
    expect(fundsRes?.data.data.length).toBeGreaterThanOrEqual(5);
  });

  it("serves custom products and tracked inventory items", () => {
    const productsRes = handleMockRequest("GET", "/custom-product");
    expect(productsRes?.data.success).toBe(true);
    const trackedItems = productsRes?.data.data.filter((p: any) => p.inventory_flag === 1);
    expect(trackedItems.length).toBe(8);

    const statsRes = handleMockRequest("GET", "/custom-product/stats");
    expect(statsRes?.data.success).toBe(true);
    expect(statsRes?.data.data.total_items).toBe(8);
    expect(statsRes?.data.data.total_value).toBeGreaterThan(0);

    const categoriesRes = handleMockRequest("GET", "/account-categories/list");
    expect(categoriesRes?.data.success).toBe(true);
    const assets = categoriesRes?.data.data.account_categories.find((c: any) => c.name === "Assets");
    expect(assets.account_subcategories.some((s: any) => s.name === "Inventory")).toBe(true);
  });

  it("serves payroll employees and payruns", () => {
    const employeesRes = handleMockRequest("GET", "/employees");
    expect(employeesRes?.data.success).toBe(true);
    expect(employeesRes?.data.data.length).toBe(2);

    const payrunsRes = handleMockRequest("GET", "/payruns");
    expect(payrunsRes?.data.success).toBe(true);
    expect(payrunsRes?.data.data.length).toBe(3);
  });

  it("serves client refunds and vendor refunds with full details", () => {
    const clientRes = handleMockRequest("GET", "/credit-note", { type: "client" });
    expect(clientRes?.data.success).toBe(true);
    expect(Array.isArray(clientRes?.data.data)).toBe(true);
    expect(clientRes?.data.data.length).toBe(3);
    expect(clientRes?.data.data[0].credit_note_no).toBe("CRN-0001");
    expect(clientRes?.data.data[0].has_complete_bank_info).toBe(true);

    const vendorRes = handleMockRequest("GET", "/credit-note", { type: "vendor" });
    expect(vendorRes?.data.success).toBe(true);
    expect(Array.isArray(vendorRes?.data.data)).toBe(true);
    expect(vendorRes?.data.data.length).toBe(3);
    expect(vendorRes?.data.data[0].credit_note_no).toBe("VCR-2001");

    const singleRes = handleMockRequest("GET", "/credit-note/1");
    expect(singleRes?.data.success).toBe(true);
    expect(singleRes?.data.data.credit_note_no).toBe("CRN-0001");

    const genRes = handleMockRequest("POST", "/credit-note/generate");
    expect(genRes?.data.success).toBe(true);
    expect(genRes?.data.data).toBe("CRN-0004");
  });

  it("serves time tracking entries, logs, stats, and weekly breakdown", () => {
    const logsRes = handleMockRequest("GET", "/tasks/time-logs");
    expect(logsRes?.data.success).toBe(true);
    expect(logsRes?.data.data.length).toBeGreaterThanOrEqual(3);

    const statsRes = handleMockRequest("GET", "/time-tracking/stats/time-based");
    expect(statsRes?.data.success).toBe(true);
    expect(statsRes?.data.data.summary.total_hours).toBe(42.5);

    const weeklyRes = handleMockRequest("GET", "/time-tracking/weekly");
    expect(weeklyRes?.data.success).toBe(true);
    expect(weeklyRes?.data.data.logs.length).toBeGreaterThan(0);

    const activeRes = handleMockRequest("GET", "/time-tracking/active");
    expect(activeRes?.data.success).toBe(true);
    expect(activeRes?.data.data).toBeNull();

    const startTimerRes = handleMockRequest("POST", "/time-tracking/start");
    expect(startTimerRes?.data.success).toBe(true);
    expect(startTimerRes?.data.data.status).toBe("running");
  });

  it("serves calendar events, list, search, and stages", () => {
    const listRes = handleMockRequest("GET", "/calendar/list");
    expect(listRes?.data.success).toBe(true);
    expect(listRes?.data.data.length).toBe(1);
    expect(listRes?.data.data[0].email).toBe("sam@coastalspark.com.au");

    const searchRes = handleMockRequest("GET", "/calendar/search", { search: "Switchboard" });
    expect(searchRes?.data.success).toBe(true);
    expect(searchRes?.data.data.length).toBeGreaterThanOrEqual(1);

    const detailRes = handleMockRequest("GET", "/calendar/cal-1");
    expect(detailRes?.data.success).toBe(true);
    expect(detailRes?.data.data.title).toContain("Switchboard");

    const stagesRes = handleMockRequest("GET", "/stage");
    expect(stagesRes?.data.success).toBe(true);
    expect(stagesRes?.data.data.length).toBeGreaterThanOrEqual(4);
  });

  it("serves planner kanban, task list, goals, budgets, and cash wallet", () => {
    const kanbanRes = handleMockRequest("GET", "/planner");
    expect(kanbanRes?.data.success).toBe(true);
    expect(kanbanRes?.data.data.length).toBe(4);
    expect(kanbanRes?.data.data[0].tasks.length).toBeGreaterThan(0);

    const tasksRes = handleMockRequest("GET", "/planner/tasks");
    expect(tasksRes?.data.success).toBe(true);
    expect(tasksRes?.data.data.rows.length).toBe(5);

    const goalsRes = handleMockRequest("GET", "/v2/planner/goals");
    expect(goalsRes?.data.success).toBe(true);
    expect(goalsRes?.data.data.length).toBeGreaterThanOrEqual(2);

    const budgetsRes = handleMockRequest("GET", "/v2/budget");
    expect(budgetsRes?.data.success).toBe(true);
    expect(budgetsRes?.data.data.length).toBeGreaterThanOrEqual(3);

    const plansRes = handleMockRequest("GET", "/v2/expense-plans");
    expect(plansRes?.data.success).toBe(true);
    expect(plansRes?.data.data.length).toBeGreaterThanOrEqual(2);

    const walletRes = handleMockRequest("GET", "/v2/cash-wallet");
    expect(walletRes?.data.success).toBe(true);
    expect(walletRes?.data.data.balance).toBe(1450);

    const overviewRes = handleMockRequest("GET", "/v2/planner/overview");
    expect(overviewRes?.data.success).toBe(true);
    expect(overviewRes?.data.data.cash_on_hand).toBeGreaterThan(0);
  });

  it("serves investment property portfolio and individual property details", () => {
    const listRes = handleMockRequest("GET", "/investment-property");
    expect(listRes?.data.success).toBe(true);
    expect(listRes?.data.data.length).toBe(2);

    const portfolioRes = handleMockRequest("GET", "/investment-property/portfolio/summary");
    expect(portfolioRes?.data.success).toBe(true);
    expect(portfolioRes?.data.data.total_properties).toBe(2);
    expect(portfolioRes?.data.data.total_current_value).toBe("1590000.00");

    const expenseRes = handleMockRequest("GET", "/investment-property/dashboard/expense-breakdown");
    expect(expenseRes?.data.success).toBe(true);
    expect(expenseRes?.data.data.breakdown.length).toBeGreaterThan(0);

    const singleRes = handleMockRequest("GET", "/investment-property/1");
    expect(singleRes?.data.success).toBe(true);
    expect(singleRes?.data.data.property_name).toContain("Sunshine Parade");

    const loanRes = handleMockRequest("GET", "/investment-property/loan/1");
    expect(loanRes?.data.success).toBe(true);
    expect(loanRes?.data.data.loan.lender_name).toBe("Macquarie Bank");

    const cgtRes = handleMockRequest("GET", "/investment-property/cgt-breakdown/1");
    expect(cgtRes?.data.success).toBe(true);
    expect(Number(cgtRes?.data.data.discounted_capital_gain)).toBeGreaterThan(0);
  });

  it("serves all reports across reporting suite without write-blocker error", () => {
    // 1: Profit & Loss
    const pnlRes = handleMockRequest("POST", "/report", {}, { report_type_id: "1" });
    expect(pnlRes?.data.success).toBe(true);
    expect(pnlRes?.data.sections.length).toBeGreaterThan(0);

    // 2: Balance Sheet
    const bsRes = handleMockRequest("POST", "/report", {}, { report_type_id: "2" });
    expect(bsRes?.data.success).toBe(true);
    expect(bsRes?.data.sections.length).toBeGreaterThan(0);

    // 3: Asset Listing
    const alRes = handleMockRequest("POST", "/report", {}, { report_type_id: "3" });
    expect(alRes?.data.success).toBe(true);
    expect(alRes?.data.data.length).toBe(5);

    // 4: Transaction Listing
    const tlRes = handleMockRequest("POST", "/report", {}, { report_type_id: "4" });
    expect(tlRes?.data.success).toBe(true);
    expect(tlRes?.data.data.length).toBe(6);

    // 8: Trial Balance
    const tbRes = handleMockRequest("POST", "/report", {}, { report_type_id: "8" });
    expect(tbRes?.data.success).toBe(true);
    expect(tbRes?.data.sections.length).toBeGreaterThan(0);

    // 9: Customer / Supplier
    const csRes = handleMockRequest("POST", "/report", {}, { report_type_id: "9" });
    expect(csRes?.data.success).toBe(true);
    expect(csRes?.data.data.length).toBeGreaterThan(0);

    // 10: Chart of Accounts
    const coaRes = handleMockRequest("POST", "/report", {}, { report_type_id: "10" });
    expect(coaRes?.data.success).toBe(true);
    expect(coaRes?.data.data.length).toBeGreaterThan(0);

    // 11: Cash Flow
    const cfRes = handleMockRequest("POST", "/report", {}, { report_type_id: "11" });
    expect(cfRes?.data.success).toBe(true);
    expect(cfRes?.data.data.length).toBeGreaterThan(0);

    // BAS (gst-extract)
    const basRes = handleMockRequest("POST", "/report/gst-extract");
    expect(basRes?.data.success).toBe(true);
    expect(basRes?.data.Quarter).toBe("Quarter 1");
    expect(basRes?.data.tax_return.sections.length).toBe(2);
    expect(basRes?.data.tax_return.sections[0].rows[0].amount).toBeGreaterThan(0);

    // Audit logs
    const auditRes = handleMockRequest("POST", "/v2/settings/audit-logs");
    expect(auditRes?.data.success).toBe(true);
    expect(auditRes?.data.data.details.length).toBeGreaterThan(0);
  });

  it("blocks any write operation in read-only demo mode", () => {
    const createInvoice = handleMockRequest("POST", "/invoice/add", {}, { total: 100 });
    expect(createInvoice?.data.success).toBe(false);
    expect(createInvoice?.data.message).toContain("Demo mode is read-only");

    const editExpense = handleMockRequest("PUT", "/expense/edit", {}, { price: 50 });
    expect(editExpense?.data.success).toBe(false);
    expect(editExpense?.data.message).toContain("Demo mode is read-only");

    const deleteContact = handleMockRequest("DELETE", "/client/101");
    expect(deleteContact?.data.success).toBe(false);
    expect(deleteContact?.data.message).toContain("Demo mode is read-only");
  });
});
