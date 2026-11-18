// @vitest-environment node
/**
 * The Bills section's UI, rendered to markup — the repo's way of testing
 * components without a browser. Covers the list (columns, Match / AI Match,
 * the repeat badge beside the supplier, due-date colours, selection), the
 * hero tiles, the Upcoming and Calendar views, the match dialog's body, the
 * schedule panel's Coming up list (skipped bills with Undo) and the supplier
 * history card. Queries are seeded straight into a QueryClient, so nothing is
 * fetched.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/expenses/bills",
  useSearchParams: () => new URLSearchParams(),
}));

const { TooltipProvider } = await import("@/components/ui/tooltip");
const { BillsList, BillsListSkeleton } = await import("@/components/bills/bills-list");
const { BillsSummary } = await import("@/components/bills/bills-summary");
const { BillsUpcoming, UPCOMING_DAYS } = await import("@/components/bills/bills-upcoming");
const { BillsCalendar } = await import("@/components/bills/bills-calendar");
const { BillMatchBody } = await import("@/components/bills/bill-match-dialog");
const { ComingUpList } = await import("@/components/bills/bill-schedule-sheet");
const { BillSupplierHistory } = await import("@/components/bills/bill-supplier-history");
const { RepeatBadge, BillStatusBadge } = await import("@/components/bills/bill-status");
const { Dialog } = await import("@/components/ui/dialog");

import type { Bill, BillExpected, BillScheduleSummary, BillSummary } from "@/lib/bills";
import type { BillRowActions } from "@/components/bills/bills-list";

const TODAY = "2026-11-14";

function bill(values: Partial<Bill> = {}): Bill {
  return {
    id: "1",
    billNo: "INV-1",
    billDate: "2026-11-01",
    dueDate: "2026-11-30",
    status: "draft",
    paymentStatus: "unpaid",
    isOverdue: false,
    amountPaid: 0,
    amountDue: 100,
    possibleMatch: 0,
    subTotal: 100,
    totalGst: 0,
    total: 100,
    notes: "",
    source: "manual",
    confidence: null,
    expenseId: null,
    occurrenceNo: null,
    schedule: null,
    supplierId: "10",
    supplierName: "Origin Energy",
    categoryId: "5",
    category: "Utilities",
    lines: [],
    gstPercent: null,
    attachments: [],
    duplicateOf: null,
    ...values,
  };
}

const monthly: BillScheduleSummary = {
  id: "9",
  frequency: "monthly",
  status: "active",
  nextDate: "2026-12-14",
  endType: "after_count",
  endDate: "",
  totalCount: 12,
  occurrencesMade: 3,
};

function expected(values: Partial<BillExpected> = {}): BillExpected {
  return {
    key: "9-4",
    scheduleId: "9",
    occurrenceNo: 4,
    totalCount: 12,
    frequency: "monthly",
    billDate: "2026-12-14",
    dueDate: "2026-12-15",
    total: 30.5,
    supplierId: "10",
    supplierName: "Telstra",
    category: "Phone",
    skipped: false,
    ...values,
  };
}

const noop: BillRowActions = {
  onMatch: () => {},
  onConvert: () => {},
  onUnapprove: () => {},
  onDelete: () => {},
  onAttach: () => {},
  onManageRepeat: () => {},
};

function withProviders(element: React.ReactElement, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client);
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, React.createElement(TooltipProvider, null, element)),
  );
}

// The match body's title and description need a Dialog around them, as in the app.
const inDialog = (element: React.ReactElement) => React.createElement(Dialog, { open: false }, element);

function list(bills: Bill[], selected: string[] = []) {
  return withProviders(
    React.createElement(BillsList, {
      bills,
      today: TODAY,
      selected: new Set(selected),
      onSelectedChange: () => {},
      convertingId: null,
      actions: noop,
    }),
  );
}

/** The table part only (the phone cards repeat the same bills below it). */
const tablePart = (html: string) => html.slice(0, html.indexOf('aria-label="Bills"'));
/** One table row, found by its supplier. */
const rowOf = (html: string, supplier: string) => {
  const table = tablePart(html);
  const at = table.indexOf(supplier);
  const start = table.lastIndexOf("<tr", at);
  return table.slice(start, table.indexOf("</tr>", at));
};

