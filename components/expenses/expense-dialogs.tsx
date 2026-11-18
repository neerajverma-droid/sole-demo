"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { attachExpenseAtom, viewExpenseIdAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  AttachmentUpload,
  type AttachmentUploadStatus,
} from "@/components/shared/attachment-upload";
import {
  type Expense,
  deleteExpenseAttachment,
  expenseStatusVariant,
  fetchExpenseDetail,
  formatExpenseAmount,
  formatExpenseDate,
  formatExpenseRemaining,
  expenseExGst,
  expenseGst,
  isImageAttachment,
  uploadExpenseAttachment,
} from "@/lib/expenses";
import { invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";
import { documentTax } from "@/lib/country-context";

/**
 * Read-only detail. Fetched fresh via the real `GET /v2/expense/:id` —
 * sole-webapp's own View action (`ExpensesInfo.js`) doesn't reuse whatever
 * the list row already has either, since the detail response carries fields
 * the list projection doesn't (the real receipt, the GST/subtotal
 * breakdown).
 */
export function ExpenseDetailsDialog() {
  const [viewId, setViewId] = useAtom(viewExpenseIdAtom);
  const query = useQuery({
    queryKey: ["expense", viewId],
    queryFn: () => fetchExpenseDetail(viewId as string),
    enabled: !!viewId,
  });
  const expense = query.data;
  /*
   * A copy from earlier in the session that's been marked changed — an edit
   * saved, an attachment added or removed — would open showing the old
   * details and then swap; instead wait for the refetch opening it starts.
   * An untouched copy opens straight away and re-checks quietly, as before.
   */
  const queryClient = useQueryClient();
  const markedChanged = !!queryClient.getQueryState(["expense", viewId])?.isInvalidated;
  const loadingFresh =
    query.isLoading || (markedChanged && query.isFetching && !query.isFetchedAfterMount);
  // In the business's own word for its tax, at the rate the expense was recorded at.
  const { country } = useCountryContext();
  const expenseTax = documentTax(country, expense?.date);

  return (
    <Dialog
      open={viewId !== null}
      onOpenChange={(open) => !open && setViewId(null)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Expense details</DialogTitle>
        </DialogHeader>

        {loadingFresh ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : query.isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {query.error?.message || "Couldn't load this expense. Try again."}
          </p>
        ) : (
          expense && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="font-medium">{expense.description}</p>
                <p className="text-sm text-muted-foreground tabular">
                  {formatExpenseDate(expense.date)} ·{" "}
                  {expense.supplierName || "—"}
                </p>
                <p className="text-2xl font-semibold tracking-tight tabular">
                  {formatExpenseAmount(expense)}
                </p>
                <p className="text-xs text-muted-foreground tabular">
                  {expense.isSplit
                    ? `business portion of ${invoiceMoney(expense.totalAmount)}`
                    : expense.gst
                      ? `includes ${invoiceMoney(expenseGst(expense, expenseTax.rate))} ${expenseTax.word} · ${invoiceMoney(expenseExGst(expense, expenseTax.rate))} ex-${expenseTax.word}`
                      : `no ${expenseTax.word} on this expense`}
                </p>
              </div>

              <PriceBreakdown expense={expense} tax={expenseTax} />

              <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                <Row label="Category" value={expense.category || "—"} />
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant={expenseStatusVariant(expense.status)}>
                      {expense.status}
                    </Badge>
                  </dd>
                </div>
                <Row
                  label="Remaining"
                  value={formatExpenseRemaining(expense)}
                  tabular
                />
                <Row label="Payment method" value={expense.paymentMethod} />
                <div className="space-y-1">
                  <dt className="text-xs text-muted-foreground">Invoice</dt>
                  <dd className="text-sm">
                    {expense.invoiceId ? (
                      <Link
                        href={`/invoices/${expense.invoiceId}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        On-charged — view invoice
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <Row
                  label="Matched transaction"
                  value={expense.transactionRef ?? "—"}
                  tabular
                />
              </dl>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Vendor note</p>
                <p className="text-sm leading-relaxed">
                  {expense.vendorNote.trim() || "—"}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Attachments</p>
                {expense.attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {expense.attachments.map((attachment) => (
                      <a
                        key={attachment.documentId}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={attachment.name}
                        className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border surface-subtle transition-opacity hover:opacity-80"
                      >
                        {isImageAttachment(attachment) ? (
                          // The real, already-uploaded file — not a local pick.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={attachment.url}
                            alt={attachment.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <FileText className="size-6 text-muted-foreground" />
                        )}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No attachments
                  </p>
                )}
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Attach or replace a receipt on an expense that already exists — the real
 * `POST /v2/expense/attachments` and `DELETE /v2/expense/attachments/:id`.
 *
 * The id/description come straight off `attachExpenseAtom` (the row already
 * has them; the listing no longer keeps a complete, always-populated store
 * to look them up in). But whether a receipt is *already* attached is real
 * detail-only data — the list row never carries `documents[]`, only `GET
 * /v2/expense/:id` does — so this does fetch that on open, same as the View
 * and Edit actions already do, to show the real existing attachment (and
 * give Replace/Remove a real document id to act on) instead of always
 * opening as if nothing were attached yet.
 */
export function AttachReceiptDialog() {
  const [attach, setAttach] = useAtom(attachExpenseAtom);
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<AttachmentUploadStatus>("idle");
  const [pendingName, setPendingName] = React.useState<string>();
  const busy = status !== "idle";

  const detailQuery = useQuery({
    queryKey: ["expense", attach?.id],
    queryFn: () => fetchExpenseDetail(attach?.id as string),
    enabled: !!attach,
  });

  const receipt = detailQuery.data?.receipt ?? null;

  // The dialog shows the spinner until the refetch lands, so it never shows
  // a file the server doesn't have (or still shows one it no longer has).
  const refresh = async () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
    await detailQuery.refetch();
  };

  const handleUpload = async (file: File) => {
    if (!attach || busy) return;
    // Replacing: the old receipt is removed first so the expense never ends
    // up carrying both — the same order the liability and equity dialogs use.
    const previousId = receipt?.documentId;
    setStatus("uploading");
    setPendingName(file.name);
    try {
      if (previousId) {
        try {
          await deleteExpenseAttachment(previousId);
        } catch (error) {
          toast.error(
            apiErrorMessage(
              error,
              "Couldn't remove the existing receipt, so it wasn't replaced. Try again.",
            ),
          );
          return;
        }
      }
      try {
        await uploadExpenseAttachment(attach.id, file);
        toast.success(previousId ? "Receipt replaced" : "Receipt attached");
      } catch (error) {
        toast.error(
          apiErrorMessage(
            error,
            previousId
              ? "The old receipt was removed but the new one couldn't be uploaded. Try again."
              : "Couldn't attach that file. Try again.",
          ),
        );
      }
    } finally {
      await refresh();
      setStatus("idle");
      setPendingName(undefined);
    }
  };

  const handleRemove = async () => {
    if (!receipt?.documentId || busy) return;
    setStatus("deleting");
    try {
      await deleteExpenseAttachment(receipt.documentId);
      toast.success("Receipt removed");
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't remove that attachment. Try again."),
      );
    } finally {
      await refresh();
      setStatus("idle");
    }
  };

  return (
    <Dialog
      open={attach !== null}
      onOpenChange={(open) => !open && !busy && setAttach(null)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {receipt ? "Replace receipt" : "Add receipt"}
          </DialogTitle>
          <DialogDescription>{attach?.description}</DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          attach && (
            <AttachmentUpload
              receipt={receipt}
              // Every change goes through the server (below), so there's no
              // local-only preview to keep.
              onChange={() => {}}
              onFileSelected={handleUpload}
              onRemove={handleRemove}
              busy={busy}
              status={status}
              pendingName={pendingName}
            />
          )
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setAttach(null)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The figures sole-webapp's View (`ExpensesInfo.js`) lists: sub total, GST and
 * total price, then — for an expense split between business and personal use —
 * how much of that total is each. The server's own breakdown where the detail
 * response carries it; worked out from the total and the GST flag where it
 * doesn't.
 */
export function PriceBreakdown({
  expense,
  tax,
}: {
  expense: Expense;
  tax: { rate: number; word: string };
}) {
  const total = expense.totalAmount;
  const gst =
    expense.totalGst ??
    expenseGst({ amount: total, gst: expense.gst, gstPercent: expense.gstPercent }, tax.rate);
  const subTotal = expense.subTotal ?? total - gst;
  const personal = expense.personalAmount ?? Math.max(0, total - expense.amount);

  return (
    <dl className="divide-y divide-border rounded-lg border border-border text-sm">
      <div className="space-y-2 p-3">
        <MoneyRow label="Sub total" value={subTotal} />
        <MoneyRow label={tax.word} value={gst} />
        <MoneyRow label="Total price" value={total} strong />
      </div>
      {expense.isSplit && (
        <div className="space-y-2 p-3">
          <MoneyRow label="Price (business)" value={expense.amount} />
          <MoneyRow label="Price (personal)" value={personal} />
        </div>
      )}
    </dl>
  );
}

function MoneyRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular", strong && "font-medium")}>
        {invoiceMoney(value)}
      </dd>
    </div>
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
