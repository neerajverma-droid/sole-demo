"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Receipt, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { apiErrorMessage } from "@/lib/api-error";
import {
  expenseInvoiceableAmount,
  fetchExpenseDetail,
  formatExpenseDate,
  isExpenseInvoiced,
  markExpenseInvoicedApi,
} from "@/lib/expenses";
import { draftInvoicesQueryKey } from "@/lib/invoice-drafts";
import { invoiceMoney } from "@/lib/invoices";
import { useExpensesStore } from "@/stores/expenses";

export const EXPENSES_ROOT = "/expenses";

/**
 * Where the list leaves the expense row it's converting, so the invoice page
 * opens on it without a second request. A reload — or a link opened fresh —
 * misses the cache and fetches the expense's detail instead.
 */
export function expenseInvoiceQueryKey(expenseId: string) {
  return ["expense", expenseId, "convert-to-invoice"] as const;
}

/** The page to open: a new invoice, or the chosen draft with the expense appended. */
export function expenseInvoiceHref(expenseId: string, draftId?: string | null): string {
  const query = `?expense=${encodeURIComponent(expenseId)}`;
  return draftId
    ? `/invoices/${encodeURIComponent(draftId)}${query}`
    : `/invoices/new/general${query}`;
}

/**
 * The invoice page opened from Expenses → Convert to invoice: the full invoice
 * editor — a new invoice, or the chosen draft (`invoiceId`) with the expense
 * appended — with the expense as its line. Once it saves, the expense is
 * linked to the invoice and the person is back on their expenses, the same
 * shape as Time Tracker's Create invoice (see TimeInvoiceEditor).
 */
export function ExpenseInvoiceEditor({
  expenseId,
  invoiceId,
}: {
  /** `?expense=` — the expense being on-charged. */
  expenseId: string;
  /** A draft being added to, or nothing for a new invoice. */
  invoiceId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const linkInvoice = useExpensesStore((state) => state.linkInvoice);

  const expenseQuery = useQuery({
    queryKey: expenseInvoiceQueryKey(expenseId),
    queryFn: () => fetchExpenseDetail(expenseId),
    staleTime: Infinity,
    retry: false,
  });
  const expense = expenseQuery.data;
  // Once this page has saved, the cached expense is marked invoiced (below) —
  // that's for a Back into this page, not for swapping the editor out here.
  const [justSaved, setJustSaved] = React.useState(false);
  const invoiced = !justSaved && expense ? isExpenseInvoiced(expense) : false;

  const handleSaved = async (saved: { id: string; number: string }) => {
    if (!expense) return;

    // The link is what stops the row offering to convert a second time, so a
    // failure here is worth saying out loud even though the invoice itself
    // saved fine.
    try {
      await markExpenseInvoicedApi(expense.id, saved.id, saved.number);
      linkInvoice(expense.id, saved.id);
    } catch (error) {
      toast.error(
        apiErrorMessage(
          error,
          `${saved.number} was created, but couldn't be linked back to this expense.`,
        ),
      );
    }

    // So a Back into this page can't raise it a second time.
    setJustSaved(true);
    queryClient.setQueryData(expenseInvoiceQueryKey(expense.id), {
      ...expense,
      invoiceId: saved.id,
    });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
    queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
    // A draft that was just sent is no longer on offer, and a new one that was
    // saved as a draft now is.
    queryClient.invalidateQueries({ queryKey: draftInvoicesQueryKey(null) });
    router.push(EXPENSES_ROOT);
  };

  if (expenseQuery.isLoading) {
    return (
      <div
        className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground"
        aria-busy="true"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <p className="text-sm">Preparing the invoice from your expense…</p>
      </div>
    );
  }

  if (!expense || invoiced) {
    return (
      <Empty>
        <EmptyMedia>
          <TriangleAlert aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>
            {expense
              ? "This expense has already been invoiced"
              : "This expense couldn't be loaded"}
          </EmptyTitle>
          <EmptyDescription>
            {expense
              ? "It's already on-charged to an invoice, so it can't be converted again."
              : apiErrorMessage(expenseQuery.error, "It may have been deleted. Try again from Expenses.")}
          </EmptyDescription>
        </div>
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href={EXPENSES_ROOT}>Back to Expenses</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/30 bg-primary/[0.05] px-4 py-2.5 text-sm">
        <Receipt className="size-4 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="font-medium">From Expenses:</span>{" "}
          {expense.description || "This expense"} · {formatExpenseDate(expense.date)} ·{" "}
          {invoiceMoney(expenseInvoiceableAmount(expense))}
          {invoiceId ? " — added as a new line on this draft." : ""}
        </span>
      </div>
      <InvoiceEditor
        // The editor seeds and hydrates its draft once, so a different expense
        // or target has to remount it.
        key={`${expense.id}:${invoiceId ?? "new"}`}
        expense={expense}
        invoiceId={invoiceId}
        returnTo={EXPENSES_ROOT}
        onSaved={handleSaved}
      />
    </div>
  );
}
