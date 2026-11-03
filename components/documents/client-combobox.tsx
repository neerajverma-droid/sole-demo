"use client";

import * as React from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

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
import { Required } from "@/components/documents/field";
import { NewClientDialog } from "@/components/documents/new-client-dialog";
import {
  clientCreateLabel,
  contactDisplayName,
  contactInitials,
  exactContactMatch,
  matchContacts,
  type ContactType,
} from "@/lib/contacts";
import { useCountryContext } from "@/hooks/use-country-context";
import { customerIdLabel } from "@/lib/country-context";
import { cn } from "@/lib/utils";
import { useContactsStore } from "@/stores/contacts";

/**
 * Client picker reading straight from the contacts store, shared by the
 * invoice and quote editors. The create row is always visible at the foot of
 * the dropdown, so a client that doesn't exist yet is never a dead end.
 */
export function ClientCombobox({
  clientId,
  clientName,
  onSelect,
  error,
  register,
  label = "Client name",
  createType = "Client",
  /**
   * Follows `createType` rather than being hardcoded: the expense and vendor
   * refund forms both pick suppliers, and were reading "Select a client" under
   * a Supplier label.
   */
  placeholder = `Select a ${createType.toLowerCase()}`,
  emptyHint = "No contacts found",
  showAddress = true,
  showAbn = false,
}: {
  clientId: string | null;
  /** Snapshot name, shown when the contact has since been deleted. */
  clientName: string;
  onSelect: (values: { clientId: string; clientName: string }) => void;
  error?: string;
  register?: (node: HTMLElement | null) => void;
  /** The field label; the Matching Rules form calls it just "Client". */
  label?: string;
  /** Expenses create Suppliers rather than Clients. */
  createType?: ContactType;
  /** Overrides the empty-state text on the trigger. */
  placeholder?: string;
  emptyHint?: string;
  /** Both follow the Sales settings field toggles for the document type. */
  showAddress?: boolean;
  showAbn?: boolean;
}) {
  // The customer's number is labelled by the business's country: ABN, NZBN, …
  const { country } = useCountryContext();
  const contacts = useContactsStore((state) => state.contacts);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const selected = contacts.find((contact) => contact.id === clientId);
  const triggerLabel = selected
    ? contactDisplayName(selected)
    : clientName || placeholder;

  const trimmed = query.trim();
  const matches = matchContacts(contacts, query);
  const createLabel = trimmed
    ? clientCreateLabel(query)
    : `Add new ${createType.toLowerCase()}`;

  const onCreateRowClick = () => {
    // Typing a name that already exists should select it, not duplicate it.
    const existing = exactContactMatch(contacts, query);

    if (existing) {
      onSelect({
        clientId: existing.id,
        clientName: contactDisplayName(existing),
      });
      setOpen(false);
      setQuery("");
      return;
    }

    setOpen(false);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-2">
      <Label className="block">
        {label}
        <Required />
      </Label>

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
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
              !selected && !clientName && "text-muted-foreground",
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
              placeholder="Search contacts"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {/*
                A plain row, not CommandEmpty — that gates on cmdk's internal
                filtered count, which we've turned off in favour of our own.
              */}
              {matches.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {emptyHint}
                </p>
              )}
              {matches.length > 0 && (
                <CommandGroup>
                  {matches.map((contact) => {
                    const name = contactDisplayName(contact);
                    return (
                      <CommandItem
                        key={contact.id}
                        value={contact.id}
                        onSelect={() => {
                          onSelect({ clientId: contact.id, clientName: name });
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {contactInitials(contact.personName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {contact.email}
                          </span>
                        </span>
                        {contact.id === clientId && (
                          <Check className="size-4 shrink-0" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>

            {/*
              Outside CommandList so cmdk can never filter it away — the row
              stays put whatever has been typed.
            */}
            <button
              type="button"
              onClick={onCreateRowClick}
              className="flex w-full items-center gap-2.5 border-t border-border p-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10"
                aria-hidden
              >
                <Plus className="size-4 text-primary" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {createLabel}
              </span>
            </button>
          </Command>
        </PopoverContent>
      </Popover>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {selected && (
        <div className="space-y-0.5 text-sm text-muted-foreground">
          <p>{selected.email}</p>
          {/* Only the lines the document actually prints. */}
          {showAddress && selected.addressLine1 && (
            <p>
              {[selected.addressLine1, selected.city, selected.country]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {showAbn && selected.abn && (
            <p className="tabular">
              {customerIdLabel(country)} {selected.abn}
            </p>
          )}
        </div>
      )}

      {/* Sibling of the popover, so closing the dropdown can't unmount it. */}
      <NewClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialName={trimmed}
        createType={createType}
        onCreated={(contact) => {
          onSelect({
            clientId: contact.id,
            clientName: contactDisplayName(contact),
          });
          setQuery("");
        }}
      />
    </div>
  );
}
