"use client";

import * as React from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Required } from "@/components/documents/field";
import { NewInvoiceClientDialog } from "@/components/documents/new-invoice-client-dialog";
import { contactsForClient, type InvoiceContact } from "@/lib/invoice-clients";
import { type InvoiceRecipient } from "@/lib/invoices";
import { useCountryContext } from "@/hooks/use-country-context";
import { customerIdLabel } from "@/lib/country-context";
import { cn } from "@/lib/utils";

export type ClientSelection = {
  clientId: string | null;
  clientName: string;
  recipients: InvoiceRecipient[];
};

/**
 * Who the invoice is for, read from the real client list.
 *
 * Two things are being chosen at once, which is why this isn't a plain
 * select: the *client* is who's billed, and the *contacts* are who receive
 * the copy. Picking the first person settles both — their company becomes the
 * client — and any further people can only come from that same company, since
 * one invoice can't be billed to two of them.
 */
export function InvoiceClientSelect({
  contacts,
  loading,
  selection,
  onChange,
  onContactsChanged,
  error,
  register,
  ndis = false,
  showAddress = true,
  showAbn = false,
}: {
  contacts: InvoiceContact[];
  loading: boolean;
  selection: ClientSelection;
  onChange: (selection: ClientSelection) => void;
  /** A client was created here, so the list needs refetching. */
  onContactsChanged: () => void;
  error?: string;
  register?: (node: HTMLElement | null) => void;
  /** NDIS claims collect the participant's NDIS number when adding a client. */
  ndis?: boolean;
  showAddress?: boolean;
  showAbn?: boolean;
}) {
  // The customer's number is labelled by the business's country: ABN, NZBN, …
  const { country } = useCountryContext();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  /**
   * Set by picking someone: the list then shows only the rest of that person's
   * company, since the next thing anyone wants is a colleague of theirs, not a
   * different client. Cleared whenever the dropdown closes, so opening it again
   * starts from the full list and switching client is still one click.
   */
  const [narrowed, setNarrowed] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  /*
   * Opening the dropdown with someone already chosen starts on them, not at
   * the top of a list that may be dozens long. Scrolls the list's own
   * container rather than calling `scrollIntoView`, which would also move the
   * page under it.
   */
  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const row = list?.querySelector<HTMLElement>('[data-chosen="true"]');
      if (!list || !row) return;
      const offset =
        row.getBoundingClientRect().top -
        list.getBoundingClientRect().top -
        (list.clientHeight - row.clientHeight) / 2;
      list.scrollTop += offset;
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const { clientId, clientName, recipients } = selection;
  const selectedIds = new Set(recipients.map((person) => person.id));

  const needle = query.trim().toLowerCase();
  const matches = contacts.filter((contact) => {
    // Only the chosen company's people who aren't already on the invoice.
    if (narrowed && (contact.clientId !== clientId || selectedIds.has(contact.id))) {
      return false;
    }
    if (!needle) return true;
    return (
      contact.name.toLowerCase().includes(needle) ||
      contact.email.toLowerCase().includes(needle) ||
      contact.clientName.toLowerCase().includes(needle)
    );
  });

  /** The chosen company's own record, for the currency/ABN/address lines. */
  const client = contacts.find((contact) => contact.clientId === clientId);
  const clientContacts = contactsForClient(contacts, clientId);

  /** Applies a pick, and returns the selection it produced. */
  const toggle = (contact: InvoiceContact): ClientSelection => {
    let next: ClientSelection;

    if (clientId && contact.clientId !== clientId) {
      // A different company replaces the selection outright rather than
      // silently billing the wrong client.
      next = {
        clientId: contact.clientId,
        clientName: contact.clientName || contact.name,
        recipients: [
          { id: contact.id, name: contact.name, email: contact.email },
        ],
      };
    } else if (selectedIds.has(contact.id)) {
      const remaining = recipients.filter((person) => person.id !== contact.id);
      next =
        remaining.length > 0
          ? { clientId, clientName, recipients: remaining }
          : // The last person removed clears the client too — an invoice
            // addressed to nobody has no client either.
            { clientId: null, clientName: "", recipients: [] };
    } else {
      next = {
        clientId: contact.clientId,
        clientName: contact.clientName || contact.name,
        recipients: [
          ...recipients,
          { id: contact.id, name: contact.name, email: contact.email },
        ],
      };
    }

    onChange(next);
    return next;
  };

  /**
   * What happens to the dropdown after a pick.
   *
   * Someone was added: if their company has others who could be copied in, the
   * list stays open but narrows to them; if there's nobody left to add — a
   * single-contact client, or everyone already chosen — the choice is made and
   * the dropdown closes. Someone was removed: the list stays as it was, since
   * that's a correction rather than a choice.
   */
  const afterPick = (contact: InvoiceContact, next: ClientSelection) => {
    setQuery("");
    const added = next.recipients.some((person) => person.id === contact.id);
    if (!added) return;

    const chosen = new Set(next.recipients.map((person) => person.id));
    const others = contactsForClient(contacts, next.clientId).filter(
      (entry) => !chosen.has(entry.id),
    );
    if (others.length > 0) {
      setNarrowed(true);
    } else {
      // Closing from here doesn't go through the popover's own change handler,
      // so the narrowing is cleared by hand — otherwise reopening would show an
      // empty list under a heading.
      setNarrowed(false);
      setOpen(false);
    }
  };

  const triggerLabel = clientName || "Select a client";

  return (
    <div className="space-y-2">
      <Label className="block">
        Client name
        <Required />
      </Label>

      {loading ? (
        <Skeleton className="h-10 w-full rounded-md" aria-hidden />
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setQuery("");
              setNarrowed(false);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              ref={register}
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-invalid={!!error}
              className={cn(
                "w-full justify-between font-normal",
                CONTROL_SURFACE_TRIGGER,
                !clientName && "text-muted-foreground",
                error && "border-destructive focus-visible:ring-destructive",
              )}
            >
              {triggerLabel}
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search clients and contacts"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList ref={listRef}>
                {matches.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {contacts.length === 0
                      ? "No clients yet — add your first below."
                      : "No contacts found"}
                  </p>
                ) : (
                  <CommandGroup
                    // A little air between rows, so a ticked row's ring and the
                    // highlighted row beside it don't run into each other.
                    className="[&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-1"
                    heading={
                      narrowed
                        ? `More contacts at ${clientName || "this client"}`
                        : undefined
                    }
                  >
                    {matches.map((contact) => {
                      const chosen = selectedIds.has(contact.id);
                      // Everything outside the locked company is dimmed but
                      // still clickable, since switching client is legitimate.
                      const otherClient =
                        !!clientId && contact.clientId !== clientId;

                      return (
                        <CommandItem
                          key={contact.id}
                          value={contact.id}
                          data-chosen={chosen || undefined}
                          onSelect={() => afterPick(contact, toggle(contact))}
                          className={cn(
                            otherClient && "opacity-60",
                            // Picked rows keep their own tint, distinct from
                            // the hover/keyboard highlight, so what's chosen
                            // still reads at a glance while moving through.
                            chosen &&
                              "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/30 data-[selected=true]:bg-primary/15 data-[selected=true]:text-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                              chosen
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted",
                            )}
                          >
                            {initials(contact.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-sm",
                                chosen && "font-semibold text-primary",
                              )}
                            >
                              {contact.name}
                              {contact.isPrimary && (
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  primary
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[contact.clientName, contact.email]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {/* Every client's currency, so it is known before
                              they're picked, not after the prices have been
                              typed. */}
                          {contact.clientCurrency && (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px] tabular"
                            >
                              {contact.clientCurrency}
                            </Badge>
                          )}
                          {chosen && (
                            <Check className="size-4 shrink-0 text-primary" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>

              {/* Back to everyone, for when the client picked was the wrong one.
                  Outside CommandList, like the button below, so a search can't
                  filter it away. */}
              {narrowed && (
                <button
                  type="button"
                  onClick={() => setNarrowed(false)}
                  className="w-full border-t border-border p-2.5 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
                >
                  Show all clients
                </button>
              )}

              {/* Outside CommandList so it can never be filtered away. */}
              <button
                type="button"
                onClick={() => {
                  setNarrowed(false);
                  setOpen(false);
                  setDialogOpen(true);
                }}
                className="flex w-full items-center gap-2.5 border-t border-border p-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10"
                  aria-hidden
                >
                  <Plus className="size-4 text-primary" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {query.trim() ? `Add "${query.trim()}"` : "Add new client"}
                </span>
              </button>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Who the emailed copy goes to. Shown as chips because more than one
          person at a client commonly needs it — accounts plus the manager. */}
      {recipients.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {recipients.map((person) => (
              <span
                key={person.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted py-1 pl-2.5 pr-1 text-xs"
              >
                <span className="truncate">{person.name || person.email}</span>
                {/* Two contacts can share a name; the address tells them apart. */}
                {person.name && person.email && (
                  <>
                    <span className="text-muted-foreground" aria-hidden>
                      -
                    </span>
                    <span className="truncate text-muted-foreground">
                      {person.email}
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = recipients.filter(
                      (entry) => entry.id !== person.id,
                    );
                    onChange(
                      next.length > 0
                        ? { clientId, clientName, recipients: next }
                        : { clientId: null, clientName: "", recipients: [] },
                    );
                  }}
                  aria-label={`Remove ${person.name || person.email}`}
                  className="grid size-4 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>

          {clientContacts.length > recipients.length && (
            <p className="text-xs text-muted-foreground">
              {clientContacts.length - recipients.length} more contact
              {clientContacts.length - recipients.length === 1 ? "" : "s"} at
              this client — add them above to copy them in.
            </p>
          )}
        </div>
      )}

      {client && (
        <div className="space-y-0.5 text-sm text-muted-foreground">
          {showAbn && client.clientAbn && (
            <p className="tabular">
              {customerIdLabel(country)} {client.clientAbn}
            </p>
          )}
        </div>
      )}

      <NewInvoiceClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialName={query.trim()}
        ndis={ndis}
        onCreated={(created) => {
          onChange({
            clientId: created.clientId,
            clientName: created.clientName,
            recipients: [created.contact],
          });
          onContactsChanged();
          setQuery("");
        }}
      />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
