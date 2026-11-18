"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraftInvoicesDialog } from "@/components/shared/draft-invoices-dialog";
import {
  expenseInvoiceHref,
  expenseInvoiceQueryKey,
} from "@/components/expenses/expense-invoice-editor";
import { convertExpenseAtom } from "@/lib/atoms";
import {
  expenseInvoiceableAmount,
  formatExpenseDate,
  type Expense,
} from "@/lib/expenses";
import {
  draftInvoicesQueryKey,
  fetchDraftInvoices,
} from "@/lib/invoice-drafts";
import { invoiceMoney } from "@/lib/invoices";

/**
 * On-charging an expense to a client — the same two steps sole-webapp's own
 * expenses list runs, and the same shape as Time Tracker's Create invoice.
 * First it asks whether there are already draft invoices to add this to — for
 * an expense that's every draft on the account, since an expense has a
 * supplier rather than a client and who it gets billed to isn't decided until
 * the invoice is written. Then the invoice opens on its own page (see
 * ExpenseInvoiceEditor): a new one with the expense as its only line, or the
 * chosen draft with the expense appended. With no drafts to offer, the
 * chooser is skipped and the page opens straight away.
 */
export function ConvertToInvoiceDialog() {
  const [expense, setExpense] = useAtom(convertExpenseAtom);
  // Mounted only while open, so each conversion starts fresh.
  return expense ? (
    <ConvertToInvoiceFlow expense={expense} onClose={() => setExpense(null)} />
  ) : null;
}

function ConvertToInvoiceFlow({
  expense,
  onClose,
}: {
  expense: Expense;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  /*
   * Account-wide rather than per-client, and read through the same key the
   * chooser uses, so opening it doesn't re-request what this already has.
   */
  const draftsQuery = useQuery({
    queryKey: draftInvoicesQueryKey(null),
    queryFn: () => fetchDraftInvoices(null),
    // Drafts come and go as invoices are raised and sent; a cached list from
    // ten minutes ago could offer one that no longer exists.
    staleTime: 0,
  });

  /*
   * A failed drafts lookup counts as "no drafts" and goes straight to a new
   * invoice — the same fall-through sole-webapp's own catch does, since not
   * being able to list drafts is no reason to block raising the invoice.
   */
  const checking = draftsQuery.isLoading;
  const choosing = !checking && (draftsQuery.data?.length ?? 0) > 0;

  // Hand the row to the invoice page and go there — once per opening. The
  // listing is paginated server-side, so the page reads the row from the
  // cache rather than a store that generally doesn't hold it; a reload of the
  // page fetches it instead.
  const opened = React.useRef(false);
  const openInvoicePage = React.useCallback(
    (draftId?: string) => {
      if (opened.current) return;
      opened.current = true;
      queryClient.setQueryData(expenseInvoiceQueryKey(expense.id), expense);
      router.push(expenseInvoiceHref(expense.id, draftId));
      onClose();
    },
    [expense, onClose, queryClient, router],
  );

  React.useEffect(() => {
    if (!checking && !choosing) openInvoicePage();
  }, [checking, choosing, openInvoicePage]);

  const summary = `${expense.description || "This expense"} · ${formatExpenseDate(expense.date)} · ${invoiceMoney(expenseInvoiceableAmount(expense))}`;

  return (
    <>
      {/*
        Checking for drafts. Its own small modal rather than a spinner on the
        row's menu item: the menu closes on select, so there would be nothing
        left on screen to show progress on, and the lookup is what decides
        whether the chooser opens.
      */}
      <Dialog open={checking} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Convert to invoice</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <p className="text-sm">Checking for draft invoices…</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* The shared chooser — no `clientId`, so it lists every draft on the
          account with a Client column. */}
      <DraftInvoicesDialog
        open={choosing}
        onOpenChange={(open) => !open && onClose()}
        onUseInvoice={(draft) => openInvoicePage(draft.id)}
        onCreateNew={() => openInvoicePage()}
      />
    </>
  );
}
