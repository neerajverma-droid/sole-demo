"use client";

import * as React from "react";
import { Filter, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Field } from "@/components/documents/field";
import {
  EMPTY_PAYRUN_FILTERS,
  PAYRUN_DATE_RANGES,
  PAYRUN_PERIOD_FILTERS,
  PAYRUN_SORTS,
  activePayrunFilterCount,
  payrunYearOptions,
  type PayrunDateRange,
  type PayrunFilters,
  type PayrunPeriodFilter,
  type PayrunSort,
} from "@/lib/payroll-payruns";

/**
 * Period, date range, financial year and sort — sole-webapp's four selects,
 * folded into one popover so the search keeps the row.
 *
 * Edits stay in a draft until Apply, same as the invoice filters: the list's
 * query (and its shimmer) fires once, not once per select touched.
 */
export function PayrunsFiltersPopover({
  value,
  onChange,
}: {
  value: PayrunFilters;
  onChange: (next: PayrunFilters) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const count = activePayrunFilterCount(value);
  const draftCount = activePayrunFilterCount(draft);
  const years = React.useMemo(() => payrunYearOptions(), []);

  // Opening always starts from what's applied — a cancelled edit shouldn't
  // reappear next time.
  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const patch = (partial: Partial<PayrunFilters>) =>
    setDraft((current) => ({ ...current, ...partial }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="size-4" aria-hidden />
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
        className="w-[320px] space-y-4"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Filter pay runs</p>
          {draftCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDraft(EMPTY_PAYRUN_FILTERS)}
            >
              <X className="size-3.5" aria-hidden />
              Clear all
            </Button>
          )}
        </div>

        <Field label="Period">
          <Select
            value={draft.period}
            onValueChange={(next) => patch({ period: next as PayrunPeriodFilter })}
          >
            <SelectTrigger aria-label="Period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYRUN_PERIOD_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Date range">
          <Select
            value={draft.dateRange}
            onValueChange={(next) => patch({ dateRange: next as PayrunDateRange })}
          >
            <SelectTrigger aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYRUN_DATE_RANGES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Financial year">
          <Select value={draft.year} onValueChange={(next) => patch({ year: next })}>
            <SelectTrigger aria-label="Financial year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Sort by">
          <Select
            value={draft.sortBy}
            onValueChange={(next) => patch({ sortBy: next as PayrunSort })}
          >
            <SelectTrigger aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYRUN_SORTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

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
          <Button
            size="sm"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
