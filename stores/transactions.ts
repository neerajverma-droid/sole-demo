import { create } from "zustand";

import type {
  Transaction,
  TransactionSource,
  TransactionStatus,
} from "@/lib/transactions";

/** Everything but identity and status — what a form or import supplies. */
/**
 * What a caller supplies to create a transaction.
 *
 * The AI suggestion, the supplier and the GST flag are left out on purpose:
 * they're things that happen to a transaction after it exists, not things a
 * form collects. `source` is optional and defaults to Manual — the one caller
 * that isn't a person typing (the bank CSV import) says so.
 */
export type TransactionDraft = Omit<
  Transaction,
  | "id"
  | "reference"
  | "status"
  | "splits"
  | "personal"
  | "transfer"
  | "source"
  | "suggestedCategory"
  | "supplier"
  | "gst"
> & { source?: TransactionSource };

/**
 * The client source of truth for bank-feed transactions. Counts are derived in
 * lib/transactions rather than stored, per the handoff's state split.
 */
type TransactionsState = {
  transactions: Transaction[];
  /**
   * Replaces the list wholesale with the page the Transactions screen has on
   * show — the real feed, mirrored so the row dialogs can look a row up by id.
   */
  setTransactions: (transactions: Transaction[]) => void;
  addTransaction: (
    draft: TransactionDraft,
    status?: TransactionStatus,
  ) => Transaction;
  /** Bulk import from the CSV wizard. */
  addTransactions: (
    drafts: TransactionDraft[],
    status?: TransactionStatus,
  ) => Transaction[];
  /** Confirms the suggested match: Review becomes Matched. */
  reconcile: (id: string) => void;
  /** Puts a reconciled transaction back in the review queue. */
  unreconcile: (id: string) => void;
  /** Row-menu edit. A patch, not a whole draft, so reference and status hold. */
  patchTransaction: (id: string, patch: Partial<TransactionDraft>) => void;
  /**
   * Confirms a row's coding — the category, the supplier, or both.
   *
   * One write rather than three calls, because approving is one decision: a
   * caller that set the category, then the supplier, then cleared the
   * suggestion would leave the row briefly half-approved, and any of the three
   * failing would leave it there for good.
   */
  approveCoding: (
    id: string,
    coding: { category?: string; supplier?: string },
  ) => void;
  /**
   * Turns down a suggested category without adopting it.
   *
   * The counterpart to `approveCoding`, and deliberately not the same call with
   * an empty argument: approving takes the guess into `category`, and this
   * leaves the coding exactly as it was. Both clear the suggestion, because
   * either way the row has stopped asking.
   */
  dismissSuggestion: (id: string) => void;
  assignSupplier: (id: string, supplier: string) => void;
  toggleGst: (id: string) => void;
  /**
   * Replaces one transaction with the parts it splits into. The parts keep the
   * original's date and account and inherit its reference with a suffix, so the
   * pieces stay traceable to the line on the statement.
   */
  splitTransaction: (
    id: string,
    parts: { amount: number; category: string; description: string }[],
  ) => void;
  removeTransaction: (id: string) => void;
  /** Undo on a split line — the line goes, the transaction stays. */
  removeSplit: (id: string, splitId: string) => void;
  /** Personal spending on a business account, in or out of the books. */
  setPersonal: (id: string, personal: boolean) => void;
  /**
   * Marks a transaction as money moved to one of the owner's own accounts,
   * pairing it with the other leg where that leg has already imported.
   */
  markTransfer: (id: string, counterAccount: string) => void;
  clearTransfer: (id: string) => void;
};

const ACCOUNT = "ANZ Business ···· 4821";

