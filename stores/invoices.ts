import { create } from "zustand";

import { toggleInvoiceDefaultFavouriteApi } from "@/lib/invoice-templates";
import { invoiceNumbering } from "@/lib/sales-settings";
import { useSalesSettingsStore } from "@/stores/sales-settings";

import {
  invoiceAmount,
  nextInvoiceNumber,
  statusAfterPayment,
  toIsoDate,
  type Invoice,
  type InvoiceAttachment,
  type InvoiceDraft,
  type InvoiceStatus,
} from "@/lib/invoices";

/**
 * The client source of truth for invoices. The Dashboard's invoice totals and
 * overdue count read from here, so the two screens can't drift apart.
 */
type InvoicesState = {
  invoices: Invoice[];
  /** True until the first real fetch lands — lets the screen skip the empty state while loading. */
  hydrated: boolean;
  /** Replaces the list wholesale with a fresh `fetchInvoices()` result. */
  setInvoices: (invoices: Invoice[]) => void;
  addInvoice: (draft: InvoiceDraft, status?: InvoiceStatus) => Invoice;
  updateInvoice: (id: string, draft: InvoiceDraft) => void;
  removeInvoice: (id: string) => void;
  removeInvoices: (ids: string[]) => void;
  /** Settles the balance outright, as opposed to recording part of it. */
  markPaid: (ids: string[]) => void;
  markSent: (id: string) => void;
  /** Records the bank transaction an invoice was reconciled against. */
  matchTransaction: (id: string, transactionId: string) => void;
  /**
   * Drops the link. The status is left alone deliberately: matching never
   * moved it, so there's nothing to put back — an invoice comes out of an
   * unmatch exactly as Outstanding or Overdue as it went in.
   */
  unmatchTransaction: (id: string) => void;
  duplicateInvoice: (id: string) => Invoice | undefined;
  /**
   * Records money received. The status follows the balance rather than being
   * chosen, so Paid and Partially paid can't disagree with the figures.
   */
  recordPayment: (id: string, received: number) => void;
  /** Attaches a file to an invoice that already exists. */
  addAttachment: (id: string, attachment: InvoiceAttachment) => void;
  removeAttachment: (id: string, attachmentId: string) => void;
  /** Starred invoice template ids, driving the Favourites filter. */
  favouriteTemplates: string[];
  /** Replaces the set wholesale with a fresh `fetchInvoiceDefaults()` result. */
  setFavouriteTemplates: (ids: string[]) => void;
  toggleFavouriteTemplate: (id: string) => void;
};

let nextId = 0;
function createId(): string {
  nextId += 1;
  return `invoice-${nextId}`;
}

function toInvoice(
  draft: InvoiceDraft,
  id: string,
  status: InvoiceStatus,
): Invoice {
  return {
    ...draft,
    id,
    status,
    // A new invoice has been paid nothing; Record payment is what changes this.
    paidAmount: 0,
    // Nor has it gone anywhere yet.
    sentAt: null,
    // Nothing has scored it against the bank feed yet — only a fetched
    // invoice carries a real count.
    possibleMatch: 0,
    // Neither a schedule nor a cash payment exists yet for a brand-new invoice.
    isRecurring: false,
    paidWithCash: false,
    clientName: draft.clientName.trim(),
    number: draft.number.trim(),
  };
}

export const useInvoicesStore = create<InvoicesState>()((set, get) => ({
  invoices: [],
  hydrated: false,
  setInvoices: (invoices) => set({ invoices, hydrated: true }),
  favouriteTemplates: [],
  setFavouriteTemplates: (ids) => set({ favouriteTemplates: ids }),
  toggleFavouriteTemplate: (id) => {
    const before = get().favouriteTemplates;
    // Optimistic — the star flips immediately, then the server confirms it.
    set({
      favouriteTemplates: before.includes(id)
        ? before.filter((entry) => entry !== id)
        : [...before, id],
    });
    toggleInvoiceDefaultFavouriteApi(id)
      .then((isFavourite) => {
        set((state) => ({
          favouriteTemplates: isFavourite
            ? state.favouriteTemplates.includes(id)
              ? state.favouriteTemplates
              : [...state.favouriteTemplates, id]
            : state.favouriteTemplates.filter((entry) => entry !== id),
        }));
      })
      .catch(() => {
        // The call failed — put the star back where it was.
        set({ favouriteTemplates: before });
      });
  },
  addInvoice: (draft, status = "Draft") => {
    const invoice = toInvoice(draft, createId(), status);
    set((state) => ({ invoices: [invoice, ...state.invoices] }));
    return invoice;
  },
  updateInvoice: (id, draft) =>
    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        invoice.id === id
          ? {
              ...toInvoice(draft, id, invoice.status),
              // Editing the document doesn't unpay it, unsend it or reset what
              // the bank feed already knows about it. `toInvoice` builds a new
              // invoice, where all of those start empty.
              paidAmount: invoice.paidAmount,
              sentAt: invoice.sentAt,
              matchedTransactionId: invoice.matchedTransactionId,
              possibleMatch: invoice.possibleMatch,
            }
          : invoice,
      ),
    })),
  recordPayment: (id, received) =>
    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        invoice.id === id
          ? {
              ...invoice,
              paidAmount: received,
              status: statusAfterPayment(invoice, received),
            }
          : invoice,
      ),
    })),
  addAttachment: (id, attachment) =>
    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        invoice.id === id
          ? { ...invoice, attachments: [...invoice.attachments, attachment] }
          : invoice,
      ),
    })),
  removeAttachment: (id, attachmentId) =>
    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        invoice.id === id
          ? {
              ...invoice,
              attachments: invoice.attachments.filter(
                (file) => file.id !== attachmentId,
              ),
            }
          : invoice,
      ),
    })),
  markPaid: (ids) =>
    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        ids.includes(invoice.id)
          ? {
              ...invoice,
              paidAmount: invoiceAmount(invoice),
              status: "Paid",
            }
          : invoice,
      ),
    })),
  matchTransaction: (id, transactionId) =>
    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        invoice.id === id
          ? { ...invoice, matchedTransactionId: transactionId }
          : invoice,
      ),
    })),
  unmatchTransaction: (id) =>
    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        invoice.id === id
          ? { ...invoice, matchedTransactionId: null }
          : invoice,
      ),
    })),
  markSent: (id) =>
    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        invoice.id === id
          ? { ...invoice, sentAt: invoice.sentAt ?? toIsoDate(new Date()) }
          : invoice,
      ),
    })),
  removeInvoices: (ids) =>
    set((state) => ({
      invoices: state.invoices.filter((invoice) => !ids.includes(invoice.id)),
    })),
  removeInvoice: (id) =>
    set((state) => ({
      invoices: state.invoices.filter((invoice) => invoice.id !== id),
    })),
  duplicateInvoice: (id) => {
    const source = get().invoices.find((invoice) => invoice.id === id);
    if (!source) return undefined;

    const copy: Invoice = {
      ...source,
      id: createId(),
      number: nextInvoiceNumber(
        get().invoices,
        invoiceNumbering(useSalesSettingsStore.getState().settings),
      ),
      status: "Draft",
      // A copy has been paid nothing: the money went against the original.
      paidAmount: 0,
      // Nor has it been sent or reconciled, whatever the original did.
      sentAt: null,
      matchedTransactionId: null,
      possibleMatch: 0,
      items: source.items.map((item, index) => ({
        ...item,
        id: `${createId()}-${index}`,
      })),
    };
    set((state) => ({ invoices: [copy, ...state.invoices] }));
    return copy;
  },
}));
