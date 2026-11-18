"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import type { IndustryOption } from "@/lib/industries";
import { cn } from "@/lib/utils";

/**
 * A searchable dropdown of the real industries list (GET /industry), picking
 * any number. Nothing picked means the add-on suits every industry, and the
 * trigger says so rather than reading as a field left empty.
 *
 * The picks show as chips under the trigger, each with its own remove, so
 * taking one off doesn't mean reopening the list to find it.
 */
export function IndustryMultiSelect({
  id,
  options,
  value,
  onChange,
  loading,
}: {
  id?: string;
  options: IndustryOption[];
  /** Industry ids, as strings. */
  value: string[];
  onChange: (value: string[]) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const matches = options.filter(
    (option) => !needle || option.name.toLowerCase().includes(needle),
  );
  const picked = value.map(
    (pickedId) =>
      options.find((option) => option.id === pickedId) ?? {
        id: pickedId,
        name: `Industry #${pickedId}`,
      },
  );

  const toggle = (optionId: string) =>
    onChange(
      value.includes(optionId)
        ? value.filter((entry) => entry !== optionId)
        : [...value, optionId],
    );

  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between px-3 font-normal",
              CONTROL_SURFACE_TRIGGER,
              value.length === 0 && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {loading
                ? "Loading industries…"
                : value.length === 0
                  ? "Every industry"
                  : `${value.length} ${value.length === 1 ? "industry" : "industries"} selected`}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[--radix-popover-trigger-width] min-w-64 p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search industries"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {matches.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {options.length === 0 ? "No industries to choose from" : "No matches found"}
                </p>
              ) : (
                <CommandGroup>
                  {matches.map((option) => {
                    const checked = value.includes(option.id);
                    return (
                      <CommandItem
                        key={option.id}
                        value={option.id}
                        onSelect={() => toggle(option.id)}
                        aria-selected={checked}
                      >
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded-[4px] border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                          aria-hidden
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {option.name}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((option) => (
            <Badge key={option.id} variant="secondary" className="gap-1 pr-1 font-medium">
              {option.name}
              <button
                type="button"
                onClick={() => toggle(option.id)}
                className="rounded-sm p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove ${option.name}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
