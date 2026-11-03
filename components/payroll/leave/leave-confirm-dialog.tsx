"use client";

import * as React from "react";
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
import {
  useCancelLeaveRequestMutation,
  useDeleteLeaveRequestMutation,
} from "@/hooks/use-payroll-leave-query";
import { apiErrorMessage } from "@/lib/api-error";
import { payrollDateRange } from "@/lib/payroll";
import {
  leaveDateFromApi,
  leaveStatusLabel,
  leaveTypeLabel,
  type LeaveRequest,
} from "@/lib/payroll-leave";

export type LeaveConfirm = {
  kind: "cancel" | "delete";
  request: LeaveRequest;
};

const COPY = {
  cancel: {
    title: "Cancel this leave?",
    description:
      "The request stays on file as cancelled, and can't be edited or approved again. Raise a new request if the leave goes ahead after all.",
    action: "Cancel leave",
    keep: "Keep leave",
    busy: "Cancelling…",
    done: "Leave request cancelled.",
    failed: "Failed to cancel leave request.",
  },
  delete: {
    title: "Delete leave request?",
    description:
      "This removes the request entirely, with no record that it was made. This action can't be undone.",
    action: "Delete request",
    keep: "Cancel",
    busy: "Deleting…",
    done: "Leave request deleted.",
    failed: "Failed to delete leave request.",
  },
} as const;

/**
 * The confirm step for the two row actions that can't be taken back —
 * cancelling (`PATCH /leave-requests/cancel/{id}`) and deleting
 * (`DELETE /leave-requests/{id}`). sole-webapp cancelled without asking and
 * deleted behind `window.confirm`.
 */
export function LeaveConfirmDialog({
  confirm,
  onOpenChange,
}: {
  confirm: LeaveConfirm | null;
  onOpenChange: (open: boolean) => void;
}) {
  // The last one asked about, held through the close animation so the copy
  // doesn't swap or blank while the dialog fades out.
  const [last, setLast] = React.useState(confirm);
  if (confirm && confirm !== last) setLast(confirm);
  const shown = confirm ?? last;
  const copy = COPY[shown?.kind ?? "delete"];
  const request = shown?.request;

  const cancel = useCancelLeaveRequestMutation();
  const remove = useDeleteLeaveRequestMutation();
  const working = cancel.isPending || remove.isPending;

  const run = () => {
    if (!confirm || working) return;
    const mutation = confirm.kind === "cancel" ? cancel : remove;
    mutation.mutate(confirm.request.id, {
      onSuccess: () => {
        toast.success(copy.done);
        onOpenChange(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, copy.failed)),
    });
  };

  return (
    <AlertDialog
      open={confirm !== null}
      onOpenChange={(open) => !working && onOpenChange(open)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>

        {request && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium">{request.employeeName}</p>
            <p className="text-xs text-muted-foreground tabular">
              {leaveTypeLabel(request.leaveType)} ·{" "}
              {payrollDateRange(
                leaveDateFromApi(request.startDate),
                leaveDateFromApi(request.endDate),
              )}{" "}
              · {leaveStatusLabel(request.status)}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>{copy.keep}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={working}
            onClick={(event) => {
              // Radix closes the dialog on click by default — held open here
              // so the spinner has somewhere to show while the call is out.
              event.preventDefault();
              run();
            }}
          >
            {working && <Loader2 className="animate-spin" aria-hidden />}
            {working ? copy.busy : copy.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
