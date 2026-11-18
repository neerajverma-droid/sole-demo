"use client";

import { useAtom } from "jotai";

import { InvoicePdfDialog } from "@/components/shared/invoice-pdf-dialog";
import { viewInvoiceIdAtom } from "@/lib/atoms";
import { useKnownInvoice } from "@/hooks/use-invoices-query";

/**
 * The list's own PDF preview: whichever invoice `viewInvoiceIdAtom` points at,
 * resolved against the rows the list is showing and handed to the shared viewer. The
 * document itself — and the receipt-vs-invoice switch a settled invoice gets —
 * lives in `InvoicePdfDialog`, so the draft chooser's per-row Preview shows
 * exactly the same thing from its own, narrower record.
 */
export function InvoicePreviewDialog() {
  const [viewId, setViewId] = useAtom(viewInvoiceIdAtom);
  const invoice = useKnownInvoice(viewId);

  return (
    <InvoicePdfDialog
      open={viewId !== null}
      onOpenChange={(open) => !open && setViewId(null)}
      invoice={invoice}
    />
  );
}