const SEED: Transaction[] = [
  {
    id: "txn-1",
    reference: "TXN-0001",
    date: "2026-07-22",
    description: "Deposit — Nomad Studio",
    category: "Sales income",
    type: "Credit",
    amount: 4290,
    status: "Matched",
    account: ACCOUNT,
    splits: [],
    personal: false,
    transfer: null,
    suggestedMatch: "INV-0021 · Turner Consulting",
    source: "Bank Feed",
    suggestedCategory: null,
    supplier: "",
    gst: true,
  },
  {
    id: "txn-2",
    reference: "TXN-0002",
    date: "2026-07-21",
    description: "Officeworks Melbourne",
    category: "Office supplies",
    type: "Debit",
    amount: 182.4,
    status: "Matched",
    account: ACCOUNT,
    splits: [
      {
        id: "txn-2-s1",
        date: "2026-07-21",
        category: "Office supplies",
        reference: "REC-4471",
        referenceType: "Receipt",
        clientName: "Officeworks",
        amount: 142.4,
      },
      {
        id: "txn-2-s2",
        date: "2026-07-21",
        category: "GST Receivable",
        reference: "REC-4471",
        referenceType: "Receipt",
        clientName: "Officeworks",
        amount: 40,
      },
    ],
    personal: false,
    transfer: null,
    suggestedMatch: "Bill · Officeworks",
    source: "Bank Feed",
    suggestedCategory: null,
    supplier: "Officeworks",
    gst: true,
  },
  {
    id: "txn-3",
    reference: "TXN-0003",
    date: "2026-07-20",
    description: "Stripe payout",
    category: "Sales income",
    type: "Credit",
    amount: 1120,
    status: "Review",
    account: ACCOUNT,
    // A payout that settled two invoices at once, less the platform's fee —
    // the case a single category can't describe.
    splits: [
      {
        id: "txn-3-s1",
        date: "2026-07-20",
        category: "Sales",
        reference: "INV-0022",
        referenceType: "Invoice",
        clientName: "Johnson Logistics Group",
        amount: 680,
      },
      {
        id: "txn-3-s2",
        date: "2026-07-20",
        category: "Services",
        reference: "INV-0024",
        referenceType: "Invoice",
        clientName: "Nomad Studio",
        amount: 472.5,
      },
      {
        id: "txn-3-s3",
        date: "2026-07-20",
        category: "Bank fees",
        reference: "STRIPE-07",
        referenceType: "Statement",
        clientName: "Stripe",
        amount: 32.5,
      },
    ],
    personal: false,
    transfer: null,
    suggestedMatch: "INV-0022 · Johnson Logistics Group",
    source: "Bank Feed",
    suggestedCategory: { category: "Software", confidence: 100 },
    supplier: "",
    gst: true,
  },
  {
    id: "txn-4",
    reference: "TXN-0004",
    date: "2026-07-19",
    description: "Adobe Creative Cloud",
    category: "Software",
    type: "Debit",
    amount: 89,
    status: "Matched",
    account: ACCOUNT,
    splits: [],
    personal: false,
    transfer: null,
    suggestedMatch: "Bill · Adobe",
    source: "Cash Payment",
    suggestedCategory: null,
    supplier: "",
    gst: false,
  },
  {
    id: "txn-5",
    reference: "TXN-0005",
    date: "2026-07-18",
    description: "Barre & Co consulting",
    category: "Consulting",
    type: "Credit",
    amount: 650,
    status: "Matched",
    account: ACCOUNT,
    splits: [],
    personal: false,
    transfer: null,
    suggestedMatch: "INV-0020 · Williams Health Services",
    source: "Bank Feed",
    suggestedCategory: null,
    supplier: "",
    gst: true,
  },
  {
    id: "txn-6",
    reference: "TXN-0006",
    date: "2026-07-15",
    description: "Rent — studio space",
    category: "Rent",
    type: "Debit",
    amount: 1200,
    status: "Review",
    account: ACCOUNT,
    splits: [],
    personal: false,
    transfer: null,
    suggestedMatch: "Bill · Studio lease",
    source: "Bank Feed",
    suggestedCategory: { category: "Motor vehicle", confidence: 92 },
    supplier: "Shell Coles Express",
    gst: true,
  },
  /**
   * Super payments. Here rather than in the super store because matching reads
   * the real bank feed — a contribution is matched against what actually left
   * the account. The June pair are two instalments of one quarterly payment,
   * which is the case the match dialog's split exists for.
   */
  {
    id: "txn-7",
    reference: "TXN-0007",
    date: "2026-08-05",
    description: "AustralianSuper contribution",
    category: "Superannuation",
    type: "Debit",
    amount: 2400,
    status: "Review",
    account: ACCOUNT,
    splits: [],
    personal: false,
    transfer: null,
    suggestedMatch: "Super · AustralianSuper",
    source: "Manual",
    suggestedCategory: null,
    supplier: "",
    gst: false,
  },
  {
    id: "txn-8",
    reference: "TXN-0008",
    date: "2026-07-08",
    description: "Hostplus SuperStream",
    category: "Superannuation",
    type: "Debit",
    amount: 950,
    status: "Review",
    account: ACCOUNT,
    splits: [],
    personal: false,
    transfer: null,
    suggestedMatch: "Super · Hostplus",
    source: "Bank Feed",
    suggestedCategory: null,
    supplier: "",
    gst: true,
  },
  {
    id: "txn-9",
    reference: "TXN-0009",
    date: "2026-06-28",
    description: "Aware Super — instalment 1",
    category: "Superannuation",
    type: "Debit",
    amount: 900,
    status: "Review",
    account: ACCOUNT,
    splits: [],
    personal: false,
    transfer: null,
    suggestedMatch: "Super · Aware Super",
    source: "Cash Payment",
    suggestedCategory: null,
    supplier: "",
    gst: false,
  },
  {
    id: "txn-10",
    reference: "TXN-0010",
    date: "2026-06-30",
    description: "Aware Super — instalment 2",
    category: "Superannuation",
    type: "Debit",
    amount: 900,
    status: "Review",
    account: ACCOUNT,
    splits: [],
    personal: false,
    transfer: null,
    suggestedMatch: "Super · Aware Super",
    source: "Bank Feed",
    suggestedCategory: null,
    supplier: "",
    gst: true,
  },
];

