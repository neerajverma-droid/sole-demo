import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));
vi.mock("@/stores/session", () => ({ currentUserId: () => "493" }));

const {
  canSelectCandidate,
  fetchMatchCandidates,
  fetchRefundRecords,
  mapAssetExpense,
  mapMatchInvoice,
  matchRefundApi,
  matchToMultipleApi,
  refundKind,
} = await import("@/lib/transaction-match");

import type { MatchCandidate, RefundRecord } from "@/lib/transaction-match";

function decrypted(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

describe("candidates", () => {
  it("maps expenses and assets", () => {
    expect(
      mapAssetExpense({
        type: "expense",
        expense_id: 4,
        name: "Fuel",
        price: "20.5",
        date: "2026-08-01T00:00:00Z",
        client: { name: "BP", email: "a@bp.com" },
        account_subcategory: { name: "Motor Vehicle" },
      }),
    ).toMatchObject({ key: "expense:4", kind: "Expense", title: "Fuel", subtitle: "Motor Vehicle", amount: 20.5, date: "2026-08-01" });
    expect(mapAssetExpense({ type: "asset", asset_id: 9, name: "Van", date_of_purchase: "2026-07-01" })).toMatchObject({
      key: "asset:9",
      kind: "Asset",
      date: "2026-07-01",
    });
  });

  it("maps an FX invoice", () => {
    expect(
      mapMatchInvoice({
        invoice_id: 7,
        invoice_no: "INV-7",
        total: 110,
        status: "Overdue",
        due_date: "2026-09-01",
        client: { name: "Acme", currency: "USD", total_after_exchange: 70 },
      }),
    ).toMatchObject({ key: "invoice:7", title: "INV-7", status: "overdue", fxAmount: "70", currency: "USD" });
  });

  it("asks for expenses/assets up to the amount, and drops taken ones", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          asset_expense: [
            { type: "expense", expense_id: 1, price: 10 },
            { type: "expense", expense_id: 2, price: 10, paid_with_cash: 1 },
            { type: "asset", asset_id: 3, price: 10, bank_transaction_id: 55 },
          ],
        },
      },
    });
    const rows = await fetchMatchCandidates("Debit", 120);
    expect(rows.map((row) => row.key)).toEqual(["expense:1"]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bankTransaction.fetchPossibleMatchExpenses, {
      params: {
        page_size: 100,
        "sort_by[date_of_purchase]": "desc",
        "filter_by[min_price]": 0,
        "filter_by[max_price]": 120,
      },
    });
  });

  it("offers only due, overdue and partially paid invoices", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_details: [
            { invoice_id: 1, status: "due" },
            { invoice_id: 2, status: "paid" },
            { invoice_id: 3, status: "partially_paid" },
            { invoice_id: 4, status: "overdue", bank_transaction_id: 9 },
          ],
        },
      },
    });
    const rows = await fetchMatchCandidates("Credit", 50);
    expect(rows.map((row) => row.id)).toEqual(["1", "3"]);
    expect(apiMock.get.mock.calls[0][1]).toEqual({
      params: { page_size: 100, "sort_by[invoice_id]": "desc", mode: "match_transaction" },
    });
  });

  it("never mixes an FX invoice with others", () => {
    const aud = { key: "invoice:1", kind: "Invoice", fxAmount: "" } as MatchCandidate;
    const aud2 = { key: "invoice:2", kind: "Invoice", fxAmount: "" } as MatchCandidate;
    const fx = { key: "invoice:3", kind: "Invoice", fxAmount: "70" } as MatchCandidate;
    expect(canSelectCandidate(aud2, [aud])).toBe(true);
    expect(canSelectCandidate(fx, [aud])).toBe(false);
    expect(canSelectCandidate(aud, [fx])).toBe(false);
    expect(canSelectCandidate(fx, [])).toBe(true);
    expect(canSelectCandidate(fx, [fx])).toBe(true);
  });
});

