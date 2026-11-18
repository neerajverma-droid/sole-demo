/**
 * The Transactions module changes, end to end where Node can reach:
 *
 * - the list's loading state — skeleton after an action, fade on a page change
 * - the open tab kept in the URL (`?status=`), so a refresh keeps it
 * - Undo from the details modal, on the Matched list's own rule
 * - the split lines: server Undo where there's a journal entry, and no wrapping
 *   in the cells that ran into each other
 * - the table skeletons' real column headings
 * - the search term going to the server as typed
 *
 * Bulk delete has its own file (bulk-delete.test.ts); the backend's reading of
 * the search lives in sole-ocr (tests/unit/utils/transactionSearch.test.js).
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  filterFromStatusParam,
  listLoadState,
  listQueryParams,
  mapMatchedRow,
  mapUnmatchedRow,
  tabForFilter,
  transactionsTabHref,
} = await import("@/lib/bank-transactions");
const { isEntryId, undoModeFor } = await import("@/lib/transactions");
const { TransactionSplitRows } = await import(
  "@/components/transactions/transaction-splits"
);
const { TableSkeleton } = await import(
  "@/components/transactions/transactions-table"
);

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

/** A matched credit split across a sale and its GST, as the API sends it. */
function splitSale(entries: Array<number | null> = [157095, 157095]) {
  return mapMatchedRow({
    id: 2411516,
    transaction_date: "2026-10-22",
    amount: 115,
    direction: "credit",
    description: "Test desc",
    data: [
      { entry_id: entries[0], name: "Sales Income", amount: 100, item_code: "QST-5", reference_type: "invoice", client_name: "Gaurav Lakhera" },
      { entry_id: entries[1], name: "GST Payable", amount: 15, item_code: "QST-5", reference_type: "invoice", client_name: "Gaurav Lakhera" },
    ],
  });
}

function render(element: React.ReactElement): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, element),
  );
}

/* ------------------------------------------------------------------ */

describe("list loading — skeleton or fade", () => {
  it("shows the skeleton on the first load", () => {
    expect(
      listLoadState({ isPending: true, isFetching: true, isPlaceholderData: false }),
    ).toEqual({ loading: true, fetching: false });
  });

  it("shows the skeleton while the list refetches after an undo or delete", () => {
    // Same list, real data on screen, refetching after an invalidation.
    expect(
      listLoadState({ isPending: false, isFetching: true, isPlaceholderData: false }),
    ).toEqual({ loading: true, fetching: false });
  });

  it("keeps the previous page on screen, faded, while the next page loads", () => {
    expect(
      listLoadState({ isPending: false, isFetching: true, isPlaceholderData: true }),
    ).toEqual({ loading: false, fetching: true });
  });

  it("shows the rows once settled", () => {
    expect(
      listLoadState({ isPending: false, isFetching: false, isPlaceholderData: false }),
    ).toEqual({ loading: false, fetching: false });
  });
});

/* ------------------------------------------------------------------ */

describe("the open tab survives a refresh", () => {
  it("writes ?status=matched for the Matched tab", () => {
    expect(transactionsTabHref("/transactions", "", "Matched")).toBe(
      "/transactions?status=matched",
    );
  });

  it("drops the param for Unmatched, the default", () => {
    expect(transactionsTabHref("/transactions", "status=matched", "Review")).toBe(
      "/transactions",
    );
  });

  it("keeps a deep link's other params when the tab changes", () => {
    expect(
      transactionsTabHref("/transactions", "search=2411516&amount=115&status=matched", "Review"),
    ).toBe("/transactions?search=2411516&amount=115");
    expect(transactionsTabHref("/transactions", "search=stripe", "Matched")).toBe(
      "/transactions?search=stripe&status=matched",
    );
  });

  it("writes the Personal and Transfer views too, both on the matched tab", () => {
    expect(transactionsTabHref("/transactions", "", "Personal")).toBe(
      "/transactions?status=personal",
    );
    expect(tabForFilter("Personal")).toBe("matched");
    expect(tabForFilter("Transfer")).toBe("matched");
  });

  it("reads the param back on load, whatever its case", () => {
    expect(filterFromStatusParam("matched")).toBe("Matched");
    expect(filterFromStatusParam("MATCHED")).toBe("Matched");
    expect(filterFromStatusParam("review")).toBe("Review");
    expect(filterFromStatusParam("personal")).toBe("Personal");
  });

  it("ignores a missing or unknown param, leaving the tab as it is", () => {
    expect(filterFromStatusParam(null)).toBeNull();
    expect(filterFromStatusParam("")).toBeNull();
    expect(filterFromStatusParam("archived")).toBeNull();
  });

  it("round-trips: the URL written for each tab reads back as that tab", () => {
    for (const filter of ["Review", "Matched", "Personal", "Transfer"] as const) {
      const href = transactionsTabHref("/transactions", "", filter);
      const status = new URL(href, "https://app.test").searchParams.get("status");
      expect(filterFromStatusParam(status) ?? "Review").toBe(filter);
    }
  });
});

