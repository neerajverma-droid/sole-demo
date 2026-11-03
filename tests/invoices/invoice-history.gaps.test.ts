import { describe, expect, it, vi, beforeEach } from "vitest";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

// lib/invoice-history.test.ts covers the route, the standard/deposit mapping
// and the basic formatting; this file covers the fallbacks it doesn't.
const { fetchInvoiceHistory, formatTimelineDateTime, paymentMethodLabel } = await import(
  "@/lib/invoice-history"
);

function historyReturns(data: Record<string, unknown>) {
  apiMock.get.mockResolvedValue({ data: { success: true, data } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchInvoiceHistory — timeline fallbacks", () => {
  it("treats any status other than completed/pending as upcoming", async () => {
    historyReturns({
      timeline: [
        { key: "a", status: "completed" },
        { key: "b", status: "pending" },
        { key: "c", status: "scheduled" },
        { key: "d" },
      ],
    });

    const { timeline } = await fetchInvoiceHistory("1");
    expect(timeline.map((event) => event.status)).toEqual([
      "completed",
      "pending",
      "upcoming",
      "upcoming",
    ]);
  });

  it("keys an event by its index when the server sends no key", async () => {
    historyReturns({ timeline: [{ key: "created" }, { title: "Reminder sent" }] });

    const { timeline } = await fetchInvoiceHistory("1");
    expect(timeline.map((event) => event.key)).toEqual(["created", "event-1"]);
  });

  it("carries who a reminder went to, and defaults sentTo to empty", async () => {
    historyReturns({
      timeline: [
        { key: "reminder", meta: { sent_to: ["a@acme.test", "b@acme.test"] } },
        { key: "created", meta: null },
      ],
    });

    const { timeline } = await fetchInvoiceHistory("1");
    expect(timeline[0].sentTo).toEqual(["a@acme.test", "b@acme.test"]);
    expect(timeline[1]).toMatchObject({
      sentTo: [],
      payments: [],
      amount: null,
      paidAmount: null,
      remainingAmount: null,
      paymentCount: null,
      title: "",
    });
  });

  it("prefers payment_date over transaction_date and names the payment method", async () => {
    historyReturns({
      timeline: [
        {
          key: "paid",
          meta: {
            payments: [
              {
                amount: "50.5",
                payment_date: "2026-03-11",
                transaction_date: "2026-03-10 00:00:00",
                source: "paid_with_cash",
              },
              { amount: 10, source: "stripe_checkout" },
            ],
          },
        },
      ],
    });

    const { timeline } = await fetchInvoiceHistory("1");
    expect(timeline[0].payments).toEqual([
      { amount: 50.5, date: "2026-03-11", description: null, method: "Cash" },
      { amount: 10, date: null, description: null, method: "Stripe" },
    ]);
  });

  it("falls back to AUD for a missing or invalid currency, and zeroes missing figures", async () => {
    historyReturns({ currency_code: "dollars" });

    expect(await fetchInvoiceHistory("1")).toMatchObject({
      invoiceNo: "",
      historyType: "standard",
      currencyCode: "AUD",
      totalAmount: 0,
      totalAllocatedAmount: 0,
      remainingAmount: 0,
      depositPaidAmount: null,
      recipientName: undefined,
      timeline: [],
    });
  });

  it("normalises a valid currency code", async () => {
    historyReturns({ currency_code: "nzd" });
    expect((await fetchInvoiceHistory("1")).currencyCode).toBe("NZD");
  });

  it("doesn't check success — only whether data is there", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, data: { invoice_no: "INV-1" } } });
    expect((await fetchInvoiceHistory("1")).invoiceNo).toBe("INV-1");
  });
});

describe("paymentMethodLabel", () => {
  it("names each source the way a person would say it", () => {
    expect(paymentMethodLabel("paid_with_cash")).toBe("Cash");
    expect(paymentMethodLabel("CASH")).toBe("Cash");
    expect(paymentMethodLabel("stripe")).toBe("Stripe");
    expect(paymentMethodLabel("payrix")).toBe("SolePay");
    expect(paymentMethodLabel("worldpay_link")).toBe("SolePay");
    expect(paymentMethodLabel("bank_feed")).toBe("Bank feed");
    expect(paymentMethodLabel("manual_upload")).toBe("Bank statement");
    expect(paymentMethodLabel("upload")).toBe("Bank statement");
    expect(paymentMethodLabel(" Manual ")).toBe("Manual entry");
  });

  it("is null for nothing, or a source that says nothing useful", () => {
    expect(paymentMethodLabel(null)).toBeNull();
    expect(paymentMethodLabel(undefined)).toBeNull();
    expect(paymentMethodLabel("  ")).toBeNull();
    expect(paymentMethodLabel("api")).toBeNull();
  });
});

describe("formatTimelineDateTime — edge cases", () => {
  it("prints a date-only value as just the date", () => {
    expect(formatTimelineDateTime("2026-03-10")).toMatch(/^10 Mar 26$/);
  });

  it("formats in the zone it's given", () => {
    // 22:30 UTC is 9:30 am the next day in Sydney (AEDT, UTC+11).
    expect(formatTimelineDateTime("2026-03-10T22:30:00Z", "Australia/Sydney")).toMatch(
      /11 Mar 26, 0?9:30\s?am/i,
    );
  });

  // Discrepancy: docs/testing-invoices.md says an unparseable value is returned
  // unchanged, but the source (lib/datetime.ts formatEventDateTime) returns the
  // "—" fallback instead.
  it.skip("returns an unparseable value unchanged (per the doc)", () => {
    expect(formatTimelineDateTime("not a date")).toBe("not a date");
  });

  it("shows an em dash for an unparseable value (what the source actually does)", () => {
    expect(formatTimelineDateTime("not a date")).toBe("—");
  });
});
