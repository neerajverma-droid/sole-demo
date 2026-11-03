"use client";

import * as React from "react";
import { Filter, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { AmountInput } from "@/components/invoices/invoices-filters";
import { contactDisplayName, matchContacts, type Contact } from "@/lib/contacts";
import type { QuoteListFilters } from "@/lib/quotes";

/** The advanced filters as typed — numeric fields stay strings until applied. */
export type QuoteFilterDraft = {
  issuedFrom: string;
  issuedTo: string;
  minTotal: string;
  maxTotal: string;
  sent: "any" | "sent" | "not_sent";
  type: "any" | "general" | "ndis";
  clientIds: string[];
};

export const EMPTY_QUOTE_FILTERS: QuoteFilterDraft = {
  issuedFrom: "",
  issuedTo: "",
  minTotal: "",
  maxTotal: "",
  sent: "any",
  type: "any",
  clientIds: [],
};

/** How many of the filters are actually narrowing anything, for the badge. */
export function activeQuoteFilterCount(filters: QuoteFilterDraft): number {
  let count = 0;
  if (filters.issuedFrom || filters.issuedTo) count += 1;
  if (filters.minTotal || filters.maxTotal) count += 1;
  if (filters.sent !== "any") count += 1;
  if (filters.type !== "any") count += 1;
  if (filters.clientIds.length > 0) count += 1;
  return count;
}

/** Turns the typed draft into what the server-side fetch actually takes. */
export function resolveQuoteFilters(
  draft: QuoteFilterDraft,
): Omit<QuoteListFilters, "status" | "search" | "clientIds"> {
  const num = (value: string) => {
    const parsed = Number(value);
    return value.trim() && Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    issuedFrom: draft.issuedFrom || undefined,
    issuedTo: draft.issuedTo || undefined,
    minTotal: num(draft.minTotal),
    maxTotal: num(draft.maxTotal),
    sent: draft.sent === "any" ? undefined : draft.sent,
    type: draft.type === "any" ? undefined : draft.type,
  };
}

/**
 * The quotes list's counterpart to InvoicesFiltersPopover: date range, amount
 * range, sent/not sent, quote type and a client picker. Balance, matching and
 * cash payment have no meaning on a quote, so they aren't here.
 *
 * Edits stay local until Apply, the same as the invoice filters — the list's
 * query only fires once, on Apply, and Cancel, an outside click or Escape all
 * discard the draft.
 */
export function QuotesFiltersPopover({
  value,
  onChange,
  clients,
}: {
  value: QuoteFilterDraft;
  onChange: (next: QuoteFilterDraft) => void;
  /** Client contacts to choose from. */
  clients: Contact[];
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [clientQuery, setClientQuery] = React.useState("");
  const count = activeQuoteFilterCount(value);
  const draftCount = activeQuoteFilterCount(draft);

  // Opening always starts from what's actually applied — an edit left over
  // from a cancelled session shouldn't reappear next time this opens.
  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const patch = (partial: Partial<QuoteFilterDraft>) =>
    setDraft((current) => ({ ...current, ...partial }));

  const toggleClient = (id: string) =>
    patch({
      clientIds: draft.clientIds.includes(id)
        ? draft.clientIds.filter((entry) => entry !== id)
        : [...draft.clientIds, id],
    });

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const cancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const matchingClients = matchContacts(clients, clientQuery);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="size-4" />
          Filters
          {count > 0 && (
            <Badge variant="secondary" className="ml-0.5 px-1.5 tabular">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        collisionPadding={16}
        className="w-[340px] space-y-4 sm:w-[380px]"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Filter quotes</p>
          {draftCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDraft(EMPTY_QUOTE_FILTERS)}
            >
              <X className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quote date from">
            <DatePicker
              value={draft.issuedFrom}
              onChange={(iso) => patch({ issuedFrom: iso })}
              label="Quote date from"
            />
          </Field>
          <Field label="Quote date to">
            <DatePicker
              value={draft.issuedTo}
              onChange={(iso) => patch({ issuedTo: iso })}
              label="Quote date to"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount min">
            <AmountInput
              value={draft.minTotal}
              onChange={(next) => patch({ minTotal: next })}
              label="Minimum amount"
            />
          </Field>
          <Field label="Amount max">
            <AmountInput
              value={draft.maxTotal}
              onChange={(next) => patch({ maxTotal: next })}
              label="Maximum amount"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sent">
            <Select
              value={draft.sent}
              onValueChange={(next) =>
                patch({ sent: next as QuoteFilterDraft["sent"] })
              }
            >
              <SelectTrigger aria-label="Sent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="not_sent">Not sent</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Type">
            <Select
              value={draft.type}
              onValueChange={(next) =>
                patch({ type: next as QuoteFilterDraft["type"] })
              }
            >
              <SelectTrigger aria-label="Quote type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="ndis">NDIS</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Clients" hint={clients.length === 0 ? "No contacts yet" : undefined}>
          <Input
            value={clientQuery}
            onChange={(event) => setClientQuery(event.target.value)}
            placeholder="Search clients"
            className="mb-2"
          />
          <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
            {matchingClients.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">No matches</p>
            ) : (
              matchingClients.map((client) => (
                <label
                  key={client.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={draft.clientIds.includes(client.id)}
                    onCheckedChange={() => toggleClient(client.id)}
                  />
                  <span className="truncate">{contactDisplayName(client)}</span>
                </label>
              ))
            )}
          </div>
        </Field>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={apply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
