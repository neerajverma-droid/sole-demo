import { create } from "zustand";

import type { Expense } from "@/lib/expenses";

/**
 * The client source of truth for expenses — fetched from `GET /expense/list`
 * (see `fetchExpenses`, lib/expenses.ts) rather than seeded.
 *
 * `expenses` mirrors the account's *complete* list, not one page of it — a
 * dozen other screens (dashboard, planner, transactions, invoices, vendor
 * refunds, the sidebar) read this store expecting everything, so unlike
 * super-contributions/vendor-refunds this one isn't paginated at the store
 * level.
 *
 * Deleting, matching, unmatching and attaching a receipt still only mutate
 * this local copy — those don't have real endpoints wired up yet, so a
 * refetch would undo them. Creating and editing go through the real API
 * (`createExpenseApi`/`updateExpenseApi`) and then invalidate the query that
 * feeds this store, rather than mutating it directly.
 */
type ExpensesState = {
  expenses: Expense[];
  /** True once the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;
  /** Replaces the list wholesale with a fresh `fetchExpenses()` result. */
  setExpenses: (expenses: Expense[]) => void;
  /**
   * Confirms a bank match: Pending becomes Matched and the expense gains the
   * transaction reference it reconciled against.
   */
  matchExpense: (id: string, transactionRef?: string) => void;
  /** Puts a matched expense back in play, when the match is undone. */
  unmatchExpense: (id: string) => void;
  removeExpense: (id: string) => void;
  /** Bulk delete from the selection bar. */
  removeExpenses: (ids: string[]) => void;
  /** Attach, replace or clear a receipt on an expense that already exists. */
  attachReceipt: (id: string, receipt: Expense["receipt"]) => void;
  /** Records that this expense was on-charged, once that invoice is saved. */
  linkInvoice: (id: string, invoiceId: string) => void;
};

/**
 * Stands in for the bank feed until matching has a real endpoint: there's no
 * real transaction id to point at yet, so this keeps a plausible one going.
 */
let transactionSeq = 40118;
function nextTransactionRef(): string {
  transactionSeq += 1;
  return `TXN-${transactionSeq}`;
}

export const useExpensesStore = create<ExpensesState>()((set) => ({
  expenses: [],
  hydrated: false,
  setExpenses: (expenses) => set({ expenses, hydrated: true }),

  removeExpenses: (ids) =>
    set((state) => ({
      expenses: state.expenses.filter((expense) => !ids.includes(expense.id)),
    })),
  attachReceipt: (id, receipt) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === id ? { ...expense, receipt } : expense,
      ),
    })),
  linkInvoice: (id, invoiceId) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === id ? { ...expense, invoiceId } : expense,
      ),
    })),
  removeExpense: (id) =>
    set((state) => ({
      expenses: state.expenses.filter((expense) => expense.id !== id),
    })),
  unmatchExpense: (id) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === id
          ? { ...expense, status: "Pending", transactionRef: null }
          : expense,
      ),
    })),
  matchExpense: (id, transactionRef) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === id
          ? {
              ...expense,
              status: "Matched",
              // A real reference when Transactions matched it from that side;
              // otherwise a generated one, because without any reference the
              // Match transaction column would still offer to match and the
              // action would look as though it had done nothing.
              transactionRef:
                transactionRef ??
                expense.transactionRef ??
                nextTransactionRef(),
            }
          : expense,
      ),
    })),
}));
