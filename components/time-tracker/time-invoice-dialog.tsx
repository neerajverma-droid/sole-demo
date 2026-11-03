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
import { DraftInvoicesDialog } from "@/components/shared/draft-invoices-dialog";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { useProjectMoney } from "@/components/projects/project-shared";
import { useMarkLogsInvoicedMutation } from "@/hooks/use-time-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  draftInvoicesQueryKey,
  fetchDraftInvoices,
  type DraftInvoiceSummary,
} from "@/lib/invoice-drafts";
import { fetchTimesheetPdf, formatHoursMinutes, type TimeInvoice } from "@/lib/time-tracker";

type Choice = { mode: "new" } | { mode: "draft"; draft: DraftInvoiceSummary };

/**
 * Selected time onto an invoice — sole-webapp's TimeEntryInvoiceFlow run with
 * this app's pieces, as KM Tracker does it: the client's drafts to add to (or
 * a new invoice), then `InvoiceEditor` embedded with one line per task and
 * the timesheet PDF attached, as sole-webapp attached it. Once it saves, every
 * selected log is marked invoiced so it can't be billed twice.
 */
export function TimeInvoiceDialog({
  invoice,
  onClose,
}: {
  /** What's being invoiced, or null when closed. */
  invoice: TimeInvoice | null;
  onClose: () => void;
}) {
  const money = useProjectMoney();
  const queryClient = useQueryClient();
  const markInvoiced = useMarkLogsInvoicedMutation();
  const [choice, setChoice] = React.useState<Choice | null>(null);

  const open = invoice !== null;
  const clientId = invoice?.seed.clientId ?? null;

  const draftsQuery = useQuery({
    queryKey: draftInvoicesQueryKey(clientId),
    queryFn: () => fetchDraftInvoices(clientId),
    enabled: open && clientId !== null,
    staleTime: 0,
  });

  // Fetched alongside the drafts; the editor opens once it's in (or failed —
  // the invoice doesn't need it).
  const timesheetQuery = useQuery({
    queryKey: ["time-tracker", "timesheet-pdf", invoice?.logIds.join("-") ?? ""],
    queryFn: () => fetchTimesheetPdf(invoice as TimeInvoice),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const seed = React.useMemo(
    () =>
      invoice
        ? { ...invoice.seed, files: timesheetQuery.data ? [timesheetQuery.data] : [] }
        : null,
    [invoice, timesheetQuery.data],
  );

  const close = React.useCallback(() => {
    setChoice(null);
    onClose();
  }, [onClose]);

  const drafts = draftsQuery.data ?? [];
  const preparing = open && timesheetQuery.isLoading;
  const checking = open && ((clientId !== null && draftsQuery.isLoading) || (preparing && choice !== null));
  const choosing = open && !checking && choice === null && drafts.length > 0;
  const editing = open && !checking && !choosing && !preparing;
  // Nothing to choose and the PDF still coming: hold on the checking dialog.
  const holding = open && !checking && !choosing && preparing;
  const targetDraft = choice?.mode === "draft" ? choice.draft : null;

  const count = invoice?.logIds.length ?? 0;
  const summary = invoice
    ? `${count} ${count === 1 ? "session" : "sessions"} · ${formatHoursMinutes(invoice.hours)} · ${money(invoice.amount)}${invoice.seed.clientName ? ` · ${invoice.seed.clientName}` : ""}`
    : "";

  const handleSaved = async (saved: { id: string; number: string }) => {
    if (!invoice) return;
    try {
      await markInvoiced.mutateAsync({ logIds: invoice.logIds, invoice: saved });
      toast.success(`${saved.number} saved`, {
        description: `${count === 1 ? "The session is" : `All ${count} sessions are`} now marked invoiced.`,
      });
    } catch (error) {
      toast.error(
        apiErrorMessage(error, `${saved.number} was created, but the time couldn't be marked invoiced.`),
      );
    }
    queryClient.invalidateQueries({ queryKey: draftInvoicesQueryKey(clientId) });
    close();
  };

  return (
    <>
      <Dialog open={checking || holding} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create invoice</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <p className="text-sm">
              {clientId !== null && draftsQuery.isLoading ? "Checking for draft invoices…" : "Preparing the timesheet…"}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <DraftInvoicesDialog
        open={choosing}
        onOpenChange={(next) => !next && close()}
        clientId={clientId}
        clientName={invoice?.seed.clientName}
        onUseInvoice={(draft) => setChoice({ mode: "draft", draft })}
        onCreateNew={() => setChoice({ mode: "new" })}
      />

      <Dialog open={editing} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex max-h-[92svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{targetDraft ? `Add to ${targetDraft.number}` : "Create invoice"}</DialogTitle>
            <DialogDescription>
              {targetDraft ? `${summary} — added as new lines on this draft.` : summary}
              {timesheetQuery.isFetched && !timesheetQuery.data && (
                <span className="mt-1 block text-warning">
                  The timesheet PDF couldn&apos;t be made, so it isn&apos;t attached.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {editing && invoice && seed && (
              <InvoiceEditor
                key={`${invoice.logIds.join("-")}:${targetDraft?.id ?? "new"}`}
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
