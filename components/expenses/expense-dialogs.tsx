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
import { AttachmentUpload } from "@/components/shared/attachment-upload";
import {
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
  type ExpenseReceipt,
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

        {query.isLoading ? (
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
                  {expense.gst
                    ? `includes ${invoiceMoney(expenseGst(expense, expenseTax.rate))} ${expenseTax.word} · ${invoiceMoney(expenseExGst(expense, expenseTax.rate))} ex-${expenseTax.word}`
                    : `no ${expenseTax.word} on this expense`}
                </p>
              </div>

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
  const [busy, setBusy] = React.useState(false);
  // Overrides the server value once a change is made in this sitting, so the
  // dialog doesn't sit on stale state until the refetch lands.
  const [localReceipt, setLocalReceipt] = React.useState<
    ExpenseReceipt | null | undefined
  >(undefined);

  const detailQuery = useQuery({
    queryKey: ["expense", attach?.id],
    queryFn: () => fetchExpenseDetail(attach?.id as string),
    enabled: !!attach,
  });

  React.useEffect(() => {
    setLocalReceipt(undefined);
  }, [attach?.id]);

  const receipt =
    localReceipt !== undefined ? localReceipt : (detailQuery.data?.receipt ?? null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
    if (attach) {
      queryClient.invalidateQueries({ queryKey: ["expense", attach.id] });
    }
  };

  const handleUpload = async (file: File) => {
    if (!attach || busy) return;
    setBusy(true);
    try {
      const { documentId } = await uploadExpenseAttachment(attach.id, file);
      setLocalReceipt((current) =>
        current ? { ...current, documentId } : current,
      );
      invalidate();
      toast.success("Receipt attached");
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't attach that file. Try again."),
      );
      setLocalReceipt(null);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!receipt?.documentId || busy) return;
    setBusy(true);
    try {
      await deleteExpenseAttachment(receipt.documentId);
      setLocalReceipt(null);
      invalidate();
      toast.success("Receipt removed");
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't remove that attachment. Try again."),
      );
    } finally {
      setBusy(false);
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
              onChange={setLocalReceipt}
              onFileSelected={handleUpload}
              onRemove={handleRemove}
              busy={busy}
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
