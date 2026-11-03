import { describe, expect, it, vi, beforeEach } from "vitest";

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

// Imported after the mock so `lib/reports.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const { fetchPlReport, plSplit, plDelta, PL_REPORT_TYPE_ID } = await import(
  "@/lib/reports"
);

beforeEach(() => {
  vi.clearAllMocks();
});

/** Every field a `POST /report` call sent, from the `FormData` body it was given. */
function sentFields(body: unknown): Record<string, string> {
  if (!(body instanceof FormData)) {
    throw new Error("Body was not FormData");
  }
  const fields: Record<string, string> = {};
  body.forEach((value, key) => {
    fields[key] = String(value);
  });
  return fields;
}

/** A `sole-ocr` `handleReports` response for `report_type_id === 1`, one month wide. */
function backendPlResponse(overrides: {
  monthLabel: string;
  income?: string;
  cogs?: string;
  expenses?: string;
  depreciation?: string;
  interest?: string;
  incomeTax?: string;
}) {
  const {
    monthLabel,
    income = "$10000.00",
    cogs = "$2000.00",
    expenses = "$3000.00",
    depreciation = "$500.00",
    interest = "$100.00",
    incomeTax = "$1000.00",
  } = overrides;

  const grossProfit = (Number(income.slice(1)) - Number(cogs.slice(1))).toFixed(2);
  const ebitda = (Number(grossProfit) - Number(expenses.slice(1))).toFixed(2);
  const profitBeforeTax = (
    Number(ebitda) -
    Number(depreciation.slice(1)) -
    Number(interest.slice(1))
  ).toFixed(2);
  const netProfit = (Number(profitBeforeTax) - Number(incomeTax.slice(1))).toFixed(2);

  const row = (accountName: string, value: string) => ({
    "Account Name": accountName,
    [monthLabel]: value,
    "YTD Amount": value,
  });

  return {
    success: true,
    message: "Report generated successfully",
    columns: ["Account Name", monthLabel, "YTD Amount"],
    sections: [
      { section: "Income", rows: [row("Consulting fees", income)], total: row("Total Income", income) },
      {
        section: "Cost of Sales",
        rows: [row("Subcontractors", cogs)],
        total: row("Total Cost of Sales", cogs),
      },
      {
        section: "Gross Profit",
        rows: [],
        total: row("Gross Profit", `$${grossProfit}`),
      },
      {
        section: "Expenses",
        rows: [row("Rent", expenses)],
        total: row("Total Operating Expenses", expenses),
      },
      {
        section: "EBITDA",
        rows: [],
        total: row(
          "Earnings before interest, tax and depreciation (EBITDA)",
          `$${ebitda}`,
        ),
      },
      {
        section: " ",
        rows: [
          row("Depreciation Expense", depreciation),
          row("Interest Expense", interest),
          row("Profit Before Tax", `$${profitBeforeTax}`),
          row("Income Tax Expense", incomeTax),
        ],
        total: null,
      },
      {
        section: "Net Profit",
        rows: [],
        total: row("Net Profit", `$${netProfit}`),
      },
    ],
  };
}

