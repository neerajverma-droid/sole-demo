import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  bulkDeleteIssue,
  bulkDeleteMessage,
  bulkDeleteSelection,
  deleteUnmatchedTransactionsApi,
  mapMatchedRow,
  mapUnmatchedRow,
} = await import("@/lib/bank-transactions");

function decrypted(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

/** An unmatched line as the bank-transactions API sends it. */
function apiRow(id: number, source: string) {
  return mapUnmatchedRow({
    bank_transacton_id: id,
    source,
    amount: "-50",
    direction: "debit",
    transaction_date: "2026-09-01",
    description: `Line ${id}`,
  });
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

describe("bulk delete — which rows can go", () => {
  it("marks bank feed lines as not deletable and everything else as deletable", () => {
    expect(apiRow(1, "bank_feed").deletable).toBe(false);
    expect(apiRow(2, "manual_upload").deletable).toBe(true);
    expect(apiRow(3, "paid_with_cash").deletable).toBe(true);
    // Anything the feed didn't send is the user's own record.
    expect(apiRow(4, "something_new").deletable).toBe(true);
  });

  it("never offers a matched line for deletion", () => {
    expect(mapMatchedRow({ id: 9, source: "manual_upload" }).deletable).toBe(false);
  });

  it("splits a mixed selection, keeping the order it was ticked in", () => {
    const rows = [
      apiRow(1, "manual_upload"),
      apiRow(2, "bank_feed"),
      apiRow(3, "paid_with_cash"),
      apiRow(4, "bank_feed"),
    ];
    expect(bulkDeleteSelection(rows)).toEqual({
      deletableIds: ["1", "3"],
      bankFeedIds: ["2", "4"],
    });
  });

  it("treats a row without the flag as deletable, as the table's per-row Delete does", () => {
    expect(bulkDeleteSelection([{ id: "7" }])).toEqual({
      deletableIds: ["7"],
      bankFeedIds: [],
    });
  });

  it("returns empty lists for an empty selection", () => {
    expect(bulkDeleteSelection([])).toEqual({ deletableIds: [], bankFeedIds: [] });
  });
});

describe("bulk delete — what stops it", () => {
  it("asks for a selection when nothing is ticked", () => {
    expect(bulkDeleteIssue({ deletableIds: [], bankFeedIds: [] })).toBe(
      "Please select any bank transaction first then you can perform bulk action.",
    );
  });

  it("refuses a selection made only of bank feed lines", () => {
    expect(bulkDeleteIssue({ deletableIds: [], bankFeedIds: ["1", "2"] })).toBe(
      "Bank feed transactions can't be deleted. Please deselect them and try again.",
    );
  });

  it("lets a mixed or all-deletable selection through", () => {
    expect(bulkDeleteIssue({ deletableIds: ["1"], bankFeedIds: ["2"] })).toBeNull();
    expect(bulkDeleteIssue({ deletableIds: ["1", "3"], bankFeedIds: [] })).toBeNull();
  });
});

describe("bulk delete — the confirmation", () => {
  it("counts the selection when every line can be deleted", () => {
    expect(bulkDeleteMessage({ deletableIds: ["1", "2", "3"], bankFeedIds: [] })).toBe(
      "Do you want to delete the selected 3 transaction(s)? This action cannot be undone.",
    );
  });

  it("names the bank feed lines that will be left behind", () => {
    expect(
      bulkDeleteMessage({ deletableIds: ["1", "3", "5"], bankFeedIds: ["2", "4"] }),
    ).toBe(
      "2 of the 5 selected transaction(s) come from a bank feed and can't be deleted. Do you want to delete the remaining 3 transaction(s)? This action cannot be undone.",
    );
  });
});

describe("bulk delete — the request", () => {
  it("posts every deletable id to the bulk endpoint in one call", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, message: "Transactions deleted successfully." },
    });

    const message = await deleteUnmatchedTransactionsApi(["1", "3"]);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post.mock.calls[0][0]).toBe(
      apiRoutes.bankTransaction.bulkDeleteUnmatchedTransaction,
    );
    expect(apiRoutes.bankTransaction.bulkDeleteUnmatchedTransaction).toMatch(
      /\/v2\/bank\/bulk-transaction-delete$/,
    );
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({
      transaction_ids: ["1", "3"],
    });
    expect(message).toBe("Transactions deleted successfully.");
  });

  it("sends only the deletable half of a mixed selection", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const rows = [apiRow(1, "bank_feed"), apiRow(2, "manual_upload"), apiRow(3, "bank_feed")];

    await deleteUnmatchedTransactionsApi(bulkDeleteSelection(rows).deletableIds);

    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({ transaction_ids: ["2"] });
  });

  it("returns an empty message when the server sends none", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(deleteUnmatchedTransactionsApi(["1"])).resolves.toBe("");
  });

  it("throws the server's message when it refuses", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Transaction 3 is already matched" },
    });
    await expect(deleteUnmatchedTransactionsApi(["3"])).rejects.toThrow(
      "Transaction 3 is already matched",
    );
  });

  it("falls back to its own message when the server gives no reason", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(deleteUnmatchedTransactionsApi(["3"])).rejects.toThrow(
      "Couldn't delete the transactions.",
    );
  });

  it("lets a network failure through to the caller", async () => {
    apiMock.post.mockRejectedValue(new Error("Network Error"));
    await expect(deleteUnmatchedTransactionsApi(["1"])).rejects.toThrow("Network Error");
  });

  it("never calls the server with nothing to delete", async () => {
    await expect(deleteUnmatchedTransactionsApi([])).rejects.toThrow(
      "Please select any bank transaction first then you can perform bulk action.",
    );
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