describe("the bills list", () => {
  it("has the expense list's Match transaction column, before Actions", () => {
    const html = list([bill()]);
    const header = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    const columns = [...header.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));
    expect(columns).toEqual(["", "Supplier", "Bill no.", "Category", "Bill date", "Due date", "Total", "Status", "Match transaction", "Actions"]);
  });

  it("offers a plain Match on an owed bill, and AI Match once the feed has a likely payment", () => {
    const html = list([
      bill({ id: "1", supplierName: "Plain Co" }),
      bill({ id: "2", supplierName: "Suggested Co", possibleMatch: 2 }),
    ]);
    const plain = rowOf(html, "Plain Co");
    expect(plain).toContain(">Match</button>");
    expect(plain).not.toContain("AI Match");
    const suggested = rowOf(html, "Suggested Co");
    expect(suggested).toContain("AI Match");
    expect(suggested).toContain("2 suggested transactions");
  });

  it("says Matched on a paid bill, nothing on a void one, and still matches what's left of a part-paid one", () => {
    const html = list([
      bill({ id: "1", supplierName: "Paid Co", status: "approved", paymentStatus: "paid", amountPaid: 100, amountDue: 0, expenseId: "70" }),
      bill({ id: "2", supplierName: "Void Co", status: "void", paymentStatus: "void", amountDue: 0 }),
      bill({ id: "3", supplierName: "Part Co", status: "approved", paymentStatus: "part_paid", amountPaid: 60, amountDue: 40, expenseId: "71" }),
    ]);
    expect(rowOf(html, "Paid Co")).toContain("Matched");
    expect(rowOf(html, "Paid Co")).not.toContain(">Match</button>");
    expect(rowOf(html, "Void Co")).not.toContain(">Match</button>");
    const part = rowOf(html, "Part Co");
    expect(part).toContain("Part paid");
    expect(part).toContain("$40.00 left");
    expect(part).toContain(">Match</button>");
  });

  it("keeps Convert to expense in the menu, not on the row", () => {
    const html = list([bill()]);
    expect(html).not.toContain("Convert to expense");
    expect(html).toContain('aria-label="Actions for INV-1"');
  });

  it("puts the repeat badge right after the supplier name, styled like the invoice list's Recurring badge, and clickable", () => {
    const html = list([bill({ schedule: monthly, occurrenceNo: 3 })]);
    const supplierCell = rowOf(html, "Origin Energy").split("</td>")[1];
    expect(supplierCell).toContain("Origin Energy");
    expect(supplierCell).toContain("Monthly");
    expect(supplierCell).toContain("3 of 12");
    expect(supplierCell.indexOf("Origin Energy")).toBeLessThan(supplierCell.indexOf("Monthly"));
    expect(supplierCell).toMatch(/uppercase/);
    expect(supplierCell).toMatch(/text-primary/);
    expect(supplierCell).toContain("Manage repeat");
    expect(supplierCell).toContain("<button");
  });

  it("colours the due date — red overdue, amber within a week — and has no 'Due tomorrow' text", () => {
    const html = list([
      bill({ id: "1", supplierName: "Late Co", dueDate: "2026-11-10", isOverdue: true }),
      bill({ id: "2", supplierName: "Soon Co", dueDate: "2026-11-15" }),
      bill({ id: "3", supplierName: "Later Co", dueDate: "2026-12-30" }),
      bill({ id: "4", supplierName: "Settled Co", dueDate: "2026-11-10", status: "approved", paymentStatus: "paid", amountDue: 0 }),
    ]);
    const dueCell = (supplier: string) => rowOf(html, supplier).split("</td>")[5];
    expect(dueCell("Late Co")).toContain("text-destructive");
    expect(dueCell("Soon Co")).toContain("text-warning");
    expect(dueCell("Later Co")).toContain("text-muted-foreground");
    expect(dueCell("Later Co")).not.toContain("text-warning");
    expect(dueCell("Settled Co")).not.toContain("text-destructive");
    expect(html).not.toMatch(/Due (today|tomorrow|in \d+ days)|days? overdue/);
  });

  it("only lets saved bills be ticked for the bulk bar", () => {
    const html = tablePart(
      list([
        bill({ id: "1", supplierName: "Saved A" }),
        bill({ id: "2", supplierName: "Converted", status: "approved", expenseId: "70" }),
        bill({ id: "3", supplierName: "Saved B" }),
      ]),
    );
    // The header's select-all plus one per saved bill.
    expect(html.match(/role="checkbox"/g)).toHaveLength(3);
    expect(rowOf(html, "Converted")).not.toContain('role="checkbox"');
  });

  it("shows a ticked row as selected", () => {
    const html = list([bill({ id: "1" })], ["1"]);
    expect(rowOf(html, "Origin Energy")).toContain('data-state="selected"');
  });

  it("renders a card per bill for phones, with the same Match button", () => {
    const html = list([bill({ id: "1" }), bill({ id: "2", supplierName: "Telstra" })]);
    const cards = html.slice(html.indexOf('aria-label="Bills"'));
    // `<li ` only: the Match icon's SVG has <line> elements.
    expect(cards.match(/<li[\s>]/g)).toHaveLength(2);
    expect(cards).toContain(">Match</button>");
  });

  it("has a skeleton with a cell for every column", () => {
    const html = renderToStaticMarkup(React.createElement(BillsListSkeleton));
    const firstRow = html.slice(html.indexOf("<tbody"), html.indexOf("</tr>", html.indexOf("<tbody")));
    expect(firstRow.match(/<td/g)).toHaveLength(10);
  });
});

