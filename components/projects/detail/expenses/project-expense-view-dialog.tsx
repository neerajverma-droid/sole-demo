"use client";

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectMoney } from "@/components/projects/project-shared";
import { useProjectExpenseViewQuery } from "@/hooks/use-project-expenses-query";
import { formatExpenseDate } from "@/lib/expenses";

/**
 * The Expenses screen's "Expense details" dialog, laid out the same way, but
 * holding only what sole-webapp's ExpensesInfo showed when opened from a
 * project: name, date, supplier, the amounts and GST, category, the
 * business/personal split, paid with cash and the attachments. Status,
 * remaining, payment method, invoice, matched transaction and vendor note
 * belong to the Expenses screen, not a project's view.
 */
export function ProjectExpenseViewDialog({
  expenseId,
  onOpenChange,
}: {
  expenseId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const money = useProjectMoney();
  const query = useProjectExpenseViewQuery(expenseId);
  const expense = query.data;
  const amount = (value: number | null) => (value === null ? "-" : money(value));

  return (
    <Dialog open={expenseId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Expense details</DialogTitle>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : query.isError || !expense ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {query.error?.message || "Couldn't load this expense. Try again."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="font-medium">{expense.name || "-"}</p>
              <p className="text-sm text-muted-foreground tabular">
                {expense.date ? formatExpenseDate(expense.date) : "-"} · {expense.supplier || "—"}
              </p>
              <p className="text-2xl font-semibold tracking-tight tabular">
                {amount(expense.totalPrice)}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                {expense.gst ? `includes ${amount(expense.gst)} GST` : "no GST on this expense"}
              </p>
            </div>

            <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Row label="Category" value={expense.category || "—"} />
              <Row label="Sub total" value={amount(expense.subTotal)} tabular />
              {expense.isSplit && (
                <>
                  <Row label="Price (Business)" value={amount(expense.businessAmount)} tabular />
                  <Row label="Price (Personal)" value={amount(expense.personalAmount)} tabular />
                </>
              )}
              <Row label="Paid with cash" value={expense.paidWithCash ? "Yes" : "No"} />
            </dl>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Attachments</p>
              {expense.files.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {expense.files.map((file) => (
                    <a
                      key={file.url}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={file.name}
                      className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border surface-subtle transition-opacity hover:opacity-80"
                    >
                      {file.isImage ? (
                        // The real, already-uploaded file — not a local pick.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.url} alt={file.name} className="size-full object-cover" />
                      ) : (
                        <FileText className="size-6 text-muted-foreground" />
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No attachments</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={tabular ? "text-sm tabular" : "text-sm"}>{value}</dd>
    </div>
  );
}
