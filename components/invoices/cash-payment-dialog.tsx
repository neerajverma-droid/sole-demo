"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
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
import { cashPaymentInvoiceIdAtom } from "@/lib/atoms";
import {
  markInvoicePaidWithCashApi,
  toIsoDate,
  type Invoice,
} from "@/lib/invoices";
import { useKnownInvoice } from "@/hooks/use-invoices-query";

/**
 * When a cash payment actually landed — sole-webapp's own cash-payment date
 * dialog. Marking paid without asking defaults every cash payment to today,
 * which misdates the common case of recording one a few days after the fact.
 */
export function CashPaymentDialog() {
  const [invoiceId, setInvoiceId] = useAtom(cashPaymentInvoiceIdAtom);
  const invoice = useKnownInvoice(invoiceId);
  const queryClient = useQueryClient();

  const today = toIsoDate(new Date());
  const [date, setDate] = React.useState(today);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (invoiceId) setDate(toIsoDate(new Date()));
  }, [invoiceId]);

  const issue = !date.trim()
    ? "Select the payment date."
    : date > today
      ? "Future payment dates aren't allowed."
      : undefined;

  const confirm = async (target: Invoice) => {
    setSaving(true);
    try {
      await markInvoicePaidWithCashApi(target.id, date);

      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`${target.number} marked as paid`);
      setInvoiceId(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Couldn't mark ${target.number} as paid.`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={invoiceId !== null}
      onOpenChange={(open) => !open && setInvoiceId(null)}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as paid with cash</DialogTitle>
          <DialogDescription className="tabular">
            {invoice?.number}
          </DialogDescription>
        </DialogHeader>

        <Field label="Payment date" required error={issue}>
          <DatePicker
            value={date}
            onChange={setDate}
            label="Payment date"
          />
        </Field>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setInvoiceId(null)}
          >
            Cancel
          </Button>
          <Button
            disabled={!!issue || !invoice || saving}
            onClick={() => invoice && confirm(invoice)}
          >
            {saving ? "Saving…" : "Mark as paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
