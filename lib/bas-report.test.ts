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

// Imported after the mock so `lib/bas-report.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  basDate,
  basTotals,
  fetchBasReport,
  filingPeriodChoices,
  periodNoun,
  usesFilingPeriods,
  parseBasAmount,
  parseBasDate,
  transactionLabelFor,
  resolveBasPeriod,
} = await import("@/lib/bas-report");
const { pickedNamedRange } = await import("@/lib/report-periods");

beforeEach(() => {
  vi.clearAllMocks();
});

/** An Australian quarter, as sole-ocr's `au_bas` template returns it. */
function backendQuarter(overrides: Record<string, unknown> = {}) {
  return {
    Quarter: "Quarter 1",
    "Quarter Start Date": "01/07/2026",
    "Quarter End Date": "30/09/2026",
    tax_return: {
      template: "au_bas",
      return_name: "BAS",
      tax_label: "GST",
      tax_authority: "ATO",
      sections: [
        {
          title: "GST amounts you owe the tax office (Sales)",
          rows: [
            { box: "G1", label: "Total Sales (Incl. GST)", amount: 11000 },
            { box: "G3", label: "GST Free Sales", amount: 0 },
            { box: "G6", label: "Total Sales Applicable", amount: 11000 },
            { box: "G9", label: "GST on Sales", amount: 1000 },
          ],
        },
        {
          title: "GST amounts tax office owes you (Purchases)",
          rows: [
            { box: "G10", label: "Capital Purchase (Incl. GST)", amount: 2200 },
            { box: "G11", label: "Non-Capital Purchase (Incl. GST)", amount: 1100 },
            { box: "G14", label: "GST Free Purchases", amount: 50 },
            { box: "G20", label: "GST on Purchase", amount: 300 },
          ],
        },
      ],
      summary: { direction: "payable", amount: 700, net_tax: 700 },
    },
    "GST amounts you owe the tax office (Sales)": {
      "Total Sales (Incl. GST)": { code: "G1", amount: "$11,000.00" },
      "GST Free Sales": { code: "G3", amount: "$0.00" },
      "Total Sales Applicable": { code: "G6", amount: "$11,000.00" },
      "GST on Sales": { code: "G9", amount: "$1,000.00" },
    },
    "GST amounts tax office owes you (Purchases)": {
      "Capital Purchase (Incl. GST)": { code: "G10", amount: "$2,200.00" },
      "Non-Capital Purchase (Incl. GST)": { code: "G11", amount: "$1,100.00" },
      "GST Free Purchases": { code: "G14", amount: "$50.00" },
      "GST on Purchase": { code: "G20", amount: "$300.00" },
    },
    "GST Refund/Payable": "$700.00 (Payable)",
    ...overrides,
  };
}

function backendRow(fields: Record<string, string | null> = {}) {
  const base: Record<string, string | null> = {
    Type: "Invoice",
    "Transaction Name": "INV-001",
    "Amount Ex GST": "$1,000.00",
    "GST Amount": "$100.00",
    "Amount Inc GST": "$1,100.00",
    Date: "15/08/2026",
    "Reconcile Date": "16/08/2026",
    "Client/Supplier": "Acme Pty Ltd",
    Category: "G1",
    "Category Name": "Sales",
    Description: null,
    ...fields,
  };
  return Object.entries(base).map(([key, value]) => ({ key, value }));
}

describe("parseBasAmount", () => {
  it("reads the backend's formatted money", () => {
    expect(parseBasAmount("$1,234.56")).toBe(1234.56);
    expect(parseBasAmount("$-20.00")).toBe(-20);
    expect(parseBasAmount("$700.00 (Refund)")).toBe(700);
    expect(parseBasAmount(12.5)).toBe(12.5);
  });

  it("falls back to 0 for anything unreadable", () => {
    expect(parseBasAmount(null)).toBe(0);
    expect(parseBasAmount(undefined)).toBe(0);
    expect(parseBasAmount("n/a")).toBe(0);
  });
});

describe("parseBasDate", () => {
  it("turns DD/MM/YYYY into ISO", () => {
    expect(parseBasDate("01/07/2026")).toBe("2026-07-01");
    expect(parseBasDate("5/3/2026")).toBe("2026-03-05");
  });

  it("returns empty for anything else", () => {
    expect(parseBasDate(null)).toBe("");
    expect(parseBasDate("2026-07-01")).toBe("");
    expect(parseBasDate("NULL")).toBe("");
  });
});

