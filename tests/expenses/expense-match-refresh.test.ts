/**
 * Reopening Match on an expense after a partial match must show the new
 * remaining amount, not the one from before. The app caches queries for five
 * minutes by default (components/providers.tsx), which is what kept the old
 * figure on screen; the match dialogs' query opts out of that.
 */
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/utils/axiosInstance", () => ({ default: { get, post: vi.fn() } }));

const { possibleMatchesQuery } = await import("@/lib/bank-match");

/** The server's answer for an expense with `remaining` still to match. */
function answer(remaining: number, ids: number[] = [1]) {
  return {
    data: {
      success: true,
      data: {
        expense_remaining_amount: remaining,
        list: ids.map((id) => ({ id, transaction_date: "2026-11-01", amount: 50, available_amount: 50, description: `Txn ${id}` })),
      },
    },
  };
}

/** The same defaults the app's QueryClient uses. */
const appClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000, retry: false } } });

/** Opens the dialog's query, waits for it to settle, and closes it again. */
async function open(client: QueryClient) {
  const observer = new QueryObserver(client, possibleMatchesQuery("expense", "42", false));
  const result = await new Promise<ReturnType<typeof observer.getCurrentResult>>((resolve) => {
    const unsubscribe = observer.subscribe((next) => {
      if (next.status === "success" && next.fetchStatus === "idle") {
        unsubscribe();
        resolve(next);
      }
    });
  });
  return result.data!;
}

afterEach(() => get.mockReset());

describe("the match dialog's possible matches", () => {
  it("shows the new remaining amount when reopened after a partial match", async () => {
    const client = appClient();
    get.mockResolvedValueOnce(answer(100, [1, 2]));
    expect((await open(client)).remainingAmount).toBe(100);

    // A $40 match is made and the dialog closed; the server now says $60.
    get.mockResolvedValueOnce(answer(60, [2]));
    const reopened = await open(client);

    expect(get).toHaveBeenCalledTimes(2);
    expect(reopened.remainingAmount).toBe(60);
    expect(reopened.candidates.map((c) => c.id)).toEqual(["2"]);
  });

  it("keeps nothing once the dialog is closed", async () => {
    const client = appClient();
    get.mockResolvedValueOnce(answer(100));
    await open(client);
    // gcTime 0: dropped as soon as nothing is watching it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryData(possibleMatchesQuery("expense", "42", false).queryKey)).toBeUndefined();
  });

  it("is keyed per entry and per tab", () => {
    expect(possibleMatchesQuery("expense", "42", false).queryKey).toEqual(["possible-matches", "expense", "42", false]);
    expect(possibleMatchesQuery("asset", "7", true).queryKey).toEqual(["possible-matches", "asset", "7", true]);
  });
});
