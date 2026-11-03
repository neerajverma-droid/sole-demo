"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
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
import { fetchCompanyContacts } from "@/lib/company-contacts";
import {
  EXPENSE_FILTERS,
  fetchExpenseCategories,
  type ExpenseFilter,
} from "@/lib/expenses";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

/** The advanced filters as typed — numeric fields stay strings until applied. */
export type ExpenseFilterDraft = {
  status: ExpenseFilter;
  dateFrom: string;
  dateTo: string;
  minPrice: string;
  maxPrice: string;
  paidWithCashOnly: boolean;
  categories: string[];
  suppliers: string[];
};

export const EMPTY_EXPENSE_FILTERS: ExpenseFilterDraft = {
  status: "All",
  dateFrom: "",
  dateTo: "",
  minPrice: "",
  maxPrice: "",
  paidWithCashOnly: false,
  categories: [],
  suppliers: [],
};

/** How many of the filters are actually narrowing anything, for the badge. */
export function activeFilterCount(filters: ExpenseFilterDraft): number {
  let count = 0;
  if (filters.status !== "All") count += 1;
  if (filters.dateFrom || filters.dateTo) count += 1;
  if (filters.minPrice || filters.maxPrice) count += 1;
  if (filters.paidWithCashOnly) count += 1;
  if (filters.categories.length > 0) count += 1;
  if (filters.suppliers.length > 0) count += 1;
  return count;
}

/**
 * Match Status, Date Range, Price Range, Paid with cash, Category and
 * Supplier — sole-webapp's own expense `SmartFilter`, laid out exactly like
 * the invoice list's own advanced-filters popover (`InvoicesFiltersPopover`):
 * one popover rather than a full dialog, edits stay in a local draft until
 * Apply, and Cancel/an outside click/Escape all discard it.
 */
export function ExpensesFiltersPopover({
  value,
  onChange,
}: {
  value: ExpenseFilterDraft;
  onChange: (next: ExpenseFilterDraft) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [supplierOpen, setSupplierOpen] = React.useState(false);
  const [categoryQuery, setCategoryQuery] = React.useState("");
  const [supplierQuery, setSupplierQuery] = React.useState("");
  const count = activeFilterCount(value);
  const draftCount = activeFilterCount(draft);

  // Opening always starts from what's actually applied — an edit left over
  // from a cancelled session shouldn't reappear next time this opens.
  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // Both lists are their own real calls — categories from the same account
  // subcategories the expense form's own picker reads (not the static
  // handoff list this used to show, which never matched a real expense's
  // `category` field and made the filter look like it did nothing) —
  // fetched only once this popover is actually opened, not on every load.
  const categoriesQuery = useQuery({
    queryKey: ["expense-categories"],
    queryFn: fetchExpenseCategories,
    enabled: open,
  });
  const categoryNames = [
    ...new Set((categoriesQuery.data ?? []).map((c) => c.name)),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const suppliersQuery = useQuery({
    queryKey: ["expense-supplier-names"],
    queryFn: () => fetchCompanyContacts("Supplier"),
    enabled: open,
  });
  const supplierNames = [
    ...new Set((suppliersQuery.data ?? []).map((c) => c.clientName)),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const patch = (partial: Partial<ExpenseFilterDraft>) =>
    setDraft((current) => ({ ...current, ...partial }));

  const toggleCategory = (name: string) =>
    patch({
      categories: draft.categories.includes(name)
        ? draft.categories.filter((entry) => entry !== name)
        : [...draft.categories, name],
    });

  const toggleSupplier = (name: string) =>
    patch({
      suppliers: draft.suppliers.includes(name)
        ? draft.suppliers.filter((entry) => entry !== name)
        : [...draft.suppliers, name],
    });

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const cancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const matchingCategories = categoryNames.filter((category) =>
    category.toLowerCase().includes(categoryQuery.trim().toLowerCase()),
  );
  const matchingSuppliers = supplierNames.filter((name) =>
    name.toLowerCase().includes(supplierQuery.trim().toLowerCase()),
  );

  // "Select All" toggles every currently-matching (search-narrowed) name at
  // once — sole-webapp's own version has no search box to narrow against, so
  // its Select All always means the whole list; this is that same idea
  // applied to whatever's actually visible here.
  const allCategoriesSelected =
    matchingCategories.length > 0 &&
    matchingCategories.every((name) => draft.categories.includes(name));
  const allSuppliersSelected =
    matchingSuppliers.length > 0 &&
    matchingSuppliers.every((name) => draft.suppliers.includes(name));

  const toggleSelectAllCategories = () =>
    patch({
      categories: allCategoriesSelected
        ? draft.categories.filter((entry) => !matchingCategories.includes(entry))
        : [...new Set([...draft.categories, ...matchingCategories])],
    });

  const toggleSelectAllSuppliers = () =>
    patch({
      suppliers: allSuppliersSelected
        ? draft.suppliers.filter((entry) => !matchingSuppliers.includes(entry))
        : [...new Set([...draft.suppliers, ...matchingSuppliers])],
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
          <p className="text-sm font-medium">Filter expenses</p>
          {draftCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDraft(EMPTY_EXPENSE_FILTERS)}
            >
              <X className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>

        <Field label="Match status">
          <Select
            value={draft.status}
            onValueChange={(next) => patch({ status: next as ExpenseFilter })}
          >
            <SelectTrigger aria-label="Match status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_FILTERS.map((option) => (
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
              label="Date from"
            />
          </Field>
          <Field label="Date to">
            <DatePicker
              value={draft.dateTo}
              onChange={(iso) => patch({ dateTo: iso })}
              label="Date to"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price min">
            <AmountInput
              value={draft.minPrice}
              onChange={(next) => patch({ minPrice: next })}
              label="Minimum price"
            />
          </Field>
          <Field label="Price max">
            <AmountInput
              value={draft.maxPrice}
              onChange={(next) => patch({ maxPrice: next })}
              label="Maximum price"
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
                disabled={matchingCategories.length === 0}
              />
              Select all
            </label>
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {categoriesQuery.isLoading ? (
                <p className="p-2 text-xs text-muted-foreground">Loading…</p>
              ) : matchingCategories.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No matches</p>
              ) : (
                matchingCategories.map((category) => (
                  <label
                    key={category}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={draft.categories.includes(category)}
                      onCheckedChange={() => toggleCategory(category)}
                    />
                    <span className="truncate">{category}</span>
                  </label>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={supplierOpen} onOpenChange={setSupplierOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md py-1 text-sm font-medium"
            >
              <span className="flex items-center gap-1.5">
                Supplier
                {draft.suppliers.length > 0 && (
                  <Badge variant="secondary" className="px-1.5 tabular">
                    {draft.suppliers.length}
                  </Badge>
                )}
              </span>
              {supplierOpen ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <Input
              value={supplierQuery}
              onChange={(event) => setSupplierQuery(event.target.value)}
              placeholder="Search suppliers"
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent">
              <Checkbox
                checked={allSuppliersSelected}
                onCheckedChange={toggleSelectAllSuppliers}
                disabled={matchingSuppliers.length === 0}
              />
              Select all
            </label>
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {suppliersQuery.isLoading ? (
                <p className="p-2 text-xs text-muted-foreground">Loading…</p>
              ) : matchingSuppliers.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No matches</p>
              ) : (
                matchingSuppliers.map((name) => (
                  <label
                    key={name}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-sm p-1.5 text-sm hover:bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={draft.suppliers.includes(name)}
                      onCheckedChange={() => toggleSupplier(name)}
                    />
                    <span className="truncate">{name}</span>
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
          <Button size="sm" onClick={apply}>
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
