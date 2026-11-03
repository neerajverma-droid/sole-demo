"use client";

import { Loader2 } from "lucide-react";
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
import { useDeleteEmployeeMutation } from "@/hooks/use-payroll-employees-query";
import {
  employeeErrorMessage,
  employeeName,
  employmentTypeLabel,
  type PayrollEmployee,
} from "@/lib/payroll-employees";

/** Confirms `DELETE /employees/{id}` — sole-webapp used `window.confirm`. */
export function EmployeeRemoveDialog({
  employee,
  onClose,
}: {
  employee: PayrollEmployee | null;
  onClose: () => void;
}) {
  const name = employee ? employeeName(employee) || "this employee" : "";
  const remove = useDeleteEmployeeMutation();
  const deleting = remove.isPending;

  return (
    <AlertDialog
      open={employee !== null}
      onOpenChange={(open) => !open && !deleting && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove employee?</AlertDialogTitle>
          <AlertDialogDescription>
            {name} will be removed from payroll and their seat freed for someone
            else. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {employee && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">
              {[employee.email, employmentTypeLabel(employee.employmentType)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={async (event) => {
              // Held open so the spinner has somewhere to show while the
              // call is out — Radix would otherwise close on click.
              event.preventDefault();
              if (!employee || deleting) return;
              try {
                await remove.mutateAsync(employee.id);
                toast.success("Employee removed successfully.");
                onClose();
              } catch (error) {
                toast.error(
                  employeeErrorMessage(error, "Failed to remove employee."),
                );
              }
            }}
          >
            {deleting && <Loader2 className="animate-spin" aria-hidden />}
            {deleting ? "Removing…" : "Remove employee"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
