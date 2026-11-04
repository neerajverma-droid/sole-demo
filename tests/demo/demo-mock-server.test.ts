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
    expect(calRes?.data.data.length).toBe(3);
  });

  it("serves bank accounts and transactions data for Coastal Spark Electrical", () => {
    const bankRes = handleMockRequest("GET", "/bank/accounts");
    expect(bankRes?.data.success).toBe(true);
    expect(bankRes?.data.data.success).toBe(true);
    expect(bankRes?.data.data.accounts.length).toBe(1);
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
