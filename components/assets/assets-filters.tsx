"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RangeSlider } from "@/components/ui/range-slider";
import { Switch } from "@/components/ui/switch";
import { AssetsDateRange } from "@/components/assets/assets-date-range";
import { useAccountCategoriesQuery } from "@/hooks/use-account-categories-query";
import {
  ASSET_MATCH_STATUSES,
  EMPTY_ASSET_ADVANCED_FILTERS,
  assetAdvancedFilterCount,
  type AssetAdvancedFilters,
  type AssetMatchStatus,
} from "@/lib/assets";
import { activeCurrencySymbol } from "@/lib/country-context";

/** The section headings — Paid by Cash, Match Status, Date Range and the rest. */
const HEADING = "text-base font-semibold";

/**
 * The asset list's "Filter by" dialog: Paid by Cash, Match Status, Date Range,
 * Asset Value and Category, with Reset and Apply at the foot.
 *
 * Edits are held in a local draft and only reach the list on Apply; closing the
 * dialog any other way (Escape, a click outside) discards them, and reopening
 * starts from what's actually applied. Reset clears every filter and applies
 * that at once.
 *
 * Category is the register's own category list rather than the chart of
 * accounts. An asset only carries a chart-of-accounts subcategory when it's
 * Inventory; every one of them carries `asset_category`, so filtering on
 * subcategories would match almost nothing.
 *
 * `ceiling` is the top of the value slider. Left at either end the range stays
 * open (null) rather than being pinned to a number, so it never hides an asset
 * dearer than the dearest one that was there when this opened.
 */
