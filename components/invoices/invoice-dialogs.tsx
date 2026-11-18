"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AttachmentsCard } from "@/components/documents/invoice-extras";
import { attachInvoiceIdAtom } from "@/lib/atoms";
import {
  deleteInvoiceAttachmentApi,
  fetchInvoiceDetail,
  invoiceAttachmentsKey,
  uploadInvoiceAttachmentApi,
  type Invoice,
  type InvoiceAttachment,
} from "@/lib/invoices";
import { useKnownInvoice } from "@/hooks/use-invoices-query";

/** Every dialog here works on the invoice its atom points at. */
function useInvoice(id: string | null): Invoice | undefined {
  return useKnownInvoice(id);
}

/* ------------------------------------------------------------------ *
 * Attachments
 * ------------------------------------------------------------------ */

/**
 * The attachments on an invoice that already exists — saved as they're
 * chosen, each one a real upload against the invoice's own record rather
 * than a name kept only in this browser tab.
 */
export function AttachInvoiceDialog() {
  const [id, setId] = useAtom(attachInvoiceIdAtom);

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && setId(null)}>
      {/*
        Every direct child gets `min-w-0`: the content is a grid, and a grid
        item won't shrink below its content — a long file name stretched the
        whole dialog past its own edge and clipped the Replace and Remove
        buttons. The content below only exists while the dialog is open, so
        each opening starts from a fresh fetch.
      */}
      <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-md [&>*]:min-w-0">
        {id !== null && (
          <AttachInvoiceContent id={id} onClose={() => setId(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttachInvoiceContent({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const listInvoice = useInvoice(id);
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  // The list's own copy of this invoice has no real attachments (the list
  // endpoint doesn't return them), so they're fetched from the record.
  //
  // Never served from the cache: the app keeps every query fresh for five
  // minutes, so after a file was deleted in the invoice editor this dialog
  // kept showing it. Its own key, always stale, refetched on every mount and
  // dropped as soon as the dialog closes, means opening it always shows what
  // is on the invoice right now.
  const detailQuery = useQuery({
    queryKey: invoiceAttachmentsKey(id),
    queryFn: () => fetchInvoiceDetail(id),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const invoice = detailQuery.data;

  const refresh = () => {
    // The editor and quick edit cache the full record under ["invoice", id] for
    // five minutes, and the editor fills its form from whatever it finds there
    // first — so a copy cached before this change would put a deleted file back
    // on the form. Dropping it makes the next opening fetch the record again.
    queryClient.removeQueries({ queryKey: ["invoice", id] });
    return queryClient.invalidateQueries({
      queryKey: invoiceAttachmentsKey(id),
    });
  };

  const upload = async (picked: { id: string; file: File }[]) => {
    setBusy(true);
    try {
      for (const entry of picked) {
        await uploadInvoiceAttachmentApi(id, entry.file);
      }
      await refresh();
      toast.success(
        picked.length === 1
          ? `${picked[0].file.name} attached`
          : `${picked.length} files attached`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't attach that file.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (file: InvoiceAttachment) => {
    setBusy(true);
    try {
      await deleteInvoiceAttachmentApi(file.id);
      await refresh();
      toast.success(`${file.name} removed`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't remove that file.",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * Swaps a stored file for a new one: the existing document is deleted first,
   * then the replacement is uploaded. If the upload fails the old file is
   * already gone, so the message says so rather than implying nothing changed,
   * and the list is refreshed either way so it shows what is really on the
   * invoice.
   */
  const replace = async (file: InvoiceAttachment, replacement: File) => {
    setBusy(true);
    let removed = false;
    try {
      await deleteInvoiceAttachmentApi(file.id);
      removed = true;
      await uploadInvoiceAttachmentApi(id, replacement);
      toast.success(`${file.name} replaced with ${replacement.name}`);
    } catch (error) {
      toast.error(
        removed
          ? `${file.name} was removed, but ${replacement.name} couldn't be uploaded. Add it again.`
          : error instanceof Error
            ? error.message
            : `Couldn't replace ${file.name}.`,
      );
    } finally {
      await refresh().catch(() => undefined);
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Attachments</DialogTitle>
        <DialogDescription className="tabular">
          {invoice?.number ?? listInvoice?.number}
        </DialogDescription>
      </DialogHeader>

      {/* Until the record has answered there's nothing true to show: the list's
          own copy of the invoice carries no attachments, so rendering it would
          read as "no attachments" and offer only the empty dropzone. */}
      {detailQuery.isPending && (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {detailQuery.isError && (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          <p className="text-destructive">
            Couldn&apos;t load this invoice&apos;s attachments.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void detailQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {invoice && (
        <div className="space-y-2">
          <AttachmentsCard
            files={invoice.attachments}
            onChange={() => {}}
            onFilesSelected={upload}
            onRemoveFile={remove}
            onReplaceFile={replace}
            disabled={busy}
          />
          {busy && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Saving…
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

// Download PDF now lives in InvoicePreviewDialog — one real PDF, fetched
// once and reused for both viewing and saving, the same way sole-webapp's
// InvoiceInfo.js does it. See components/invoices/invoice-preview-dialog.tsx.
