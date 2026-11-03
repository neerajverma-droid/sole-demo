"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { apiErrorMessage } from "@/lib/api-error";
import {
  saveParticipantNdisApi,
  type ClientNdisDetails,
} from "@/lib/invoice-clients";
import { NDIS_NUMBER_PLACEHOLDER, ndisNumberError } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * Adding the participant's NDIS number without leaving the claim.
 *
 * sole-webapp answers "this client has no NDIS number" by opening the client's
 * primary contact in a drawer over the invoice form; this is the same step cut
 * down to the three NDIS fields that drawer edits. The document stays mounted
 * underneath, so nothing typed into it is lost, and `onSaved` hands back the
 * details as they now stand so the caller can carry on with whatever save was
 * waiting on them.
 */
export function NdisNumberDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  details,
  noun = "invoice",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string;
  /** What's already on the contact, when it's been looked up. */
  details?: ClientNdisDetails;
  /** "invoice" or "quote" — for the copy. */
  noun?: string;
  onSaved?: (details: ClientNdisDetails) => void;
}) {
  const queryClient = useQueryClient();
  const [ndisNumber, setNdisNumber] = React.useState("");
  const [planManagerName, setPlanManagerName] = React.useState("");
  const [planManagerNumber, setPlanManagerNumber] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNdisNumber(details?.participantNumber ?? "");
    setPlanManagerName(details?.planManagerName ?? "");
    setPlanManagerNumber(details?.planManagerNumber ?? "");
    setSubmitted(false);
  }, [open, details]);

  const ndisIssue = ndisNumberError(ndisNumber);
  const issueFor = (issue: string | undefined) => (submitted ? issue : undefined);
  const participant = details?.participantName || clientName || "This client";

  const save = async () => {
    setSubmitted(true);
    if (ndisIssue || !clientId || saving) return;

    setSaving(true);
    try {
      const saved = await saveParticipantNdisApi(
        {
          clientId,
          participantContactId:
            details?.clientId === clientId ? details.participantContactId : "",
          participantName:
            details?.clientId === clientId ? details.participantName : "",
        },
        { ndisNumber, planManagerName, planManagerNumber },
        clientName,
      );
      // Clear the claim check at once, then let the real lookups catch up.
      queryClient.setQueryData(["client-ndis-details", clientId], saved);
      queryClient.invalidateQueries({
        queryKey: ["client-ndis-details", clientId],
      });
      queryClient.invalidateQueries({ queryKey: ["invoice-contacts"] });
      toast.success(`NDIS number saved for ${participant}`);
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't save the NDIS number. Try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add NDIS number</DialogTitle>
          <DialogDescription>
            {participant} has no NDIS number on their contact record. Add it
            here and it&apos;s saved to the contact — this {noun} stays just as
            you left it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Field
            label="Participant NDIS number"
            required
            error={issueFor(ndisIssue)}
            hint="9 digits, from their plan. Needed before the claim can be lodged."
          >
            <Input
              value={ndisNumber}
              inputMode="numeric"
              autoFocus
              placeholder={NDIS_NUMBER_PLACEHOLDER}
              onChange={(event) => setNdisNumber(event.target.value)}
              aria-invalid={!!issueFor(ndisIssue)}
              className={cn(
                "tabular",
                issueFor(ndisIssue) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          <Field label="Plan manager name">
            <Input
              value={planManagerName}
              onChange={(event) => setPlanManagerName(event.target.value)}
              placeholder="Optional"
            />
          </Field>

          <Field label="Plan manager NDIS number">
            <Input
              value={planManagerNumber}
              inputMode="numeric"
              onChange={(event) => setPlanManagerNumber(event.target.value)}
              placeholder="Optional"
              className="tabular"
            />
          </Field>

          {/* Lets Enter submit; the visible buttons live in the footer. */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
