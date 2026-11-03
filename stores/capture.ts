import { create } from "zustand";

import type {
  ExpenseExtractionFields,
  InvoiceExtractionFields,
} from "@/lib/ocr-capture";

/**
 * A document that's been read and is on its way into a form.
 *
 * The chooser (`/invoices/new`, `/expenses/new`) and the form are different
 * routes, so what the capture found has to survive a navigation. This is that
 * hand-off, and nothing more: the form takes it once on mount (`take*`) and it
 * is gone, so reloading the form or coming back later starts blank. Not
 * persisted, for the same reason — a stale reading must never seed a form
 * nobody asked it to.
 */
type CaptureState = {
  invoice: { fields: InvoiceExtractionFields; confidence: number } | null;
  expense: {
    fields: ExpenseExtractionFields;
    confidence: number;
    /** The original file, so the form can attach it as the receipt. */
    file: File;
  } | null;
  setInvoice: (value: NonNullable<CaptureState["invoice"]>) => void;
  setExpense: (value: NonNullable<CaptureState["expense"]>) => void;
  takeInvoice: () => CaptureState["invoice"];
  takeExpense: () => CaptureState["expense"];
};

export const useCaptureStore = create<CaptureState>((set, get) => ({
  invoice: null,
  expense: null,
  setInvoice: (invoice) => set({ invoice }),
  setExpense: (expense) => set({ expense }),
  takeInvoice: () => {
    const { invoice } = get();
    if (invoice) set({ invoice: null });
    return invoice;
  },
  takeExpense: () => {
    const { expense } = get();
    if (expense) set({ expense: null });
    return expense;
  },
}));
