"use client";

import { Loader2 } from "lucide-react";

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
import { payrollDateRange, payrollMoney, plural } from "@/lib/payroll";
import { usePayrunActions } from "@/components/payroll/payruns/use-payrun-actions";
import { payrunName, type PayrunRow } from "@/lib/payroll-payruns";

/**
 * Confirms deleting one run or several. Runs that can't be deleted (completed
 * ones) never reach here — the caller passes only the deletable ones, and
 * says how many it left out in `skipped`.
 */
export function PayrunDeleteDialog({
  runs,
  skipped = 0,
  onClose,
  onDeleted,
}: {
  /** Empty closes the dialog. */
  runs: PayrunRow[];
  skipped?: number;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const single = runs.length === 1 ? runs[0] : null;
  const actions = usePayrunActions();
  const deleting = actions.deleting;

  return (
    <AlertDialog
      open={runs.length > 0}
      onOpenChange={(open) => !open && !deleting && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {single ? `Delete ${payrunName(single)}?` : `Delete ${plural(runs.length, "pay run")}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This removes the run and its payslips from Sole. Anything already created in Microkeeper stays there.
            This action can&apos;t be undone.
            {skipped > 0 &&
              ` ${plural(skipped, "completed run")} in your selection will be left as ${skipped === 1 ? "it is" : "they are"}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {single && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium tabular">{payrunName(single)}</p>
            <p className="text-xs text-muted-foreground tabular">
              {payrollDateRange(single.startDate, single.endDate)} ·{" "}
              {payrollMoney(single.paymentTotal)} · {plural(single.employeeCount, "employee")}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={async (event) => {
              // Held open so the spinner has somewhere to show while it's out.
              event.preventDefault();
              if (deleting) return;
              const done = await actions.remove(runs);
              if (done) onDeleted?.();
              onClose();
            }}
          >
            {deleting && <Loader2 className="animate-spin" aria-hidden />}
            {deleting
              ? "Deleting…"
              : single
                ? "Delete pay run"
                : `Delete ${plural(runs.length, "run")}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
