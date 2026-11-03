import { describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const {
  fetchPossibleAssetMatches,
  matchAssetToTransactionApi,
  matchAssetToMultipleTransactionsApi,
  undoAssetMatchApi,
  bulkUndoAssetMatchesApi,
} = await import("@/lib/asset-match");

describe("fetchPossibleAssetMatches", () => {
  it("GETs the asset-scoped endpoint and maps the candidate list", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          list: [
            {
              id: 501,
              transaction_date: "2026-06-01",
              description: "EFTPOS Harvey Norman",
              amount: "1249.00",
              available_amount: "1249.00",
            },
          ],
          asset_remaining_amount: "1249.00",
        },
      },
    });

    const result = await fetchPossibleAssetMatches("42");

    expect(apiMock.get).toHaveBeenCalledWith(
      `${apiRoutes.bankTransaction.fetchPossibleMatchTransaction}/asset/42`,
    );
    expect(result).toEqual({
      transactions: [
        {
          id: "501",
          date: "2026-06-01",
          description: "EFTPOS Harvey Norman",
          amount: "1249.00",
          availableAmount: "1249.00",
        },
      ],
      remainingAmount: "1249.00",
    });
  });

  it("returns an empty list rather than throwing when nothing comes back", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    const result = await fetchPossibleAssetMatches("42");
    expect(result).toEqual({ transactions: [], remainingAmount: "0" });
  });

  it("passes multiple_match_mode when widening the candidate list", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    await fetchPossibleAssetMatches("42", true);
    expect(apiMock.get).toHaveBeenCalledWith(
      `${apiRoutes.bankTransaction.fetchPossibleMatchTransaction}/asset/42`,
      { params: { multiple_match_mode: true } },
    );
  });
});

describe("matchAssetToMultipleTransactionsApi", () => {
  it("posts type/entry_id/transaction_ids and maps the response", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { remaining_amount: "0.00", matches: [{}, {}] },
      },
    });
    const result = await matchAssetToMultipleTransactionsApi("42", ["1", "2"]);
    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.bankTransaction.matchMultipleExpensesAssets,
      { type: "asset", entry_id: "42", transaction_ids: ["1", "2"] },
    );
    expect(result).toEqual({ remainingAmount: 0, matchedCount: 2 });
  });

  it("throws with the server's message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Transaction already reconciled" },
    });
    await expect(
      matchAssetToMultipleTransactionsApi("42", ["1"]),
    ).rejects.toThrow("Transaction already reconciled");
  });
});

describe("matchAssetToTransactionApi", () => {
  it("posts the asset id inside an array, alongside the transaction id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const result = await matchAssetToTransactionApi("42", "501");
    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.bankTransaction.setMatchExpenses,
      { bank_transaction_id: "501", assets: ["42"] },
    );
    expect(result).toEqual({ status: "matched" });
  });

  it("surfaces a writeoff_prompt instead of throwing", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        status: "writeoff_prompt",
        difference: "-12.34",
        message: "This falls short of the transaction amount.",
      },
    });
    const result = await matchAssetToTransactionApi("42", "501");
    expect(result).toEqual({
      status: "writeoff_prompt",
      difference: "-12.34",
      message: "This falls short of the transaction amount.",
    });
  });

  it("throws with the server's message on a genuine failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Asset is already matched" },
    });
    await expect(matchAssetToTransactionApi("42", "501")).rejects.toThrow(
      "Asset is already matched",
    );
  });
});

describe("undoAssetMatchApi", () => {
  it("posts the asset id to the shared undo endpoint", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await undoAssetMatchApi("42");
    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.bankTransaction.undoMatchTransaction,
      { asset_id: "42" },
    );
  });

  it("throws with the server's message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Nothing to undo" },
    });
    await expect(undoAssetMatchApi("42")).rejects.toThrow("Nothing to undo");
  });
});

describe("undoAssetMatchApi when the backend refuses with an error status", () => {
  it("passes on the backend's own reason, not axios's 'status code 404'", async () => {
    const { AxiosError } = await import("axios");
    apiMock.post.mockRejectedValue(
      new AxiosError(
        "Request failed with status code 404",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 404,
          data: { success: false, message: "Matched journal entry not found." },
        } as never,
      ),
    );
    await expect(undoAssetMatchApi("42")).rejects.toThrow(
      "Matched journal entry not found.",
    );
  });
});

describe("bulkUndoAssetMatchesApi", () => {
  it("posts asset_ids and splits the response into succeeded/failed", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        message: "Bulk asset undo match completed.",
        data: { succeeded: [1, 2], failed: [3] },
      },
    });
    const result = await bulkUndoAssetMatchesApi(["1", "2", "3"]);
    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.bankTransaction.bulkUndoMatchTransaction,
      { asset_ids: ["1", "2", "3"] },
    );
    expect(result).toEqual({ succeeded: ["1", "2"], failed: ["3"] });
  });

  it("throws with the server's message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "No matched assets selected" },
    });
    await expect(bulkUndoAssetMatchesApi(["1"])).rejects.toThrow(
      "No matched assets selected",
    );
  });
});
