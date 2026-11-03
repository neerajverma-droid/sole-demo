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
import { useMarkEntriesInvoicedMutation } from "@/hooks/use-project-jobs-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  draftInvoicesQueryKey,
  fetchDraftInvoices,
  type DraftInvoiceSummary,
} from "@/lib/invoice-drafts";
import type { JobInvoice } from "@/lib/project-jobs";

type Choice = { mode: "new" } | { mode: "draft"; draft: DraftInvoiceSummary };

/**
 * A job's selected time onto an invoice — Jobaccordionitem.js's flow, run
 * with this app's own pieces as KM Tracker's Convert to invoice does: the
 * client's drafts first (when it has any), then `InvoiceEditor` embedded with
 * the lines. Once the invoice saves, the selected entries are marked invoiced
 * against it so they stop offering to be billed again.
 */
export function JobInvoiceDialog({
  projectId,
  jobName,
  invoice,
  onClose,
  onInvoiced,
}: {
  projectId: string;
  jobName: string;
  /** What's being invoiced, or null when closed. */
  invoice: JobInvoice | null;
  onClose: () => void;
  /** After the invoice saves — the job card clears its selection. */
  onInvoiced: () => void;
}) {
  const queryClient = useQueryClient();
  const markInvoiced = useMarkEntriesInvoicedMutation(projectId);
  const [choice, setChoice] = React.useState<Choice | null>(null);

  const open = invoice !== null;
  const clientId = invoice?.seed.clientId ?? null;

  const draftsQuery = useQuery({
    queryKey: draftInvoicesQueryKey(clientId),
    queryFn: () => fetchDraftInvoices(clientId),
    // No client, no "this client's drafts" — straight to a new invoice.
    enabled: open && clientId !== null,
    staleTime: 0,
  });

  const close = React.useCallback(() => {
    setChoice(null);
    onClose();
  }, [onClose]);

  const drafts = draftsQuery.data ?? [];
  const checking = open && clientId !== null && draftsQuery.isLoading;
  const choosing = open && !checking && choice === null && drafts.length > 0;
  const editing = open && !checking && !choosing;
  const targetDraft = choice?.mode === "draft" ? choice.draft : null;

  const lineCount = invoice?.seed.items.length ?? 0;
  const summary = invoice
    ? `${jobName} · ${lineCount} ${lineCount === 1 ? "line" : "lines"}${invoice.seed.clientName ? ` · ${invoice.seed.clientName}` : ""}`
    : "";

  const handleSaved = async (saved: { id: string; number: string }) => {
    if (!invoice) return;
    if (invoice.entryIds.length > 0) {
      try {
        await markInvoiced.mutateAsync({ entryIds: invoice.entryIds, invoice: saved });
        toast.success("Time entries marked as invoiced");
      } catch (error) {
        // The invoice itself is fine — say exactly what didn't happen.
        toast.error(apiErrorMessage(error, "Failed to update time entries"));
      }
    }
    queryClient.invalidateQueries({ queryKey: draftInvoicesQueryKey(clientId) });
    // The new invoice carries this project, so the Invoices tab lists it.
    queryClient.invalidateQueries({ queryKey: ["project-invoices", projectId] });
    onInvoiced();
    close();
  };

  return (
    <>
      <Dialog open={checking} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create invoice</DialogTitle>
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
        clientName={invoice?.seed.clientName}
        onUseInvoice={(draft) => setChoice({ mode: "draft", draft })}
        onCreateNew={() => setChoice({ mode: "new" })}
      />

      <Dialog open={editing} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex max-h-[92svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>
              {targetDraft ? `Add to ${targetDraft.number}` : "Create invoice"}
            </DialogTitle>
            <DialogDescription>
              {targetDraft ? `${summary} — added as new lines on this draft.` : summary}
            </DialogDescription>
          </DialogHeader>

          {/* No bottom padding: the editor's sticky footer sticks inside the
              padding box, so any padding here is a strip under the footer
              where the form shows through as it scrolls. */}
          <div className="flex-1 overflow-y-auto px-6 pt-5">
            {editing && invoice && (
              <InvoiceEditor
                key={`${invoice.entryIds.join("-")}:${targetDraft?.id ?? "new"}`}
                seed={invoice.seed}
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
