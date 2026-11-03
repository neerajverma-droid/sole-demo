import { beforeEach, describe, expect, it } from "vitest";

import { useExpensesStore } from "@/stores/expenses";
import type { Expense } from "@/lib/expenses";

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "1",
    date: "2026-09-10",
    description: "Coffee with client",
    supplierId: null,
    supplierName: "",
    contactId: null,
    contactName: "",
    category: "Office Expenses",
    categoryId: "12",
    amount: 45,
    gst: true,
    paymentMethod: "Card",
    paidAmount: 0,
    status: "Pending",
    invoiceId: null,
    invoiceNo: null,
    transactionRef: null,
    journalEntryId: null,
    vendorNote: "",
    receipt: null,
    attachments: [],
    possibleMatch: 0,
    creditNoteId: null,
    creditNoteNo: null,
    isSplit: false,
    totalAmount: 45,
    ...overrides,
  };
}

beforeEach(() => {
  useExpensesStore.setState({ expenses: [], hydrated: false });
});

describe("setExpenses", () => {
  it("replaces the list and marks the store hydrated, even for an empty list", () => {
    useExpensesStore.getState().setExpenses([]);
    expect(useExpensesStore.getState().hydrated).toBe(true);
    expect(useExpensesStore.getState().expenses).toEqual([]);
  });
});

describe("matchExpense — the transactionRef fallback chain", () => {
  it("uses the real reference when one is given", () => {
    useExpensesStore.setState({ expenses: [expense({ transactionRef: "OLD" })] });
    useExpensesStore.getState().matchExpense("1", "TXN-REAL");
    const [row] = useExpensesStore.getState().expenses;
    expect(row.status).toBe("Matched");
    expect(row.transactionRef).toBe("TXN-REAL");
  });

  it("keeps the expense's own existing reference when none is given", () => {
    useExpensesStore.setState({ expenses: [expense({ transactionRef: "TXN-OWN" })] });
    useExpensesStore.getState().matchExpense("1");
    expect(useExpensesStore.getState().expenses[0].transactionRef).toBe("TXN-OWN");
  });

  it("generates a fresh, distinct TXN- reference when there's neither", () => {
    useExpensesStore.setState({
      expenses: [expense({ id: "1" }), expense({ id: "2" })],
    });
    useExpensesStore.getState().matchExpense("1");
    useExpensesStore.getState().matchExpense("2");
    const [a, b] = useExpensesStore.getState().expenses;
    expect(a.transactionRef).toMatch(/^TXN-\d+$/);
    expect(b.transactionRef).toMatch(/^TXN-\d+$/);
    expect(a.transactionRef).not.toBe(b.transactionRef);
  });

  it("only touches the matching row", () => {
    useExpensesStore.setState({
      expenses: [expense({ id: "1" }), expense({ id: "2" })],
    });
    useExpensesStore.getState().matchExpense("1", "TXN-REAL");
    const [, other] = useExpensesStore.getState().expenses;
    expect(other.status).toBe("Pending");
    expect(other.transactionRef).toBeNull();
  });
});

describe("unmatchExpense", () => {
  it("puts the expense back to Pending and clears its reference", () => {
    useExpensesStore.setState({
      expenses: [expense({ status: "Matched", transactionRef: "TXN-1" })],
    });
    useExpensesStore.getState().unmatchExpense("1");
    const [row] = useExpensesStore.getState().expenses;
    expect(row.status).toBe("Pending");
    expect(row.transactionRef).toBeNull();
  });
});

describe("removeExpense / removeExpenses", () => {
  it("removes one row, or every selected row, leaving the rest", () => {
    useExpensesStore.setState({
      expenses: [expense({ id: "1" }), expense({ id: "2" }), expense({ id: "3" })],
    });
    useExpensesStore.getState().removeExpense("2");
    expect(useExpensesStore.getState().expenses.map((e) => e.id)).toEqual(["1", "3"]);

    useExpensesStore.getState().removeExpenses(["1", "3", "missing"]);
    expect(useExpensesStore.getState().expenses).toEqual([]);
  });
});

describe("attachReceipt / linkInvoice", () => {
  it("sets (and clears) the receipt only on the matching row", () => {
    useExpensesStore.setState({ expenses: [expense({ id: "1" }), expense({ id: "2" })] });
    const receipt = { dataUrl: "https://x/r.png", name: "r.png", size: 0 };
    useExpensesStore.getState().attachReceipt("1", receipt);
    expect(useExpensesStore.getState().expenses[0].receipt).toEqual(receipt);
    expect(useExpensesStore.getState().expenses[1].receipt).toBeNull();

    useExpensesStore.getState().attachReceipt("1", null);
    expect(useExpensesStore.getState().expenses[0].receipt).toBeNull();
  });

  it("links the invoice id only on the matching row", () => {
    useExpensesStore.setState({ expenses: [expense({ id: "1" }), expense({ id: "2" })] });
    useExpensesStore.getState().linkInvoice("2", "137497");
    expect(useExpensesStore.getState().expenses.map((e) => e.invoiceId)).toEqual([
      null,
      "137497",
    ]);
  });
});
