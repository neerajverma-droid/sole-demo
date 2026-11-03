"use client";

import * as React from "react";
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
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { DraftInvoicesDialog } from "@/components/shared/draft-invoices-dialog";
import { useInvalidateProjectExpenses } from "@/hooks/use-project-expenses-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatExpenseDate, markExpenseInvoicedApi } from "@/lib/expenses";
import {
  draftInvoicesQueryKey,
  fetchDraftInvoices,
  type DraftInvoiceSummary,
} from "@/lib/invoice-drafts";
import { invoiceMoney } from "@/lib/invoices";
import {
  invoiceSeedFromProjectExpense,
  type ProjectExpense,
  type ProjectExpensePage,
} from "@/lib/project-expenses";
import type { Project } from "@/lib/projects";

type Choice = { mode: "new" } | { mode: "draft"; draft: DraftInvoiceSummary };

/**
 * A project expense onto an invoice — sole-webapp's "Convert to Invoice": look
 * for the project client's draft invoices first, offer them if there are any,
 * then open the invoice form with the expense as its line, billed to the
 * project's client. Once the invoice saves the expense is marked invoiced, so
 * the row stops offering to convert again. Same shape as the Expenses screen's
 * and KM tracker's own convert dialogs.
 */
export function ProjectExpenseInvoiceDialog({
  project,
  expense,
  onClose,
}: {
  project: Project;
  /** The expense being invoiced, or null when closed. */
  expense: ProjectExpense | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProjectExpenses(project.id);
  const [choice, setChoice] = React.useState<Choice | null>(null);

  const open = expense !== null;
  const clientId = project.clientId;

  const draftsQuery = useQuery({
    queryKey: draftInvoicesQueryKey(clientId),
    queryFn: () => fetchDraftInvoices(clientId),
    enabled: open,
    // Drafts are raised and sent elsewhere; a stale list could offer one that's gone.
    staleTime: 0,
  });

  const close = React.useCallback(() => {
    setChoice(null);
    onClose();
  }, [onClose]);

  const seed = React.useMemo(
    () => (expense ? invoiceSeedFromProjectExpense(expense, project) : null),
    [expense, project],
  );

  // A failed drafts lookup falls through to a new invoice, as sole-webapp's catch does.
  const drafts = draftsQuery.data ?? [];
  const checking = open && draftsQuery.isLoading;
  const choosing = open && !checking && choice === null && drafts.length > 0;
  const editing = open && !checking && !choosing;
  const targetDraft = choice?.mode === "draft" ? choice.draft : null;

  const summary = expense
    ? `${expense.description || "This expense"} · ${expense.date ? formatExpenseDate(expense.date) : "—"} · ${invoiceMoney(expense.amount)}`
    : "";

  const handleSaved = async (saved: { id: string; number: string }) => {
    if (!expense) return;
    try {
      await markExpenseInvoicedApi(expense.id, saved.id, saved.number);
      // Shown as invoiced straight away, rather than only once the page's
      // refetch lands — the row's menu locks on this flag.
      queryClient.setQueriesData<ProjectExpensePage>(
        { queryKey: ["project-expenses", project.id, "list"] },
        (page) =>
          page && {
            ...page,
            expenses: page.expenses.map((row) =>
              row.id === expense.id
                ? { ...row, invoiced: true, invoiceId: saved.id, invoiceNo: saved.number }
                : row,
            ),
          },
      );
      toast.success("Invoice created successfully");
    } catch (error) {
      // The invoice itself saved — say exactly what didn't happen.
      toast.error(
        apiErrorMessage(error, `${saved.number} was created, but couldn't be linked back to this expense.`),
      );
    }
    void invalidate(expense.id);
    // The new invoice carries this project, so the Invoices tab lists it.
    void queryClient.invalidateQueries({ queryKey: ["project-invoices", project.id] });
    void queryClient.invalidateQueries({ queryKey: draftInvoicesQueryKey(clientId) });
    close();
  };

  return (
    <>
      <Dialog open={checking} onOpenChange={(next) => !next && close()}>
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

      <DraftInvoicesDialog
        open={choosing}
        onOpenChange={(next) => !next && close()}
        clientId={clientId}
        clientName={project.clientName || undefined}
        onUseInvoice={(draft) => setChoice({ mode: "draft", draft })}
        onCreateNew={() => setChoice({ mode: "new" })}
      />

      <Dialog open={editing} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex max-h-[92svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>
              {targetDraft ? `Add to ${targetDraft.number}` : "Convert to invoice"}
            </DialogTitle>
            <DialogDescription>
              {targetDraft ? `${summary} — added as a new line on this draft.` : summary}
            </DialogDescription>
          </DialogHeader>
          {/* No bottom padding: the editor's sticky footer sticks inside the
              padding box, so any padding here is a strip under the footer
              where the form shows through as it scrolls. */}
          <div className="flex-1 overflow-y-auto px-6 pt-5">
            {editing && expense && seed && (
              <InvoiceEditor
                // The editor seeds once, so a different expense or target remounts it.
                key={`${expense.id}:${targetDraft?.id ?? "new"}`}
                seed={seed}
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