describe("fetchBasReport", () => {
  it("posts a plain multipart view request to gst-extract", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { transactions: [], quarters: [] }, pagination: { total: 0 } },
    });

    await fetchBasReport("Custom range", { from: "2026-07-01", to: "2026-09-30" }, 2, 25);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, form] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.reporting.gst);
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("action")).toBe("view");
    expect(form.get("start_date")).toBe("2026-07-01");
    expect(form.get("end_date")).toBe("2026-09-30");
    expect(form.get("page")).toBe("2");
    expect(form.get("page_size")).toBe("25");
    expect(form.get("data")).toBeNull();
  });

  it("maps quarters and transactions into numbers and ISO dates", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { transactions: [backendRow()], quarters: [backendQuarter()] },
        pagination: { total: 51, total_pages: 3 },
      },
    });

    const report = await fetchBasReport(
      "Custom range",
      { from: "2026-07-01", to: "2026-09-30" },
      1,
      25,
    );

    expect(report.total).toBe(51);
    expect(report.pageCount).toBe(3);

    const [quarter] = report.quarters;
    expect(quarter.label).toBe("Quarter 1");
    expect(quarter.from).toBe("2026-07-01");
    expect(quarter.to).toBe("2026-09-30");
    expect(quarter.sections.map((section) => section.title)).toEqual([
      "GST amounts you owe the tax office (Sales)",
      "GST amounts tax office owes you (Purchases)",
    ]);
    expect(quarter.sections[0].rows.map((line) => line.code)).toEqual(["G1", "G3", "G6", "G9"]);
    expect(quarter.sections[1].rows.map((line) => line.code)).toEqual(["G10", "G11", "G14", "G20"]);
    expect(quarter.taxOnSales).toBe(1000);
    expect(quarter.taxOnPurchases).toBe(300);
    expect(quarter.net).toBe(700);
    expect(quarter.outcome).toBe("payable");

    const [row] = report.transactions;
    expect(row).toMatchObject({
      type: "Invoice",
      name: "INV-001",
      date: "2026-08-15",
      reconcileDate: "2026-08-16",
      party: "Acme Pty Ltd",
      basCode: "G1",
      category: "Sales",
      description: "",
      exGst: 1000,
      gst: 100,
      incGst: 1100,
    });
  });

  it("reads a refund and an unrecognised code", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          transactions: [backendRow({ Category: "Something" })],
          quarters: [
            backendQuarter({
              tax_return: {
                ...backendQuarter().tax_return,
                summary: { direction: "refund", amount: 120.5, net_tax: -120.5 },
              },
            }),
          ],
        },
        pagination: { total: 1, total_pages: 1 },
      },
    });

    const report = await fetchBasReport("Last quarter", null);
    expect(report.quarters[0].outcome).toBe("refund");
    expect(report.quarters[0].net).toBe(120.5);
    expect(report.transactions[0].basCode).toBe("Other");
  });

  it("keeps the G-codes on an Australian listing — no labels means no relabelling", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          transactions: [],
          quarters: [
            {
              Quarter: "Quarter 1",
              "Quarter Start Date": "01/07/2026",
              "Quarter End Date": "30/09/2026",
              tax_return: { template: "au_bas", return_name: "BAS", tax_label: "GST", sections: [] },
            },
          ],
        },
        pagination: { total: 0 },
      },
    });

    expect((await fetchBasReport("Last quarter", null)).transactionLabels).toBeNull();
  });

  it("falls back to the legacy Australian blocks when a response has no tax_return", async () => {
    // A mid-deploy backend, or an older one. The figures still read, so an
    // Australian business never sees a blank worksheet because of a rollout.
    const { tax_return: _dropped, ...legacy } = backendQuarter();
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { transactions: [], quarters: [legacy] },
        pagination: { total: 0 },
      },
    });

    const report = await fetchBasReport("Last quarter", null);
    const [quarter] = report.quarters;
    expect(quarter.sections.map((section) => section.title)).toEqual([
      "GST amounts you owe the tax office (Sales)",
      "GST amounts tax office owes you (Purchases)",
    ]);
    expect(quarter.taxOnSales).toBe(1000);
    expect(quarter.outcome).toBe("payable");
    expect(quarter.net).toBe(700);
    // With nothing to read them from, the names stay Australian.
    expect(report.returnName).toBe("BAS");
    expect(report.taxLabel).toBe("GST");
  });

  it("names the report from the country's own return template", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          transactions: [],
          quarters: [
            {
              Quarter: "Period 3",
              "Quarter Start Date": "01/08/2026",
              "Quarter End Date": "30/09/2026",
              tax_return: {
                template: "nz_gst101a",
                return_name: "GST return",
                tax_label: "GST",
                tax_authority: "Inland Revenue",
                sections: [
                  {
                    title: "GST on sales and income",
                    rows: [
                      { box: "5", label: "Total sales and income (incl. GST)", amount: 11500 },
                      { box: "8", label: "GST on sales and income", amount: 1500 },
                    ],
                  },
                  {
                    title: "GST on purchases and expenses",
                    rows: [
                      { box: "11", label: "Total purchases and expenses (incl. GST)", amount: 2300 },
                      { box: "14", label: "GST on purchases and expenses", amount: 300 },
                    ],
                  },
                ],
                summary: { direction: "payable", amount: 1200, net_tax: 1200 },
                transaction_labels: { G1: "Sales (Box 5)", G10: "Purchases (Box 11)", G11: "Purchases (Box 11)", Other: "Not in the return" },
              },
            },
          ],
        },
        pagination: { total: 0 },
      },
    });

    const report = await fetchBasReport("Last quarter", null);
    expect(report.returnName).toBe("GST return");
    expect(report.taxAuthority).toBe("Inland Revenue");
    // The listing shows the GST101A grouping, not the BAS G-codes.
    expect(report.transactionLabels).toEqual({ G1: "Sales (Box 5)", G10: "Purchases (Box 11)", G11: "Purchases (Box 11)", Other: "Not in the return" });

    const [period] = report.quarters;
    expect(period.label).toBe("Period 3");
    // The New Zealand form's own section titles, which the old parser — which
    // matched on the two Australian ones — would have found nothing for.
    expect(period.sections.map((section) => section.title)).toEqual([
      "GST on sales and income",
      "GST on purchases and expenses",
    ]);
    // Boxes 8 and 14, not G9 and G20.
    expect(period.taxOnSales).toBe(1500);
    expect(period.taxOnPurchases).toBe(300);
    expect(period.net).toBe(1200);
  });

  /** One period whose only content is the given sections, for the box-reading tests. */
  const periodWith = (template: string, sections: { title: string; rows: { box: string; label: string; amount: number }[] }[]) => ({
    data: {
      success: true,
      data: {
        transactions: [],
        quarters: [
          {
            Quarter: "Period 1",
            "Quarter Start Date": "01/04/2026",
            "Quarter End Date": "31/05/2026",
            tax_return: { template, return_name: "GST return", tax_label: "GST", sections },
          },
        ],
      },
      pagination: { total: 0 },
    },
  });

  it("reads a full GST101A from its totals — Box 10 and Box 14 — so adjustments count", async () => {
    apiMock.post.mockResolvedValue(
      periodWith("nz_gst101a", [
        {
          title: "GST on sales and income",
          rows: [
            { box: "5", label: "Total sales", amount: 11500 },
            { box: "6", label: "Zero-rated", amount: 0 },
            { box: "7", label: "Box 5 minus Box 6", amount: 11500 },
            { box: "8", label: "GST on sales", amount: 1500 },
            { box: "9", label: "Adjustments", amount: 50 },
            { box: "10", label: "Total GST collected", amount: 1550 },
          ],
        },
        {
          title: "GST on purchases and expenses",
          rows: [
            { box: "11", label: "Total purchases", amount: 2300 },
            { box: "12", label: "GST on purchases", amount: 300 },
            { box: "13", label: "Credit adjustments", amount: 20 },
            { box: "14", label: "Total GST credit", amount: 320 },
          ],
        },
      ]),
    );

    const [period] = (await fetchBasReport("Last quarter", null)).quarters;
    expect(period.taxOnSales).toBe(1550);
    // Box 13 is a GST101A credit adjustment; it must not be read as VAT201 output tax.
    expect(period.taxOnPurchases).toBe(320);
  });

  it("reads VAT201 input tax from field 19, not the capital-goods value in field 14", async () => {
    apiMock.post.mockResolvedValue(
      periodWith("za_vat201", [
        { title: "Output tax", rows: [{ box: "13", label: "Output tax", amount: 9000 }] },
        {
          title: "Input tax",
          rows: [
            { box: "14", label: "Capital goods (value)", amount: 22000 },
            { box: "19", label: "Total input tax", amount: 5400 },
          ],
        },
      ]),
    );

    const [period] = (await fetchBasReport("Last quarter", null)).quarters;
    expect(period.taxOnSales).toBe(9000);
    expect(period.taxOnPurchases).toBe(5400);
  });

  it("reads a GSTR-3B, where the taxable value and the tax share a table", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          transactions: [],
          quarters: [
            {
              Quarter: "September 2026",
              "Quarter Start Date": "01/09/2026",
              "Quarter End Date": "30/09/2026",
              tax_return: {
                template: "in_gstr3b",
                return_name: "GSTR-3B",
                tax_label: "GST",
                tax_authority: "GSTN",
                currency_symbol: "\u20b9",
                sections: [
                  {
                    title: "3.1 Outward supplies",
                    rows: [
                      { box: "3.1(a)", label: "Outward taxable supplies (taxable value)", amount: 1000000 },
                      { box: "3.1(a) tax", label: "GST on outward taxable supplies (IGST + CGST + SGST)", amount: 180000 },
                    ],
                  },
                  {
                    title: "4. Eligible ITC",
                    rows: [
                      { box: "4(A)(5)", label: "All other ITC", amount: 54000 },
                      { box: "4(C)", label: "Net ITC available", amount: 54000 },
                    ],
                  },
                ],
                summary: { direction: "payable", amount: 126000, net_tax: 126000 },
              },
            },
          ],
        },
        pagination: { total: 0 },
      },
    });

    const report = await fetchBasReport("Last quarter", null);
    expect(report.returnName).toBe("GSTR-3B");
    expect(report.taxAuthority).toBe("GSTN");

    const [period] = report.quarters;
    // The tax, not the taxable value that sits under the same number on the
    // form — which is why the backend gives the tax row its own box code.
    expect(period.taxOnSales).toBe(180000);
    expect(period.taxOnPurchases).toBe(54000);
    expect(period.net).toBe(126000);
  });

  it("throws the backend's message on success: false", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Financial year records not found" },
    });
    await expect(fetchBasReport("Last quarter", null)).rejects.toThrow(
      "Financial year records not found",
    );
  });
});

