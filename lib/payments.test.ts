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
  GATEWAYS,
  checkStripeConnection,
  checkWorldpayConnection,
  feeRate,
  fetchStripeStats,
  fetchStripeTransactions,
  fetchWorldpayTransactions,
  formatPaymentDate,
  formatPaymentMoney,
  manageableGateways,
  netAmount,
  paymentStats,
  paymentStatusVariant,
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

/* ------------------------------------------------------------------ *
 * Linking — checkWorldpayConnection / checkStripeConnection
 * ------------------------------------------------------------------ */

describe("checkWorldpayConnection — POST /v1/payrix/getMerchantAccount", () => {
  it("posts user_id and returns true only when the merchant is completed", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { merchant_status: "completed" } },
    });

    const result = await checkWorldpayConnection(42);

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.payrix.getMerchantAccount, {
      user_id: 42,
    });
    expect(result).toBe(true);
  });

  it("is false when the merchant exists but isn't completed yet", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { merchant_status: "draft_saved" } },
    });
    expect(await checkWorldpayConnection(42)).toBe(false);
  });

  it("is false when the backend reports success:false", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, data: { merchant_status: "completed" } },
    });
    expect(await checkWorldpayConnection(42)).toBe(false);
  });

  it("is false rather than throwing when the request itself fails", async () => {
    apiMock.post.mockRejectedValue(new Error("network error"));
    expect(await checkWorldpayConnection(42)).toBe(false);
  });

  it("passes through whatever user id it's given, string or number", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await checkWorldpayConnection("");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.payrix.getMerchantAccount, {
      user_id: "",
    });
  });
});

describe("checkStripeConnection — GET /stripe-connect/account", () => {
  it("is true only once Stripe's own onboarding is complete", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { account: { onboarding_complete: true } } },
    });

    const result = await checkStripeConnection();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.stripeConnect.account);
    expect(result).toBe(true);
  });

  it("is false while onboarding_complete is false", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { account: { onboarding_complete: false } } },
    });
    expect(await checkStripeConnection()).toBe(false);
  });

  it("is false when there's no account at all yet", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await checkStripeConnection()).toBe(false);
  });

  it("is false rather than throwing when the request itself fails", async () => {
    apiMock.get.mockRejectedValue(new Error("network error"));
    expect(await checkStripeConnection()).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Listing — fetchWorldpayTransactions / fetchStripeTransactions / fetchStripeStats
 * ------------------------------------------------------------------ */

describe("fetchWorldpayTransactions — GET /v1/payrix/reports", () => {
  it("sends page and per_page, and maps each raw row to a Payment", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        status: true,
        data: [
          {
            id: 501,
            created_at: "2026-08-19 10:00:00",
            status_description: "Settled",
            invoice_no: "INV-0099",
            type_description: "Bank transfer",
            amount: "250.00",
            amount_settled: "250.00",
            fees_deducted: "2.25",
            net_amount: "247.75",
            currency: "AUD",
          },
        ],
        pagination: { current_page: 2, total_pages: 5, per_page: 15, total: 70 },
      },
    });

    const result = await fetchWorldpayTransactions(2, 15);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payrix.report, {
      params: { page: 2, per_page: 15 },
    });
    expect(result.pagination).toEqual({
      current_page: 2,
      total_pages: 5,
      per_page: 15,
      total: 70,
    });
    expect(result.payments).toEqual([
      expect.objectContaining({
        id: "501",
        date: "2026-08-19",
        invoiceNo: "INV-0099",
        amount: 250,
        processingFee: 2.25,
        netAmount: 247.75,
        status: "Settled",
        currency: "AUD",
        gatewayId: "sole-pay",
      }),
    ]);
  });

  it("returns an empty page rather than throwing when the backend reports status:false", async () => {
    apiMock.get.mockResolvedValue({ data: { status: false } });
    const result = await fetchWorldpayTransactions();
    expect(result.payments).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("falls back to a single-page pagination envelope when the server omits one", async () => {
    apiMock.get.mockResolvedValue({
      data: { status: true, data: [{ id: 1 }, { id: 2 }] },
    });
    const result = await fetchWorldpayTransactions(1, 15);
    expect(result.pagination).toEqual({
      current_page: 1,
      total_pages: 1,
      per_page: 15,
      total: 2,
    });
  });

  it("defaults an unrecognised invoice number to null rather than the placeholder string", async () => {
    apiMock.get.mockResolvedValue({
      data: { status: true, data: [{ id: 1, invoice_no: null }] },
    });
    const [payment] = (await fetchWorldpayTransactions()).payments;
    expect(payment.invoiceNo).toBe("N/A");
    expect(payment.invoiceNumber).toBeNull();
  });
});

