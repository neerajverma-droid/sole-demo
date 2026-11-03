"use client";

import { useAtom } from "jotai";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteBudgetIdAtom,
  deleteGoalIdAtom,
  deletePlanIdAtom,
} from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import { invoiceMoney } from "@/lib/invoices";
import { planCommitted } from "@/lib/planner";
import {
  useDeleteBudgetMutation,
  useDeleteGoalMutation,
  useDeletePlanMutation,
} from "@/hooks/use-planner-query";
import { usePlannerStore } from "@/stores/planner";

/* ------------------------------------------------------------------ *
 * Deletions — the standard confirmation, one per record type
 * ------------------------------------------------------------------ */

export function DeleteGoalDialog({
  onDeleted,
}: {
  /** The detail page passes a route change: the record it showed is gone. */
  onDeleted?: () => void;
}) {
  const [id, setId] = useAtom(deleteGoalIdAtom);
  const goals = usePlannerStore((state) => state.goals);
  const deleteGoal = useDeleteGoalMutation();
  const goal = goals.find((entry) => entry.id === id);

  return (
    <Confirm
      open={id !== null}
      onClose={() => setId(null)}
      title="Delete this goal?"
      body={
        goal
          ? `${goal.name} and its ${goal.allocations.length} ${goal.allocations.length === 1 ? "allocation" : "allocations"} will be removed. The cash was only ever earmarked, so nothing is refunded or moved.`
          : ""
      }
      pending={deleteGoal.isPending}
      onConfirm={async () => {
        if (!id) return;
        try {
          await deleteGoal.mutateAsync(id);
          setId(null);
          toast.success("Goal deleted");
          onDeleted?.();
        } catch (error) {
          toast.error(apiErrorMessage(error, "Failed to delete goal."));
        }
      }}
    />
  );
}

export function DeleteBudgetDialog({
  onDeleted,
}: {
  /** The detail page passes a route change: the record it showed is gone. */
  onDeleted?: () => void;
}) {
  const [id, setId] = useAtom(deleteBudgetIdAtom);
  const budgets = usePlannerStore((state) => state.budgets);
  const deleteBudget = useDeleteBudgetMutation();
  const budget = budgets.find((entry) => entry.id === id);

  return (
    <Confirm
      open={id !== null}
      onClose={() => setId(null)}
      title="Delete this budget?"
      body={
        budget
          ? `${budget.name} will be removed. Your expenses aren't affected — a budget only reads them.`
          : ""
      }
      pending={deleteBudget.isPending}
      onConfirm={async () => {
        if (!id) return;
        try {
          await deleteBudget.mutateAsync(id);
          setId(null);
          toast.success("Budget deleted");
          onDeleted?.();
        } catch (error) {
          toast.error(apiErrorMessage(error, "Failed to delete budget."));
        }
      }}
    />
  );
}

export function DeletePlanDialog({
  onDeleted,
}: {
  /** The detail page passes a route change: the record it showed is gone. */
  onDeleted?: () => void;
}) {
  const [id, setId] = useAtom(deletePlanIdAtom);
  const plans = usePlannerStore((state) => state.plans);
  const deletePlan = useDeletePlanMutation();
  const plan = plans.find((entry) => entry.id === id);

  return (
    <Confirm
      open={id !== null}
      onClose={() => setId(null)}
      title="Delete this expense plan?"
      body={
        plan
          ? `${plan.name} will be removed, and the ${invoiceMoney(planCommitted(plan))} committed to it returns to your available cash.`
          : ""
      }
      pending={deletePlan.isPending}
      onConfirm={async () => {
        if (!id) return;
        try {
          await deletePlan.mutateAsync(id);
          setId(null);
          toast.success("Expense plan deleted");
          onDeleted?.();
        } catch (error) {
          toast.error(apiErrorMessage(error, "Failed to delete expense plan."));
        }
      }}
    />
  );
}

function Confirm({
  open,
  onClose,
  title,
  body,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  onConfirm: () => void;
  /** While the delete is in flight, so it can't be fired twice. */
  pending?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending}
            onClick={(event) => {
              // The dialog closes on confirm by default; the delete is a
              // request now, so it's dismissed once that comes back instead.
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
