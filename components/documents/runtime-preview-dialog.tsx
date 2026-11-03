"use client";

import * as React from "react";
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
import { savePdfBlob } from "@/lib/invoices";

/**
 * A document exactly as it will print, before any of it has been saved.
 *
 * Mirrors sole-webapp's own top-of-form "Preview" button on both the invoice
 * and the quote form: the draft is sent to the same real PDF renderer a saved
 * document's preview and download use, so what's shown here is never a local
 * reconstruction that could drift from the actual server output.
 *
 * Which renderer is asked is the caller's business — `fetchBlob` is the one
 * request that differs between an invoice and a quote; everything about
 * showing the bytes is shared here.
 *
 * Fetched once per open rather than on every keystroke — the dialog shows the
 * draft as it stood the moment "Preview" was clicked; closing and reopening
 * picks up whatever changed since.
 */
export function RuntimePreviewDialog({
  open,
  onOpenChange,
  fetchBlob,
  title,
  filename,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renders the draft as it stands right now. Read once per open. */
  fetchBlob: () => Promise<Blob>;
  /** The header, e.g. "Invoice preview" — also the iframe's accessible name. */
  title: string;
  /** What the download button saves the PDF as. */
  filename: string;
  /** Screen-reader description of what's being previewed. */
  description?: string;
}) {
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The latest fetcher, so opening uses the draft as it stands at that moment
  // without re-fetching every time the parent re-renders.
  const fetchRef = React.useRef(fetchBlob);
  React.useEffect(() => {
    fetchRef.current = fetchBlob;
  });

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    setBlob(null);

    fetchRef
      .current()
      .then((result) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(result);
        setBlob(result);
        setPdfUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Couldn't generate the preview.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open]);

  const download = () => {
    if (!blob) return;
    savePdfBlob(blob, filename);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Same column layout and brand header as the saved-document preview —
          one modal language for "here's your document," wherever it's shown from. */}
      <DialogContent
        hideClose
        className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:w-[75vw] sm:max-w-[900px]"
      >
        <DialogHeader className="shrink-0 flex-row items-center justify-between gap-3 space-y-0 bg-primary p-5 text-left text-primary-foreground">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-md bg-white/15"
              aria-hidden
            >
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate">{title}</DialogTitle>
              <DialogDescription className="sr-only">
                {description ??
                  "How this document will look once it's sent — nothing here has been saved."}
              </DialogDescription>
            </div>
          </div>

          <div className="flex shrink-0 space-x-3 items-center">
            {pdfUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="btn-soft-close-inverse size-7"
                aria-label="Download this preview as PDF"
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
              <p className="text-sm">Generating the preview…</p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#view=FitH&toolbar=0&statusbar=0&messages=0&navpanes=0`}
              className="h-full min-h-[75vh] w-full border-0"
              title={title}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