describe("basTotals", () => {
  it("nets refunds against payments across quarters", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          transactions: [],
          quarters: [
            backendQuarter(),
            // The structured summary is what decides the direction now, so a
            // refund is expressed there rather than in the formatted string.
            backendQuarter({
              Quarter: "Quarter 2",
              tax_return: {
                ...backendQuarter().tax_return,
                summary: { direction: "refund", amount: 900, net_tax: -900 },
              },
              "GST Refund/Payable": "$900.00 (Refund)",
            }),
          ],
        },
        pagination: { total: 0 },
      },
    });
    const report = await fetchBasReport("This financial year", null);
    const totals = basTotals(report.quarters);
    expect(totals.taxOnSales).toBe(2000);
    expect(totals.taxOnPurchases).toBe(600);
    expect(totals.net).toBe(200);
    expect(totals.outcome).toBe("refund");
  });

  it("is a zero payment with no quarters", () => {
    expect(basTotals([])).toEqual({
      taxOnSales: 0,
      taxOnPurchases: 0,
      net: 0,
      outcome: "payable",
    });
  });
});

describe("basDate", () => {
  it("formats an ISO date, or a dash for none", () => {
    expect(basDate("2026-08-15")).toBe("15 Aug 2026");
    expect(basDate("")).toBe("—");
  });
});

