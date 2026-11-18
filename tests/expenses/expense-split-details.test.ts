import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const { mapApiExpense } = await import("@/lib/expenses");

/** `GET /v2/expense/:id` for a $100 expense split $20 business / $80 personal. */
const splitDetail = {
  expense_id: 42,
  name: "split expense",
  date: "2026-11-03",
  price: "20.00",
  total_price: "100.00",
  business_amount: "20.00",
  personal_amount: "80.00",
  sub_total: "100.00",
  total_gst: "0.00",
  is_split: 1,
  gst: 0,
  paid_with_cash: 0,
};

describe("split expense detail, as sole-webapp's ExpensesInfo shows it", () => {
  it("maps the server's breakdown: sub total, GST, total, business and personal", () => {
    const expense = mapApiExpense(splitDetail);
    expect(expense.isSplit).toBe(true);
    expect(expense.amount).toBe(20);
    expect(expense.totalAmount).toBe(100);
    expect(expense.subTotal).toBe(100);
    expect(expense.totalGst).toBe(0);
    expect(expense.personalAmount).toBe(80);
  });

  it("treats a business amount under the total as split even without the flag", () => {
    const expense = mapApiExpense({ ...splitDetail, is_split: 0 });
    expect(expense.isSplit).toBe(true);
  });

  it("isn't split when the business amount is the whole total", () => {
    const expense = mapApiExpense({
      ...splitDetail,
      is_split: 0,
      price: "100.00",
      business_amount: "100.00",
      personal_amount: "0.00",
    });
    expect(expense.isSplit).toBe(false);
  });

  it("leaves the breakdown null on a list row, which doesn't carry it", () => {
    const expense = mapApiExpense({
      expense_id: 7,
      date: "2026-11-03",
      price: "50.00",
      total_price: "50.00",
    });
    expect(expense.isSplit).toBe(false);
    expect(expense.subTotal).toBeNull();
    expect(expense.totalGst).toBeNull();
    expect(expense.personalAmount).toBeNull();
  });
});

/*
 * The View dialog's price section, rendered to markup the way the repo's
 * other render tests do (the dialog itself portals, so it renders nothing
 * server-side — the section is rendered on its own).
 */
const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { PriceBreakdown } = await import("@/components/expenses/expense-dialogs");

const GST = { rate: 10, word: "GST" };

function breakdown(raw: Parameters<typeof mapApiExpense>[0]): string {
  const html = renderToStaticMarkup(
    React.createElement(PriceBreakdown, { expense: mapApiExpense(raw), tax: GST }),
  );
  // Label → amount pairs, in order, without the markup between them.
  return html
    .replace(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g, "[$1: $2]")
    .replace(/<[^>]+>/g, "");
}

describe("View dialog's price breakdown", () => {
  it("shows the old modal's figures for a split expense", () => {
    expect(breakdown(splitDetail)).toBe(
      "[Sub total: $100.00][GST: $0.00][Total price: $100.00]" +
        "[Price (business): $20.00][Price (personal): $80.00]",
    );
  });

  it("leaves the business/personal rows off an expense that isn't split", () => {
    const html = breakdown({
      ...splitDetail,
      is_split: 0,
      price: "110.00",
      total_price: "110.00",
      business_amount: "110.00",
      personal_amount: "0.00",
      sub_total: "100.00",
      total_gst: "10.00",
      gst: 1,
    });
    expect(html).toBe("[Sub total: $100.00][GST: $10.00][Total price: $110.00]");
  });

  it("works the figures out when the response doesn't carry them", () => {
    const html = breakdown({
      expense_id: 9,
      date: "2026-11-03",
      price: "33.00",
      total_price: "110.00",
      is_split: 1,
      gst: 1,
      gst_percentage: 10,
    });
    expect(html).toBe(
      "[Sub total: $100.00][GST: $10.00][Total price: $110.00]" +
        "[Price (business): $33.00][Price (personal): $77.00]",
    );
  });
});
