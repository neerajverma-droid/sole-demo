import { describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { fetchInvoiceHistory, formatTimelineDateTime } = await import(
  "@/lib/invoice-history"
);

describe("fetchInvoiceHistory", () => {
  it("fetches against the invoice's own history route", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_no: "INV-8801", timeline: [] } },
    });
    await fetchInvoiceHistory("8801");
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.invoice.history("8801"));
  });

  it("maps a standard invoice's timeline, figures and recipient", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_no: "INV-8801",
          history_type: "standard",
          currency_code: "AUD",
          total_amount: 1100,
          total_allocated_amount: 400,
          remaining_amount: 700,
          selected_contacts: [{ name: "Priya Shah", email: "priya@acme.test" }],
          timeline: [
            {
              key: "invoice_created",
              title: "Invoice created",
              status: "completed",
              occurred_at: "2026-03-01 09:00:00",
              meta: { amount: 1100 },
            },
            {
              key: "invoice_partially_paid",
              title: "Invoice partially paid",
              status: "completed",
              occurred_at: "2026-03-10 14:30:00",
              meta: {
                amount: 400,
                paid_amount: 400,
                remaining_amount: 700,
                payment_count: 1,
                payments: [
                  { amount: 400, transaction_date: "2026-03-10 14:30:00", description: "Bank transfer" },
                ],
              },
            },
            {
              key: "invoice_paid_in_full",
              title: "Invoice paid in full",
              status: "pending",
              occurred_at: null,
              meta: null,
            },
          ],
        },
      },
    });

    const history = await fetchInvoiceHistory("8801");

    expect(history.historyType).toBe("standard");
    expect(history.totalAmount).toBe(1100);
    expect(history.totalAllocatedAmount).toBe(400);
    expect(history.remainingAmount).toBe(700);
    expect(history.recipientName).toBe("Priya Shah");
    expect(history.recipientEmail).toBe("priya@acme.test");
    expect(history.timeline).toHaveLength(3);

    const [created, partial, full] = history.timeline;
    expect(created).toMatchObject({ status: "completed", amount: 1100 });
    expect(partial.payments).toEqual([
      { amount: 400, date: "2026-03-10", method: null, description: "Bank transfer" },
    ]);
    expect(full.status).toBe("pending");
    expect(full.occurredAt).toBeNull();
  });

  it("reads a deposit invoice's own history_type and deposit figure", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_no: "INV-9001",
          payment_structure: "deposit_balance",
          deposit_paid_amount: 250,
          timeline: [],
        },
      },
    });
    const history = await fetchInvoiceHistory("9001");
    expect(history.historyType).toBe("deposit");
    expect(history.depositPaidAmount).toBe(250);
  });

  it("throws when the server has nothing for that invoice", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    await expect(fetchInvoiceHistory("404")).rejects.toThrow(
      "Couldn't load that invoice's history.",
    );
  });
});

describe("formatTimelineDateTime", () => {
  it("renders a stored datetime in the timeline's own format", () => {
    expect(formatTimelineDateTime("2026-03-10 14:30:00")).toMatch(
      /10 Mar 26, 0?2:30\s?pm/i,
    );
  });

  it("shows an em dash for nothing to format", () => {
    expect(formatTimelineDateTime(null)).toBe("—");
  });
});
