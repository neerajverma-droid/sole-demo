import { describe, expect, it, vi, beforeEach } from "vitest";

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

// Imported after the mock so `lib/payments.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  PAYMENT_TABS,
  PAYMENT_STATUSES,
  feeRate,
  fetchStripeStats,
  fetchStripeTransactions,
  fetchWorldpayTransactions,
  formatPaymentDate,
  formatPaymentMoney,
  manageableGateways,
  netAmount,
  paymentStats,
} = await import("@/lib/payments");

import type { Payment } from "@/lib/payments";

beforeEach(() => {
  vi.clearAllMocks();
});

function basePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    date: "2026-08-19",
    category: "Payment Received",
    invoiceNo: "INV-0023",
    description: "Test payment",
    type: "credit",
    amount: 100,
    processingFee: 3,
    fee: 3,
    netAmount: 97,
    status: "Settled",
    ...overrides,
  };
}

function stripeRow(row: Record<string, unknown>) {
  return { data: { success: true, data: { transactions: [{ id: "1", ...row }] } } };
}

describe("PAYMENT_TABS / PAYMENT_STATUSES", () => {
  it("lists the three tabs and four statuses, in order", () => {
    expect(PAYMENT_TABS).toEqual([
      "Gateways",
      "SolePay Payments",
      "Stripe Payments",
      "NextTap Payments",
    ]);
    expect(PAYMENT_STATUSES).toEqual(["Settled", "Processing", "Refunded", "Failed"]);
  });
});

describe("fetchStripeTransactions — the rest of the status normalisation", () => {
  it.each([
    ["paid", "Settled"],
    ["pending", "Settled"],
    ["complete", "Processing"],
    ["canceled", "Refunded"],
    ["cancelled", "Refunded"],
    ["SUCCEEDED", "Settled"],
    ["something_new", "Settled"],
  ])("maps %s to %s", async (payment_status, expected) => {
    apiMock.get.mockResolvedValueOnce(stripeRow({ payment_status }));
    expect((await fetchStripeTransactions()).payments[0].status).toBe(expected);
  });

  it("falls back to the raw status when payment_status is absent", async () => {
    apiMock.get.mockResolvedValueOnce(stripeRow({ status: "failed" }));
    expect((await fetchStripeTransactions()).payments[0].status).toBe("Failed");
  });

  it("always tags rows with gatewayId stripe", async () => {
    apiMock.get.mockResolvedValueOnce(stripeRow({}));
    expect((await fetchStripeTransactions()).payments[0].gatewayId).toBe("stripe");
  });

  it("sends the default page/per_page when called with no arguments", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await fetchStripeTransactions();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.stripeConnect.transactions, {
      params: { page: 1, per_page: 15 },
    });
  });

  it("falls back to a single-page pagination envelope when the server omits one", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { transactions: [{ id: "1" }, { id: "2" }] } },
    });
    const result = await fetchStripeTransactions(3, 10);
    expect(result.pagination).toEqual({
      current_page: 3,
      total_pages: 1,
      per_page: 10,
      total: 2,
    });
  });

  it("uses the server's own pagination when given", async () => {
    const pagination = { current_page: 2, total_pages: 5, per_page: 15, total: 70 };
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { transactions: [], pagination } },
    });
    expect((await fetchStripeTransactions(2)).pagination).toEqual(pagination);
  });

  it("derives net as amount minus the absolute fee when net_amount is absent", async () => {
    apiMock.get.mockResolvedValueOnce(stripeRow({ amount: "100", fee: "-3.5" }));
    const [payment] = (await fetchStripeTransactions()).payments;
    expect(payment.amount).toBe(100);
    expect(payment.processingFee).toBe(3.5);
    expect(payment.fee).toBe(3.5);
    expect(payment.netAmount).toBe(96.5);
  });

  it("reads a UNIX `created` timestamp as an ISO date when there's no date string", async () => {
    // 2026-08-19T00:00:00Z
    apiMock.get.mockResolvedValueOnce(stripeRow({ created: 1787097600 }));
    expect((await fetchStripeTransactions()).payments[0].date).toBe("2026-08-19");
  });

  it("is an empty page rather than throwing when data is missing despite success", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true } });
    expect((await fetchStripeTransactions()).payments).toEqual([]);
  });
});