describe("filing periods (New Zealand)", () => {
  const nz = {
    iso2: "NZ",
    filingFrequency: "bimonthly",
    currentFilingPeriod: { code: "B4", label: "Oct – Nov 2026", startDate: "2026-10-01", endDate: "2026-11-30", dueDate: "2027-01-15" },
    previousFilingPeriod: { code: "B3", label: "Aug – Sep 2026", startDate: "2026-08-01", endDate: "2026-09-30", dueDate: "2026-10-28" },
  };

  it("offers a two-monthly filer its own periods instead of quarters", () => {
    expect(usesFilingPeriods(nz)).toBe(true);
    expect(usesFilingPeriods({ ...nz, filingFrequency: "sixmonthly" })).toBe(true);
  });

  it("keeps Australia on its quarter presets, whatever it files", () => {
    expect(usesFilingPeriods({ ...nz, iso2: "AU", filingFrequency: "quarterly" })).toBe(false);
    expect(usesFilingPeriods({ ...nz, iso2: "AU", filingFrequency: "monthly" })).toBe(false);
  });

  it("keeps quarters for a quarterly filer, and until the context has a period", () => {
    expect(usesFilingPeriods({ ...nz, filingFrequency: "quarterly" })).toBe(false);
    expect(usesFilingPeriods({ ...nz, currentFilingPeriod: null })).toBe(false);
    expect(usesFilingPeriods({ ...nz, filingFrequency: null })).toBe(false);
  });

  it("names this and last period with the backend's own dates", () => {
    expect(filingPeriodChoices(nz)).toEqual([
      { key: "this-period", name: "This period", scope: "Oct – Nov 2026", range: { from: "2026-10-01", to: "2026-11-30" } },
      { key: "last-period", name: "Last period", scope: "Aug – Sep 2026", range: { from: "2026-08-01", to: "2026-09-30" } },
    ]);
    expect(filingPeriodChoices({ ...nz, previousFilingPeriod: null })).toHaveLength(1);
  });

  it("calls the worksheet tabs quarters or periods the way the backend labelled them", () => {
    const tab = (label: string) => ({ label }) as never;
    expect(periodNoun({ quarters: [tab("Quarter 1"), tab("Quarter 2")] })).toBe("quarter");
    expect(periodNoun({ quarters: [tab("Period 3"), tab("Period 4")] })).toBe("period");
    expect(periodNoun({ quarters: [tab("Period 1 (FY 2026-27)")] })).toBe("period");
  });
});

