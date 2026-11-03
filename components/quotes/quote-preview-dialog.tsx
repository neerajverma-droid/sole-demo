"use client";

import { useAtom } from "jotai";
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
import { useQuotePdf } from "@/hooks/use-quote-pdf";
import { viewQuoteIdAtom } from "@/lib/atoms";
import { savePdfBlob } from "@/lib/invoices";
import { useKnownQuotes } from "@/hooks/use-quotes-query";

/**
 * The quote's real PDF — the same file the server would email or hand a
 * client, fetched from `quote/preview/:templateId` and shown as-is, mirroring
 * sole-webapp's QuoteInfo.js. Nothing here reconstructs the document from
 * local business/client data, so it can't drift from what's on the record.
 */
export function QuotePreviewDialog() {
  const [viewId, setViewId] = useAtom(viewQuoteIdAtom);
  const quotes = useKnownQuotes();
  const quote = quotes.find((entry) => entry.id === viewId);

  const { pdfUrl, blob, loading, error } = useQuotePdf(quote);

  const download = () => {
    if (!blob || !quote) return;
    savePdfBlob(blob, `${quote.number || "quote"}.pdf`);
  };

  return (
    <Dialog
      open={viewId !== null}
      onOpenChange={(open) => !open && setViewId(null)}
    >
      {/*
        A column layout so the header bar stays put while the PDF scrolls
        under it — a header that scrolled away would take the download
        button with it.
      */}
      <DialogContent
        hideClose
        className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:w-[75vw] sm:max-w-[900px]"
      >
        {/* The brand bar separates "our chrome" from "your quote" below it —
            the same treatment the invoice preview gets. */}
        <DialogHeader className="shrink-0 flex-row items-center justify-between gap-3 space-y-0 bg-primary p-5 text-left text-primary-foreground">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-md bg-white/15"
              aria-hidden
            >
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate">Quote preview</DialogTitle>
              <DialogDescription className="sr-only">
                The quote&apos;s real PDF, as your client would receive it.
              </DialogDescription>
            </div>
          </div>

          <div className="flex shrink-0 items-center">
            {pdfUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="btn-soft-close-inverse size-7"
                aria-label={`Download ${quote?.number ?? "quote"} as PDF`}
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
              <p className="text-sm">Loading the quote…</p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#view=FitH&toolbar=0&statusbar=0&messages=0&navpanes=0`}
              className="h-full min-h-[75vh] w-full border-0"
              title={`${quote?.number ?? "Quote"} preview`}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
