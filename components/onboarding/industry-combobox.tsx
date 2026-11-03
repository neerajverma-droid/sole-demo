"use client";

import * as React from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
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
import {
  CUSTOM_INDUSTRY_OPTION,
  ONBOARDING_INDUSTRIES,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * The industry picker — searchable, on the same Popover + Command pattern as the
 * client combobox, so the two behave identically.
 *
 * The list is every industry the platform knows rather than a shorter onboarding
 * subset: it's what Settings offers later, and a business that can't find itself
 * here would have to come back and change it.
 *
 * The last row is the way out for anyone the list still misses. It's a row in
 * the same list rather than a checkbox beside it, because "my industry isn't
 * listed" is a conclusion you reach by reading the list to the end.
 */
export function IndustryCombobox({
  value,
  onSelect,
  onCustom,
  invalid,
  id,
}: {
  /** A preset, something typed, or empty. */
  value: string;
  onSelect: (industry: string) => void;
  /** Chose the last row: the caller reveals its own text field. */
  onCustom: () => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={!!invalid}
          className={cn(
            "h-10 w-full justify-between px-3 font-normal",
            CONTROL_SURFACE_TRIGGER,
            !value && "text-muted-foreground",
            invalid && "border-destructive focus-visible:ring-destructive",
          )}
        >
          {value || "Select your industry"}
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search industries…" />
          <CommandList>
            <CommandEmpty>No industry matches that.</CommandEmpty>
            <CommandGroup>
              {ONBOARDING_INDUSTRIES.map((industry) => (
                <CommandItem
                  key={industry}
                  value={industry}
                  onSelect={() => {
                    onSelect(industry);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === industry ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  {industry}
                </CommandItem>
              ))}
            </CommandGroup>
            {/* Its own group, so the separator marks it as a different kind of
                answer rather than one more industry in the list. */}
            <CommandGroup className="border-t">
              <CommandItem
                value={CUSTOM_INDUSTRY_OPTION}
                onSelect={() => {
                  onCustom();
                  setOpen(false);
                }}
              >
                <Plus className="size-4" aria-hidden />
                {CUSTOM_INDUSTRY_OPTION}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
