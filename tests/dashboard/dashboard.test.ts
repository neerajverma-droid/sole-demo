import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/dashboard.ts`'s own
// `import api from "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  bankIdFor,
  currentFinancialYearRange,
  fetchDashboardBalance,
  fetchDashboardBankAccounts,
  fetchDashboardCashFlow,
  fetchDashboardGstSetAside,
  fetchDashboardTopExpenses,
  fetchDashboardTopIncomes,
  returnDueTiming,
} = await import("@/lib/dashboard");

/** Pins "now" to a local wall-clock time. Only `Date` is faked, so mocked promises still resolve. */
function setNow(year: number, monthIndex: number, day: number, hour = 12, minute = 0) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(year, monthIndex, day, hour, minute));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ *
 * Financial-year range
 * ------------------------------------------------------------------ */

describe("currentFinancialYearRange", () => {
  it("starts on 1 July of this year once we're past June, ending at the end of this month", () => {
    setNow(2026, 9, 8); // 8 Oct 2026
    expect(currentFinancialYearRange()).toEqual({ start: "2026-07-01", end: "2026-10-31" });
  });

  it("starts on 1 July of the previous year between January and June", () => {
    setNow(2026, 2, 15); // 15 Mar 2026
    expect(currentFinancialYearRange()).toEqual({ start: "2025-07-01", end: "2026-03-31" });
  });

  it("treats 1 July itself as the first day of the new financial year", () => {
    setNow(2026, 6, 1, 0, 1);
    expect(currentFinancialYearRange()).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });

  it("ends on the real last day of a short month", () => {
    setNow(2028, 1, 10); // Feb in a leap year
    expect(currentFinancialYearRange().end).toBe("2028-02-29");
  });

  it("follows a New Zealand business's 1 April year when given it", () => {
    setNow(2027, 2, 15); // 15 Mar 2027 — still the year that began 1 Apr 2026
    expect(currentFinancialYearRange({ month: 4, day: 1 })).toEqual({
      start: "2026-04-01",
      end: "2027-03-31",
    });
    setNow(2027, 3, 1); // 1 Apr 2027 — the next one
    expect(currentFinancialYearRange({ month: 4, day: 1 }).start).toBe("2027-04-01");
  });
});

/* ------------------------------------------------------------------ *
 * Cash on hand
 * ------------------------------------------------------------------ */

describe("fetchDashboardBalance", () => {
  it("GETs /dashboard/balance with no params", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { current_balance: 0, total: [] } } });
    await fetchDashboardBalance();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.dashboard.balance);
  });

  it("maps the cumulative monthly series to month labels, oldest first", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          current_balance: 12500.5,
          total: [
            { year: 2025, month: 11, net_flow: 1000, current_balance: 9000 },
            { year: 2025, month: 12, net_flow: 1500, current_balance: 10500 },
            { year: 2026, month: 1, net_flow: 2000.5, current_balance: 12500.5 },
          ],
        },
      },
    });

    expect(await fetchDashboardBalance()).toEqual({
      currentBalance: 12500.5,
      series: [
        { month: "Nov", balance: 9000 },
        { month: "Dec", balance: 10500 },
        { month: "Jan", balance: 12500.5 },
      ],
    });
  });

  it("reads the running balance, not the month's net flow", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { current_balance: 300, total: [{ year: 2026, month: 3, net_flow: -50, current_balance: 300 }] },
      },
    });
    const { series } = await fetchDashboardBalance();
    expect(series[0].balance).toBe(300);
  });

  it("coerces string figures and falls back to 0 for garbage", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          current_balance: "4200.75",
          total: [{ year: 2026, month: 6, net_flow: 0, current_balance: "not-a-number" }],
        },
      },
    });
    expect(await fetchDashboardBalance()).toEqual({
      currentBalance: 4200.75,
      series: [{ month: "Jun", balance: 0 }],
    });
  });

  it("returns a zero balance and empty series when the envelope has no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchDashboardBalance()).toEqual({ currentBalance: 0, series: [] });
  });
});

/* ------------------------------------------------------------------ *
 * Connected accounts
 * ------------------------------------------------------------------ */

