// @vitest-environment node
/**
 * Super contributions — what happens after a match.
 *
 *  - The match dialog's candidate list must never be replayed from cache.
 *    It used to be, so reopening the dialog after a (partial) match showed
 *    the very transaction just matched on both tabs, with the old remaining
 *    and matched figures.
 *  - A match closes the dialog *before* refreshing the list and the cards,
 *    so the refetch happens where it can be seen rather than behind the
 *    modal.
 *  - The super screen shows its table and card skeletons while that
 *    refetch (or the one after creating/editing/deleting) is in flight.
 *
 * Rendered to markup, the way `tests/quick-actions/time-tracker-card.render.test.ts`
 * renders its card — this repo has no DOM test environment, so the clicks
 * themselves aren't simulated; the states they lead to are.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { possibleMatchesQuery, refreshAfterMatch } = await import("@/lib/bank-match");
const { SuperScreen } = await import("@/components/super/super-screen");
const { TooltipProvider } = await import("@/components/ui/tooltip");

import type { Contribution } from "@/lib/super";

/** The app's own defaults (components/providers.tsx) — the ones that made the dialog replay its cache. */
function appQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      },
    },
  });
}

function candidatesResponse(ids: string[], remaining: number) {
  return {
    data: {
      success: true,
      data: {
        list: ids.map((id) => ({
          id,
          transaction_date: "2026-10-01",
          description: `Payment ${id}`,
          reference: null,
          amount: "100",
          available_amount: "100",
        })),
        expense_remaining_amount: remaining,
      },
    },
  };
}

/** Lets gcTime: 0's removal timer (a zero-delay setTimeout) run. */
const flushTimers = () => new Promise((resolve) => setTimeout(resolve, 5));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("possibleMatchesQuery", () => {
  it("keys each record and each tab separately", () => {
    expect(possibleMatchesQuery("expense", "42", false).queryKey).toEqual([
      "possible-matches",
      "expense",
      "42",
      false,
    ]);
    expect(possibleMatchesQuery("expense", "42", true).queryKey).toEqual([
      "possible-matches",
      "expense",
      "42",
      true,
    ]);
  });

  it("opts out of the app-wide 5-minute cache", () => {
    const options = possibleMatchesQuery("expense", "42", false);
    expect(options.staleTime).toBe(0);
    expect(options.gcTime).toBe(0);
  });

  it("drops the list once the dialog closes, so reopening after a match starts from the loader with a fresh list", async () => {
    const client = appQueryClient();
    const options = possibleMatchesQuery("expense", "42", false);

    // First open: two candidates, 300 still owing.
    apiMock.get.mockResolvedValueOnce(candidatesResponse(["t1", "t2"], 300));
    const firstOpen = new QueryObserver(client, options);
    const unsubscribe = firstOpen.subscribe(() => {});
    await vi.waitFor(() => expect(firstOpen.getCurrentResult().isSuccess).toBe(true));
    expect(firstOpen.getCurrentResult().data?.candidates.map((c) => c.id)).toEqual(["t1", "t2"]);

    // Match t1 and close the dialog.
    unsubscribe();
    await flushTimers();
    expect(client.getQueryCache().find({ queryKey: options.queryKey })).toBeUndefined();

    // Reopen: no cached rows to flash up — the loader shows until the
    // server's post-match answer arrives, without t1 and with 200 owing.
    let resolveSecond!: (value: unknown) => void;
    apiMock.get.mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    const reopened = new QueryObserver(client, options);
    const unsubscribeAgain = reopened.subscribe(() => {});
    expect(reopened.getCurrentResult().isLoading).toBe(true);
    expect(reopened.getCurrentResult().data).toBeUndefined();

    resolveSecond(candidatesResponse(["t2"], 200));
    await vi.waitFor(() => expect(reopened.getCurrentResult().isSuccess).toBe(true));
    expect(reopened.getCurrentResult().data?.candidates.map((c) => c.id)).toEqual(["t2"]);
    expect(reopened.getCurrentResult().data?.remainingAmount).toBe(200);
    expect(apiMock.get).toHaveBeenCalledTimes(2);
    unsubscribeAgain();
  });

  it("refetches the Assign to multiple tab too, rather than reusing its earlier list", async () => {
    const client = appQueryClient();
    const multiple = possibleMatchesQuery("expense", "42", true);

    apiMock.get.mockResolvedValueOnce(candidatesResponse(["t1", "t2", "t3"], 300));
    const before = new QueryObserver(client, multiple);
    const unsubscribe = before.subscribe(() => {});
    await vi.waitFor(() => expect(before.getCurrentResult().isSuccess).toBe(true));
    unsubscribe();
    await flushTimers();

    apiMock.get.mockResolvedValueOnce(candidatesResponse(["t2", "t3"], 200));
    const after = new QueryObserver(client, multiple);
    const unsubscribeAgain = after.subscribe(() => {});
    await vi.waitFor(() => expect(after.getCurrentResult().isSuccess).toBe(true));
    expect(after.getCurrentResult().data?.candidates.map((c) => c.id)).toEqual(["t2", "t3"]);
    expect(apiMock.get).toHaveBeenLastCalledWith(
      expect.stringContaining("/expense/42"),
      { params: { multiple_match_mode: "true" } },
    );
    unsubscribeAgain();
  });
});

