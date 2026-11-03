"use client";

import { useAtom } from "jotai";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMarkClientRefundedMutation } from "@/hooks/use-client-refunds-query";
import { viewRefundIdAtom } from "@/lib/atoms";
import { useCountryContext } from "@/hooks/use-country-context";
import { contactDisplayName } from "@/lib/contacts";
import {
  bankAccountField,
  bankBranchField,
  taxWord,
} from "@/lib/country-context";
import { invoiceMoney } from "@/lib/invoices";
import {
  formatRefundAmount,
  formatRefundDate,
  formatRefundGst,
  refundAmount,
  refundGst,
  refundReasonLabel,
  refundStatusVariant,
} from "@/lib/refunds";
import { cn } from "@/lib/utils";
import { useContactsStore } from "@/stores/contacts";
import { useInvoicesStore } from "@/stores/invoices";
import { useRefundsStore } from "@/stores/refunds";

export function RefundDetailsDialog() {
  const [viewId, setViewId] = useAtom(viewRefundIdAtom);
  const refunds = useRefundsStore((state) => state.refunds);
  const markRefundedMutation = useMarkClientRefundedMutation();
  const contacts = useContactsStore((state) => state.contacts);
  const invoices = useInvoicesStore((state) => state.invoices);
  // "GST", "VAT" — the business's own word for the tax inside the amount.
  const { country } = useCountryContext();
  // BSB in Australia; New Zealand has no branch field — it's in the account number.
  const branchField = bankBranchField(country);
  const accountLabel = bankAccountField(country)?.label || "Account number";
  const tax = taxWord(country);

  const refund = refunds.find((entry) => entry.id === viewId);

  // The live contact name wins while the contact exists; the snapshot is the
  // fallback, same as the table.
  const contact = contacts.find((entry) => entry.id === refund?.clientId);
  const client = contact
    ? contactDisplayName(contact)
    : (refund?.clientName ?? "");
  const invoice = invoices.find((entry) => entry.id === refund?.invoiceId);

  return (
    <Dialog
      open={viewId !== null}
      onOpenChange={(open) => !open && setViewId(null)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund details</DialogTitle>
        </DialogHeader>

        {refund && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="font-medium">{client}</p>
              <p className="text-sm text-muted-foreground tabular">
                {refund.reference} · {formatRefundDate(refund.date)} ·{" "}
                {refund.type}
              </p>
              {/* The amount is the whole of it — GST sits inside, never added. */}
              <p className="text-2xl font-semibold tracking-tight tabular">
                {formatRefundAmount(refund)}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                includes {formatRefundGst(refund)} {tax}
                {refundGst(refund) > 0 &&
                  refundAmount(refund) > 0 &&
                  ` · ${invoiceMoney(refundAmount(refund) - refundGst(refund))} excl. ${tax}`}
              </p>
            </div>

            <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Row label="Reason" value={refundReasonLabel(refund)} />
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={refundStatusVariant(refund.status)}>
                    {refund.status}
                  </Badge>
                </dd>
              </div>
              <Row
                label="Linked invoice"
                value={invoice ? invoice.number : "None"}
                tabular={!!invoice}
              />
              <Row label="Type" value={refund.type} />
            </dl>

            {refund.bank ? (
              <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Paid to account
                  </dt>
                  <dd className="text-sm">{refund.bank.accountName}</dd>
                </div>
                {branchField && refund.bank.bsb.trim() && (
                  <Row
                    label={branchField.label}
                    value={refund.bank.bsb}
                    tabular
                  />
                )}
                <Row
                  label={accountLabel}
                  value={refund.bank.accountNumber}
                  tabular
                />
              </dl>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                A credit note isn&apos;t paid out — it sits against the
                client&apos;s account until it&apos;s used.
              </p>
            )}

            {refund.notes.trim() && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm leading-relaxed">{refund.notes}</p>
              </div>
            )}

            {refund.status === "Issued" && (
              <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Not yet paid out</p>
                  <p className="text-xs text-muted-foreground">
                    Mark it refunded once the money has left your account.
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={markRefundedMutation.isPending}
                  onClick={() => {
                    markRefundedMutation.mutate(refund.id, {
                      onSuccess: () => {
                        setViewId(null);
                        toast.success(
                          `${refund.reference} marked as refunded`,
                        );
                      },
                      onError: (error: Error) =>
                        toast.error(
                          error.message || "Failed to mark as refunded.",
                        ),
                    });
                  }}
                >
                  <CircleCheck />
                  Mark as refunded
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", tabular && "tabular")}>{value}</dd>
    </div>
  );
}