describe("the return's bottom line and due date", () => {
  const nzPeriod = {
    Quarter: "Period 3",
    "Quarter Start Date": "01/08/2026",
    "Quarter End Date": "30/09/2026",
    tax_return: {
      template: "nz_gst101a",
      return_name: "GST return",
      tax_label: "GST",
      sections: [],
      period: { due_date: "2026-10-28" },
      summary: { direction: "refund", amount: 161.09, net_tax: -161.09, box: "15", box_label: "Difference between Box 10 and Box 14" },
    },
  };

  it("prints a GST101A's bottom line as Box 15, with the period's due date", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { transactions: [], quarters: [nzPeriod] }, pagination: { total: 0 } } });
    const [period] = (await fetchBasReport("Custom range", { from: "2026-08-01", to: "2026-09-30" })).quarters;
    expect(period).toMatchObject({
      summaryCode: "15",
      summaryLabel: "Difference between Box 10 and Box 14",
      dueDate: "2026-10-28",
      net: 161.09,
      outcome: "refund",
    });
  });

  it("leaves the BAS as it was: no box on the bottom line, no due date", async () => {
    const auPeriod = {
      ...nzPeriod,
      Quarter: "Quarter 1",
      tax_return: { ...nzPeriod.tax_return, template: "au_bas", return_name: "BAS", summary: { direction: "payable", amount: 700, net_tax: 700 } },
    };
    apiMock.post.mockResolvedValue({ data: { success: true, data: { transactions: [], quarters: [auPeriod] }, pagination: { total: 0 } } });
    const [quarter] = (await fetchBasReport("Last quarter", null)).quarters;
    expect(quarter).toMatchObject({ summaryCode: null, summaryLabel: null, dueDate: "" });
  });
});

