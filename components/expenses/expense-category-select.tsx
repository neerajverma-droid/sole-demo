"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Required } from "@/components/documents/field";
import type { ExpenseCategoryOption } from "@/lib/expenses";
import { cn } from "@/lib/utils";

/**
 * The expense form's own category picker — same searchable combobox as
 * `RuleCategorySelect`, over the (already Expense-only, already Super
 * Contribution-excluded) list `fetchExpenseCategories` returns. No parent
 * label needed here: unlike a matching rule, an expense only ever assigns
 * into this one branch of the chart of accounts.
 */
export function ExpenseCategorySelect({
  categories,
  loading,
  categoryId,
  onSelect,
  error,
}: {
  categories: ExpenseCategoryOption[];
  loading: boolean;
  categoryId: string;
  onSelect: (categoryId: string) => void;
  error?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const matches = categories.filter(
    (category) => !needle || category.name.toLowerCase().includes(needle),
  );

  const selected = categories.find((category) => category.id === categoryId);

  return (
    <div className="space-y-2">
      <Label className="block">
        Category
        <Required />
      </Label>

      {loading ? (
        <Skeleton className="h-10 w-full rounded-md" aria-hidden />
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-invalid={!!error}
              className={cn(
                "w-full justify-between font-normal",
                CONTROL_SURFACE_TRIGGER,
                !selected && "text-muted-foreground",
                error && "border-destructive focus-visible:ring-destructive",
              )}
            >
              <span className="truncate">
                {selected ? selected.name : "Choose a category"}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search categories"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {matches.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {categories.length === 0
                      ? "No categories found"
                      : "No matches found"}
                  </p>
                ) : (
                  <CommandGroup>
                    {matches.map((category) => (
                      <CommandItem
                        key={category.id}
                        value={category.id}
                        onSelect={() => {
                          onSelect(category.id);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {category.name}
                        </span>
                        {category.id === categoryId && (
                          <Check className="size-4 shrink-0" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