describe("matchToMultipleApi", () => {
  const expense = { kind: "Expense", id: "1", fxAmount: "" } as MatchCandidate;
  const asset = { kind: "Asset", id: "2", fxAmount: "" } as MatchCandidate;

  it("posts expenses and assets for money out", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "ok" } });
    await matchToMultipleApi("91", "Debit", [expense, asset]);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.matchMultipleAssetsExpenses);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({
      transaction_id: "91",
      expense_ids: ["1"],
      asset_ids: ["2"],
    });
  });

  it("posts invoices for money in, flagging FX", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await matchToMultipleApi("91", "Credit", [
      { kind: "Invoice", id: "7", fxAmount: "70" } as MatchCandidate,
    ]);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.bankTransaction.matchMultipleInvoices);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({
      transaction_id: "91",
      invoice_ids: ["7"],
      is_fx: "1",
    });
  });

  it("refuses an empty selection with sole-webapp's messages", async () => {
    await expect(matchToMultipleApi("1", "Debit", [])).rejects.toThrow(
      "Please select at least one asset or expense to match.",
    );
    await expect(matchToMultipleApi("1", "Credit", [])).rejects.toThrow(
      "Please select at least one invoice to match.",
    );
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("throws the server's message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(matchToMultipleApi("1", "Debit", [expense])).rejects.toThrow("Nope");
  });
});

describe("refunds", () => {
  it("maps direction to the refund kind", () => {
    expect(refundKind("Credit")).toBe("vendor");
    expect(refundKind("Debit")).toBe("client");
  });

  it("reads matched expenses for a vendor refund", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          expense_details: [{ expense_id: 3, name: "Rent", client: { name: "Landlord" }, price: 900, remainingAmount: 0 }],
          total: 1,
          total_pages: 1,
        },
      },
    });
    const page = await fetchRefundRecords("Credit", 1);
    expect(page.records[0]).toMatchObject({ id: "3", kind: "Expense", title: "Rent", amount: 900 });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.expense.matched, { params: { page: 1, page_size: 10 } });
  });

  it("reads matched invoices for a client refund", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_details: [{ invoice_id: 8, invoice_no: "INV-8", total: 50, status: "Paid" }], total: 1 } },
    });
    const page = await fetchRefundRecords("Debit", 2);
    expect(page.records[0]).toMatchObject({ id: "8", kind: "Invoice", title: "INV-8", status: "paid" });
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.invoice.matched);
  });

  it("numbers and writes a credit note, then matches the line to it", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { success: true, data: "CN-0042" } })
      .mockResolvedValueOnce({ data: { success: true, data: { id: 77 } } })
      .mockResolvedValueOnce({ data: { success: true } });
    const record = { id: "3", kind: "Expense", amount: 900 } as RefundRecord;

    await matchRefundApi("91", "Credit", record);

    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.creditNote.generate);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({ user_id: "493" });
    expect(apiMock.post.mock.calls[1][0]).toBe(apiRoutes.creditNote.add);
    expect(decrypted(apiMock.post.mock.calls[1][1])).toMatchObject({
      user_id: "493",
      type: "vendor",
      related_expense_id: "3",
      related_invoice_id: "",
      status: "issued",
      reason: "Refund",
      gst_amount: 0,
      total: 900,
      transaction_id: "91",
      credit_note_number: "CN-0042",
    });
    expect(apiMock.post.mock.calls[2][0]).toBe(apiRoutes.bankTransaction.matchCreditNote);
    expect(decrypted(apiMock.post.mock.calls[2][1])).toEqual({
      transaction_id: "91",
      credit_note_id: "77",
      credit_note_type: "vendor",
    });
  });

  it("stops if the credit note isn't created", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { success: true, data: "CN-1" } })
      .mockResolvedValueOnce({ data: { success: false, message: "Bad note" } });
    await expect(
      matchRefundApi("91", "Debit", { id: "8", kind: "Invoice", amount: 50 } as RefundRecord),
    ).rejects.toThrow("Bad note");
    expect(apiMock.post).toHaveBeenCalledTimes(2);
  });
});
