/**
 * Handing a Time Tracker invoice to the invoice page.
 *
 * "Create invoice" on the Time Tracker opens the full invoice editor
 * (/invoices/new/general, or a chosen draft's /invoices/:id) rather than a
 * modal, so what was built from the selected sessions — the lines, client,
 * project, the sessions to mark invoiced and the timesheet rows — has to
 * survive the navigation. It travels as a short key in the URL (`?time=`)
 * with the data itself in sessionStorage, so a reload of the invoice page
 * still has it. The timesheet PDF isn't stored: a File can't be, and the page
 * regenerates it from the timesheet rows.
 *
 * Storage can be unavailable (private windows, blocked site data); an
 * in-memory copy covers the navigation itself in that case.
 */
import type { TimeInvoice } from "@/lib/time-tracker";

const PREFIX = "time-invoice:";
const memory = new Map<string, TimeInvoice>();

function newKey(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Stores the invoice and returns the key to put in the URL. */
export function saveTimeInvoiceHandoff(invoice: TimeInvoice): string {
  const key = newKey();
  memory.set(key, invoice);
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(invoice));
  } catch {
    // In-memory only — enough for the navigation, not for a reload.
  }
  return key;
}

export function readTimeInvoiceHandoff(key: string | null | undefined): TimeInvoice | null {
  if (!key) return null;
  const inMemory = memory.get(key);
  if (inMemory) return inMemory;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TimeInvoice;
    return parsed && Array.isArray(parsed.logIds) && parsed.seed ? parsed : null;
  } catch {
    return null;
  }
}

/** Once the invoice is saved, so a back-navigation can't raise it twice. */
export function clearTimeInvoiceHandoff(key: string): void {
  memory.delete(key);
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing stored to clear.
  }
}

export type TimeInvoiceStep = "closed" | "checking" | "choosing" | "open-new";

/**
 * What "Create invoice" shows next: wait while the client's drafts load; with
 * drafts, let the person pick one or start new; with none — or with no client
 * to have drafts — go straight to a new invoice page.
 */
export function timeInvoiceStep(input: {
  open: boolean;
  clientId: string | null;
  draftsLoading: boolean;
  draftCount: number;
}): TimeInvoiceStep {
  if (!input.open) return "closed";
  if (input.clientId !== null && input.draftsLoading) return "checking";
  return input.draftCount > 0 ? "choosing" : "open-new";
}

/** The page to open: a new invoice, or the chosen draft with the time appended. */
export function timeInvoiceHref(key: string, draftId?: string | null): string {
  const query = `?time=${encodeURIComponent(key)}`;
  return draftId ? `/invoices/${encodeURIComponent(draftId)}${query}` : `/invoices/new/general${query}`;
}