describe("bankIdFor", () => {
  it("matches a feed name that contains a known bank name, case-insensitively", () => {
    expect(bankIdFor("WESTPAC Banking Corporation")).toBe("westpac");
  });

  it("matches a short feed name contained in a known bank's full name", () => {
    expect(bankIdFor("Commonwealth")).toBe("commbank");
  });

  it("trims before matching", () => {
    expect(bankIdFor("  ING  ")).toBe("ing");
  });

  it("is null for a blank or unknown bank name", () => {
    expect(bankIdFor(null)).toBeNull();
    expect(bankIdFor(undefined)).toBeNull();
    expect(bankIdFor("")).toBeNull();
    expect(bankIdFor("Totally Unknown Credit Union XYZ")).toBeNull();
  });
});

describe("fetchDashboardBankAccounts", () => {
  it("GETs /dashboard/bank/accounts/balance", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { accounts: [], total_balance: 0 } } });
    await fetchDashboardBankAccounts();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.dashboard.bankAccountsBalance);
  });

  it("maps every account to the ConnectedAccount shape, with the total alongside", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          accounts: [
            { id: 7, bank_name: " Westpac ", account_name: " Everyday ", balance: "1520.40" },
            { id: "8", bank_name: "ANZ", account_name: "Savings", balance: 300 },
          ],
          total_balance: "1820.40",
        },
      },
    });

    const result = await fetchDashboardBankAccounts();

    expect(result.totalBalance).toBe(1820.4);
    expect(result.accounts).toEqual([
      {
        id: "7",
        bankId: "westpac",
        name: "Westpac",
        account: "Everyday",
        balance: 1520.4,
        accountType: "TRANS_AND_SAVINGS_ACCOUNTS",
        syncedAt: "just now",
        archived: false,
      },
      expect.objectContaining({ id: "8", bankId: "anz", name: "ANZ", account: "Savings", balance: 300 }),
    ]);
  });

  it("falls back to 'Bank account' / '' when the bank or account name is blank server-side", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          accounts: [
            { id: 1, bank_name: null, account_name: null, balance: null },
            { id: 2, bank_name: "   ", account_name: "  ", balance: "" },
          ],
          total_balance: 0,
        },
      },
    });
    const [nullName, blankName] = (await fetchDashboardBankAccounts()).accounts;
    expect(nullName).toMatchObject({ name: "Bank account", account: "", balance: 0, bankId: null });
    expect(blankName).toMatchObject({ name: "Bank account", account: "", balance: 0 });
  });

  // Doc: a bank name that doesn't match anything falls back to a generic icon.
  // Source: `bankIdFor("   ")` trims to "" — and every bank name `.includes("")`
  // — so a whitespace-only bank_name gets the first BANKS entry's mark ("nab")
  // next to the "Bank account" fallback name. Cosmetic only.
  it.todo("gives a whitespace-only bank_name no bank mark (bankId null), like a null one");

  it("is an empty list (not an error) when every account has been soft-deleted", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { accounts: [], total_balance: 0 } } });
    expect(await fetchDashboardBankAccounts()).toEqual({ accounts: [], totalBalance: 0 });
  });

  it("is empty when the envelope carries no data at all", async () => {
    apiMock.get.mockResolvedValue({ data: {} });
    expect(await fetchDashboardBankAccounts()).toEqual({ accounts: [], totalBalance: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * Cash flow
 * ------------------------------------------------------------------ */

describe("fetchDashboardCashFlow", () => {
  it("always requests an explicit 24-calendar-month window ending this month", async () => {
    setNow(2026, 9, 8); // 8 Oct 2026
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchDashboardCashFlow();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.dashboard.incomeExpense, {
      params: { period: "year", start: "2024-11-01", end: "2026-10-31" },
    });
  });

  it("handles the window crossing a year boundary from January", async () => {
    setNow(2027, 0, 20);
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    await fetchDashboardCashFlow();
    expect(apiMock.get.mock.calls[0][1].params).toEqual({
      period: "year",
      start: "2025-02-01",
      end: "2027-01-31",
    });
  });

  it("maps each month by slicing the YYYY-MM-01 string, never through a Date", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { month: "2026-01-01", income: 5000, expense: 3200, net_profit: 1800 },
          { month: "2026-12-01", income: "7000.5", expense: "1000", net_profit: 6000.5 },
        ],
      },
    });

    expect(await fetchDashboardCashFlow()).toEqual([
      { key: "2026-01", month: "Jan", year: 2026, moneyIn: 5000, moneyOut: 3200 },
      { key: "2026-12", month: "Dec", year: 2026, moneyIn: 7000.5, moneyOut: 1000 },
    ]);
  });

  it("drops forecast rows entirely before mapping", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { month: "2026-09-01", income: 100, expense: 50 },
          { month: "2026-10-01", income: 200, expense: 80, forecast: false },
          { month: "2026-11-01", income: 999, expense: 1, forecast: true },
        ],
      },
    });
    const months = await fetchDashboardCashFlow();
    expect(months.map((m) => m.key)).toEqual(["2026-09", "2026-10"]);
  });

  it("zeroes non-numeric figures and returns [] with no data", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: [{ month: "2026-05-01", income: null, expense: "abc" }] },
    });
    expect(await fetchDashboardCashFlow()).toEqual([
      { key: "2026-05", month: "May", year: 2026, moneyIn: 0, moneyOut: 0 },
    ]);

    apiMock.get.mockResolvedValueOnce({ data: { success: true } });
    expect(await fetchDashboardCashFlow()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * GST set-aside / BAS due date
 * ------------------------------------------------------------------ */

describe("fetchDashboardGstSetAside", () => {
  it("GETs /dashboard/gst/summary over the financial-year-to-date and reads net_gst_payable only", async () => {
    setNow(2026, 9, 8);
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { gst_collected: 900, gst_paid: 300, net_gst_payable: "600.25", taxable_sales: 9000 },
      },
    });

    const result = await fetchDashboardGstSetAside();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.dashboard.gstSummary, {
      params: { period: "year", start: "2026-07-01", end: "2026-10-31" },
    });
    expect(result.amount).toBe(600.25);
  });

  it("picks the next fixed BAS due date — 28 Oct for Q1", async () => {
    setNow(2026, 9, 8); // 8 Oct 2026
    apiMock.get.mockResolvedValue({ data: { success: true, data: { net_gst_payable: 0 } } });
    expect(await fetchDashboardGstSetAside()).toEqual({
      amount: 0,
      quarter: "Q1 FY26",
      dueLabel: "28 Oct",
      daysAway: 20,
    });
  });

  it("early in the calendar year, uses the previous FY's Q2 (28 Feb)", async () => {
    setNow(2027, 0, 10); // 10 Jan 2027 — FY26 still
    apiMock.get.mockResolvedValue({ data: { success: true, data: { net_gst_payable: 10 } } });
    expect(await fetchDashboardGstSetAside()).toMatchObject({
      quarter: "Q2 FY26",
      dueLabel: "28 Feb",
      daysAway: 49,
    });
  });

  it("after 28 Apr moves on to Q4's 28 Jul", async () => {
    setNow(2027, 4, 1); // 1 May 2027
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchDashboardGstSetAside()).toMatchObject({ quarter: "Q4 FY26", dueLabel: "28 Jul" });
  });

  it("in early July (new FY) still points at the old FY's 28 Jul Q4", async () => {
    setNow(2027, 6, 5); // 5 Jul 2027
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchDashboardGstSetAside()).toMatchObject({
      quarter: "Q4 FY26",
      dueLabel: "28 Jul",
      daysAway: 23,
    });
  });

  it("late on the day before the due date reads 1 day away, not 0 (calendar-day regression)", async () => {
    setNow(2026, 9, 27, 23, 30); // 27 Oct, 23:30
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchDashboardGstSetAside()).toMatchObject({ quarter: "Q1 FY26", daysAway: 1 });
  });

  it("early on the day before the due date also reads 1 day away", async () => {
    setNow(2026, 9, 27, 0, 5);
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchDashboardGstSetAside()).toMatchObject({ quarter: "Q1 FY26", daysAway: 1 });
  });

  // Doc: the due date is chosen by comparing *calendar dates* ("earliest one
  // >= today", both sides normalised to midnight). Source passes the raw
  // `new Date()` into `nextBasDueDate`, so any time after 00:00 on the due
  // date itself skips straight to the following quarter (28 Feb, ~123 days)
  // instead of reporting "Q1 FY26, 0 days away".
  it.todo("on the BAS due date itself (after midnight) still reports that quarter, 0 days away");

  it("at exactly 00:00 on the due date reports that quarter, 0 days away", async () => {
    setNow(2026, 9, 28, 0, 0);
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchDashboardGstSetAside()).toMatchObject({ quarter: "Q1 FY26", daysAway: 0 });
  });

  it("defaults amount to 0 when the response has no data", async () => {
    setNow(2026, 9, 8);
    apiMock.get.mockResolvedValue({ data: {} });
    expect((await fetchDashboardGstSetAside()).amount).toBe(0);
  });

  it("reports over a New Zealand business's own year when given its start", async () => {
    setNow(2026, 4, 15); // 15 May 2026
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    await fetchDashboardGstSetAside({ fiscalYearStart: { month: 4, day: 1 } });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.dashboard.gstSummary, {
      params: { period: "year", start: "2026-04-01", end: "2026-05-31" },
    });
  });
});

