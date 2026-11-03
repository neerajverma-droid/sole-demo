import { describe, expect, it, vi } from "vitest";

const apiMock = { get: vi.fn(), post: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { duplicateQuoteDraft, fetchQuoteDetail } = await import("@/lib/quotes");
const { invoiceTotals } = await import("@/lib/invoices");

describe("quote line rates", () => {
  it("keeps the rate a saved line was quoted at, and prices a copy at today's rate", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          quote_no: "QUO-1",
          quote_item: [
            {
              description: "Old work",
              qty: 1,
              price: 100,
              gst: 1,
              gst_percentage: "10.00",
            },
            {
              description: "Untaxed",
              qty: 1,
              price: 100,
              gst: 0,
              gst_percentage: "0.00",
            },
          ],
        },
      },
    });
    const quote = await fetchQuoteDetail("1");
    expect(quote.items.map((item) => item.gstPercent)).toEqual([10, undefined]);
    // At a 15% document rate the saved 10% line still charges 10.
    expect(invoiceTotals(quote.items, "", 15).gstTotal).toBeCloseTo(10);

    const copy = duplicateQuoteDraft(quote, "2026-10-21", null);
    expect(copy.items.every((item) => item.gstPercent === undefined)).toBe(
      true,
    );
    expect(invoiceTotals(copy.items, "", 15).gstTotal).toBeCloseTo(15);
  });
});
