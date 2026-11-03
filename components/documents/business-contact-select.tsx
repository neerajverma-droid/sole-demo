"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  RotateCw,
} from "lucide-react";

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NewBusinessContactDialog } from "@/components/documents/new-business-contact-dialog";
import { Required } from "@/components/documents/field";
import type { BusinessContact } from "@/lib/clients";
import { contactInitials } from "@/lib/contacts";
import type { ContactType } from "@/lib/contacts";
import { useCountryContext } from "@/hooks/use-country-context";
import { customerIdLabel } from "@/lib/country-context";
import { cn } from "@/lib/utils";

/**
 * A real client-or-supplier picker, same look and the same email/currency
 * detail as `InvoiceClientSelect` (the invoice editor's own client field) —
 * just over the plain client/supplier entity any other module's `client_id`
 * needs, single-select, with no per-contact recipient chips or NDIS
 * handling, since those are specific to addressing an invoice rather than
 * picking who a rule, an expense or a transaction belongs to.
 */
export function BusinessContactSelect({
  type,
  label,
  contacts,
  loading,
  contactId,
  contactName,
  onSelect,
  onContactsChanged,
  error,
  loadError,
  onRetry,
  register,
  compact = false,
  required = true,
}: {
  /** Which side of the real `/client` list this reads from and creates into. */
  type: ContactType;
  /** Defaults to the type itself ("Client"/"Supplier"). */
  label?: string;
  contacts: BusinessContact[];
  loading: boolean;
  contactId: string | null;
  contactName: string;
  onSelect: (values: {
    contactId: string;
    contactName: string;
    /** This client/supplier's own primary contact person, if it has one — a different id space than `contactId` above (which is the client/company id). */
    primaryContactId?: string | null;
  }) => void;
  /** A contact was created here, so the caller's list needs refetching. */
  onContactsChanged: () => void;
  error?: string;
  /**
   * The contact list itself failed to load. Stops the spinner and shows this
   * message, with a retry, in place of the list.
   */
  loadError?: string;
  /** Re-runs the failed list request; the retry button is hidden without it. */
  onRetry?: () => void;
  register?: (node: HTMLElement | null) => void;
  /**
   * A table cell's version: no label and no detail lines underneath, a
   * shorter trigger, and a dropdown wider than the cell it opens from.
   */
  compact?: boolean;
  /** Drops the asterisk for a record where who it's for is optional — a trip's client. */
  required?: boolean;
}) {
  // The customer's number is labelled by the business's country: ABN, NZBN, …
  const { country } = useCountryContext();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // A failed request isn't still loading, whatever the caller's flag says.
  const busy = loading && !loadError;

  const fieldLabel = label ?? type;
  const labelRef = React.useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = React.useState(false);
  const measure = () => {
    const node = labelRef.current;
    setTruncated(!!node && !!contactName && node.scrollWidth > node.clientWidth);
  };
  const noun = fieldLabel.toLowerCase();

  const needle = query.trim().toLowerCase();
  const matches = contacts.filter((contact) => {
    if (!needle) return true;
    return (
      contact.name.toLowerCase().includes(needle) ||
      contact.email.toLowerCase().includes(needle)
    );
  });

  const selected = contacts.find((contact) => contact.id === contactId);
  const triggerLabel = contactName || `Select a ${noun}`;

  return (
    <div className={compact ? undefined : "space-y-2"}>
      {!compact && (
        <Label className="block">
          {fieldLabel}
          {required && <Required />}
        </Label>
      )}

      <Popover
        // `modal`: inside a dialog, the dialog's scroll lock swallowed the
        // wheel over this portaled list. A modal popover takes its own lock,
        // which lets the list scroll — in a dialog or out of one.
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        {/*
          Compact (in a table cell), a name too long for the field shows in
          full on hover — measured, so a name that fits gets no tooltip.
        */}
        <TooltipProvider delayDuration={200}>
          <Tooltip open={compact && truncated ? undefined : false}>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  ref={register}
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-invalid={!!error}
                  aria-label={compact ? fieldLabel : undefined}
                  onPointerEnter={measure}
                  onFocus={measure}
                  className={cn(
                    "w-full justify-between font-normal",
                    CONTROL_SURFACE_TRIGGER,
                    compact && "h-7 gap-1 px-2 text-xs",
                    !contactName && "text-muted-foreground",
                    error && "border-destructive focus-visible:ring-destructive",
                  )}
                >
                  <span ref={labelRef} className="min-w-0 truncate">
                    {triggerLabel}
                  </span>
                  {busy ? (
                    <Loader2
                      className={cn(
                        "shrink-0 animate-spin opacity-50",
                        compact ? "size-3" : "size-4",
                      )}
                    />
                  ) : loadError ? (
                    <AlertCircle
                      className={cn(
                        "shrink-0 text-destructive",
                        compact ? "size-3" : "size-4",
                      )}
                      aria-hidden
                    />
                  ) : (
                    <ChevronDown
                      className={cn(
                        "shrink-0 opacity-50",
                        compact ? "size-3" : "size-4",
                      )}
                    />
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-80">
              {contactName}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <PopoverContent
          className={cn(
            "p-0",
            compact
              ? "w-72 max-w-[calc(100vw-2rem)]"
              : "w-[--radix-popover-trigger-width]",
          )}
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${noun}s`}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {busy ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Loading {noun}s…
                </div>
              ) : loadError ? (
                <div
                  role="alert"
                  className="flex flex-col items-center gap-2 px-4 py-6 text-center"
                >
                  <p className="text-sm text-destructive">{loadError}</p>
                  {onRetry && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRetry}
                    >
                      <RotateCw className="size-3.5" aria-hidden />
                      Try again
                    </Button>
                  )}
                </div>
              ) : matches.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {contacts.length === 0
                    ? `No ${noun}s yet — add your first below.`
                    : "No matches found"}
                </p>
              ) : (
                <CommandGroup>
                  {matches.map((contact) => (
                    <CommandItem
                      key={contact.id}
                      value={contact.id}
                      onSelect={() => {
                        onSelect({
                          contactId: contact.id,
                          contactName: contact.name,
                          primaryContactId: contact.primaryContactId ?? null,
                        });
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {contactInitials(contact.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {contact.name}
                        </span>
                        {contact.email && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {contact.email}
                          </span>
                        )}
                      </span>
                      {contact.currency && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px] tabular"
                        >
                          {contact.currency}
                        </Badge>
                      )}
                      {contact.id === contactId && (
                        <Check className="size-4 shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>

            {/* Outside CommandList so it can never be filtered away. */}
            <button
              type="button"
              onClick={() => {
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
                {query.trim() ? `Add "${query.trim()}"` : `Add new ${noun}`}
              </span>
            </button>
          </Command>
        </PopoverContent>
      </Popover>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        loadError &&
        !compact && (
          <p className="text-xs text-destructive">
            {loadError}
            {onRetry && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={onRetry}
                  className="font-medium underline underline-offset-2 hover:no-underline"
                >
                  Try again
                </button>
              </>
            )}
          </p>
        )
      )}

      {selected && !compact && (
        <div className="space-y-0.5 text-sm text-muted-foreground">
          {selected.email && <p>{selected.email}</p>}
          {selected.address && <p>{selected.address}</p>}
          {selected.abn && (
            <p className="tabular">
              {customerIdLabel(country)} {selected.abn}
            </p>
          )}
        </div>
      )}

      {/* Sibling of the popover, so closing the dropdown can't unmount it. */}
      <NewBusinessContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={type}
        initialName={query.trim()}
        onCreated={(created) => {
          onSelect({
            contactId: created.id,
            contactName: created.name,
            primaryContactId: created.primaryContactId ?? null,
          });
          onContactsChanged();
          setQuery("");
        }}
      />
    </div>
  );
}
