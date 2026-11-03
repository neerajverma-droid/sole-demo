"use client";

import * as React from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NewClientDialog } from "@/components/documents/new-client-dialog";
import { useCalendarContactsQuery } from "@/hooks/use-calendar-query";
import type { CalendarContact } from "@/lib/calendar";
import type { ProjectClient } from "@/lib/projects";
import { cn } from "@/lib/utils";

function toProjectClient(contact: CalendarContact): ProjectClient | null {
  if (contact.client_id == null || contact.client_id === "") return null;
  return {
    clientId: String(contact.client_id),
    contactId:
      contact.contact_id != null && contact.contact_id !== ""
        ? String(contact.contact_id)
        : null,
    name: contact.label,
    email: contact.email,
  };
}

/**
 * The project's client — sole-webapp's SearchableClientSelect. A project
 * records both the `client_id` and the `contact_id`, so it reads the same
 * `/contact/list` the calendar's task form does, the one list carrying the
 * pair. A client that doesn't exist yet can be created from the foot of the
 * list, as there.
 */
export function ProjectClientSelect({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id?: string;
  value: ProjectClient | null;
  onChange: (client: ProjectClient | null) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const contactsQuery = useCalendarContactsQuery(!disabled);
  const contacts = (contactsQuery.data ?? []).filter((contact) =>
    toProjectClient(contact),
  );

  const isSelected = (contact: CalendarContact) =>
    !!value &&
    String(contact.client_id) === value.clientId &&
    String(contact.contact_id ?? "") === (value.contactId ?? "");

  return (
    <>
      {/* Modal for the same reason as the time picker: in a dialog, the
          contact list wouldn't scroll with a trackpad otherwise. */}
      <Popover
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <Tooltip>
          {/* A div carries the hover: the trigger is disabled while editing,
              and a disabled button takes no pointer events. */}
          <TooltipTrigger asChild>
            <div className="w-full">
              <PopoverTrigger asChild>
                <Button
                  id={id}
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-invalid={invalid || undefined}
                  disabled={disabled}
                  className={cn(
                    CONTROL_SURFACE_TRIGGER,
                    "w-full justify-between font-normal",
                    !value && "text-muted-foreground",
                    invalid &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                >
                  {value ? (
                    // One line, the height of every other field: name, then email.
                    <span className="min-w-0 truncate text-left">
                      {value.name || "Unnamed client"}
                      {value.email && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {value.email}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="truncate">Find or create a contact</span>
                  )}
                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
            </div>
          </TooltipTrigger>
          {value && (
            <TooltipContent align="start" className="max-w-sm">
              <p className="font-medium">{value.name || "Unnamed client"}</p>
              {value.email && <p className="opacity-80">{value.email}</p>}
            </TooltipContent>
          )}
        </Tooltip>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-0"
        >
          <Command
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput
              placeholder="Search contacts…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {contactsQuery.isLoading
                  ? "Loading contacts…"
                  : "No contacts found"}
              </CommandEmpty>
              <CommandGroup>
                {contacts.map((contact) => (
                  <CommandItem
                    key={`${contact.client_id}-${contact.contact_id}`}
                    value={`${contact.label} ${contact.email} ${contact.client_id}-${contact.contact_id}`}
                    onSelect={() => {
                      onChange(toProjectClient(contact));
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {contact.label || "Unnamed contact"}
                      </p>
                      {contact.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {contact.email}
                        </p>
                      )}
                    </div>
                    {isSelected(contact) && (
                      <Check className="size-4 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t border-border p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-primary"
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
              >
                <Plus />
                {query.trim() ? `Create “${query.trim()}”` : "Add new client"}
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <NewClientDialog
        open={creating}
        onOpenChange={setCreating}
        initialName={query.trim()}
        onCreated={async (contact) => {
          // The new client's contact row only exists server-side, so fetch the
          // list again and select the row the server made for it.
          const rows = (await contactsQuery.refetch()).data ?? [];
          const row = rows.find(
            (candidate) => String(candidate.client_id) === contact.id,
          );
          onChange(
            (row && toProjectClient(row)) ?? {
              clientId: contact.id,
              contactId: null,
              name: contact.businessName || contact.personName,
              email: contact.email,
            },
          );
          setQuery("");
        }}
      />
    </>
  );
}
