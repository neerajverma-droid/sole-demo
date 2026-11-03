import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
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

// Imported after the mock so `lib/bank-match.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  fetchPossibleMatches,
  filterMatchCandidates,
  matchSelectionTotals,
  matchSingleTransaction,
  matchMultipleTransactions,
  undoMatchTransaction,
} = await import("@/lib/bank-match");

import type { MatchCandidate } from "@/lib/bank-match";

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: "1",
    date: "2026-09-10",
    description: "AMP SUPER CONTRIBUTION",
    reference: "TXN-0001",
    amount: 1212,
    availableAmount: 1212,
    ...overrides,
  };
}

describe("fetchPossibleMatches", () => {
  it("fetches from /possible-matches/{type}/{id} with no mode param by default", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { list: [], expense_remaining_amount: 0 } },
    });

    await fetchPossibleMatches("expense", "89276");

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(
      `${apiRoutes.bankTransaction.fetchPossibleMatchTransaction}/expense/89276`,
    );
    expect(config.params).toEqual({});
  });

  it("sends multiple_match_mode=true only when asked for the multi-match tab", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { list: [], expense_remaining_amount: 0 } },
    });

    await fetchPossibleMatches("expense", "89276", { multiple: true });

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params).toEqual({ multiple_match_mode: "true" });
  });

  it("maps every candidate field", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          list: [
            {
              id: 501,
              transaction_date: "2026-09-10",
              description: "AMP SUPER CONTRIBUTION",
              reference: "TXN-0001",
              amount: "1212.00",
              available_amount: "1212.00",
            },
          ],
          expense_remaining_amount: "1212.00",
        },
      },
    });

    const result = await fetchPossibleMatches("expense", "89276");

    expect(result.candidates).toEqual([
      {
        id: "501",
        date: "2026-09-10",
        description: "AMP SUPER CONTRIBUTION",
        reference: "TXN-0001",
        amount: 1212,
        availableAmount: 1212,
      },
    ]);
    expect(result.remainingAmount).toBe(1212);
  });

  it("reads asset_remaining_amount for an asset match", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { list: [], asset_remaining_amount: "500.00" },
      },
    });

    const result = await fetchPossibleMatches("asset", "1");
    expect(result.remainingAmount).toBe(500);
  });

  it("defaults remainingAmount to 0 when the response carries neither field", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { list: [] } },
    });
    const result = await fetchPossibleMatches("expense", "1");
    expect(result.remainingAmount).toBe(0);
  });

  it("builds the same /:type/:id route for a liability or an equity entry", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { list: [] } },
    });

    await fetchPossibleMatches("liability", "42");
    expect(apiMock.get.mock.calls[0][0]).toBe(
      `${apiRoutes.bankTransaction.fetchPossibleMatchTransaction}/liability/42`,
    );

    await fetchPossibleMatches("equity", "7");
    expect(apiMock.get.mock.calls[1][0]).toBe(
      `${apiRoutes.bankTransaction.fetchPossibleMatchTransaction}/equity/7`,
    );
  });

  it("builds /possible-matches/invoice/:id — the same route the invoice list's own fetch used", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { list: [] } },
    });
    await fetchPossibleMatches("invoice", "123");
    expect(apiMock.get.mock.calls[0][0]).toBe(
      `${apiRoutes.bankTransaction.fetchPossibleMatchTransaction}/invoice/123`,
    );
  });
});

describe("filterMatchCandidates", () => {
  const candidates = [
    candidate({ id: "1", description: "AMP SUPER CONTRIBUTION", amount: 1212 }),
    candidate({ id: "2", description: "HOSTPLUS PAYMENT", amount: 56 }),
  ];

  it("returns everything for an empty query", () => {
    expect(filterMatchCandidates(candidates, "")).toEqual(candidates);
    expect(filterMatchCandidates(candidates, "   ")).toEqual(candidates);
  });

  it("matches the description, case-insensitively", () => {
    const result = filterMatchCandidates(candidates, "hostplus");
    expect(result.map((c) => c.id)).toEqual(["2"]);
  });

  it("matches the amount as a substring", () => {
    const result = filterMatchCandidates(candidates, "1212");
    expect(result.map((c) => c.id)).toEqual(["1"]);
  });
});

describe("matchSelectionTotals", () => {
  it("sums the selection and clamps remaining at zero", () => {
    const selected = [candidate({ amount: 700 }), candidate({ amount: 500 })];
    const totals = matchSelectionTotals(1000, selected);
    expect(totals.selectedTotal).toBe(1200);
    expect(totals.remaining).toBe(0);
    expect(totals.settled).toBe(true);
  });

  it("reports the true remainder when the selection doesn't cover it", () => {
    const totals = matchSelectionTotals(1000, [candidate({ amount: 400 })]);
    expect(totals.remaining).toBe(600);
    expect(totals.settled).toBe(false);
  });

  it("settles within the same cents tolerance the rest of the module uses", () => {
    const totals = matchSelectionTotals(1000, [candidate({ amount: 999.999 })]);
    expect(totals.settled).toBe(true);
  });
});

