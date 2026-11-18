/**
 * Quick Actions — the Get paid card (GetPaidCard.js).
 *
 * Invoice and Quote groups; To send / Overdue / Due soon and To send /
 * Convert invoice tabs; which button each row gets and what it says.
 */
import { describe, expect, it } from "vitest";

import type { UniboxInvoice, UniboxQuote } from "@/lib/unibox";
import {
  GET_PAID_SUCCESS,
  getPaidSets,
  invoiceAction,
  invoiceSub,
  invoiceTitle,
  isDueSoonInvoice,
  isOverdueInvoice,
  quoteAction,
  quoteIdOf,
  quoteSub,
  quoteTitle,
  statusOf,
} from "@/lib/unibox-rules";

/** Noon, 10 March 2026 — local time, so dates don't wander across midnight. */
const NOW = new Date("2026-03-10T12:00:00").getTime();
const day = (offset: number) => {
  const date = new Date(NOW + offset * 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T12:00:00`;
};

const invoice = (over: Partial<UniboxInvoice>): UniboxInvoice => ({ id: 1, ...over });
const quote = (over: Partial<UniboxQuote>): UniboxQuote => ({ id: 1, ...over });

describe("statusOf", () => {
  it("lower-cases the status, falling back to mark_as", () => {
    expect(statusOf({ status: "DRAFT" })).toBe("draft");
    expect(statusOf({ mark_as: "Sent" })).toBe("sent");
    expect(statusOf({ status: "", mark_as: "Overdue" })).toBe("overdue");
    expect(statusOf({})).toBe("");
  });
});

describe("quoteAction", () => {
  it("offers Send on a draft", () => {
    expect(quoteAction(quote({ status: "draft" }))).toEqual({ key: "send_quote", label: "Send" });
  });

  it("offers Send again on a rejected quote", () => {
    expect(quoteAction(quote({ status: "rejected" }))).toEqual({ key: "send_quote_again", label: "Send again" });
  });

  it.each(["sent", "accepted", "approved", ""])("offers Convert to invoice on a %s quote", (status) => {
    expect(quoteAction(quote({ status }))).toEqual({ key: "convert_quote", label: "Convert to invoice" });
  });

  it("offers nothing once converted, by status or by flag", () => {
    expect(quoteAction(quote({ status: "converted" }))).toBeNull();
    expect(quoteAction(quote({ status: "sent", converted: 1 }))).toBeNull();
    expect(quoteAction(quote({ status: "sent", converted: "1" }))).toBeNull();
  });

  it("reads mark_as when there's no status", () => {
    expect(quoteAction(quote({ mark_as: "Draft" }))?.key).toBe("send_quote");
  });
});

describe("isOverdueInvoice", () => {
  it("is true for an invoice marked overdue, whatever its date", () => {
    expect(isOverdueInvoice(invoice({ status: "overdue", due_date: day(5) }), NOW)).toBe(true);
  });

  it("is true for a sent invoice past its due date", () => {
    expect(isOverdueInvoice(invoice({ status: "sent", due_date: day(-1) }), NOW)).toBe(true);
  });

  it("is false for a sent invoice not yet due, a draft past due, or no due date", () => {
    expect(isOverdueInvoice(invoice({ status: "sent", due_date: day(1) }), NOW)).toBe(false);
    expect(isOverdueInvoice(invoice({ status: "draft", due_date: day(-3) }), NOW)).toBe(false);
    expect(isOverdueInvoice(invoice({ status: "sent" }), NOW)).toBe(false);
  });
});

describe("isDueSoonInvoice", () => {
  it.each([0, 1, 2])("is true for a sent invoice due in %i days", (offset) => {
    expect(isDueSoonInvoice(invoice({ status: "sent", due_date: day(offset) }), NOW)).toBe(true);
  });

  it("counts a 'due' status too", () => {
    expect(isDueSoonInvoice(invoice({ status: "due", due_date: day(1) }), NOW)).toBe(true);
  });

  it("is false three days out, in the past, for a draft, or with no due date", () => {
    expect(isDueSoonInvoice(invoice({ status: "sent", due_date: day(3) }), NOW)).toBe(false);
    expect(isDueSoonInvoice(invoice({ status: "sent", due_date: day(-1) }), NOW)).toBe(false);
    expect(isDueSoonInvoice(invoice({ status: "draft", due_date: day(1) }), NOW)).toBe(false);
    expect(isDueSoonInvoice(invoice({ status: "sent" }), NOW)).toBe(false);
  });
});

describe("getPaidSets", () => {
  const invoices = [
    invoice({ id: 1, status: "draft" }),
    invoice({ id: 2, status: "draft" }),
    invoice({ id: 3, status: "overdue", due_date: day(-20) }),
    invoice({ id: 4, status: "sent", due_date: day(-2) }),
    invoice({ id: 5, status: "sent", due_date: day(1) }),
    invoice({ id: 6, status: "paid", due_date: day(-5) }),
  ];
  const quotes = [
    quote({ id: 10, status: "draft" }),
    quote({ id: 11, status: "rejected" }),
    quote({ id: 12, status: "sent" }),
    quote({ id: 13, status: "converted" }),
    quote({ id: 14, status: "sent", converted: 1 }),
  ];
  const sets = getPaidSets(invoices, quotes, NOW);

  it("puts drafts under To send", () => {
    expect(sets.invoices["To send"].map((row) => row.id)).toEqual([1, 2]);
  });

  it("puts overdue and sent-past-due under Overdue", () => {
    expect(sets.invoices.Overdue.map((row) => row.id)).toEqual([3, 4]);
  });

  it("puts sent invoices due within two days under Due soon", () => {
    expect(sets.invoices["Due soon"].map((row) => row.id)).toEqual([5]);
  });

  it("leaves paid invoices out of every tab", () => {
    const all = Object.values(sets.invoices).flat().map((row) => row.id);
    expect(all).not.toContain(6);
  });

  it("puts drafts and rejected quotes under To send", () => {
    expect(sets.quotes["To send"].map((row) => row.id)).toEqual([10, 11]);
  });

  it("puts the rest under Convert invoice, never a converted one", () => {
    expect(sets.quotes["Convert invoice"].map((row) => row.id)).toEqual([12]);
  });

  it("counts every tab, each group, and both together for the header", () => {
    expect(sets.invoiceCounts).toEqual({ "To send": 2, Overdue: 2, "Due soon": 1 });
    expect(sets.quoteCounts).toEqual({ "To send": 2, "Convert invoice": 1 });
    expect(sets.groupCounts).toEqual({ Invoice: 5, Quote: 3 });
    expect(sets.total).toBe(8);
  });

  it("is all zeros with nothing to show", () => {
    const empty = getPaidSets([], [], NOW);
    expect(empty.total).toBe(0);
    expect(empty.groupCounts).toEqual({ Invoice: 0, Quote: 0 });
  });
});

describe("row text", () => {
  it("titles an invoice by number and client, falling back to its id", () => {
    expect(invoiceTitle(invoice({ id: 3, invoice_no: "INV-3", client: { name: "abc" } }))).toBe("INV-3 · abc");
    expect(invoiceTitle(invoice({ id: 3 }))).toBe("3 · ");
  });

  it("titles a quote by number and client", () => {
    expect(quoteTitle(quote({ id: 4, quote_no: "Q-4", client: { name: "Test" } }))).toBe("Q-4 · Test");
  });

  it("says Draft on To send", () => {
    expect(invoiceSub(invoice({ due_date: day(5) }), "To send", NOW)).toBe("Draft");
  });

  it("says how many days overdue on Overdue", () => {
    expect(invoiceSub(invoice({ due_date: "2026-03-01T12:00:00" }), "Overdue", NOW)).toBe(
      "9 days overdue · Due 1 Mar",
    );
  });

  it("says plain Overdue when the due date is today or missing", () => {
    expect(invoiceSub(invoice({ due_date: day(0) }), "Overdue", NOW)).toMatch(/^Overdue · Due /);
    expect(invoiceSub(invoice({}), "Overdue", NOW)).toBe("Overdue · Due ");
  });

  it("says the due date on Due soon", () => {
    expect(invoiceSub(invoice({ due_date: "2026-03-11T12:00:00" }), "Due soon", NOW)).toBe("Due 11 Mar");
  });

  it("shows a quote's status, capitalised, with its valid-till date", () => {
    expect(quoteSub(quote({ status: "draft", valid_till: "2026-03-20T12:00:00" }))).toBe("Draft · 20 Mar");
    expect(quoteSub(quote({ status: "sent", due_date: "2026-03-21T12:00:00" }))).toBe("Sent · 21 Mar");
    expect(quoteSub(quote({}))).toBe("Draft · ");
  });
});

describe("row actions", () => {
  it("sends from To send and follows up from Overdue and Due soon", () => {
    expect(invoiceAction("To send")).toEqual({ key: "send_invoice", label: "Send" });
    expect(invoiceAction("Overdue")).toEqual({ key: "follow_up", label: "Follow up" });
    expect(invoiceAction("Due soon")).toEqual({ key: "follow_up", label: "Follow up" });
  });

  it("acts on a quote by its quote id where it has one", () => {
    expect(quoteIdOf(quote({ id: 1, quote_id: 45 }))).toBe(45);
    expect(quoteIdOf(quote({ id: 1 }))).toBe(1);
  });

  it("has the old page's success message for every action", () => {
    expect(GET_PAID_SUCCESS).toEqual({
      follow_up: "Invoice reminder sent successfully!",
      send_quote: "Quote sent successfully!",
      send_quote_again: "Quote sent again successfully!",
      send_invoice: "Invoice sent successfully!",
      convert_quote: "Quote converted to invoice successfully!",
    });
  });
});
