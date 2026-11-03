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
import { createBusinessContactApi, type BusinessContact } from "@/lib/clients";
import { invalidateContactLists } from "@/hooks/use-contacts-query";
import { EMAIL_PATTERN, type ContactType } from "@/lib/contacts";
import { cn } from "@/lib/utils";

/**
 * Adding a client or supplier without leaving the picker — the same real
 * `/client` create endpoint `NewInvoiceClientDialog` uses, generalized so any
 * module with a client/supplier field can offer this instead of building its
 * own. Email is required only for a client — sole-webapp's own Contacts page
 * (`AddCompanyContact.js`) relaxes it for a supplier the same way, since a
 * supplier is routinely paid without ever being emailed.
 */
export function NewBusinessContactDialog({
  open,
  onOpenChange,
  type,
  initialName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ContactType;
  /** Whatever was typed into the picker's search box. */
  initialName: string;
  onCreated: (created: BusinessContact) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(initialName);
  const [email, setEmail] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(initialName);
    setEmail("");
    setSubmitted(false);
  }, [open, initialName]);

  const noun = type.toLowerCase();
  const emailRequired = type === "Client";

  const nameIssue = !name.trim() ? `Enter the ${noun}'s name.` : undefined;
  const emailIssue = email.trim()
    ? EMAIL_PATTERN.test(email.trim())
      ? undefined
      : "Enter a valid email address."
    : emailRequired
      ? "Enter an email address."
      : undefined;

  const blocked = !!nameIssue || !!emailIssue;
  const issueFor = (issue: string | undefined) =>
    submitted ? issue : undefined;

  const save = async () => {
    setSubmitted(true);
    if (blocked) return;

    setSaving(true);
    try {
      const created = await createBusinessContactApi(type, {
        name: name.trim(),
        email: email.trim(),
      });
      // Every other picker and the Contacts screen keep their own copy of
      // the client book — this one's caller refetches its own list, these
      // are marked stale so the new record is there wherever it's opened next.
      void invalidateContactLists(queryClient);
      onCreated(created);
      onOpenChange(false);
      toast.success(`${created.name} added`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Couldn't add that ${noun}.`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a {noun}</DialogTitle>
          <DialogDescription>
            They&apos;ll be saved to your contacts and selected here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label={`${type} name`} required error={issueFor(nameIssue)}>
            <Input
              autoFocus
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
            required={emailRequired}
            error={issueFor(emailIssue)}
            hint={emailRequired ? undefined : "Optional."}
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
            {saving ? "Adding…" : `Add ${noun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