describe("the status badge", () => {
  it("reads Saved, Unpaid, Part paid, Overdue, Paid or Void", () => {
    const render = (values: Partial<Bill>) => renderToStaticMarkup(React.createElement(BillStatusBadge, { bill: bill(values) }));
    expect(render({})).toContain("Saved");
    expect(render({ status: "approved" })).toContain("Unpaid");
    expect(render({ status: "approved", paymentStatus: "part_paid" })).toContain("Part paid");
    expect(render({ isOverdue: true })).toContain("Overdue");
    expect(render({ status: "approved", paymentStatus: "paid" })).toContain("Paid");
    expect(render({ status: "void", paymentStatus: "void" })).toContain("Void");
  });
});

describe("the repeat badge", () => {
  it("is a plain badge with the schedule as its title when it can't open anything", () => {
    const html = renderToStaticMarkup(React.createElement(RepeatBadge, { schedule: monthly, occurrenceNo: 3 }));
    expect(html).not.toContain("<button");
    expect(html).toContain('title="Repeats monthly · This is bill 3 of 12 · Next bill on 14/12/2026 · 12 bills in all"');
  });

  it("is a button that names the schedule and opens Manage repeat", () => {
    const html = withProviders(React.createElement(RepeatBadge, { schedule: monthly, occurrenceNo: 3, onManage: () => {} }));
    expect(html).toContain("<button");
    expect(html).toMatch(/aria-label="Repeats monthly\. This is bill 3 of 12\. Next bill on 14\/12\/2026\. 12 bills in all\. Manage repeat"/);
    // No nested div inside the button (Badge renders a div; this one is a span).
    expect(html).not.toMatch(/<button[^>]*>\s*<div/);
  });

  it("goes quiet once the repeat has finished", () => {
    const html = renderToStaticMarkup(React.createElement(RepeatBadge, { schedule: { ...monthly, status: "stopped", nextDate: "" }, occurrenceNo: 3 }));
    expect(html).not.toContain("text-primary");
    expect(html).toContain("Stopped");
  });
});