describe("refreshAfterMatch", () => {
  const LIST_KEY = ["super-contributions", 1, 25, ""];
  const MATRIX_KEY = ["super-contribution-matrix", "year"];

  /** The super screen's list and cards, on screen, logging when each fetches. */
  function onScreen(client: QueryClient, log: string[]) {
    const pending: Array<() => void> = [];
    const observe = (queryKey: unknown[], name: string) => {
      client.setQueryData(queryKey, { seeded: true });
      const observer = new QueryObserver(client, {
        queryKey,
        queryFn: () =>
          new Promise((resolve) => {
            log.push(`fetch:${name}`);
            pending.push(() => resolve({ seeded: false }));
          }),
      });
      observer.subscribe(() => {});
      return observer;
    };
    return {
      list: observe(LIST_KEY, "list"),
      matrix: observe(MATRIX_KEY, "matrix"),
      settle: () => pending.forEach((resolve) => resolve()),
    };
  }

  it("closes the dialog before the list and the cards start refetching", () => {
    const client = appQueryClient();
    const log: string[] = [];
    onScreen(client, log);

    refreshAfterMatch(client, [["super-contributions"], ["super-contribution-matrix"]], () =>
      log.push("close"),
    );

    expect(log).toEqual(["close", "fetch:list", "fetch:matrix"]);
  });

  it("doesn't wait for the refetch — both are still in flight when it returns, which is what the screen shows a skeleton for", async () => {
    const client = appQueryClient();
    const screen = onScreen(client, []);

    const returned = refreshAfterMatch(
      client,
      [["super-contributions"], ["super-contribution-matrix"]],
      () => {},
    );

    expect(returned).toBeUndefined();
    expect(screen.list.getCurrentResult().isFetching).toBe(true);
    expect(screen.matrix.getCurrentResult().isFetching).toBe(true);

    screen.settle();
    await vi.waitFor(() => expect(screen.list.getCurrentResult().isFetching).toBe(false));
    expect(screen.matrix.getCurrentResult().isFetching).toBe(false);
  });

  it("only refreshes the keys it's given", () => {
    const client = appQueryClient();
    const log: string[] = [];
    onScreen(client, log);

    refreshAfterMatch(client, [["super-contribution-matrix"]], () => log.push("close"));

    expect(log).toEqual(["close", "fetch:matrix"]);
  });
});

describe("SuperScreen loading", () => {
  const LIST_KEY = ["super-contributions", 1, 25, ""];
  const MATRIX_KEY = ["super-contribution-matrix", "year"];

  const contribution: Contribution = {
    id: "1",
    fundId: "116",
    fundName: "AMP Super",
    date: "2026-09-10",
    amount: "500",
    notes: "",
    taxDeduction: false,
    matches: [{ transactionId: "t1", reference: "T1", amount: 200 }],
    possibleMatch: 0,
  };

  const matrix = {
    has_previous_data: false,
    cards_data: [
      { key: "total_contributions", total_amount: 500, percentage_change: 0 },
      { key: "matched_contributions", total_amount: 200, percentage_change: 0 },
      { key: "pending_contributions", total_amount: 300, percentage_change: 0 },
    ],
  };

  /** Seeds the list and the cards, optionally mid-refetch the way a match or a create leaves them. */
  function seeded({ listRefetching = false, matrixRefetching = false } = {}) {
    const client = appQueryClient();
    client.setQueryData(LIST_KEY, { contributions: [contribution], total: 1 });
    client.setQueryData(MATRIX_KEY, matrix);
    const never = () => new Promise<never>(() => {});
    if (listRefetching) void client.fetchQuery({ queryKey: LIST_KEY, queryFn: never, staleTime: 0 });
    if (matrixRefetching) void client.fetchQuery({ queryKey: MATRIX_KEY, queryFn: never, staleTime: 0 });
    return client;
  }

  const render = (client: QueryClient) =>
    renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(TooltipProvider, null, React.createElement(SuperScreen)),
      ),
    );

  // The table's skeleton rows and the cards' skeleton figures, told apart by
  // their own placeholder sizes (super-table.tsx / stat-cards.tsx).
  const tableSkeleton = (html: string) => html.includes("h-4 w-28");
  const cardSkeleton = (html: string) => html.includes("h-6 w-24");

  it("shows the rows and figures once nothing is in flight", () => {
    const html = render(seeded());
    expect(tableSkeleton(html)).toBe(false);
    expect(cardSkeleton(html)).toBe(false);
    expect(html).toContain("AMP Super");
    expect(html).toContain("$200.00");
  });

  it("shows both skeletons while the list and the cards refetch after a match", () => {
    const html = render(seeded({ listRefetching: true, matrixRefetching: true }));
    expect(tableSkeleton(html)).toBe(true);
    expect(cardSkeleton(html)).toBe(true);
    // The header and period tabs stay put — only the parts being refreshed shimmer.
    expect(html).toContain("Super contributions");
  });

  it("shows the table skeleton alone when only the list is refetching", () => {
    const html = render(seeded({ listRefetching: true }));
    expect(tableSkeleton(html)).toBe(true);
    expect(cardSkeleton(html)).toBe(false);
  });

  it("shows the card skeletons alone when only the cards are refetching", () => {
    const html = render(seeded({ matrixRefetching: true }));
    expect(tableSkeleton(html)).toBe(false);
    expect(cardSkeleton(html)).toBe(true);
  });
});
