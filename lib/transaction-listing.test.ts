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

// Imported after the mock so `lib/transaction-listing.ts`'s own `import api
// from "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  fetchTransactionListing,
  TRANSACTION_LISTING_REPORT_TYPE_ID,
  listingDate,
  transactionCount,
} = await import("@/lib/transaction-listing");

beforeEach(() => {
  vi.clearAllMocks();
});

type Cell = { key: string; value: string | number | null };
type RawRow = Cell[];

function backendRow(overrides: Partial<Record<string, string | number | null>>): RawRow {
  const fields: Record<string, string | number | null> = {
    Type: "Income",
    "Transaction Name": "Invoice #1",
    "Amount (EX GST)": "1000",
    "Amount (INC. GST)": "1100",
    "Category Name": "Services",
    "Reconcile Date": "2026-01-15",
    "Transaction Date": "2026-01-10",
    "Client/Supplier": "Turner Consulting",
    Description: "Consulting retainer",
    ...overrides,
  };
  return Object.entries(fields).map(([key, value]) => ({ key, value }));
}

/**
 * Routes each mocked call by the span (`start_date`) and page it was actually
 * sent for, rather than by call order — `fetchTransactionListing` fires the
 * current and previous spans through `Promise.all`, so their underlying
 * `api.post` calls can interleave.
 */
function mockRoutedPost(
  responses: Record<string, { data?: RawRow[]; pagination?: { total?: number; total_pages?: number }; success?: boolean; message?: string }>,
) {
  apiMock.post.mockImplementation(async (_url: string, form: FormData) => {
    const startDate = String(form.get("start_date"));
    const page = String(form.get("page"));
    const key = `${startDate}:${page}`;
    const response = responses[key];
    if (!response) throw new Error(`Unexpected call: ${key}`);
    return { data: response };
  });
}

describe("fetchTransactionListing", () => {
  it("sends report_type_id, action, page and page_size as multipart FormData for the current and previous spans", async () => {
    mockRoutedPost({
      "2026-01-01:1": { data: [], pagination: { total: 0, total_pages: 1 } },
      "2025-12-01:1": { data: [], pagination: { total: 0, total_pages: 1 } },
    });

    await fetchTransactionListing("Custom range", {
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(apiMock.post).toHaveBeenCalledTimes(2);
    apiMock.post.mock.calls.forEach((call: unknown[]) => {
      const [url, form] = call as [string, FormData];
      expect(url).toBe(apiRoutes.reporting.reports);
      expect(form.get("report_type_id")).toBe(TRANSACTION_LISTING_REPORT_TYPE_ID);
      expect(form.get("action")).toBe("view");
      expect(form.get("page")).toBe("1");
      expect(form.get("page_size")).toBe("200");
    });
  });

  it("fetches every page for a span and merges them, not just the first", async () => {
    mockRoutedPost({
      "2026-01-01:1": {
        data: [backendRow({ "Transaction Name": "Row A" })],
        pagination: { total: 2, total_pages: 2 },
      },
      "2026-01-01:2": {
        data: [backendRow({ "Transaction Name": "Row B" })],
        pagination: { total: 2, total_pages: 2 },
      },
      "2025-12-01:1": { data: [], pagination: { total: 0, total_pages: 1 } },
    });

    const listing = await fetchTransactionListing("Custom range", {
      from: "2026-01-01",
      to: "2026-01-31",
    });

    const servicesGroup = listing.groups.find((group) => group.category === "Services");
    expect(servicesGroup?.rows).toHaveLength(2);
  });

  it("derives direction from the category's real type, reconciled from whether a reconcile date came back, and gst as inc minus ex", async () => {
    mockRoutedPost({
      "2026-01-01:1": {
        data: [
          backendRow({
            "Category Name": "Services",
            "Amount (EX GST)": "1000",
            "Amount (INC. GST)": "1100",
            "Reconcile Date": "2026-01-15",
          }),
          backendRow({
            "Category Name": "Rent",
            "Amount (EX GST)": "500",
            "Amount (INC. GST)": "550",
            "Reconcile Date": null,
          }),
        ],
        pagination: { total: 2, total_pages: 1 },
      },
      "2025-12-01:1": { data: [], pagination: { total: 0, total_pages: 1 } },
    });

    const listing = await fetchTransactionListing("Custom range", {
      from: "2026-01-01",
      to: "2026-01-31",
    });

    const services = listing.groups.find((group) => group.category === "Services");
    expect(services?.type).toBe("Income");
    expect(services?.direction).toBe("in");
    expect(services?.rows[0]).toMatchObject({
      net: 1000,
      gross: 1100,
      gst: 100,
      reconciled: true,
      reference: "Invoice #1",
    });

    const rent = listing.groups.find((group) => group.category === "Rent");
    expect(rent?.type).toBe("Expense");
    expect(rent?.direction).toBe("out");
    expect(rent?.rows[0].reconciled).toBe(false);
  });

  it("falls back to the amount's sign for a category this app doesn't recognise", async () => {
    mockRoutedPost({
      "2026-01-01:1": {
        data: [
          backendRow({
            "Category Name": "Some New Backend Category",
            "Amount (EX GST)": "-250",
            "Amount (INC. GST)": "-275",
          }),
        ],
        pagination: { total: 1, total_pages: 1 },
      },
      "2025-12-01:1": { data: [], pagination: { total: 0, total_pages: 1 } },
    });

    const listing = await fetchTransactionListing("Custom range", {
      from: "2026-01-01",
      to: "2026-01-31",
    });

    const group = listing.groups.find(
      (g) => g.category === "Some New Backend Category",
    );
    expect(group?.type).toBeNull();
    expect(group?.direction).toBe("out");
  });

  it("compares the period's totals against the previous span's, not an estimate", async () => {
    mockRoutedPost({
      "2026-01-01:1": {
        data: [backendRow({ "Amount (INC. GST)": "1100" })],
        pagination: { total: 1, total_pages: 1 },
      },
      "2025-12-01:1": {
        data: [
          backendRow({ "Amount (INC. GST)": "900" }),
          backendRow({ "Amount (INC. GST)": "800" }),
        ],
        pagination: { total: 2, total_pages: 1 },
      },
    });

    const listing = await fetchTransactionListing("Custom range", {
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(listing.summary.count).toEqual({ amount: 1, previous: 2 });
    expect(listing.summary.moneyIn).toEqual({ amount: 1100, previous: 1700 });
  });

  it("throws with the backend's own message when a call reports failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Something went wrong" },
    });

    await expect(
      fetchTransactionListing("Custom range", {
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).rejects.toThrow("Something went wrong");
  });
});

describe("listingDate", () => {
  it("formats an ISO date the same way the rest of the product does", () => {
    expect(listingDate("2026-08-12")).toBe("12 Aug 2026");
  });

  it("reads as a dash rather than throwing on something unparseable", () => {
    expect(listingDate("not-a-date")).toBe("—");
  });
});

describe("transactionCount", () => {
  it("formats a whole number with locale grouping", () => {
    expect(transactionCount(1234)).toBe("1,234");
  });
});
