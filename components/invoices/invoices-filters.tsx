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
import { contactDisplayName, matchContacts, type Contact } from "@/lib/contacts";
import type { InvoiceListFilters } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

/** The advanced filters as typed — numeric fields stay strings until applied. */
export type InvoiceFilterDraft = {
  issuedFrom: string;
  issuedTo: string;
  minTotal: string;
  maxTotal: string;
  balanceMin: string;
  balanceMax: string;
  sent: "any" | "sent" | "not_sent";
  matchedOnly: boolean;
  paidWithCashOnly: boolean;
  clientIds: string[];
};

export const EMPTY_INVOICE_FILTERS: InvoiceFilterDraft = {
  issuedFrom: "",
  issuedTo: "",
  minTotal: "",
  maxTotal: "",
  balanceMin: "",
  balanceMax: "",
  sent: "any",
  matchedOnly: false,
  paidWithCashOnly: false,
  clientIds: [],
};

/** How many of the filters are actually narrowing anything, for the badge. */
export function activeFilterCount(filters: InvoiceFilterDraft): number {
  let count = 0;
  if (filters.issuedFrom || filters.issuedTo) count += 1;
  if (filters.minTotal || filters.maxTotal) count += 1;
  if (filters.balanceMin || filters.balanceMax) count += 1;
  if (filters.sent !== "any") count += 1;
  if (filters.matchedOnly) count += 1;
  if (filters.paidWithCashOnly) count += 1;
  if (filters.clientIds.length > 0) count += 1;
  return count;
}

/** Turns the typed draft into what the server-side fetch actually takes. */
export function resolveInvoiceFilters(
  draft: InvoiceFilterDraft,
): Omit<InvoiceListFilters, "status" | "search" | "clientIds"> {
  const num = (value: string) => {
    const parsed = Number(value);
    return value.trim() && Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    issuedFrom: draft.issuedFrom || undefined,
    issuedTo: draft.issuedTo || undefined,
    minTotal: num(draft.minTotal),
    maxTotal: num(draft.maxTotal),
    balanceMin: num(draft.balanceMin),
    balanceMax: num(draft.balanceMax),
    sent: draft.sent === "any" ? undefined : draft.sent,
    matchedOnly: draft.matchedOnly || undefined,
    paidWithCashOnly: draft.paidWithCashOnly || undefined,
  };
}

/**
 * Date range, amount range, balance range, sent/not-sent, matched, paid with
 * cash, and a client picker — sole-webapp's own SmartFilter, folded into one
 * popover rather than a full dialog since there's nowhere here it needs the
 * room.
 *
 * Edits stay local until Apply: every field here changes a draft copy, not
 * `value` itself, so the list's own query — and the shimmer it shows while
 * fetching — only fires once, on Apply, rather than once per field touched.
 * Cancel, an outside click or Escape all discard the draft the same way:
 * nothing propagates to `onChange` unless Apply was the thing that closed it.
 */
export function InvoicesFiltersPopover({
  value,
  onChange,
  clients,
}: {
  value: InvoiceFilterDraft;
  onChange: (next: InvoiceFilterDraft) => void;
  /** Client contacts to choose from — suppliers don't get invoiced. */
  clients: Contact[];
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [clientQuery, setClientQuery] = React.useState("");
  const count = activeFilterCount(value);
  const draftCount = activeFilterCount(draft);

  // Opening always starts from what's actually applied — an edit left over
  // from a cancelled session shouldn't reappear next time this opens.
  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const patch = (partial: Partial<InvoiceFilterDraft>) =>
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
          <p className="text-sm font-medium">Filter invoices</p>
          {draftCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDraft(EMPTY_INVOICE_FILTERS)}
            >
              <X className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Issued from">
            <DatePicker
              value={draft.issuedFrom}
              onChange={(iso) => patch({ issuedFrom: iso })}
              label="Issued from"
            />
          </Field>
          <Field label="Issued to">
            <DatePicker
              value={draft.issuedTo}
              onChange={(iso) => patch({ issuedTo: iso })}
              label="Issued to"
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
          <Field label="Balance min">
            <AmountInput
              value={draft.balanceMin}
              onChange={(next) => patch({ balanceMin: next })}
              label="Minimum balance owed"
            />
          </Field>
          <Field label="Balance max">
            <AmountInput
              value={draft.balanceMax}
              onChange={(next) => patch({ balanceMax: next })}
              label="Maximum balance owed"
            />
          </Field>
        </div>

        <Field label="Sent">
          <Select
            value={draft.sent}
            onValueChange={(next) =>
              patch({ sent: next as InvoiceFilterDraft["sent"] })
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

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={draft.matchedOnly}
              onCheckedChange={(checked) =>
                patch({ matchedOnly: checked === true })
              }
            />
            Matched to a bank transaction
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={draft.paidWithCashOnly}
              onCheckedChange={(checked) =>
                patch({ paidWithCashOnly: checked === true })
              }
            />
            Paid with cash
          </label>
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
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent",
                  )}
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

/** A dollar-prefixed amount field — shared with the quotes list's own filters. */
export function AmountInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {activeCurrencySymbol()}
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="pl-7 tabular"
        aria-label={label}
      />
    </div>
  );
}
