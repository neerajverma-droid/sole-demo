"use client";

import { useCountryContext } from "@/hooks/use-country-context";
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
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import {
  daysBetween,
  invoiceAmount,
  markInvoicePaidWithCashApi,
  toIsoDate,
  type Invoice,
} from "@/lib/invoices";
import { useInvoicesStore } from "@/stores/invoices";

/**
 * When a cash payment actually landed — sole-webapp's own cash-payment date
 * dialog. Marking paid without asking defaults every cash payment to today,
 * which misdates the common case of recording one a few days after the fact.
 */
export function CashPaymentDialog() {
  const { country } = useCountryContext();
  const [invoiceId, setInvoiceId] = useAtom(cashPaymentInvoiceIdAtom);
  const invoices = useInvoicesStore((state) => state.invoices);
  const invoice = invoices.find((entry) => entry.id === invoiceId);
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

      /*
       * Fired here rather than inside `markInvoicePaidWithCashApi`, which is
       * handed an id and a date and so cannot say what the invoice was worth
       * or how long it took. This dialog has the whole invoice.
       *
       * `days_to_payment` is the number the business actually wants from this
       * — "how long do clients take to pay" is not answerable from a count of
       * payments — so it is a required property of the event and the dev
       * validator says so if it ever goes missing.
       */
      track(EVENTS.INVOICE_PAID, {
        amount: invoiceAmount(target),
        days_to_payment: Math.max(0, daysBetween(target.issued, date)),
        method: "cash",
        // `amount` is in the books' currency, so that is the currency to report it in.
        currency: target.baseCurrency ?? country.currency,
      });

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