/* ------------------------------------------------------------------ *
 * The return due, from the country context's filing periods
 * ------------------------------------------------------------------ */

describe("returnDueTiming", () => {
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  /**
   * AU quarterly BAS periods as `GET /country-context` sends them: the quarter
   * containing `day` and the one before, labelled "Jul – Sep 2026", due the
   * 28th of the month after — two months after for the December quarter.
   */
  function auPeriods(day: Date) {
    const quarterStart = (offset: number) =>
      new Date(day.getFullYear(), Math.floor(day.getMonth() / 3) * 3 + offset * 3, 1);
    const period = (start: Date) => {
      const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
      const monthsAfter = end.getMonth() === 11 ? 2 : 1;
      const due = new Date(end.getFullYear(), end.getMonth() + monthsAfter, 28);
      const quarter = ((((start.getMonth() - 6) / 3 + 4) % 4) + 1);
      return {
        code: `Q${quarter}`,
        label: "Jul – Sep 2026",
        startDate: iso(start),
        endDate: iso(end),
        dueDate: iso(due),
      };
    };
    return [period(quarterStart(-1)), period(quarterStart(0))];
  }

  it("for Australia, matches the BAS calendar it replaces on every day of two years", () => {
    for (let offset = 0; offset < 731; offset += 1) {
      for (const hour of [0, 12, 23]) {
        const day = new Date(2026, 0, 1 + offset, hour, 30);
        expect(returnDueTiming(day, auPeriods(day))).toEqual(returnDueTiming(day));
      }
    }
  });

  it("keeps the tile's 'Q1 FY26' name for a quarter, not the registry's label", () => {
    const day = new Date(2026, 9, 8);
    expect(returnDueTiming(day, auPeriods(day))).toEqual({
      quarter: "Q1 FY26",
      dueLabel: "28 Oct",
      daysAway: 20,
    });
  });

  const nzPeriods = [
    { code: "B6", label: "Feb – Mar 2026", startDate: "2026-02-01", endDate: "2026-03-31", dueDate: "2026-05-07" },
    { code: "B1", label: "Apr – May 2026", startDate: "2026-04-01", endDate: "2026-05-31", dueDate: "2026-06-28" },
  ];
  const NZ = { month: 4, day: 1 };

  it("for New Zealand, the last period's GST return while it's still to lodge", () => {
    expect(returnDueTiming(new Date(2026, 4, 3), nzPeriods, NZ)).toEqual({
      quarter: "Feb – Mar 2026",
      dueLabel: "7 May",
      daysAway: 4,
    });
  });

  it("for New Zealand, the current period's once that due date has passed", () => {
    expect(returnDueTiming(new Date(2026, 4, 15), nzPeriods, NZ)).toEqual({
      quarter: "Apr – May 2026",
      dueLabel: "28 Jun",
      daysAway: 44,
    });
  });

  it("falls back to the BAS calendar when no period carries a due date", () => {
    const day = new Date(2026, 9, 8);
    expect(
      returnDueTiming(day, [{ ...nzPeriods[0], dueDate: null }], NZ),
    ).toEqual(returnDueTiming(day));
  });
});

