"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraftInvoicesDialog } from "@/components/shared/draft-invoices-dialog";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { convertExpenseAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  expenseInvoiceableAmount,
  formatExpenseDate,
  markExpenseInvoicedApi,
} from "@/lib/expenses";
import {
  draftInvoicesQueryKey,
  fetchDraftInvoices,
  type DraftInvoiceSummary,
} from "@/lib/invoice-drafts";
import { invoiceMoney } from "@/lib/invoices";
import { useExpensesStore } from "@/stores/expenses";

/** Which invoice the expense is going onto, once that's been decided. */
type Choice =
  | { mode: "new" }
  | { mode: "draft"; draft: DraftInvoiceSummary };

/**
 * On-charging an expense to a client, over the list rather than away from it.
 *
 * The same two steps sole-webapp's own expenses list runs. First it asks
 * whether there are already draft invoices to add this to — for an expense
 * that's every draft on the account, since an expense has a supplier rather
 * than a client and who it gets billed to isn't decided until the invoice is
 * written. Then it opens the invoice form: either a new one with the expense
 * as its only line, or the chosen draft with the expense appended to what's
 * already on it. With no drafts to offer, the chooser is skipped entirely and
 * the form opens straight away, same as sole-webapp.
 *
 * The form is this app's own `InvoiceEditor` — the same component the
 * `/invoices/new/general` page renders, only without its page heading and
 * back button, which the dialog supplies.
 */
export function ConvertToInvoiceDialog() {
  const [expense, setExpense] = useAtom(convertExpenseAtom);
  const queryClient = useQueryClient();
  const linkInvoice = useExpensesStore((state) => state.linkInvoice);

  const [choice, setChoice] = React.useState<Choice | null>(null);

  /*
   * Account-wide rather than per-client, and read through the same key the
   * chooser uses, so opening it doesn't re-request what this already has.
   */
  const draftsQuery = useQuery({
    queryKey: draftInvoicesQueryKey(null),
    queryFn: () => fetchDraftInvoices(null),
    enabled: expense !== null,
    // Drafts come and go as invoices are raised and sent; a cached list from
    // ten minutes ago could offer one that no longer exists.
    staleTime: 0,
  });

  const close = React.useCallback(() => {
    setExpense(null);
    setChoice(null);
  }, [setExpense]);

  /*
   * Which of the three surfaces below is showing. A failed drafts lookup
   * counts as "no drafts" and goes straight to a new invoice — the same
   * fall-through sole-webapp's own catch does, since not being able to list
   * drafts is no reason to block raising the invoice.
   */
  const drafts = draftsQuery.data ?? [];
  const checking = expense !== null && draftsQuery.isLoading;
  const choosing =
    expense !== null && !checking && choice === null && drafts.length > 0;
  const editing = expense !== null && !checking && !choosing;

  const targetDraft = choice?.mode === "draft" ? choice.draft : null;

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

    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
    queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
    // A draft that was just sent is no longer on offer, and a new one that was
    // saved as a draft now is.
    queryClient.invalidateQueries({ queryKey: draftInvoicesQueryKey(null) });
    close();
  };

  const summary = expense
    ? `${expense.description || "This expense"} · ${formatExpenseDate(expense.date)} · ${invoiceMoney(expenseInvoiceableAmount(expense))}`
    : "";

  return (
    <>
      {/*
        Checking for drafts. Its own small modal rather than a spinner on the
        row's menu item: the menu closes on select, so there would be nothing
        left on screen to show progress on, and the lookup is what decides
        which of the next two surfaces opens.
      */}
      <Dialog open={checking} onOpenChange={(open) => !open && close()}>
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
        onOpenChange={(open) => !open && close()}
        onUseInvoice={(draft) => setChoice({ mode: "draft", draft })}
        onCreateNew={() => setChoice({ mode: "new" })}
      />

      <Dialog
        open={editing}
        onOpenChange={(open) => {
          // Closing goes through the editor's own Cancel where possible, so the
          // unsaved-changes prompt gets a say; the overlay and Escape are the
          // one door it can't wrap, and losing a prefilled line is a small loss.
          if (!open) close();
        }}
      >
        <DialogContent className="flex max-h-[92svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>
              {targetDraft
                ? `Add to ${targetDraft.number}`
                : "Convert to invoice"}
            </DialogTitle>
            <DialogDescription>
              {targetDraft
                ? `${summary} — added as a new line on this draft.`
                : summary}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {expense && editing && (
              <InvoiceEditor
                // A fresh form per expense and per target: the editor seeds and
                // hydrates its draft once, so switching either has to remount.
                key={`${expense.id}:${targetDraft?.id ?? "new"}`}
                expense={expense}
                invoiceId={targetDraft?.id}
                embedded
                onClose={close}
                onSaved={handleSaved}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