describe("fetchStripeTransactions — GET /stripe-connect/transactions", () => {
  it("sends page and per_page, and maps each raw row to a Payment", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          transactions: [
            {
              id: "ch_1",
              date: "2026-08-19",
              amount: "100.00",
              fee: "3.20",
              payment_status: "succeeded",
              currency: "USD",
            },
          ],
          pagination: { current_page: 1, total_pages: 3, per_page: 15, total: 40 },
        },
      },
    });

    const result = await fetchStripeTransactions(1, 15);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.stripeConnect.transactions, {
      params: { page: 1, per_page: 15 },
    });
    expect(result.pagination.total).toBe(40);
    expect(result.payments).toEqual([
      expect.objectContaining({
        id: "ch_1",
        date: "2026-08-19",
        amount: 100,
        processingFee: 3.2,
        status: "Settled",
        currency: "USD",
        gatewayId: "stripe",
      }),
    ]);
  });

  it("normalises every real Stripe status to the platform's own four", async () => {
    const rowWith = (payment_status: string) => ({
      data: {
        success: true,
        data: { transactions: [{ id: "1", payment_status }] },
      },
    });

    apiMock.get.mockResolvedValueOnce(rowWith("succeeded"));
    expect((await fetchStripeTransactions()).payments[0].status).toBe("Settled");

    apiMock.get.mockResolvedValueOnce(rowWith("processing"));
    expect((await fetchStripeTransactions()).payments[0].status).toBe("Processing");

    apiMock.get.mockResolvedValueOnce(rowWith("failed"));
    expect((await fetchStripeTransactions()).payments[0].status).toBe("Failed");

    apiMock.get.mockResolvedValueOnce(rowWith("refunded"));
    expect((await fetchStripeTransactions()).payments[0].status).toBe("Refunded");
  });

  it("returns an empty page rather than throwing when the backend reports success:false", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    const result = await fetchStripeTransactions();
    expect(result.payments).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });
});

describe("fetchStripeStats — GET /stripe-connect/transactions/stats", () => {
  it("returns the raw stats object on success", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { net_amount: 500, transactions_count: 12 } },
    });

    const stats = await fetchStripeStats();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.stripeConnect.transactionStats);
    expect(stats).toEqual({ net_amount: 500, transactions_count: 12 });
  });

  it("is null on success:false, and null rather than throwing on a request failure", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: false } });
    expect(await fetchStripeStats()).toBeNull();

    apiMock.get.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchStripeStats()).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Pure helpers shared by the Gateways/Transactions views
 * ------------------------------------------------------------------ */

