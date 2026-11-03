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
import { AttachmentsCard } from "@/components/documents/invoice-extras";
import { attachInvoiceIdAtom } from "@/lib/atoms";
import {
  deleteInvoiceAttachmentApi,
  fetchInvoiceDetail,
  uploadInvoiceAttachmentApi,
  type Invoice,
  type InvoiceAttachment,
} from "@/lib/invoices";
import { useInvoicesStore } from "@/stores/invoices";

/** Every dialog here works on the invoice its atom points at. */
function useInvoice(id: string | null): Invoice | undefined {
  const invoices = useInvoicesStore((state) => state.invoices);
  return invoices.find((invoice) => invoice.id === id);
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
  const listInvoice = useInvoice(id);
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  // The list's own copy of this invoice has no real attachments (the list
  // endpoint doesn't return them) — fetched fresh so the dialog opens on
  // what's actually on the record.
  const detailQuery = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => fetchInvoiceDetail(id as string),
    enabled: id !== null,
  });
  const invoice = detailQuery.data ?? listInvoice;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["invoice", id] });

  const upload = async (picked: { id: string; file: File }[]) => {
    if (!id) return;
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

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && setId(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attachments</DialogTitle>
          <DialogDescription className="tabular">
            {invoice?.number}
          </DialogDescription>
        </DialogHeader>

        {invoice && (
          <div className="space-y-2">
            <AttachmentsCard
              files={invoice.attachments}
              onChange={() => {}}
              onFilesSelected={upload}
              onRemoveFile={remove}
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
          <Button variant="outline" onClick={() => setId(null)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Download PDF now lives in InvoicePreviewDialog — one real PDF, fetched
// once and reused for both viewing and saving, the same way sole-webapp's
// InvoiceInfo.js does it. See components/invoices/invoice-preview-dialog.tsx.
