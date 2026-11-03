"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDeclineLeaveRequestMutation } from "@/hooks/use-payroll-leave-query";
import { apiErrorMessage } from "@/lib/api-error";
import { payrollDateRange } from "@/lib/payroll";
import {
  leaveDateFromApi,
  leaveTypeLabel,
  type LeaveRequest,
} from "@/lib/payroll-leave";

/**
 * Declines a pending request, with an optional reason the employee will see —
 * `PATCH /leave-requests/decline/{id}` with `{ reviewNote }`.
 */
export function DeclineLeaveDialog({
  request,
  onOpenChange,
}: {
  /** The request being declined; null while the dialog is closed. */
  request: LeaveRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = React.useState("");
  const reasonId = React.useId();
  const decline = useDeclineLeaveRequestMutation();
  // The last request asked about, held through the close animation so the
  // summary doesn't blank mid-fade. A new one also clears the reason — what
  // was typed for one request shouldn't greet the next.
  const [last, setLast] = React.useState(request);
  if (request && request !== last) {
    setLast(request);
    setReason("");
  }
  const shown = request ?? last;

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => !decline.isPending && onOpenChange(open)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline leave request?</DialogTitle>
          <DialogDescription>
            The request stays on file as declined, and can&apos;t be edited or
            approved afterwards.
          </DialogDescription>
        </DialogHeader>

        {shown && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium">{shown.employeeName}</p>
            <p className="text-xs text-muted-foreground tabular">
              {leaveTypeLabel(shown.leaveType)} ·{" "}
              {payrollDateRange(
                leaveDateFromApi(shown.startDate),
                leaveDateFromApi(shown.endDate),
              )}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={reasonId}>
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example, it clashes with end-of-month close"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={decline.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={decline.isPending}
            onClick={() => {
              if (!request) return;
              decline.mutate(
                { id: request.id, reason },
                {
                  onSuccess: () => {
                    toast.success("Leave request declined.");
                    onOpenChange(false);
                  },
                  onError: (error) =>
                    toast.error(
                      apiErrorMessage(error, "Failed to decline leave request."),
                    ),
                },
              );
            }}
          >
            {decline.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {decline.isPending ? "Declining…" : "Decline request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
