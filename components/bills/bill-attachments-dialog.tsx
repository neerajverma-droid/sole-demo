"use client";

import * as React from "react";
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
import {
  MultiAttachmentUpload,
  type MultiAttachmentRow,
} from "@/components/shared/multi-attachment-upload";
import { useBillQuery, useInvalidateBills } from "@/hooks/use-bills-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  deleteBillAttachment,
  uploadBillAttachment,
  type Bill,
} from "@/lib/bills";

/**
 * Add or remove the supplier's bill (a PDF or photo) on a saved bill without
 * opening it, from the list's row menu — the same job the expense list's
 * "Attach receipt" does. Each upload and removal is live, as it is on the bill
 * form. Only offered for a bill that hasn't been converted: a converted bill's
 * files live on its expense.
 */
export function BillAttachmentsDialog({
  bill,
  onClose,
}: {
  bill: Bill | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!bill} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {/* Keyed so each bill starts from a clean slate. */}
        {bill && <AttachmentsBody key={bill.id} bill={bill} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function AttachmentsBody({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const detail = useBillQuery(bill.id);
  const invalidate = useInvalidateBills();
  /** Files on their way up — not in the stored list yet. */
  const [uploading, setUploading] = React.useState<MultiAttachmentRow[]>([]);
  const [deleting, setDeleting] = React.useState<string[]>([]);

  const stored: MultiAttachmentRow[] = (detail.data?.attachments ?? []).map((attachment) => ({
    key: attachment.documentId,
    name: attachment.name,
    url: attachment.url,
    status: deleting.includes(attachment.documentId) ? "deleting" : "idle",
  }));
  const rows = [...stored, ...uploading];

  const onAdd = async (files: File[]) => {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const placeholder: MultiAttachmentRow = {
        key: `uploading_${Date.now()}_${index}`,
        name: file.name,
        size: file.size,
        url: "",
        status: "uploading",
      };
      setUploading((current) => [...current, placeholder]);
      try {
        await uploadBillAttachment(bill.id, file);
        await detail.refetch();
        invalidate();
      } catch (error) {
        toast.error(apiErrorMessage(error, `Couldn't attach "${file.name}". Try again.`));
      } finally {
        setUploading((current) => current.filter((row) => row.key !== placeholder.key));
      }
    }
  };

  const onRemove = async (key: string) => {
    setDeleting((current) => [...current, key]);
    try {
      await deleteBillAttachment(bill.id, key);
      await detail.refetch();
      invalidate();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove that attachment. Try again."));
    } finally {
      setDeleting((current) => current.filter((id) => id !== key));
    }
  };

  const label = bill.billNo || bill.supplierName || "this bill";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Attach a document</DialogTitle>
        <DialogDescription>Keep the supplier&apos;s bill with {label}.</DialogDescription>
      </DialogHeader>

      {detail.isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="animate-spin" aria-label="Loading attachments" />
        </div>
      ) : detail.isError ? (
        <p className="py-4 text-sm text-destructive">
          {apiErrorMessage(detail.error, "Couldn't load this bill's attachments.")}
        </p>
      ) : (
        <MultiAttachmentUpload
          noun="bill"
          rows={rows}
          onAdd={(files) => void onAdd(files)}
          onRemove={(key) => void onRemove(key)}
          onOpen={(row) => row.url && window.open(row.url, "_blank", "noopener")}
        />
      )}

      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  );
}
