"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
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
import { useCurrencyOptions } from "@/hooks/use-currency-options";
import { cn } from "@/lib/utils";

/**
 * A searchable currency dropdown, "New Zealand Dollar (NZD)", fed by the
 * exchange-rate table. Anyone can pick any currency; the caller decides which
 * one starts selected (usually the business's own, from the country context).
 */
export function CurrencySelect({
  value,
  onChange,
  disabled,
  id,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { options, loading } = useCurrencyOptions([value]);
  const selected = options.find((option) => option.code === value.toUpperCase());

  return (
    // modal: inside a drawer, the drawer's scroll lock otherwise swallows the
    // mouse wheel over this list (the phone picker does the same).
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {selected
              ? selected.label === selected.code
                ? selected.code
                : `${selected.label} (${selected.code})`
              : loading
                ? "Loading…"
                : "Select currency"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currency…" />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.code}
                  // cmdk filters on this string, so both the name and the code are searchable.
                  value={`${option.label} ${option.code}`}
                  onSelect={() => {
                    onChange(option.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", option.code === selected?.code ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  {option.label === option.code ? option.code : `${option.label} (${option.code})`}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
