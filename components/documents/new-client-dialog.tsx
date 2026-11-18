"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
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
  contactFormDefaults,
  quickContactIssues,
  type Contact,
  type ContactType,
} from "@/lib/contacts";
import { createContactApi } from "@/lib/contacts-api";
import { EVENTS } from "@/lib/analytics-events";
import { moduleNameForPath } from "@/lib/nav";
import { useTrackOnOpen } from "@/hooks/use-track-once";
import { invalidateContactLists } from "@/hooks/use-contacts-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { contactDefaultCurrency, contactDefaultDialCode } from "@/lib/country-context";
import { cn } from "@/lib/utils";
import { useContactsStore } from "@/stores/contacts";

/**
 * Quick-create used by the client combobox. Deliberately three fields — the
 * full Contacts drawer is where the rest of a contact gets filled in.
 */
export function NewClientDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
  createType = "Client",
  showPhone = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whatever was typed in the combobox. */
  initialName: string;
  onCreated: (contact: Contact) => void;
  /** Expenses create Suppliers; documents create Clients. */
  createType?: ContactType;
  /**
   * The optional Phone field. Time Tracker leaves it off — a client made there
   * is someone to log hours against; the phone is filled in on Contacts.
   */
  showPhone?: boolean;
}) {
  const queryClient = useQueryClient();
  // "Add client" from inside a module is a contact being started too;
  // module_name says which one it was started from.
  const pathname = usePathname();
  useTrackOnOpen(EVENTS.CONTACT_CREATION_INITIATED, open, {
    module_name: moduleNameForPath(pathname),
  });
  const { country } = useCountryContext();
  const setContacts = useContactsStore((state) => state.setContacts);
  const noun = createType.toLowerCase();
  const label = createType;

  const [name, setName] = React.useState(initialName);
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // Reopening for a different typed name must not keep the last draft.
  React.useEffect(() => {
    if (!open) return;
    setName(initialName);
    setEmail("");
    setPhone("");
    setTouched(false);
  }, [open, initialName]);

  // `quickContactIssues`: email required for a client, optional for a
  // supplier; a badly typed one is flagged either way.
  const {
    emailRequired,
    name: nameError,
    email: emailError,
  } = quickContactIssues(createType, { name, email });

  const nameIssue = touched ? nameError : undefined;
  // "Required" waits for a submit; "not an email" shows while typing.
  const emailIssue = email.trim() || touched ? emailError : undefined;

  const onCreate = async () => {
    if (nameError || emailError) {
      setTouched(true);
      return;
    }

    const trimmed = name.trim();
    setCreating(true);
    try {
      const contact = await createContactApi({
        ...contactFormDefaults,
        currency: contactDefaultCurrency(country),
        countryCode: contactDefaultDialCode(country),
        type: createType,
        // The quick form asks for one name, so it stands as both the
        // business and contact name until it's refined on the Contacts
        // screen.
        businessName: trimmed,
        personName: trimmed,
        email: email.trim(),
        phone: phone.trim(),
      });

      // The full list only catches up once the Contacts screen's own query
      // refetches — merged in here too, from the real created record, so
      // this contact is selectable the moment it exists.
      setContacts([contact, ...useContactsStore.getState().contacts]);

      // Every other picker and the Contacts screen keep their own copy of
      // the client book — this one's caller refetches its own list, these
      // are marked stale so the new record is there wherever it's opened next.
      void invalidateContactLists(queryClient);
      onCreated(contact);
      onOpenChange(false);
      toast.success(`${label} added`);
    } catch (error) {
      toast.error(apiErrorMessage(error, `Couldn't add that ${noun}.`));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New {noun}</DialogTitle>
          <DialogDescription>
            This {noun} is saved to your contacts and selected here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label={`${label} name`} required error={nameIssue}>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Pty Ltd"
              aria-invalid={!!nameIssue}
              className={cn(
                nameIssue &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          <Field
            label="Email"
            required={emailRequired}
            hint={emailRequired ? undefined : "Optional."}
            error={emailIssue}
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="accounts@acme.com.au"
              aria-invalid={!!emailIssue}
              className={cn(
                emailIssue &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          {showPhone && (
            <Field label="Phone" hint="Optional.">
              <Input
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="411 111 111"
                className="tabular"
              />
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Enabled whenever nothing's in flight: submitting is how you
              find out what's missing. */}
          <Button onClick={onCreate} disabled={creating}>
            {creating ? "Creating…" : `Create ${noun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
