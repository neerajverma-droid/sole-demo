"use client";

import * as React from "react";
import { BadgeDollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraftInvoicesDialog } from "@/components/shared/draft-invoices-dialog";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchDraftInvoices, type DraftInvoiceSummary } from "@/lib/invoice-drafts";
import {
  draftPlannerTaskInvoice,
  fetchFinalStageId,
  fetchTimeLogsByTask,
  markTimeEntriesInvoiced,
  updatePlannerTaskStage,
} from "@/lib/task-planner-api";
import {
  entriesSpanClients,
  invoiceSeedFromEntries,
  taskInvoiceEntries,
  type PlannerTask,
  type TaskTimeEntry,
} from "@/lib/task-planner";

type Step =
  | { kind: "confirm" }
  | { kind: "choose"; entries: TaskTimeEntry[]; clientId: string | null; clientName: string }
  | { kind: "editor"; entries: TaskTimeEntry[]; draft: DraftInvoiceSummary | null };

/**
 * KanbanInvoiceFlow — a billable task on its way to Done asks to be invoiced
 * first. "Draft" has the backend draft the invoice and move the event; "Create"
 * builds an invoice from the task's uninvoiced time entries (into an existing
 * draft for that client, or a new one), then marks those entries billed and
 * moves the event to the final stage.
 *
 * `onCancel` fires when the flow is abandoned before an invoice exists, so the
 * card stays where it was; `onDone` once it's drafted or created.
 */
export function TaskInvoiceFlow({
  task,
  onCancel,
  onDone,
}: {
  task: PlannerTask | null;
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [step, setStep] = React.useState<Step>({ kind: "confirm" });
  const [busy, setBusy] = React.useState<"draft" | "create" | null>(null);

  React.useEffect(() => {
    if (task) setStep({ kind: "confirm" });
  }, [task]);

  const cancel = () => {
    if (busy) return;
    onCancel();
  };

  const handleDraft = async () => {
    if (!task) return;
    setBusy("draft");
    try {
      if (!task.event_id) throw new Error("Event id not found");
      await draftPlannerTaskInvoice(task.event_id);
      toast.success("Invoice drafted successfully");
      await onDone();
    } catch (error) {
      // Left open, as before, so it can be retried or closed.
      toast.error(apiErrorMessage(error, "Failed to draft invoice"));
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    if (!task) return;
    setBusy("create");
    try {
      const groups = await fetchTimeLogsByTask();
      const entries = taskInvoiceEntries(groups, task.source_task_id);
      if (entries.length === 0) {
        toast.error("No uninvoiced time entries found for this task");
        onCancel();
        return;
      }
      if (entriesSpanClients(entries)) {
        toast.error("Please select time entries from the same client only");
        onCancel();
        return;
      }

      const first = entries[0];
      const clientId =
        first.client_id !== null && first.client_id !== undefined ? String(first.client_id) : null;

      // Into one of this client's drafts if there are any; a failed check
      // just goes on to a new invoice, as the time tracker does.
      let hasDrafts = false;
      if (clientId) {
        try {
          hasDrafts = (await fetchDraftInvoices(clientId)).length > 0;
        } catch {
          hasDrafts = false;
        }
      }
      setStep(
        hasDrafts
          ? { kind: "choose", entries, clientId, clientName: first.client_name || "" }
          : { kind: "editor", entries, draft: null },
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't load this task's time entries."));
      onCancel();
    } finally {
      setBusy(null);
    }
  };

  const handleSaved = async (saved: { id: string; number: string }, entries: TaskTimeEntry[]) => {
    try {
      await markTimeEntriesInvoiced(entries, saved);
      toast.success("Invoice created successfully");
    } catch {
      toast.error("Failed to update time entries");
    }
    // The invoice exists either way, so the task goes to Done regardless.
    if (task?.event_id) {
      try {
        const finalStageId = await fetchFinalStageId();
        if (finalStageId) await updatePlannerTaskStage(task.event_id, finalStageId);
      } catch (error) {
        toast.error(apiErrorMessage(error, "Couldn't move the task to Done."));
      }
    }
    await onDone();
  };

  const editorSeed =
    step.kind === "editor" ? invoiceSeedFromEntries(step.entries) : null;

  return (
    <>
      <Dialog open={Boolean(task) && step.kind === "confirm"} onOpenChange={(open) => !open && cancel()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader className="items-center text-center sm:text-center">
            <span className="mb-1 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <BadgeDollarSign className="size-6" />
            </span>
            <DialogTitle>Invoice this task</DialogTitle>
            <DialogDescription>
              Do you want to create an invoice for this task before marking it as done?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-2">
            <Button variant="outline" disabled={busy !== null} onClick={handleDraft}>
              {busy === "draft" && <Loader2 className="animate-spin" />}
              Draft
            </Button>
            <Button disabled={busy !== null} onClick={handleCreate}>
              {busy === "create" && <Loader2 className="animate-spin" />}
              {busy === "create" ? "Checking..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DraftInvoicesDialog
        open={Boolean(task) && step.kind === "choose"}
        onOpenChange={(open) => !open && cancel()}
        clientId={step.kind === "choose" ? step.clientId : null}
        clientName={step.kind === "choose" ? step.clientName : null}
        onUseInvoice={(draft) =>
          step.kind === "choose" && setStep({ kind: "editor", entries: step.entries, draft })
        }
        onCreateNew={() =>
          step.kind === "choose" && setStep({ kind: "editor", entries: step.entries, draft: null })
        }
      />

      <Dialog open={Boolean(task) && step.kind === "editor"} onOpenChange={(open) => !open && cancel()}>
        <DialogContent className="flex max-h-[92svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>
              {step.kind === "editor" && step.draft ? `Add to ${step.draft.number}` : "Invoice this task"}
            </DialogTitle>
            <DialogDescription>
              {task?.task_name}
              {step.kind === "editor" &&
                ` · ${step.entries.length} time ${step.entries.length === 1 ? "entry" : "entries"}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step.kind === "editor" && editorSeed && (
              <InvoiceEditor
                key={`${task?.id}:${step.draft?.id ?? "new"}`}
                seed={editorSeed}
                invoiceId={step.draft?.id}
                embedded
                onClose={cancel}
                onSaved={(saved) => handleSaved(saved, step.entries)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
