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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BulkChoice } from "@/lib/bulk-import";
import { cn } from "@/lib/utils";

/**
 * A searchable dropdown for a Review cell that holds an id — the chart of
 * accounts, which is too long for a plain select to be usable.
 *
 * The trigger carries `data-bulk-field` and `aria-invalid` like the table's
 * other editors, so Review can focus it when its cell is the one at fault.
 */
export function BulkChoiceSelect({
  options,
  value,
  onChange,
  placeholder = "Select",
  invalid,
  attention,
  describedBy,
  label,
  field,
}: {
  options: readonly BulkChoice[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  /** Red placeholder text and nothing else — "pick one" without a red box. */
  attention?: boolean;
  describedBy?: string;
  /** The accessible name — "Category, row 3". */
  label: string;
  /** The field's label, for Review to find the control by. */
  field: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const matches = options.filter(
    (option) => !needle || option.label.toLowerCase().includes(needle),
  );
  const selected = options.find((option) => option.value === value);

  return (
    // Modal so the list scrolls inside a Dialog, whose own scroll lock
    // otherwise swallows the wheel over a popover portaled outside it.
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-label={label}
          data-bulk-field={field}
          className={cn(
            "h-8 w-full min-w-44 justify-between px-3 font-normal",
            CONTROL_SURFACE_TRIGGER,
            !selected &&
              (attention || invalid ? "text-destructive" : "text-muted-foreground"),
            invalid && "border-destructive focus-visible:ring-destructive",
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-56 p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {matches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {options.length === 0 ? "Nothing to choose from" : "No matches found"}
              </p>
            ) : (
              <CommandGroup>
                {matches.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {option.label}
                    </span>
                    {option.value === value && (
                      <Check className="size-4 shrink-0" aria-hidden />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
