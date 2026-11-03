"use client";

import { useAtom } from "jotai";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCountryContext } from "@/hooks/use-country-context";
import { useExpensesQuery } from "@/hooks/use-expenses-query";
import { viewVendorRefundIdAtom } from "@/lib/atoms";
import { contactDisplayName } from "@/lib/contacts";
import {
  bankAccountField,
  bankBranchField,
  taxWord,
} from "@/lib/country-context";
import { invoiceMoney } from "@/lib/invoices";
import {
  formatVendorRefundAmount,
  formatVendorRefundDate,
  formatVendorRefundGst,
  vendorRefundAmount,
  vendorRefundGst,
  vendorRefundReasonLabel,
  vendorRefundStatusVariant,
} from "@/lib/vendor-refunds";
import { cn } from "@/lib/utils";
import { useContactsStore } from "@/stores/contacts";
import { useExpensesStore } from "@/stores/expenses";
import { useVendorRefundsStore } from "@/stores/vendor-refunds";

/**
 * Read-only detail for one vendor refund.
 *
 * Everything here is a value, not a control — the reason, the type and the
 * linked expense are text in a label/value grid rather than disabled inputs,
 * which would read as an editable form that had been switched off. Editing
 * lives behind the row menu's Edit, on the form.
 */
export function VendorRefundDetailsDialog() {
  const [viewId, setViewId] = useAtom(viewVendorRefundIdAtom);
  const refunds = useVendorRefundsStore((state) => state.vendorRefunds);
  const markVendorRefunded = useVendorRefundsStore(
    (state) => state.markVendorRefunded,
  );
  const contacts = useContactsStore((state) => state.contacts);
  // The expenses store only fills in once something fetches it — visiting
  // Vendor Refunds directly (without having visited Expenses first) would
  // otherwise leave "Linked expense" reading "None" even when a real one
  // exists. React Query dedupes this against whatever's already cached, so
  // it's a no-op if Expenses already loaded it.
  useExpensesQuery();
  const expenses = useExpensesStore((state) => state.expenses);
  // "GST", "VAT" — the business's own word for the tax inside the amount.
  const { country } = useCountryContext();
  // BSB in Australia; New Zealand has no branch field — it's in the account number.
  const branchField = bankBranchField(country);
  const accountLabel = bankAccountField(country)?.label || "Account number";
  const tax = taxWord(country);

  const refund = refunds.find((entry) => entry.id === viewId);

  // The live contact name wins while the contact exists; the snapshot is the
  // fallback, same as the table.
  const contact = contacts.find((entry) => entry.id === refund?.supplierId);
  const supplier = contact
    ? contactDisplayName(contact)
    : (refund?.supplierName ?? "");
  const expense = expenses.find((entry) => entry.id === refund?.expenseId);

  return (
    <Dialog
      open={viewId !== null}
      onOpenChange={(open) => !open && setViewId(null)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vendor refund details</DialogTitle>
        </DialogHeader>

        {refund && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="font-medium">{supplier}</p>
              <p className="text-sm text-muted-foreground tabular">
                {refund.reference} · {formatVendorRefundDate(refund.date)} ·{" "}
                {refund.type}
              </p>
              {/* The amount is the whole of it — GST sits inside, never added. */}
              <p className="text-2xl font-semibold tracking-tight tabular">
                {formatVendorRefundAmount(refund)}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                includes {formatVendorRefundGst(refund)} {tax}
                {vendorRefundGst(refund) > 0 &&
                  vendorRefundAmount(refund) > 0 &&
                  ` · ${invoiceMoney(vendorRefundAmount(refund) - vendorRefundGst(refund))} excl. ${tax}`}
              </p>
            </div>

            <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Row label="Reason" value={vendorRefundReasonLabel(refund)} />
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={vendorRefundStatusVariant(refund.status)}>
                    {refund.status}
                  </Badge>
                </dd>
              </div>
              <Row
                label="Linked expense"
                value={expense ? expense.description : "None"}
              />
              <Row label="Type" value={refund.type} />
            </dl>

            {refund.bank ? (
              <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Received into account
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
                A credit note isn&apos;t paid out — it sits against your account
                with the supplier until it&apos;s used.
              </p>
            )}

            {refund.notes.trim() && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm leading-relaxed">{refund.notes}</p>
              </div>
            )}

            {refund.status === "Awaiting" && (
              <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Not yet received</p>
                  <p className="text-xs text-muted-foreground">
                    Mark it refunded once the money is back in your account.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    markVendorRefunded(refund.id);
                    setViewId(null);
                    toast.success(`${refund.reference} marked as refunded`, {
                      description: "Recorded as received from the supplier.",
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

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
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
