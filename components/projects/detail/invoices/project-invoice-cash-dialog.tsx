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
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { useProjectInvoiceCashMutation } from "@/hooks/use-project-invoices-query";
import { apiErrorMessage } from "@/lib/api-error";
import { toIsoDate } from "@/lib/invoices";
import type { ProjectInvoice } from "@/lib/project-invoices";

/**
 * The old tab's "Confirm payment date" dialog. Built here rather than reusing
 * `components/invoices/cash-payment-dialog.tsx`, which looks its invoice up
 * in the main invoices store — a project's invoices aren't necessarily in it.
 * Same rules: a date is required and can't be in the future.
 */
export function ProjectInvoiceCashDialog({
  projectId,
  invoice,
  onOpenChange,
}: {
  projectId: string;
  invoice: ProjectInvoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const cash = useProjectInvoiceCashMutation(projectId);
  const today = toIsoDate(new Date());
  const [date, setDate] = React.useState(today);

  // Every opening starts on today, as the old dialog reset to it.
  React.useEffect(() => {
    if (invoice) setDate(toIsoDate(new Date()));
  }, [invoice]);

  const issue = !date.trim()
    ? "Please select the payment date."
    : date > today
      ? "Future payment dates are not allowed."
      : undefined;

  const confirm = () => {
    if (!invoice || issue) return;
    cash.mutate(
      { invoiceId: invoice.id, undo: false, paymentDate: date },
      {
        onSuccess: () => {
          toast.success("Invoice marked as paid with cash successfully!");
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(
            apiErrorMessage(error, "Failed to update cash payment status. Please try again."),
          ),
      },
    );
  };

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => !open && !cash.isPending && onOpenChange(false)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm payment date</DialogTitle>
          <DialogDescription>
            Select the date {invoice?.number || "this invoice"} was paid. This date will be used
            as the transaction date.
          </DialogDescription>
        </DialogHeader>

        <Field label="Payment date" required error={issue}>
          <DatePicker
            value={date}
            onChange={setDate}
            toDate={new Date()}
            label="Payment date"
            disabled={cash.isPending}
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" disabled={cash.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!!issue || cash.isPending} onClick={confirm}>
            {cash.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