describe("transactionLabelFor", () => {
  const nzLabels = {
    G1: "Sales (Box 5)",
    G10: "Purchases (Box 11)",
    G11: "Purchases (Box 11)",
    Other: "Not in the return",
    SALE_NO_GST: "No GST (Boxes 5 & 6)",
    PURCHASE_NO_GST: "No GST — not in Box 11",
  };

  it("labels a purchase with GST as Box 11, and one without GST as outside it", () => {
    expect(transactionLabelFor(nzLabels, "G11", 26.09)).toBe("Purchases (Box 11)");
    expect(transactionLabelFor(nzLabels, "G10", 300)).toBe("Purchases (Box 11)");
    expect(transactionLabelFor(nzLabels, "G11", 0)).toBe("No GST — not in Box 11");
  });

  it("labels a sale without GST as Boxes 5 & 6", () => {
    expect(transactionLabelFor(nzLabels, "G1", 150)).toBe("Sales (Box 5)");
    expect(transactionLabelFor(nzLabels, "G1", 0)).toBe("No GST (Boxes 5 & 6)");
  });

  it("falls back to the code's own label when the return has no no-GST label", () => {
    expect(transactionLabelFor({ G11: "Purchases (Box 11)" }, "G11", 0)).toBe("Purchases (Box 11)");
  });

  it("keeps Australia's G-codes: no labels, no relabelling", () => {
    expect(transactionLabelFor(null, "G11", 0)).toBeNull();
  });
});

describe("the return screen's period", () => {
  const last = { key: "last-period", name: "Last period", scope: "Aug – Sep 2026", range: { from: "2026-08-01", to: "2026-09-30" } };
  const current = { key: "this-period", name: "This period", scope: "Oct – Nov 2026", range: { from: "2026-10-01", to: "2026-11-30" } };
  const nz = { ready: true, businessId: "nz-1", periodOwner: "nz-1", filingMode: true, filingChoices: [current, last] };
  const au = { ready: true, businessId: "au-1", periodOwner: "au-1", filingMode: false, filingChoices: [] };

  it("starts a two-monthly filer on the last filing period, not a calendar quarter", () => {
    expect(resolveBasPeriod({ ...nz, stored: { period: "This quarter", range: null, namedKey: null } })).toEqual({
      period: "Custom range",
      range: last.range,
      namedKey: "last-period",
    });
  });

  it("lets a New Zealand user pick Custom range and keep it, dates and all", () => {
    // After picking "Custom range" from "Last period", the key is gone but the
    // dates are still the period's — that must stay a custom range, with pickers.
    const stored = { period: "Custom range" as const, range: { ...last.range }, namedKey: null };
    expect(resolveBasPeriod({ ...nz, stored })).toEqual(stored);
    expect(pickedNamedRange(stored.period, stored.range, nz.filingChoices, stored.namedKey, true)).toBeUndefined();
  });

  it("does not turn a typed range into a period because its dates match one", () => {
    expect(pickedNamedRange("Custom range", { ...current.range }, nz.filingChoices, null, true)).toBeUndefined();
    expect(pickedNamedRange("Custom range", { ...current.range }, nz.filingChoices, "this-period", true)).toBe(current);
  });

  it("does not carry a New Zealand filing period to another business", () => {
    const stored = { period: "Custom range" as const, range: { ...last.range }, namedKey: "last-period" };
    expect(resolveBasPeriod({ ...au, periodOwner: "nz-1", stored })).toEqual({ period: "This quarter", range: null, namedKey: null });
  });

  it("moves a named period to its new dates when the filing calendar moves on", () => {
    const stored = { period: "Custom range" as const, range: { from: "2026-06-01", to: "2026-07-31" }, namedKey: "last-period" };
    expect(resolveBasPeriod({ ...nz, stored }).range).toEqual(last.range);
  });

  it("leaves Australia's choice exactly as it was", () => {
    for (const stored of [
      { period: "This quarter" as const, range: null, namedKey: null },
      { period: "Custom range" as const, range: { from: "2026-07-01", to: "2026-07-31" }, namedKey: null },
    ]) {
      expect(resolveBasPeriod({ ...au, stored })).toEqual(stored);
      // Switching between Australian businesses keeps a typed range, as it always did.
      expect(resolveBasPeriod({ ...au, periodOwner: "au-2", stored })).toEqual(stored);
    }
  });

  it("holds the stored choice until the country context has answered", () => {
    const stored = { period: "This quarter" as const, range: null, namedKey: null };
    expect(resolveBasPeriod({ ...nz, ready: false, stored })).toEqual(stored);
  });
});