export function AssetsFiltersDialog({
  value,
  onChange,
  ceiling,
}: {
  value: AssetAdvancedFilters;
  onChange: (next: AssetAdvancedFilters) => void;
  ceiling: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [categoryOpen, setCategoryOpen] = React.useState(true);
  const count = assetAdvancedFilterCount(value);
  const categoriesQuery = useAccountCategoriesQuery("Assets");
  const categoryOptions = categoriesQuery.data ?? [];

  const patch = (partial: Partial<AssetAdvancedFilters>) =>
    setDraft((current) => ({ ...current, ...partial }));

  const handleOpenChange = (next: boolean) => {
    // Opening always starts from what's applied, so an edit left over from a
    // discarded session doesn't reappear.
    if (next) setDraft(value);
    setOpen(next);
  };

  const low = Math.min(draft.minValue ?? 0, ceiling);
  const high = Math.min(draft.maxValue ?? ceiling, ceiling);
  // Step scales with the range so a $2m ceiling isn't a 2,000-stop crawl.
  const step = ceiling >= 100_000 ? 100 : ceiling >= 10_000 ? 10 : 1;

  const setMin = (next: number) =>
    patch({ minValue: next <= 0 ? null : Math.min(next, high) });
  const setMax = (next: number) =>
    patch({ maxValue: next >= ceiling ? null : Math.max(next, low) });

  const allCategories =
    categoryOptions.length > 0 &&
    categoryOptions.every((option) => draft.categories.includes(option.id));
  const toggleCategory = (category: string) =>
    patch({
      categories: draft.categories.includes(category)
        ? draft.categories.filter((entry) => entry !== category)
        : [...draft.categories, category],
    });

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const reset = () => {
    setDraft(EMPTY_ASSET_ADVANCED_FILTERS);
    onChange(EMPTY_ASSET_ADVANCED_FILTERS);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <Filter className="size-4" />
          Filter by
          {count > 0 && (
            <Badge variant="secondary" className="ml-0.5 px-1.5 tabular">
              {count}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      {/* No corner close: the Paid by Cash toggle owns the top-right, and
          Escape, a click outside and Reset/Apply all leave the dialog. */}
      <DialogContent
        hideClose
        className="max-h-[90svh] gap-7 overflow-y-auto sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Filter assets</DialogTitle>
        <DialogDescription className="sr-only">
          Narrow the asset register by payment, match status, purchase date,
          value and category.
        </DialogDescription>

        <div className="flex items-center justify-between gap-4">
          <label htmlFor="asset-filter-cash" className={HEADING}>
            Paid by Cash
          </label>
          <Switch
            id="asset-filter-cash"
            checked={draft.paidWithCashOnly}
            onCheckedChange={(checked) => patch({ paidWithCashOnly: checked })}
          />
        </div>

        <section className="space-y-3">
          <h3 className={HEADING}>Match Status</h3>
          <RadioGroup
            value={draft.match}
            onValueChange={(next) => patch({ match: next as AssetMatchStatus })}
            className="grid-flow-col justify-start gap-6"
            aria-label="Match status"
          >
            {ASSET_MATCH_STATUSES.map((status) => (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-2 text-base"
              >
                <RadioGroupItem value={status} className="size-5" />
                {status}
              </label>
            ))}
          </RadioGroup>
        </section>

        <section className="space-y-3">
          <h3 className={HEADING}>Date Range</h3>
          <AssetsDateRange
            from={draft.dateFrom}
            to={draft.dateTo}
            onChange={({ from, to }) => patch({ dateFrom: from, dateTo: to })}
            label="Purchase date range"
          />
        </section>

        <section className="space-y-4">
          <h3 className={HEADING}>Asset Value ({activeCurrencySymbol()})</h3>
          <RangeSlider
            min={0}
            max={ceiling}
            step={step}
            value={[low, high]}
            onChange={([nextLow, nextHigh]) =>
              patch({
                minValue: nextLow <= 0 ? null : nextLow,
                maxValue: nextHigh >= ceiling ? null : nextHigh,
              })
            }
            lowLabel="Minimum asset value"
            highLabel="Maximum asset value"
          />
          <div className="grid grid-cols-2 gap-4">
            <ValueInput
              label="Minimum asset value"
              value={low}
              onChange={setMin}
            />
            <ValueInput
              label="Maximum asset value"
              value={high}
              onChange={setMax}
            />
          </div>
        </section>

        <Collapsible open={categoryOpen} onOpenChange={setCategoryOpen}>
          <div className="flex items-center justify-between">
            <h3 className={HEADING}>Category</h3>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-9 border-primary/60 text-primary"
                aria-label={
                  categoryOpen ? "Hide categories" : "Show categories"
                }
              >
                {categoryOpen ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="pt-3">
            {categoriesQuery.isLoading ? (
              <p className="py-3 text-sm text-muted-foreground">
                Loading categories…
              </p>
            ) : categoriesQuery.isError || categoryOptions.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Couldn&apos;t load the categories.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                <CategoryRow
                  label="Select All"
                  checked={allCategories}
                  onToggle={() =>
                    patch({
                      categories: allCategories
                        ? []
                        : categoryOptions.map((option) => option.id),
                    })
                  }
                />
                {categoryOptions.map((option) => (
                  <CategoryRow
                    key={option.id}
                    label={option.name}
                    checked={draft.categories.includes(option.id)}
                    onToggle={() => toggleCategory(option.id)}
                  />
                ))}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={reset}
            className="border-destructive/60 px-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Reset
          </Button>
          <Button onClick={apply} className="px-6">
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 py-3 text-base">
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          className="size-5"
        />
        {label}
      </label>
    </li>
  );
}

/**
 * A dollar amount, held as typed while it's being edited so "12." and an
 * emptied field don't snap back mid-keystroke, and committed as a number only
 * when it parses as one. Follows the slider whenever the figure changes from
 * outside.
 */
function ValueInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const show = (n: number) =>
    Number.isInteger(n) && n === 0 ? "0" : n.toFixed(2);
  const [text, setText] = React.useState(show(value));
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setText(show(value));
  }, [value, editing]);

  return (
    <Input
      value={text}
      inputMode="decimal"
      aria-label={label}
      className="h-12 rounded-lg border border-input bg-background px-4 text-base tabular"
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(event) => {
        const next = event.target.value;
        if (!/^\d*\.?\d{0,2}$/.test(next)) return;
        setText(next);
        const parsed = next === "" || next === "." ? 0 : Number(next);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
    />
  );
}
