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
import type { RuleCategoryOption } from "@/lib/rules";
import { cn } from "@/lib/utils";

/**
 * The rule form's account category picker — searchable, same as
 * sole-webapp's own category Listbox (it filters a flat list by a typed
 * term rather than grouping it under headers).
 */
export function RuleCategorySelect({
  categories,
  loading,
  categoryId,
  onSelect,
  error,
  register,
  label = "Account category",
  placeholder = "Select a category",
  searchPlaceholder = "Search categories",
  showParent = true,
}: {
  categories: RuleCategoryOption[];
  loading: boolean;
  categoryId: string;
  onSelect: (categoryId: string) => void;
  error?: string;
  register?: (node: HTMLElement | null) => void;
  /** Defaults are the rule form's own wording. */
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Appends "· Parent" to each name; off where the list is one parent already. */
  showParent?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const matches = categories.filter(
    (category) => !needle || category.name.toLowerCase().includes(needle),
  );

  const selected = categories.find((category) => category.id === categoryId);
  const triggerLabel = selected
    ? showParent
      ? `${selected.name} · ${selected.parentName}`
      : selected.name
    : placeholder;

  return (
    <div className="space-y-2">
      <Label className="block">
        {label}
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
              ref={register}
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
              <span className="truncate">{triggerLabel}</span>
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={searchPlaceholder}
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
                          {showParent && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {category.parentName}
                            </span>
                          )}
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