describe("the summary tiles", () => {
  const summary: BillSummary = {
    asOf: TODAY,
    paidThisMonth: { amount: 1620.5, count: 2 },
    due7: { amount: 972, count: 3, expectedCount: 1 },
    due30: { amount: 2400.5, count: 6, expectedCount: 2 },
    overdue: { amount: 451.35, count: 1, expectedCount: 0 },
    owed: { amount: 2851.85, count: 9, expectedCount: 0 },
  };

  it("shows Paid this month first and Overdue last, with no Cash after bills", () => {
    const html = withProviders(React.createElement(BillsSummary, { summary, loading: false }));
    const order = ["Paid this month", "Due in 7 days", "Due in 30 days", "Overdue"].map((label) => html.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain("Cash after bills");
  });

  it("captions each tile with its counts", () => {
    const html = withProviders(React.createElement(BillsSummary, { summary, loading: false }));
    expect(html).toContain("2 bills");
    expect(html).toContain("3 bills · 1 expected");
    expect(html).toContain("6 bills · 2 expected");
    expect(html).toContain("1 bill<");
  });

  it("says when a tile is empty, and shows only placeholders while loading", () => {
    const empty = withProviders(React.createElement(BillsSummary, { summary: undefined, loading: false }));
    expect(empty).toContain("Nothing paid yet this month");
    expect(empty).toContain("Nothing overdue");
    const loading = withProviders(React.createElement(BillsSummary, { summary: undefined, loading: true }));
    expect(loading).not.toContain("Paid this month");
    expect(loading).toContain('aria-hidden="true"');
  });
});

describe("the Upcoming view", () => {
  const render = (bills: Bill[], expectedRows: BillExpected[]) =>
    withProviders(React.createElement(BillsUpcoming, { today: TODAY, onManageRepeat: () => {} }), (client) =>
      client.setQueryData(["bills-upcoming", UPCOMING_DAYS], { asOf: TODAY, bills, expected: expectedRows }),
    );

  it("groups what's owed by when it's due, with each group's total", () => {
    const html = render(
      [
        bill({ id: "1", supplierName: "Late Co", dueDate: "2026-11-10", isOverdue: true, amountDue: 100 }),
        bill({ id: "2", supplierName: "Soon Co", dueDate: "2026-11-16", amountDue: 50 }),
      ],
      [expected({ billDate: "2026-12-09", dueDate: "2026-12-10", total: 30.5 })],
    );
    expect(html).toContain("Overdue · 1");
    expect(html).toContain("Due in the next 7 days · 1");
    expect(html).toContain("Due within 30 days · 1");
    expect(html).toContain("$100.00");
    expect(html).toContain("$30.50");
  });

  it("marks repeat bills not made yet as Expected, with their place in the series", () => {
    const html = render([], [expected()]);
    expect(html).toContain("Expected · 4 of 12");
    expect(html).toContain("Telstra");
  });

  it("colours due dates instead of spelling out the days", () => {
    const html = render([bill({ id: "1", dueDate: "2026-11-15" })], []);
    expect(html).toMatch(/text-warning[^"]*">Due 15\/11\/2026/);
    expect(html).not.toMatch(/Due (today|tomorrow|in \d+ days)/);
  });

  it("says when nothing is owed", () => {
    expect(render([], [])).toContain("Nothing owed");
  });
});

describe("the Calendar view", () => {
  it("puts each bill on the day it falls due, and lists the selected day below", () => {
    const html = withProviders(React.createElement(BillsCalendar, { today: TODAY, onManageRepeat: () => {} }), (client) =>
      client.setQueryData(["bills-calendar", "2026-11-01", "2026-11-30"], {
        bills: [bill({ id: "1", supplierName: "Origin Energy", dueDate: "2026-11-14", total: 130.5 })],
        expected: [expected({ billDate: "2026-11-20", dueDate: "2026-11-21", supplierName: "Telstra" })],
      }),
    );
    expect(html).toContain("November 2026");
    expect(html).toContain("Origin Energy $130.50");
    expect(html).toContain("Telstra $30.50");
    // Today is selected, so its bills are listed under the grid.
    expect(html).toContain("Saturday 14 November");
    expect(html.match(/role="gridcell"/g)!.length % 7).toBe(0);
  });
});

describe("the match dialog", () => {
  it("is the expense dialog's two tabs, sized to the bill, and says matching adds a saved bill to expenses", () => {
    const target = bill({ id: "40", billNo: "INV-9", supplierName: "Origin Energy", total: 130.5, amountDue: 130.5 });
    const html = withProviders(inDialog(React.createElement(BillMatchBody, { bill: target, onClose: () => {} })), (client) =>
      client.setQueryData(["bill-possible-matches", "40", false], {
        candidates: [{ id: "77", date: "2026-11-10", description: "BPAY ORIGIN", reference: "", amount: 130.5, availableAmount: 130.5 }],
        remainingAmount: 130.5,
      }),
    );
    expect(html).toContain("Match payment");
    expect(html).toContain("Origin Energy · INV-9 · due 30/11/2026 · $130.50");
    expect(html).toContain("Matching adds this bill to your expenses");
    expect(html).toContain("Potential transactions");
    expect(html).toContain("Assign to multiple");
    expect(html).toContain("BPAY ORIGIN");
    expect(html).toContain(">Match</button>");
  });

  it("doesn't talk about adding to expenses for a bill that's already converted", () => {
    const target = bill({ id: "41", status: "approved", paymentStatus: "part_paid", expenseId: "70", total: 100, amountDue: 40 });
    const html = withProviders(inDialog(React.createElement(BillMatchBody, { bill: target, onClose: () => {} })), (client) =>
      client.setQueryData(["bill-possible-matches", "41", false], { candidates: [], remainingAmount: 40 }),
    );
    expect(html).not.toContain("Matching adds this bill");
    expect(html).toContain("$40.00");
    expect(html).toContain("No likely payments");
  });
});

describe("the schedule panel's Coming up list", () => {
  const render = (upcoming: BillExpected[]) =>
    renderToStaticMarkup(React.createElement(ComingUpList, { upcoming, onUnskip: () => {}, unskippingDate: null, disabled: false }));

  it("keeps a skipped bill in place, struck through, with Undo", () => {
    const html = render([
      expected({ key: "9-skipped-2027-01-14", skipped: true, occurrenceNo: 0, billDate: "2027-01-14", dueDate: "2027-01-15" }),
      expected({ key: "9-4", billDate: "2027-02-14", dueDate: "2027-02-15" }),
    ]);
    const [skippedRow, normalRow] = html.split("</li>");
    expect(skippedRow).toContain('data-skipped="true"');
    expect(skippedRow).toContain("line-through");
    expect(skippedRow).toContain("Skipped");
    expect(skippedRow).toContain('aria-label="Undo skipping the bill on 14/01/2027"');
    expect(skippedRow).not.toContain(" of 12");
    expect(normalRow).not.toContain("line-through");
    expect(normalRow).not.toContain("Undo");
    expect(normalRow).toContain("4 of 12");
  });

  it("says when there's nothing left to come", () => {
    expect(render([])).toContain("No more bills to come.");
  });
});

describe("the supplier history card", () => {
  const render = (total: number, previous: Bill[]) =>
    withProviders(React.createElement(BillSupplierHistory, { supplierId: "10", supplierName: "Origin Energy", billId: "50", total }), (client) =>
      client.setQueryData(["bills-page", 1, 5, { status: "All", search: "", supplierId: "10", excludeId: "50" }], {
        bills: previous,
        total: previous.length,
      }),
    );

  it("lists the supplier's last bills and how this one compares", () => {
    const html = render(120, [bill({ id: "49", billDate: "2026-10-01", total: 100 })]);
    expect(html).toContain("Previous bills from Origin Energy");
    expect(html).toContain("Up 20% on the last bill ($100.00 on 01/10/2026)");
  });

  it("shows nothing without a supplier, or with no other bills from them", () => {
    expect(render(120, [])).not.toContain("Previous bills");
    const none = withProviders(React.createElement(BillSupplierHistory, { supplierId: null, supplierName: "", total: 0 }));
    expect(none).toBe("");
  });
});
