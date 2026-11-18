"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Filter, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { PrefixInput } from "@/components/ui/prefix-input";
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
import { useAccountCategoriesQuery } from "@/hooks/use-account-categories-query";
import {
  ASSET_MATCH_STATUSES,
  EMPTY_ASSET_ADVANCED_FILTERS,
  assetAdvancedFilterCount,
  type AssetAdvancedFilters,
  type AssetMatchStatus,
} from "@/lib/assets";
import { activeCurrencySymbol } from "@/lib/country-context";
import { parseIsoDate } from "@/lib/invoices";

/** A typed amount: digits with at most two decimals, or nothing at all. */
const AMOUNT_PATTERN = /^\d*\.?\d{0,2}$/;

/** An amount field's text as a bound — empty (or a lone ".") is no bound. */
function amountBound(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === ".") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const amountText = (value: number | null) =>
  value == null ? "" : String(value);

/**
 * The asset register's "Filter by" popover: Match status, Date range, Price
 * range, Paid with cash and Category — laid out exactly like the expense
 * list's own `ExpensesFiltersPopover` so the two registers read the same.
 *
 * Edits stay in a local draft until Apply; Cancel, an outside click and Escape
 * all discard them, and reopening starts from what's actually applied.
 *
 * Category is the chart-of-accounts subcategories under "Assets" — what the
 * register's Category column shows and what `account_subcategory_id` filters
 * on — so the draft holds subcategory ids, searched and shown by name.
 *
 * The price fields are held as typed and only become numbers on Apply; an
 * empty field leaves that end of the range open (null).
 */
export function AssetsFiltersPopover({
  value,
  onChange,
}: {
  value: AssetAdvancedFilters;
  onChange: (next: AssetAdvancedFilters) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [minText, setMinText] = React.useState(amountText(value.minValue));
  const [maxText, setMaxText] = React.useState(amountText(value.maxValue));
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [categoryQuery, setCategoryQuery] = React.useState("");
  const count = assetAdvancedFilterCount(value);

  const categoriesQuery = useAccountCategoriesQuery("Assets");
  const categoryOptions = categoriesQuery.data ?? [];

  // Opening always starts from what's actually applied — an edit left over
  // from a cancelled session shouldn't reappear next time this opens.
  React.useEffect(() => {
    if (!open) return;
    setDraft(value);
    setMinText(amountText(value.minValue));
    setMaxText(amountText(value.maxValue));
  }, [open, value]);

  const minValue = amountBound(minText);
  const maxValue = amountBound(maxText);
  const rangeInvalid =
    minValue != null && maxValue != null && minValue > maxValue;
  const next: AssetAdvancedFilters = { ...draft, minValue, maxValue };
  const draftCount = assetAdvancedFilterCount(next);

  const patch = (partial: Partial<AssetAdvancedFilters>) =>
    setDraft((current) => ({ ...current, ...partial }));

  const toggleCategory = (id: string) =>
    patch({
      categories: draft.categories.includes(id)
        ? draft.categories.filter((entry) => entry !== id)
        : [...draft.categories, id],
    });

  const clearAll = () => {
    setDraft(EMPTY_ASSET_ADVANCED_FILTERS);
    setMinText("");
    setMaxText("");
  };

  const apply = () => {
    if (rangeInvalid) return;
    onChange(next);
    setOpen(false);
  };

  const cancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const matchingCategories = categoryOptions.filter((option) =>
    option.name.toLowerCase().includes(categoryQuery.trim().toLowerCase()),
  );
  const matchingIds = matchingCategories.map((option) => option.id);

  // "Select All" toggles every currently-matching (search-narrowed) category
  // at once — the same behaviour as the expense list's category section.
  const allCategoriesSelected =
    matchingIds.length > 0 &&
    matchingIds.every((id) => draft.categories.includes(id));

  const toggleSelectAllCategories = () =>
    patch({
      categories: allCategoriesSelected
        ? draft.categories.filter((entry) => !matchingIds.includes(entry))
        : [...new Set([...draft.categories, ...matchingIds])],
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="size-4" />
          Filter by
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
          <p className="text-sm font-medium">Filter assets</p>
          {draftCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={clearAll}
            >
              <X className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>

        <Field label="Match status">
          <Select
            value={draft.match}
            onValueChange={(status) =>
              patch({ match: status as AssetMatchStatus })
            }
          >
            <SelectTrigger aria-label="Match status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_MATCH_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date from">
            <DatePicker
              value={draft.dateFrom}
              onChange={(iso) => patch({ dateFrom: iso })}
              toDate={parseIsoDate(draft.dateTo)}
              label="Date from"
            />
          </Field>
          <Field label="Date to">
            <DatePicker
              value={draft.dateTo}
              onChange={(iso) => patch({ dateTo: iso })}
              fromDate={parseIsoDate(draft.dateFrom)}
              label="Date to"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price min">
            <AmountInput
              value={minText}
              onChange={setMinText}
              label="Minimum price"
              placeholder="Min"
              invalid={rangeInvalid}
            />
          </Field>
          <Field
            label="Price max"
            error={rangeInvalid ? "Must be at least the minimum" : undefined}
          >
            <AmountInput
              value={maxText}
              onChange={setMaxText}
              label="Maximum price"
              placeholder="Max"
              invalid={rangeInvalid}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={draft.paidWithCashOnly}
            onCheckedChange={(checked) =>
              patch({ paidWithCashOnly: checked === true })
            }
          />
          Paid with cash
        </label>

        <Collapsible open={categoryOpen} onOpenChange={setCategoryOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md py-1 text-sm font-medium"
            >
              <span className="flex items-center gap-1.5">
                Category
                {draft.categories.length > 0 && (
                  <Badge variant="secondary" className="px-1.5 tabular">
                    {draft.categories.length}
                  </Badge>
                )}
              </span>
              {categoryOpen ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <Input
              value={categoryQuery}
              onChange={(event) => setCategoryQuery(event.target.value)}
              placeholder="Search categories"
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent">
              <Checkbox
                checked={allCategoriesSelected}
                onCheckedChange={toggleSelectAllCategories}
                disabled={matchingIds.length === 0}
              />
              Select all
            </label>
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {categoriesQuery.isLoading ? (
                <p className="p-2 text-xs text-muted-foreground">Loading…</p>
              ) : categoriesQuery.isError ? (
                <p className="p-2 text-xs text-muted-foreground">
                  Couldn&apos;t load the categories.
                </p>
              ) : matchingCategories.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No matches</p>
              ) : (
                matchingCategories.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={draft.categories.includes(option.id)}
                      onCheckedChange={() => toggleCategory(option.id)}
                    />
                    <span className="truncate">{option.name}</span>
                  </label>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={apply} disabled={rangeInvalid}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AmountInput({
  value,
  onChange,
  label,
  placeholder,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <PrefixInput
      prefix={activeCurrencySymbol()}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (AMOUNT_PATTERN.test(next)) onChange(next);
      }}
      inputMode="decimal"
      className="tabular"
      aria-label={label}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
    />
  );
}
