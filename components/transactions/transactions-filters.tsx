"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Filter, X } from "lucide-react";

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
import { invoiceMoney, parseIsoDate, toIsoDate } from "@/lib/invoices";
import { fetchManualAccounts } from "@/lib/manual-transaction";
import {
  EMPTY_TRANSACTION_FILTERS,
  FILTER_HIDDEN_CATEGORY_IDS,
  activeTransactionFilterCount,
  presetRange,
  toggleCategoryGroup,
  type DatePreset,
  type TransactionFilterDraft,
} from "@/lib/transaction-filters";
import { cn } from "@/lib/utils";
import { useBankAccountsQuery } from "@/hooks/use-bank-accounts-query";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { activeCurrencySymbol } from "@/lib/country-context";

/**
 * The Transactions lists' Filters — sole-webapp's smart filters, in the
 * Invoices list's popover.
 *
 * Both tabs: a date preset or custom range, Credit/Debit, and an amount
 * range. Unmatched adds the bank accounts; Matched adds categories (by
 * parent, each with Select all) and cash payments.
 *
 * Edits stay in a draft until Apply, as on Invoices: Cancel, an outside click
 * or Escape all leave the applied filters as they were.
 */
export function TransactionsFiltersPopover({
  tab,
  value,
  onChange,
}: {
  tab: "unmatched" | "matched";
  value: TransactionFilterDraft;
  onChange: (next: TransactionFilterDraft) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const count = activeTransactionFilterCount(value, tab);
  const draftCount = activeTransactionFilterCount(draft, tab);
  const today = React.useMemo(() => parseIsoDate(toIsoDate(new Date())), []);
  // "Previous financial year" is the business's — April to March in New Zealand.
  const fiscalYearStart = useFiscalYearStart();

  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const patch = (partial: Partial<TransactionFilterDraft>) =>
    setDraft((current) => ({ ...current, ...partial }));

  const choosePreset = (preset: DatePreset) => {
    if (preset === "custom") {
      patch({ datePreset: "custom" });
      return;
    }
    patch({
      datePreset: preset,
      ...presetRange(preset, new Date(), fiscalYearStart),
    });
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Filter className="size-4" />
          Filters
          {count > 0 && (
            <Badge variant="secondary" className="ml-0.5 px-1.5 tabular">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      {/*
        Opens below the button, and is never taller than the room left on
        screen there — Radix measures that as
        `--radix-popover-content-available-height` — so the whole popover is
        always visible and anything longer scrolls inside it. Opening upward
        pushed its top off the screen, where it couldn't be scrolled back.
      */}
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={16}
        className="max-h-[min(var(--radix-popover-content-available-height),540px)] w-[340px] space-y-4 overflow-y-auto overscroll-contain sm:w-[380px]"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            Filter {tab === "unmatched" ? "unmatched" : "matched"} transactions
          </p>
          {draftCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDraft(EMPTY_TRANSACTION_FILTERS)}
            >
              <X className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>

        <Field label="Date range">
          <Select
            value={draft.datePreset}
            onValueChange={(next) => choosePreset(next as DatePreset)}
          >
            <SelectTrigger aria-label="Date range preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Select</SelectItem>
              <SelectItem value="prev_month">Previous month</SelectItem>
              <SelectItem value="prev_fy">Previous financial year</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <DatePicker
              value={draft.from}
              toDate={today}
              onChange={(iso) => patch({ from: iso, datePreset: "custom" })}
              label="From date"
            />
          </Field>
          <Field label="To">
            <DatePicker
              value={draft.to}
              toDate={today}
              onChange={(iso) => patch({ to: iso, datePreset: "custom" })}
              label="To date"
            />
          </Field>
        </div>

        <Field label="Type">
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={draft.credit}
                onCheckedChange={(checked) => patch({ credit: checked === true })}
              />
              Credit
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={draft.debit}
                onCheckedChange={(checked) => patch({ debit: checked === true })}
              />
              Debit
            </label>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount min">
            <AmountInput
              value={draft.minAmount}
              onChange={(next) => patch({ minAmount: next })}
              label="Minimum amount"
            />
          </Field>
          <Field label="Amount max">
            <AmountInput
              value={draft.maxAmount}
              onChange={(next) => patch({ maxAmount: next })}
              label="Maximum amount"
            />
          </Field>
        </div>

        {tab === "unmatched" ? (
          <AccountsField
            selected={draft.accountIds}
            onChange={(accountIds) => patch({ accountIds })}
          />
        ) : (
          <>
            <CategoriesField
              selected={draft.categoryIds}
              onChange={(categoryIds) => patch({ categoryIds })}
            />
            <Field label="Transaction type">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.cash}
                  onCheckedChange={(checked) => patch({ cash: checked === true })}
                />
                Cash
              </label>
            </Field>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(value);
              setOpen(false);
            }}
          >
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

/** Unmatched: which feeds to show — sole-webapp's Account checkboxes. */
function AccountsField({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const query = useBankAccountsQuery();
  const accounts = query.data?.accounts ?? [];
  if (!query.isPending && accounts.length === 0) return null;

  return (
    <Field label="Bank accounts">
      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
        {query.isPending ? (
          <p className="p-2 text-xs text-muted-foreground">Loading accounts…</p>
        ) : (
          accounts.map((account) => (
            <label
              key={account.id}
              className="flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(account.id)}
                onCheckedChange={() =>
                  onChange(
                    selected.includes(account.id)
                      ? selected.filter((id) => id !== account.id)
                      : [...selected, account.id],
                  )
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{account.name}</span>
                <span className="block truncate text-xs text-muted-foreground tabular">
                  ACC {account.accountNumber || "—"} ·{" "}
                  {invoiceMoney(account.balance)}
                </span>
              </span>
            </label>
          ))
        )}
      </div>
    </Field>
  );
}

/**
 * Matched: categories, one collapsible block per parent with Select all —
 * sole-webapp's category accordions.
 */
function CategoriesField({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const query = useQuery({
    queryKey: ["manual-transaction-accounts"],
    queryFn: fetchManualAccounts,
  });
  const [openGroups, setOpenGroups] = React.useState<string[]>([]);

  const groups = React.useMemo(() => {
    const byParent = new Map<string, { id: string; name: string }[]>();
    for (const account of query.data ?? []) {
      if (!account.name || FILTER_HIDDEN_CATEGORY_IDS.includes(account.id)) continue;
      const list = byParent.get(account.parentName) ?? [];
      list.push({ id: account.id, name: account.name });
      byParent.set(account.parentName, list);
    }
    return [...byParent.entries()].map(([name, options]) => ({ name, options }));
  }, [query.data]);

  return (
    <Field label="Categories">
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1">
        {query.isPending ? (
          <p className="p-2 text-xs text-muted-foreground">Loading categories…</p>
        ) : groups.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">No categories found</p>
        ) : (
          groups.map((group) => {
            const open = openGroups.includes(group.name);
            const ids = group.options.map((option) => option.id);
            const picked = ids.filter((id) => selected.includes(id)).length;
            const all = picked === ids.length && ids.length > 0;
            return (
              <div key={group.name}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((current) =>
                      open
                        ? current.filter((name) => name !== group.name)
                        : [...current, group.name],
                    )
                  }
                  aria-expanded={open}
                  className="flex w-full items-center gap-1.5 rounded-sm p-1.5 text-left text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {open ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{group.name}</span>
                  {picked > 0 && (
                    <Badge variant="secondary" className="px-1.5 text-xs tabular">
                      {picked}
                    </Badge>
                  )}
                </button>
                {open && (
                  <div className="space-y-0.5 pb-1 pl-6">
                    <label className="flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm font-medium hover:bg-accent">
                      <Checkbox
                        checked={all ? true : picked > 0 ? "indeterminate" : false}
                        onCheckedChange={() => onChange(toggleCategoryGroup(selected, ids))}
                      />
                      Select all
                    </label>
                    {group.options.map((option) => (
                      <label
                        key={option.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent",
                        )}
                      >
                        <Checkbox
                          checked={selected.includes(option.id)}
                          onCheckedChange={() =>
                            onChange(
                              selected.includes(option.id)
                                ? selected.filter((id) => id !== option.id)
                                : [...selected, option.id],
                            )
                          }
                        />
                        <span className="truncate">{option.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Field>
  );
}

/** "$" then the figure — the Invoices filter's own amount field. */
function AmountInput({
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
        onChange={(event) => {
          // Digits with up to two decimals, as sole-webapp's inputs allow.
          if (/^\d*(\.\d{0,2})?$/.test(event.target.value)) {
            onChange(event.target.value);
          }
        }}
        inputMode="decimal"
        className="pl-7 tabular"
        aria-label={label}
      />
    </div>
  );
}
