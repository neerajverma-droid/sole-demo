"use client";

import { RuntimePreviewDialog } from "@/components/documents/runtime-preview-dialog";
import {
  fetchInvoiceRuntimePreviewBlob,
  type InvoiceSubmitContext,
} from "@/lib/invoice-submit";
import type { InvoiceDraft } from "@/lib/invoices";

/**
 * The invoice exactly as it will print, before any of it has been saved —
 * the shared runtime preview, pointed at the invoice renderer. The draft is
 * read the moment the dialog opens, so the participant and bank details the
 * server composes from the selected client come out exactly as they would on
 * save.
 */
export function InvoiceRuntimePreviewDialog({
  open,
  onOpenChange,
  draft,
  context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: InvoiceDraft;
  context: InvoiceSubmitContext;
}) {
  return (
    <RuntimePreviewDialog
      open={open}
      onOpenChange={onOpenChange}
      fetchBlob={() => fetchInvoiceRuntimePreviewBlob(draft, context)}
      title="Invoice preview"
      filename={`${draft.number || "invoice"}-preview.pdf`}
      description="How this invoice will look once it's sent — nothing here has been saved."
    />
  );
}
