import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { post: vi.fn(), get: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  fetchBasReview,
  fetchSavedReport,
  groupFindings,
  readiness,
  sourceHref,
  reviewHeadline,
  saveBasReviewReport,
} = await import(
  "@/lib/bas-review"
);

import type { BasReview, ReviewFinding } from "@/lib/bas-review";

beforeEach(() => vi.clearAllMocks());

const finding = (
  id: string,
  severity: ReviewFinding["severity"],
): ReviewFinding => ({
  id,
  source: "rule",
  severity,
  title: id,
  detail: "",
  action: "review",
  impactAmount: null,
  suggestions: [],
  rowCount: 0,
  rows: [],
});

describe("fetchBasReview", () => {
  it("posts the range as form data to the review endpoint and returns the data", async () => {
    const data = { summary: "ok" } as BasReview;
    apiMock.post.mockResolvedValue({ data: { success: true, data } });

    await expect(
      fetchBasReview({ from: "2025-07-01", to: "2025-09-30" }),
    ).resolves.toBe(data);

    const [url, form] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.reporting.basReview);
    expect((form as FormData).get("start_date")).toBe("2025-07-01");
    expect((form as FormData).get("end_date")).toBe("2025-09-30");
  });

  it("surfaces the backend's message when it reports failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "End Date must be greater than Start Date" },
    });
    await expect(
      fetchBasReview({ from: "2025-09-30", to: "2025-07-01" }),
    ).rejects.toThrow("End Date must be greater than Start Date");
  });

  it("rejects a success response that has no data", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(
      fetchBasReview({ from: "2025-07-01", to: "2025-09-30" }),
    ).rejects.toThrow("Couldn't review the BAS");
  });
});

describe("groupFindings", () => {
  it("orders high → low and omits empty groups", () => {
    const groups = groupFindings([
      finding("a", "low"),
      finding("b", "high"),
      finding("c", "low"),
    ]);
    expect(groups.map((g) => [g.severity, g.findings.map((f) => f.id)])).toEqual([
      ["high", ["b"]],
      ["low", ["a", "c"]],
    ]);
  });
});

describe("reviewHeadline", () => {
  it("leads with the most serious tier present", () => {
    expect(reviewHeadline({ high: 1, medium: 4, low: 2 })).toBe(
      "1 thing needs fixing before you lodge",
    );
    expect(reviewHeadline({ high: 0, medium: 2, low: 2 })).toBe(
      "2 things are worth fixing",
    );
    expect(reviewHeadline({ high: 0, medium: 0, low: 1 })).toBe(
      "1 thing is worth a look",
    );
  });
  it("says so when there is nothing", () => {
    expect(reviewHeadline({ high: 0, medium: 0, low: 0 })).toBe(
      "Nothing needs attention",
    );
  });
});

describe("readiness", () => {
  const findings = [finding("a", "high"), finding("b", "low"), finding("c", "low"), finding("d", "low")];

  it("counts accepted and rejected as dealt with, pending as not", () => {
    expect(readiness(findings, { a: "accepted", b: "rejected", c: "pending" })).toBe(50);
    expect(readiness(findings, {})).toBe(0);
  });
  it("is complete when there is nothing to deal with", () => {
    expect(readiness([], {})).toBe(100);
  });
});

describe("saved reports", () => {
  it("saves the review with its period and decisions", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 3, readiness: 50 } } });
    const review = { period: { from: "2025-07-01", to: "2025-09-30" }, findings: [] } as unknown as BasReview;
    await expect(saveBasReviewReport(review, { f1: "accepted" })).resolves.toEqual({ id: 3, readiness: 50 });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.reporting.basReviewReports);
    expect(body).toMatchObject({ period_from: "2025-07-01", period_to: "2025-09-30", decisions: { f1: "accepted" } });
  });

  it("opens one report by id", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { id: 3 } } });
    await expect(fetchSavedReport(3)).resolves.toEqual({ id: 3 });
    expect(apiMock.get.mock.calls[0][0]).toBe(`${apiRoutes.reporting.basReviewReports}/3`);
  });
});

describe("sourceHref", () => {
  it("sends each record kind to its own page", () => {
    expect(sourceHref({ kind: "expense", id: 4 }).href).toBe("/expenses/4");
    expect(sourceHref({ kind: "invoice", id: 5 }).href).toBe("/invoices/5");
    expect(sourceHref({ kind: "asset", id: 6 }).href).toBe("/assets?edit=6");
    expect(sourceHref({ kind: "client_refund", id: 7 }).href).toBe("/sales/client-refunds/7");
    expect(sourceHref({ kind: "vendor_refund", id: 8 }).href).toBe("/expenses/vendor-refunds");
  });
  it("a bank transaction opens Matched, in its financial year, searched by the bank's own text", () => {
    const link = sourceHref(
      { kind: "bank_transaction", id: 5, search: "TX-ABC-1" },
      { type: "Other", name: "Equity matched from transaction #1", date: "2026-08-07", incGst: -301 },
    );
    const url = new URL(link.href, "https://x.test");
    expect(url.pathname).toBe("/transactions");
    expect(url.searchParams.get("status")).toBe("Matched");
    expect(url.searchParams.get("search")).toBe("TX-ABC-1");
    expect(url.searchParams.get("period")).toBe("FY 26/27");
    // Searched by its own id, so the page can open the one row it finds.
    expect(url.searchParams.get("undo")).toBe("1");
    // The amount (unsigned) tells apart transactions whose text matches the same search.
    expect(url.searchParams.get("amount")).toBe("301.00");
  });
  it("July starts the next financial year, June ends the last", () => {
    const fy = (date: string) =>
      new URL(
        sourceHref({ kind: "bank_transaction", id: 1, search: "x" }, { type: "Other", name: "n", date }).href,
        "https://x.test",
      ).searchParams.get("period");
    expect(fy("2026-06-30")).toBe("FY 25/26");
    expect(fy("2026-07-01")).toBe("FY 26/27");
    expect(fy("2025-12-31")).toBe("FY 25/26");
  });
  it("falls back to the row's name, and leaves the year off when there is no date", () => {
    const url = new URL(
      sourceHref({ kind: "bank_transaction", id: 5 }, { type: "Other", name: "Fallback" }).href,
      "https://x.test",
    );
    expect(url.searchParams.get("search")).toBe("Fallback");
    expect(url.searchParams.has("period")).toBe(false);
    // A search by the row's wording isn't unique to one transaction: don't open an Undo dialog.
    expect(url.searchParams.has("undo")).toBe(false);
  });
  it("without a record id, lands on the right list already searched for the transaction", () => {
    expect(sourceHref(null, { type: "Expense", name: "Created from transaction #1136939" })).toEqual({
      href: "/expenses?search=Created%20from%20transaction%20%231136939",
      label: "Find expense",
    });
    expect(sourceHref(null, { type: "Other", name: "A & B" })).toEqual({
      href: "/transactions?search=A%20%26%20B",
      label: "Find in Transactions",
    });
  });
  it("has no search when the row has no name", () => {
    expect(sourceHref(null, { type: "Other", name: " " }).href).toBe("/transactions");
    expect(sourceHref(null).href).toBe("/transactions");
  });
});
