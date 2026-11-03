"use client";

import { Download, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInvoicePdf } from "@/hooks/use-invoice-pdf";
import { savePdfBlob, type Invoice } from "@/lib/invoices";

/** All the PDF renderer needs: which invoice, on which template, called what. */
export type PreviewableInvoice = Pick<
  Invoice,
  "id" | "templateId" | "number"
> & { status?: Invoice["status"] };

/**
 * The invoice's real PDF — the same file the server would email or hand a
 * client, fetched from `template/:id/preview` and shown as-is, mirroring
 * sole-webapp's InvoiceInfo.js. Nothing here reconstructs the document from
 * local business/client data, so it can't drift from what's actually on
 * the record.
 *
 * Shared rather than owned by the invoices list, because more than one screen
 * needs to show a document before acting on it: the list's own preview
 * (`InvoicePreviewDialog`, which supplies the invoice from the store) and the
 * draft chooser's per-row Preview, which has only the narrow projection the
 * drafts endpoint returns and no full record to look up.
 */
export function InvoicePdfDialog({
  open,
  onOpenChange,
  invoice,
  receipt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: PreviewableInvoice | undefined;
  /**
   * Render the receipt layout instead of the invoice one. Defaults to the
   * same switch sole-webapp makes — a settled invoice gets the receipt.
   */
  receipt?: boolean;
}) {
  const asReceipt = receipt ?? invoice?.status === "Paid";
  const { pdfUrl, blob, loading, error } = useInvoicePdf(invoice, asReceipt);

  const download = () => {
    if (!blob || !invoice) return;
    savePdfBlob(blob, `${invoice.number || "invoice"}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        A column layout so the header bar stays put while the PDF scrolls
        under it — a header that scrolled away would take the download
        button with it.
      */}
      <DialogContent
        hideClose
        className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:w-[75vw] sm:max-w-[900px]"
      >
        {/*
          The one modal on the platform that opens on a brand bar rather than a
          white one — it's the only one showing the client's own document, and
          the bar is what separates "our chrome" from "your invoice" below it.
        */}
        <DialogHeader className="shrink-0 flex-row items-center justify-between gap-3 space-y-0 bg-primary p-5 text-left text-primary-foreground">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-md bg-white/15"
              aria-hidden
            >
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate">Invoice preview</DialogTitle>
              <DialogDescription className="sr-only">
                The invoice&apos;s real PDF, as your client would receive it.
              </DialogDescription>
            </div>
          </div>

          {/* Butted together, same size, same hover: two ways out of the same
              bar rather than two unrelated controls. */}
          <div className="flex shrink-0 items-center">
            {pdfUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="btn-soft-close-inverse size-7"
                aria-label={`Download ${invoice?.number ?? "invoice"} as PDF`}
                onClick={download}
              >
                <Download />
              </Button>
            )}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                aria-label="Close preview"
              >
                <X />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 bg-muted/30">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              <p className="text-sm">Loading the invoice…</p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#view=FitH&toolbar=0&statusbar=0&messages=0&navpanes=0`}
              className="h-full min-h-[75vh] w-full border-0"
              title={`${invoice?.number ?? "Invoice"} preview`}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