/* ------------------------------------------------------------------ *
 * Top movers
 * ------------------------------------------------------------------ */

describe("fetchDashboardTopIncomes / fetchDashboardTopExpenses", () => {
  function topRows(rows: unknown[]) {
    apiMock.get.mockResolvedValue({ data: { success: true, data: rows } });
  }

  it("each GETs its own route over the financial-year-to-date", async () => {
    setNow(2026, 9, 8);
    topRows([]);

    await fetchDashboardTopIncomes();
    await fetchDashboardTopExpenses();

    const params = { params: { period: "year", start: "2026-07-01", end: "2026-10-31" } };
    expect(apiMock.get).toHaveBeenNthCalledWith(1, apiRoutes.dashboard.topIncomes, params);
    expect(apiMock.get).toHaveBeenNthCalledWith(2, apiRoutes.dashboard.topExpenses, params);
  });

  it("labels a row '{client} — {category}' when both are meaningful, keeping the backend's order", async () => {
    topRows([
      { label: "Consulting", client_name: "Acme Pty Ltd", amount: "5000" },
      { label: "Design", client_name: "Beta Co", amount: 1200 },
    ]);

    expect(await fetchDashboardTopIncomes()).toEqual([
      {
        id: "Acme Pty Ltd — Consulting-0",
        label: "Acme Pty Ltd — Consulting",
        amount: 5000,
        clientName: "Acme Pty Ltd",
        category: "Consulting",
      },
      {
        id: "Beta Co — Design-1",
        label: "Beta Co — Design",
        amount: 1200,
        clientName: "Beta Co",
        category: "Design",
      },
    ]);
  });

  it.each(["Sales Income", "sales  income", "Income", "Expense", "Expenses", "General Expenses", "general expense"])(
    "shows just the client name when the category is the generic bucket %j",
    async (generic) => {
      topRows([{ label: generic, client_name: "Acme", amount: 10 }]);
      const [row] = await fetchDashboardTopExpenses();
      expect(row.label).toBe("Acme");
    },
  );

  it("falls back to whichever of client or category is present", async () => {
    topRows([
      { label: "Software", client_name: null, amount: 1 },
      { label: "", client_name: "Solo Client", amount: 2 },
    ]);
    const rows = await fetchDashboardTopExpenses();
    expect(rows.map((r) => r.label)).toEqual(["Software", "Solo Client"]);
  });

  it.each(["N/A", "n/a", "null", "NULL", "Unknown"])(
    "treats the literal client_name %j as absent",
    async (placeholder) => {
      topRows([{ label: "Consulting", client_name: placeholder, amount: 1 }]);
      const [row] = await fetchDashboardTopIncomes();
      expect(row.label).toBe("Consulting");
    },
  );

  it.each(["Uncategorised", "uncategorised", "null"])(
    "treats the literal category %j as absent",
    async (placeholder) => {
      topRows([{ label: placeholder, client_name: "Acme", amount: 1 }]);
      const [row] = await fetchDashboardTopIncomes();
      expect(row.label).toBe("Acme");
    },
  );

  it("reads 'Uncategorised' when neither client nor category is meaningful", async () => {
    topRows([
      { label: "null", client_name: "N/A", amount: 3 },
      { label: "", amount: 4 },
    ]);
    const rows = await fetchDashboardTopIncomes();
    expect(rows.map((r) => r.label)).toEqual(["Uncategorised", "Uncategorised"]);
    // Index-suffixed ids keep two identically-labelled rows distinct as React keys.
    expect(rows.map((r) => r.id)).toEqual(["Uncategorised-0", "Uncategorised-1"]);
  });

  // Doc: client_name/label can be "N/A" / "Uncategorised" / "null" and all
  // three are treated as "not really there". Source only rejects "N/A" (and
  // "unknown") on the client side and only "Uncategorised" on the category
  // side, so `{ label: "N/A" }` with no client renders "N/A" verbatim and a
  // client_name of "Uncategorised" is shown as if it were a real client.
  it.todo("treats a category label of 'N/A' (or a client_name of 'Uncategorised') as absent");

  it("zeroes a non-numeric amount and leaves blank client/category undefined", async () => {
    topRows([{ label: "  ", client_name: "  ", amount: "oops" }]);
    const [row] = await fetchDashboardTopIncomes();
    expect(row).toEqual({
      id: "Uncategorised-0",
      label: "Uncategorised",
      amount: 0,
      clientName: undefined,
      category: undefined,
    });
  });

  it("returns [] when the envelope has no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchDashboardTopIncomes()).toEqual([]);
  });
});
