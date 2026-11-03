"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Clock3, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { NewInvoiceClientDialog } from "@/components/documents/new-invoice-client-dialog";
import { invalidateContactLists } from "@/hooks/use-contacts-query";
import { FilterPill } from "@/components/ui/filter-pills";
import {
  StepFooter,
  StepHeader,
  ToggleCard,
  useTouched,
} from "@/components/proposals/steps/step-parts";
import {
  CONTRACT_LENGTHS,
  fetchProposalContacts,
  generalIssues,
  snapshotFromContact,
  type ClientSnapshot,
  type ProposalContact,
  type ProposalGeneral,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

export function GeneralStep({
  general,
  client,
  onChange,
  onClientChange,
  onSave,
  saving,
  loading,
}: {
  general: ProposalGeneral;
  client: ClientSnapshot | null;
  onChange: (patch: Partial<ProposalGeneral>) => void;
  onClientChange: (client: ClientSnapshot | null) => void;
  onSave: () => void;
  saving: boolean;
  loading: boolean;
}) {
  const { show, submit } = useTouched();
  const issues = generalIssues(general);

  const save = () => {
    submit();
    if (Object.keys(issues).length) return;
    onSave();
  };

  return (
    <section className="space-y-5">
      <StepHeader
        title="General"
        description="Save the proposal draft, selected client, contract timing, and expiry settings."
      />

      <Field
        label="Proposal name"
        htmlFor="proposal_name"
        required
        error={show("proposal_name") ? issues.proposal_name : undefined}
      >
        <Input
          id="proposal_name"
          value={general.proposal_name}
          placeholder="Untitled Proposal"
          aria-invalid={show("proposal_name") && Boolean(issues.proposal_name)}
          onChange={(event) => onChange({ proposal_name: event.target.value })}
        />
      </Field>

      <Field
        label="Client"
        required
        error={show("client_id") ? issues.client_id : undefined}
      >
        <ContactSelect
          value={general.contact_id}
          client={client}
          disabled={loading}
          invalid={show("client_id") && Boolean(issues.client_id)}
          onSelect={(contact) => {
            const snapshot = contact ? snapshotFromContact(contact) : null;
            onClientChange(snapshot);
            onChange({
              client_id: contact?.clientId ?? "",
              contact_id: contact?.contactId ?? "",
              ...(contact?.currency ? { currency_code: contact.currency } : {}),
            });
          }}
        />
      </Field>

      <div className="grid gap-6 border-b border-border pb-5 xl:grid-cols-[1fr_1.35fr]">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Contract starts</h3>
          <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1">
            {(
              [
                { label: "On acceptance", value: "ON_ACCEPTANCE" },
                { label: "Specific date", value: "ON_SPECIFIC_DATE" },
              ] as const
            ).map((option) => {
              const active = general.contract_start_type === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ contract_start_type: option.value })}
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {general.contract_start_type === "ON_SPECIFIC_DATE" ? (
            <div className="max-w-xs">
              <Field
                label="Start date"
                required
                error={show("contract_start_date") ? issues.contract_start_date : undefined}
              >
                <DatePicker
                  value={general.contract_start_date}
                  onChange={(iso) => onChange({ contract_start_date: iso })}
                  invalid={show("contract_start_date") && Boolean(issues.contract_start_date)}
                />
              </Field>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Clock3 className="size-4" aria-hidden />
              Begins the moment the client signs
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Contract length</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Contract length">
            {CONTRACT_LENGTHS.map((option) => (
              <FilterPill
                key={option.value}
                active={general.contract_length === option.value}
                onSelect={() => onChange({ contract_length: option.value })}
              >
                {option.label}
              </FilterPill>
            ))}
          </div>
          {general.contract_length === "custom" && (
            <div className="max-w-[180px]">
              <Field
                label="Custom months"
                htmlFor="contract_custom_length"
                required
                error={show("contract_custom_length") ? issues.contract_custom_length : undefined}
              >
                <Input
                  id="contract_custom_length"
                  type="number"
                  min={1}
                  value={general.contract_custom_length}
                  onChange={(event) =>
                    onChange({ contract_custom_length: event.target.value })
                  }
                />
              </Field>
            </div>
          )}
          <p className="text-xs font-medium text-muted-foreground">
            Min term: 1 Month - auto-renews monthly
          </p>
        </div>
      </div>

      <ToggleCard
        id="is_auto_expire"
        label="Auto expire proposal"
        description="Expire the proposal automatically if it isn't accepted in time."
        checked={general.is_auto_expire}
        onCheckedChange={(checked) => onChange({ is_auto_expire: checked })}
      >
        {general.is_auto_expire && (
          <div className="mt-4 max-w-xs">
            <Field
              label="Expire in days"
              htmlFor="expire_in_days"
              error={show("expire_in_days") ? issues.expire_in_days : undefined}
            >
              <Input
                id="expire_in_days"
                type="number"
                min={1}
                className="bg-background"
                value={general.expire_in_days}
                onChange={(event) => onChange({ expire_in_days: event.target.value })}
              />
            </Field>
          </div>
        )}
      </ToggleCard>

      <StepFooter
        saving={saving}
        disabled={loading}
        nextLabel="Services"
        onSave={save}
      />
    </section>
  );
}

/**
 * Who the proposal is addressed to: one contact at a client. Their name and
 * email are who it's emailed to and who signs it; their company is the client.
 */
function ContactSelect({
  value,
  client,
  disabled,
  invalid,
  onSelect,
}: {
  value: string;
  client: ClientSnapshot | null;
  disabled?: boolean;
  invalid?: boolean;
  onSelect: (contact: ProposalContact | null) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const contactsQuery = useQuery({
    queryKey: ["proposal-contacts"],
    queryFn: fetchProposalContacts,
    // Clients are added elsewhere too — check again each time the builder opens.
    refetchOnMount: "always",
  });
  const contacts = React.useMemo(() => contactsQuery.data ?? [], [contactsQuery.data]);
  const selected = contacts.find((contact) => contact.contactId === value);

  const label = selected?.name ?? (value && client ? client.name : "");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            className={cn(
              CONTROL_SURFACE_TRIGGER,
              "w-full justify-between font-normal",
              invalid && "border-destructive",
            )}
          >
            <span className={cn("truncate", !label && "text-muted-foreground")}>
              {label ? (
                <>
                  {label}
                  {(selected?.email || client?.email) && (
                    <span className="ml-2 text-muted-foreground">
                      {selected?.email || client?.email}
                    </span>
                  )}
                </>
              ) : contactsQuery.isLoading ? (
                "Loading clients…"
              ) : (
                "Select a client"
              )}
            </span>
            <ChevronDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput
              placeholder="Search clients"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No clients found.</CommandEmpty>
              <CommandGroup>
                {contacts.map((contact) => (
                  <CommandItem
                    key={contact.contactId}
                    value={`${contact.name} ${contact.email} ${contact.contactId}`}
                    onSelect={() => {
                      onSelect(contact.contactId === value ? null : contact);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        contact.contactId === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{contact.name}</span>
                      {contact.email && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {contact.email}
                        </span>
                      )}
                    </span>
                    {contact.currency && (
                      <Badge variant="outline" className="shrink-0 text-[10px] tabular">
                        {contact.currency}
                      </Badge>
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
                className="w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
              >
                <Plus />
                Add new client
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <NewInvoiceClientDialog
        open={creating}
        onOpenChange={setCreating}
        initialName={search}
        ndis={false}
        onCreated={async (created) => {
          // Every picker in the app learns about the new client, and this one
          // reads the server's list now — not its cached copy, which predates it.
          void invalidateContactLists(queryClient);
          const fresh = await queryClient.fetchQuery({
            queryKey: ["proposal-contacts"],
            queryFn: fetchProposalContacts,
            staleTime: 0,
          });
          const match =
            fresh.find((contact) => contact.contactId === created.contact.id) ??
            fresh.find((contact) => contact.clientId === created.clientId);
          if (match) onSelect(match);
        }}
      />
    </>
  );
}