describe("matchSingleTransaction", () => {
  it("POSTs an encrypted body with bank_transaction_id and expenses[] for an expense", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await matchSingleTransaction("expense", "89276", "501");

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.setMatchExpenses);
    expect(decryptedFieldsFromBody(body)).toEqual({
      bank_transaction_id: "501",
      expenses: ["89276"],
    });
  });

  it("sends assets[] instead of expenses[] for an asset", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await matchSingleTransaction("asset", "10", "501");
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toEqual({ bank_transaction_id: "501", assets: ["10"] });
  });

  it("hits setMatchLiability with liabilities[] for a liability — a genuinely different endpoint, not just a wider type", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await matchSingleTransaction("liability", "42", "501");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.setMatchLiability);
    expect(decryptedFieldsFromBody(body)).toEqual({
      bank_transaction_id: "501",
      liabilities: ["42"],
    });
  });

  it("hits setMatchEquity with equities[] for equity", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await matchSingleTransaction("equity", "7", "501");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.setMatchEquity);
    expect(decryptedFieldsFromBody(body)).toEqual({
      bank_transaction_id: "501",
      equities: ["7"],
    });
  });

  it("hits setMatchInvoices with Number-coerced ids and invoices[] — matches the invoice list's own match call exactly", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await matchSingleTransaction("invoice", "42", "501");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.setMatchInvoices);
    expect(decryptedFieldsFromBody(body)).toEqual({
      bank_transaction_id: 501,
      invoices: [42],
    });
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Transaction already matched" },
    });
    await expect(
      matchSingleTransaction("expense", "1", "2"),
    ).rejects.toThrow("Transaction already matched");
  });

  it("throws when the server returns a shortfall/overpayment status instead of a plain success", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        status: "writeoff_prompt",
        message: "Shortfall exceeds tolerance.",
      },
    });
    await expect(
      matchSingleTransaction("expense", "1", "2"),
    ).rejects.toThrow("Shortfall exceeds tolerance.");
  });
});

describe("matchMultipleTransactions", () => {
  it("POSTs an encrypted body with transaction_ids, entry_id and type", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await matchMultipleTransactions("expense", "89276", ["501", "502"]);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.matchMultipleExpensesAssets);
    expect(decryptedFieldsFromBody(body)).toEqual({
      transaction_ids: ["501", "502"],
      entry_id: "89276",
      type: "expense",
    });
  });

  it("hits setMultipleLiability with liability_id — not entry_id/type like expense/asset — for a liability", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await matchMultipleTransactions("liability", "42", ["501", "502"]);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.setMultipleLiability);
    expect(decryptedFieldsFromBody(body)).toEqual({
      transaction_ids: ["501", "502"],
      liability_id: "42",
    });
  });

  it("hits setMultipleEquity with equity_id for equity", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await matchMultipleTransactions("equity", "7", ["501"]);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.setMultipleEquity);
    expect(decryptedFieldsFromBody(body)).toEqual({
      transaction_ids: ["501"],
      equity_id: "7",
    });
  });

  it("hits setMultipleInvoices with invoice_id — not entry_id/type — for an invoice", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await matchMultipleTransactions("invoice", "42", ["501", "502"]);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.setMultipleInvoices);
    expect(decryptedFieldsFromBody(body)).toEqual({
      transaction_ids: ["501", "502"],
      invoice_id: "42",
    });
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "entry_id is required." },
    });
    await expect(
      matchMultipleTransactions("expense", "1", ["2"]),
    ).rejects.toThrow("entry_id is required.");
  });
});

describe("undoMatchTransaction", () => {
  it("prefers journal_entry_id when one is given — the same field sole-webapp's own undo sends", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await undoMatchTransaction("expense", "89276", "156660");

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bankTransaction.undoMatchTransaction);
    expect(decryptedFieldsFromBody(body)).toEqual({
      journal_entry_id: "156660",
    });
  });

  it("falls back to the record's own type, e.g. expense_id, with no journal entry id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await undoMatchTransaction("expense", "89276");

    const [, body] = apiMock.post.mock.calls[0];
    expect(decryptedFieldsFromBody(body)).toEqual({ expense_id: "89276" });
  });

  it("also falls back when the journal entry id is explicitly null", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await undoMatchTransaction("expense", "89276", null);
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toEqual({ expense_id: "89276" });
  });

  it("keys the body by asset_id for an asset", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await undoMatchTransaction("asset", "10");
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toEqual({ asset_id: "10" });
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Journal entry not found for this transaction." },
    });
    await expect(undoMatchTransaction("expense", "1")).rejects.toThrow(
      "Journal entry not found for this transaction.",
    );
  });
});