describe("fetchPlReport", () => {
  it("sends report_type_id, action and the exact custom range as multipart FormData, once for the current span and once for the previous one", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: backendPlResponse({ monthLabel: "Jan2026" }) })
      .mockResolvedValueOnce({ data: backendPlResponse({ monthLabel: "Dec2025" }) });

    await fetchPlReport("Custom range", { from: "2026-01-01", to: "2026-01-31" });

    expect(apiMock.post).toHaveBeenCalledTimes(2);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.reporting.reports);

    const current = sentFields(apiMock.post.mock.calls[0][1]);
    expect(current).toEqual({
      report_type_id: PL_REPORT_TYPE_ID,
      action: "view",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });

    // The previous span is the same number of days immediately before it.
    const previous = sentFields(apiMock.post.mock.calls[1][1]);
    expect(previous.start_date).toBe("2025-12-01");
    expect(previous.end_date).toBe("2025-12-31");
  });

  it("parses the $-formatted figures into the report's ladder, and reads the previous column from the second call", async () => {
    apiMock.post
      .mockResolvedValueOnce({
        data: backendPlResponse({ monthLabel: "Jan2026", income: "$10000.00" }),
      })
      .mockResolvedValueOnce({
        data: backendPlResponse({ monthLabel: "Dec2025", income: "$8000.00" }),
      });

    const report = await fetchPlReport("Custom range", {
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(report.headline.income).toEqual({ amount: 10000, previous: 8000 });
    expect(report.headline.netProfit.amount).toBeCloseTo(3400, 5);
    // income − net profit, not a re-derivation of every cost line.
    expect(report.headline.expenses.amount).toBeCloseTo(
      report.headline.income.amount - report.headline.netProfit.amount,
      5,
    );

    const incomeBlock = report.blocks.find((block) => block.id === "income");
    expect(incomeBlock?.rows).toEqual([
      { id: "income-Consulting fees", label: "Consulting fees", values: [10000, 10000, 8000] },
    ]);

    // The single-account LIDT rows split into their own blocks, no summary.
    const depreciation = report.blocks.find((block) => block.id === "depreciation");
    expect(depreciation?.summary).toBeNull();
    expect(depreciation?.rows[0].label).toBe("Depreciation expense");

    const netProfitBlock = report.blocks.find((block) => block.id === "net-profit");
    expect(netProfitBlock?.isResult).toBe(true);

    // Profit before tax is a *result* (a derived figure, not an account) —
    // same shape as Gross Profit/EBITDA/Net Profit. `ProfitLossTable` merges
    // the Section and Account name cells for an `isResult` block on the
    // assumption its `rows` are empty; a populated row on an `isResult` block
    // doubles up that cell and shifts every later column by one, which is
    // exactly the bug a change here should be caught reintroducing.
    const beforeTax = report.blocks.find((block) => block.id === "before-tax");
    expect(beforeTax?.isResult).toBe(true);
    expect(beforeTax?.rows).toEqual([]);
    expect(beforeTax?.summary?.values).toEqual([4400, 4400, 2400]);
  });

  it("keeps every result block's rows empty — `ProfitLossTable` merges a result's Section and Account name cells on that assumption", async () => {
    apiMock.post.mockResolvedValue({
      data: backendPlResponse({ monthLabel: "Jan2026" }),
    });

    const report = await fetchPlReport("Custom range", {
      from: "2026-01-01",
      to: "2026-01-31",
    });

    report.blocks.forEach((block) => {
      if (block.isResult) {
        expect(block.rows).toEqual([]);
        expect(block.summary).not.toBeNull();
      }
    });
  });

  it("throws with the backend's own message when the call reports failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "No data available" },
    });

    await expect(
      fetchPlReport("Custom range", { from: "2026-01-01", to: "2026-01-31" }),
    ).rejects.toThrow("No data available");
  });

  it("doesn't throw on a genuinely empty report, and reports every headline figure as zero", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, message: "No data available", columns: [], sections: [] },
    });

    const report = await fetchPlReport("Custom range", {
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(report.headline).toEqual({
      netProfit: { amount: 0, previous: 0 },
      income: { amount: 0, previous: 0 },
      expenses: { amount: 0, previous: 0 },
      grossProfit: { amount: 0, previous: 0 },
    });
    expect(report.blocks).toHaveLength(10);
  });
});

describe("plSplit", () => {
  it("scales expense and profit shares against income, without a segment exceeding it", () => {
    const report = {
      headline: {
        income: { amount: 10000, previous: 0 },
        expenses: { amount: 6000, previous: 0 },
        netProfit: { amount: 4000, previous: 0 },
        grossProfit: { amount: 8000, previous: 0 },
      },
    } as Parameters<typeof plSplit>[0];

    const split = plSplit(report);
    expect(split.expensePercent).toBeCloseTo(60, 5);
    expect(split.profitPercent).toBeCloseTo(40, 5);
    expect(split.loss).toBe(false);
  });

  it("spends the whole bar on expenses for a loss, with no profit segment", () => {
    const report = {
      headline: {
        income: { amount: 5000, previous: 0 },
        expenses: { amount: 7000, previous: 0 },
        netProfit: { amount: -2000, previous: 0 },
        grossProfit: { amount: 1000, previous: 0 },
      },
    } as Parameters<typeof plSplit>[0];

    const split = plSplit(report);
    expect(split.profitPercent).toBe(0);
    expect(split.loss).toBe(true);
  });
});

describe("plDelta", () => {
  it("reads as favourable when net profit is up-good and it rose", () => {
    const delta = plDelta({ amount: 1200, previous: 1000 }, "last month");
    expect(delta.favourable).toBe(true);
    expect(delta.label).toContain("last month");
  });
});