let nextId = 0;
function createId(): string {
  nextId += 1;
  return `txn-new-${nextId}`;
}

/** Continues the TXN-0000 sequence from the highest already on file. */
function nextReference(transactions: Transaction[], offset = 0): string {
  const highest = transactions.reduce((max, transaction) => {
    const digits = transaction.reference.match(/(\d+)\s*$/);
    return digits ? Math.max(max, Number(digits[1])) : max;
  }, 0);
  return `TXN-${String(highest + 1 + offset).padStart(4, "0")}`;
}

export const useTransactionsStore = create<TransactionsState>()((set, get) => ({
  transactions: SEED,
  setTransactions: (transactions) => set({ transactions }),
  addTransaction: (draft, status = "Review") => {
    const transaction: Transaction = {
      ...draft,
      id: createId(),
      reference: nextReference(get().transactions),
      status,
      splits: [],
      personal: false,
      transfer: null,
      // Someone typed it unless the caller says otherwise, and nothing has had
      // an opinion about it yet.
      source: draft.source ?? "Manual",
      suggestedCategory: null,
      supplier: "",
      gst: false,
    };
    set((state) => ({ transactions: [transaction, ...state.transactions] }));
    return transaction;
  },
  addTransactions: (drafts, status = "Review") => {
    const existing = get().transactions;
    const created = drafts.map((draft, index) => ({
      ...draft,
      splits: [],
      personal: false,
      transfer: null,
      id: `${createId()}-${index}`,
      reference: nextReference(existing, index),
      status,
      source: draft.source ?? "Manual",
      suggestedCategory: null,
      supplier: "",
      gst: false,
    }));
    set((state) => ({ transactions: [...created, ...state.transactions] }));
    return created;
  },
  reconcile: (id) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === id
          ? { ...transaction, status: "Matched" }
          : transaction,
      ),
    })),
  unreconcile: (id) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === id
          ? { ...transaction, status: "Review" }
          : transaction,
      ),
    })),
  patchTransaction: (id, patch) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === id ? { ...transaction, ...patch } : transaction,
      ),
    })),
  splitTransaction: (id, parts) =>
    set((state) => {
      const source = state.transactions.find(
        (transaction) => transaction.id === id,
      );
      if (!source || parts.length < 2) return state;

      const pieces: Transaction[] = parts.map((part, index) => ({
        ...source,
        id: `${source.id}-split-${index + 1}`,
        reference: `${source.reference}-${index + 1}`,
        amount: part.amount,
        category: part.category,
        description: part.description,
        // A split needs re-checking, and the original suggestion belonged to the
        // whole line rather than to either piece.
        status: "Review",
        splits: [],
        suggestedMatch: "",
      }));

      return {
        transactions: state.transactions.flatMap((transaction) =>
          transaction.id === id ? pieces : [transaction],
        ),
      };
    }),
  removeSplit: (id, splitId) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === id
          ? {
              ...transaction,
              splits: transaction.splits.filter((s) => s.id !== splitId),
            }
          : transaction,
      ),
    })),
  approveCoding: (id, coding) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) => {
        if (transaction.id !== id) return transaction;
        return {
          ...transaction,
          // What was chosen, else the guess, else what it already had.
          category:
            coding.category ??
            transaction.suggestedCategory?.category ??
            transaction.category,
          supplier: coding.supplier ?? transaction.supplier,
          // Cleared, not kept: the guess has become the coding, and a row
          // holding both would keep offering to approve what it already did.
          suggestedCategory: null,
        };
      }),
    })),

  dismissSuggestion: (id) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === id
          ? { ...transaction, suggestedCategory: null }
          : transaction,
      ),
    })),

  assignSupplier: (id, supplier) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === id
          ? { ...transaction, supplier: supplier.trim() }
          : transaction,
      ),
    })),

  toggleGst: (id) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === id
          ? { ...transaction, gst: !transaction.gst }
          : transaction,
      ),
    })),

  setPersonal: (id, personal) =>
    set((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === id
          ? {
              ...transaction,
              personal,
              // The two classifications are alternatives, not layers: money
              // moved between your own accounts isn't also personal spending.
              transfer: personal ? null : transaction.transfer,
            }
          : transaction,
      ),
    })),

  markTransfer: (id, counterAccount) =>
    set((state) => {
      const source = state.transactions.find((entry) => entry.id === id);
      if (!source) return {};

      /*
       * The other leg: same amount, opposite direction, in the account named,
       * closest in time. Matched on the amount rather than the description
       * because a feed describes the two sides differently — "TFR OUT" against
       * "TRANSFER FROM SAVINGS" — and the figure is the thing they agree on.
       */
      const candidates = state.transactions
        .filter(
          (entry) =>
            entry.id !== id &&
            entry.account === counterAccount &&
            entry.type !== source.type &&
            Math.abs(entry.amount - source.amount) < 0.005 &&
            !entry.transfer,
        )
        .sort(
          (a, b) =>
            Math.abs(Date.parse(a.date) - Date.parse(source.date)) -
            Math.abs(Date.parse(b.date) - Date.parse(source.date)),
        );
      const pair = candidates[0] ?? null;

      return {
        transactions: state.transactions.map((entry) => {
          if (entry.id === id) {
            return {
              ...entry,
              personal: false,
              transfer: { counterAccount, pairedId: pair?.id ?? null },
            };
          }
          // Both legs get marked, so neither shows up as income or an expense.
          if (pair && entry.id === pair.id) {
            return {
              ...entry,
              personal: false,
              transfer: { counterAccount: source.account, pairedId: source.id },
            };
          }
          return entry;
        }),
      };
    }),

  clearTransfer: (id) =>
    set((state) => {
      const source = state.transactions.find((entry) => entry.id === id);
      const pairedId = source?.transfer?.pairedId ?? null;
      return {
        transactions: state.transactions.map((entry) =>
          entry.id === id || (pairedId && entry.id === pairedId)
            ? { ...entry, transfer: null }
            : entry,
        ),
      };
    }),

  removeTransaction: (id) =>
    set((state) => ({
      transactions: state.transactions.filter(
        (transaction) => transaction.id !== id,
      ),
    })),
}));