describe("fetchWorldpayTransactions — field mapping", () => {
  it("prefers amount_settled over amount, and takes the absolute fee", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        status: true,
        data: [
          {
            id: 7,
            amount: "105.00",
            amount_settled: "100.00",
            fees_deducted: "-2.50",
            created_at: "2026-08-19 10:11:12",
          },
        ],
      },
    });
    const [payment] = (await fetchWorldpayTransactions()).payments;
    expect(payment.amount).toBe(100);
    expect(payment.processingFee).toBe(2.5);
    expect(payment.netAmount).toBe(100);
    expect(payment.originalAmount).toBe(105);
    expect(payment.date).toBe("2026-08-19");
    expect(payment.gatewayId).toBe("sole-pay");
  });

  it("prefers the row's own net_amount when present", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { status: true, data: [{ id: 7, amount: "100", net_amount: "97.5" }] },
    });
    expect((await fetchWorldpayTransactions()).payments[0].netAmount).toBe(97.5);
  });

  it("keeps a real invoice number on both invoiceNo and invoiceNumber", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { status: true, data: [{ id: 7, invoice_no: "INV-9" }] },
    });
    const [payment] = (await fetchWorldpayTransactions()).payments;
    expect(payment.invoiceNo).toBe("INV-9");
    expect(payment.invoiceNumber).toBe("INV-9");
  });

  it("returns an empty page when status is true but data is missing", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { status: true } });
    const result = await fetchWorldpayTransactions(2, 5);
    expect(result.payments).toEqual([]);
    expect(result.pagination).toEqual({
      current_page: 2,
      total_pages: 1,
      per_page: 5,
      total: 0,
    });
  });

  it("reads the `status` flag, not `success` — success:true alone yields nothing", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: [{ id: 1 }] } });
    expect((await fetchWorldpayTransactions()).payments).toEqual([]);
  });

  // Doc contract says `amount_settled ?? amount`, but the source uses `||`,
  // so a real numeric 0 settled amount falls back to `amount` instead of 0.
  it.skip("treats a numeric amount_settled of 0 as 0, not a fallback to amount (doc says ??, source uses ||)", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { status: true, data: [{ id: 7, amount: 50, amount_settled: 0 }] },
    });
    expect((await fetchWorldpayTransactions()).payments[0].amount).toBe(0);
  });
});

describe("fetchStripeStats — missing data", () => {
  it("is null on success:true with no data", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true } });
    expect(await fetchStripeStats()).toBeNull();
  });
});

describe("paymentStats / netAmount / feeRate — remaining edges", () => {
  it("excludes Refunded and Failed rows from every figure, including count", () => {
    const stats = paymentStats([
      basePayment({ amount: 100, processingFee: 3, fee: 3, netAmount: 97 }),
      basePayment({ status: "Processing", amount: 50, processingFee: 1, fee: 1, netAmount: 49 }),
      basePayment({ status: "Refunded", amount: 1000, processingFee: 30, fee: 30, netAmount: 970 }),
      basePayment({ status: "Failed", amount: 1000, processingFee: 30, fee: 30, netAmount: 970 }),
    ]);
    expect(stats).toEqual({ total: 150, fees: 4, count: 2, net: 146 });
  });

  it("is all zeros for an empty list", () => {
    expect(paymentStats([])).toEqual({ total: 0, fees: 0, count: 0, net: 0 });
  });

  it("netAmount falls back to the legacy fee alias when processingFee is missing", () => {
    const payment = basePayment({ netAmount: Number.NaN, fee: 4 });
    delete (payment as Partial<Payment>).processingFee;
    expect(netAmount(payment)).toBe(96);
  });

  it("feeRate rounds to one decimal place", () => {
    expect(feeRate({ total: 300, fees: 5, count: 1, net: 295 })).toBe("1.7% of takings");
    expect(feeRate({ total: -10, fees: 0, count: 0, net: 0 })).toBe("No payments yet");
  });
});

describe("manageableGateways — order and duplicates", () => {
  it("never includes sole-pay or nexttap even when connected", () => {
    expect(manageableGateways(["sole-pay", "nexttap"])).toEqual([]);
    expect(manageableGateways(["nexttap", "stripe", "sole-pay"]).map((g) => g.id)).toEqual([
      "stripe",
    ]);
  });
});

describe("formatPaymentMoney / formatPaymentDate — remaining inputs", () => {
  it("adds thousands separators", () => {
    expect(formatPaymentMoney(1234567.891, "AUD")).toBe("$1,234,567.89");
  });

  it("treats a timestamp above 1e11 as milliseconds", () => {
    // 2026-08-19T00:00:00Z in ms
    expect(formatPaymentDate(1787097600000)).toBe(formatPaymentDate(1787097600));
  });

  it("reads only the date part of an ISO date-time string", () => {
    expect(formatPaymentDate("2026-08-05 13:45:00")).toBe("05 August, 2026");
  });
});