describe("paymentStats / netAmount / feeRate", () => {
  it("counts only Settled and Processing rows toward the totals", () => {
    const rows = [
      basePayment({ status: "Settled", amount: 100, processingFee: 3, netAmount: 97 }),
      basePayment({ status: "Processing", amount: 50, processingFee: 1, netAmount: 49 }),
      basePayment({ status: "Refunded", amount: 200, processingFee: 5, netAmount: 195 }),
      basePayment({ status: "Failed", amount: 300, processingFee: 0, netAmount: 300 }),
    ];
    const stats = paymentStats(rows);
    expect(stats).toEqual({ total: 150, fees: 4, count: 2, net: 146 });
  });

  it("netAmount prefers the row's own netAmount over amount-minus-fee", () => {
    expect(netAmount(basePayment({ amount: 100, fee: 3, netAmount: 90 }))).toBe(90);
  });

  it("netAmount falls back to amount-minus-fee when netAmount isn't a real number", () => {
    const row = basePayment({ amount: 100, processingFee: 3 });
    // @ts-expect-error — exercising the fallback path a malformed API row could hit
    row.netAmount = undefined;
    expect(netAmount(row)).toBe(97);
  });

  it("feeRate reports 'No payments yet' rather than dividing by zero", () => {
    expect(feeRate({ total: 0, fees: 0, count: 0, net: 0 })).toBe("No payments yet");
  });

  it("feeRate is a percentage of the total once there's real volume", () => {
    expect(feeRate({ total: 1000, fees: 30, count: 5, net: 970 })).toBe("3.0% of takings");
  });
});

describe("manageableGateways", () => {
  it("keeps only connected gateways that have their own dashboard, in connection order", () => {
    // Stripe has a dashboardUrl; sole-pay and nexttap don't (this app is
    // their own dashboard, so there's nowhere else to send anyone).
    expect(manageableGateways(["stripe"]).map((g) => g.id)).toEqual(["stripe"]);
    expect(manageableGateways(["sole-pay"])).toEqual([]);
    expect(manageableGateways(["nexttap"])).toEqual([]);
  });

  it("ignores an id that isn't a real gateway rather than throwing", () => {
    expect(manageableGateways(["not-a-real-gateway"])).toEqual([]);
  });

  it("is empty for no connections", () => {
    expect(manageableGateways([])).toEqual([]);
  });
});

describe("paymentStatusVariant", () => {
  it("maps each real status to its badge variant", () => {
    expect(paymentStatusVariant("Settled")).toBe("success");
    expect(paymentStatusVariant("Processing")).toBe("warning");
    expect(paymentStatusVariant("Refunded")).toBe("secondary");
    expect(paymentStatusVariant("Failed")).toBe("danger");
  });
});

describe("formatPaymentMoney", () => {
  it("always prefixes with $ regardless of the currency argument — matching sole-webapp's own display", () => {
    expect(formatPaymentMoney(1234.5)).toBe("$1,234.50");
    expect(formatPaymentMoney(1234.5, "AUD")).toBe("$1,234.50");
  });

  it("shows $0.00 for zero or a missing amount, not a dash", () => {
    expect(formatPaymentMoney(0)).toBe("$0.00");
    expect(formatPaymentMoney(null)).toBe("$0.00");
    expect(formatPaymentMoney(undefined)).toBe("$0.00");
  });

  it("shows the absolute value — a refund's negative amount reads the same as a charge", () => {
    expect(formatPaymentMoney(-42)).toBe("$42.00");
  });
});

describe("formatPaymentDate", () => {
  it("formats an ISO date as 'DD Month, YYYY'", () => {
    expect(formatPaymentDate("2026-08-19")).toBe("19 August, 2026");
  });

  it("formats a UNIX timestamp (seconds) the same way", () => {
    // 2026-08-19T00:00:00Z
    expect(formatPaymentDate(1787097600)).toMatch(/^19 August, 2026$/);
  });

  it("passes through a string already in the target format unchanged", () => {
    expect(formatPaymentDate("19 August, 2026")).toBe("19 August, 2026");
  });

  it("is an em dash for a missing date", () => {
    expect(formatPaymentDate(null)).toBe("—");
    expect(formatPaymentDate(undefined)).toBe("—");
  });
});

describe("GATEWAYS — the real three providers this screen manages", () => {
  it("has exactly stripe, sole-pay and nexttap, in that order", () => {
    expect(GATEWAYS.map((g) => g.id)).toEqual(["stripe", "sole-pay", "nexttap"]);
  });

  it("only Stripe has its own dashboard to link out to", () => {
    expect(GATEWAYS.filter((g) => g.dashboardUrl).map((g) => g.id)).toEqual(["stripe"]);
  });
});