/* ------------------------------------------------------------------ */

describe("Undo from the details modal follows the Matched list", () => {
  it("undoes a multi-line match line by line", () => {
    expect(undoModeFor(splitSale())).toBe("line");
  });

  it("undoes a single-line match from the transaction", () => {
    const single = mapMatchedRow({
      id: 9,
      amount: 50,
      direction: "debit",
      data: [{ entry_id: 3, name: "Office supplies", amount: 50 }],
    });
    expect(undoModeFor(single)).toBe("whole");
  });

  it("undoes a personal or transfer mark from the transaction, whatever its lines", () => {
    expect(undoModeFor({ ...splitSale(), personal: true })).toBe("whole");
    expect(
      undoModeFor({ ...splitSale(), transfer: { counterAccount: "", pairedId: null } }),
    ).toBe("whole");
  });

  it("offers no Undo on an unmatched transaction", () => {
    const unmatched = mapUnmatchedRow({ bank_transacton_id: 4, source: "manual_upload", amount: 10, direction: "credit" });
    expect(undoModeFor(unmatched)).toBeNull();
  });

  it("only points a line's Undo at a real journal entry", () => {
    expect(isEntryId("157095")).toBe(true);
    expect(isEntryId("")).toBe(false);
    expect(isEntryId("split-1")).toBe(false);
    expect(isEntryId("12a")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("split lines in the details modal", () => {
  it("shows a server Undo on each line with a journal entry", () => {
    const html = render(
      React.createElement(TransactionSplitRows, {
        transaction: splitSale(),
        onUndo: () => {},
      }),
    );
    expect(html.match(/>Undo<\/button>|Undo<\/button>/g)).toHaveLength(2);
    expect(html).not.toContain(">--<");
  });

  it("shows -- instead of Undo on a line with nothing to undo against", () => {
    const transaction = splitSale();
    transaction.splits[1] = { ...transaction.splits[1], id: "draft-line" };
    const html = render(
      React.createElement(TransactionSplitRows, { transaction, onUndo: () => {} }),
    );
    expect(html.match(/Undo<\/button>/g)).toHaveLength(1);
    expect(html).toContain(">--<");
  });

  it("keeps the old draft-line Undo where no server Undo is given", () => {
    const transaction = splitSale();
    transaction.splits[1] = { ...transaction.splits[1], id: "draft-line" };
    const html = render(React.createElement(TransactionSplitRows, { transaction }));
    expect(html.match(/Undo<\/button>/g)).toHaveLength(2);
  });

  it("keeps the category pills, date and amount on one line so the tag can't run into Reference number", () => {
    const html = render(
      React.createElement(TransactionSplitRows, { transaction: splitSale(), onUndo: () => {} }),
    );
    // The pill pair, the category pill itself, the date and the amount.
    expect(html).toMatch(/class="flex items-center gap-1\.5 whitespace-nowrap"/);
    expect(html).toMatch(/inline-flex shrink-0 whitespace-nowrap rounded-md border[^"]*">Sales Income</);
    expect(html).toMatch(/whitespace-nowrap py-2 tabular">22 Oct 2026</);
    expect(html).toMatch(/whitespace-nowrap py-2 text-right font-medium tabular">[^<]*100\.00</);
  });

  it("totals the lines in the footer", () => {
    const html = render(
      React.createElement(TransactionSplitRows, { transaction: splitSale(), onUndo: () => {} }),
    );
    expect(html).toContain("2 lines");
    expect(html).not.toContain("unallocated");
  });
});

/* ------------------------------------------------------------------ */

describe("table skeletons", () => {
  it("draws the table's own headings over shimmer rows, with a checkbox and Actions column", () => {
    const html = render(
      React.createElement(TableSkeleton, {
        columns: ["TXN date", "Description", "Type", "TXN Amt"],
      }),
    );
    for (const heading of ["TXN date", "Description", "Type", "TXN Amt", "Actions"]) {
      expect(html).toContain(`>${heading}</th>`);
    }
    // Six placeholder rows, each with the checkbox, the four columns and Actions.
    expect(html.match(/<tr/g)).toHaveLength(7);
    expect(html.match(/<td/g)).toHaveLength(6 * 6);
  });
});

/* ------------------------------------------------------------------ */

describe("search goes to the server as typed", () => {
  const base = { page: 1, pageSize: 10, period: "FY 26/27" };

  it("sends an amount, formatted or not, for the server to read", () => {
    for (const term of ["NZ$1,212.00", "-120.50", "1212"]) {
      expect(
        listQueryParams({ ...base, tab: "unmatched", search: term })["filter_by[search]"],
      ).toBe(term);
    }
  });

  it("sends a TXN ID on both tabs", () => {
    expect(listQueryParams({ ...base, tab: "unmatched", search: "2411738" })["filter_by[search]"]).toBe("2411738");
    expect(listQueryParams({ ...base, tab: "matched", search: "2411516" })["filter_by[search]"]).toBe("2411516");
  });
});
