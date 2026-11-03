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
import { createInvoiceClientApi } from "@/lib/invoice-clients";
import { invalidateContactLists } from "@/hooks/use-contacts-query";
import { EMAIL_PATTERN } from "@/lib/contacts";
import { NDIS_NUMBER_PLACEHOLDER, ndisNumberError } from "@/lib/settings";
import type { InvoiceRecipient } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/**
 * Adding a client without leaving the invoice.
 *
 * Deliberately the minimum: a name, an address to send to, and — on an NDIS
 * claim — the participant's NDIS number, without which the claim can't be
 * lodged at all. Everything else about a client (ABN, currency, postal
 * address, extra contacts) is edited on the Contacts screen; asking for it
 * here would turn a two-field detour into a form.
 */
export function NewInvoiceClientDialog({
  open,
  onOpenChange,
  initialName,
  ndis,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whatever was typed into the picker's search box. */
  initialName: string;
  ndis: boolean;
  onCreated: (created: {
    clientId: string;
    clientName: string;
    contact: InvoiceRecipient;
  }) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(initialName);
  const [email, setEmail] = React.useState("");
  const [ndisNumber, setNdisNumber] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(initialName);
    setEmail("");
    setNdisNumber("");
    setSubmitted(false);
  }, [open, initialName]);

  const nameIssue = !name.trim() ? "Enter the client's name." : undefined;
  const emailIssue = !email.trim()
    ? "Enter an email — this is where the invoice is sent."
    : EMAIL_PATTERN.test(email.trim())
      ? undefined
      : "Enter a valid email address.";
  // Optional even on a claim: a client can be created now and their number
  // added before the invoice is actually sent.
  const ndisIssue =
    ndis && ndisNumber.trim() ? ndisNumberError(ndisNumber) : undefined;

  const blocked = !!nameIssue || !!emailIssue || !!ndisIssue;
  const issueFor = (issue: string | undefined) =>
    submitted ? issue : undefined;

  const save = async () => {
    setSubmitted(true);
    if (blocked) return;

    setSaving(true);
    try {
      const created = await createInvoiceClientApi({
        name: name.trim(),
        email: email.trim(),
        ndisNumber: ndis ? ndisNumber.trim() : "",
      });
      // Every other picker and the Contacts screen keep their own copy of
      // the client book — this one's caller refetches its own list, these
      // are marked stale so the new record is there wherever it's opened next.
      void invalidateContactLists(queryClient);
      onCreated(created);
      onOpenChange(false);
      toast.success(`${created.clientName} added`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't add that client.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
          <DialogDescription>
            They&apos;ll be saved to your contacts and selected on this invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Client name" required error={issueFor(nameIssue)}>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Business or person"
              aria-invalid={!!issueFor(nameIssue)}
              className={cn(
                issueFor(nameIssue) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          <Field
            label="Email"
            required
            error={issueFor(emailIssue)}
            hint="Where the invoice and any reminders are sent."
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              aria-invalid={!!issueFor(emailIssue)}
              className={cn(
                issueFor(emailIssue) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          {ndis && (
            <Field
              label="Participant NDIS number"
              error={issueFor(ndisIssue)}
              hint="9 digits, from their plan. Needed before the claim can be lodged."
            >
              <Input
                value={ndisNumber}
                inputMode="numeric"
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
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Adding…" : "Add client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
