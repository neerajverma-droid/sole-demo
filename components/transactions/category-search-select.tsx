"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Sparkles } from "lucide-react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CategoryGroup } from "@/lib/manual-transaction";
import type { AiCategoryOption, AiSuggestions } from "@/lib/transactions";
import { cn } from "@/lib/utils";

/**
 * A searchable, grouped account picker for a table cell — the same compact
 * look as the client/supplier picker beside it, but pick-only: the chart of
 * accounts is fixed, so there's nothing to add from here.
 */
export function CategorySearchSelect({
  groups,
  loading,
  value,
  label,
  placeholder = "Select category",
  ariaLabel,
  className,
  ai,
  onSelect,
}: {
  groups: CategoryGroup[];
  loading: boolean;
  /** The selected account id, or "" for none. */
  value: string;
  /** What the trigger shows — the picked or suggested name. */
  label: string;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  /**
   * The model's picks for this row — sole-webapp's `AiCategorySelect`: a
   * confidence badge inside the field, the reason on hover, and an "AI Model
   * Suggestions" section above the full list.
   */
  ai?: AiSuggestions | null;
  onSelect: (account: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const matchesNeedle = (name: string) =>
    !needle || name.toLowerCase().includes(needle);

  const aiOptions: (AiCategoryOption & { top: boolean })[] = ai
    ? [
        { ...ai.primary, top: true },
        ...ai.alternatives.map((option) => ({ ...option, top: false })),
      ]
    : [];
  const confidenceById = new Map(
    aiOptions
      .filter((option) => option.confidence !== null)
      .map((option) => [option.id, option.confidence as number]),
  );
  const shownAi = aiOptions.filter((option) => matchesNeedle(option.name));
  const selectedConfidence = confidenceById.get(value) ?? null;
  const tooltip = ai?.reason
    ? label
      ? `${label} (Matched on: ${ai.reason})`
      : `Matched on: ${ai.reason}`
    : "";

  const pick = (option: { id: string; name: string }) => {
    onSelect({ id: option.id, name: option.name });
    setOpen(false);
    setQuery("");
  };
  const shown = groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => matchesNeedle(option.name)),
    }))
    .filter((group) => group.options.length > 0);

  return (
    <Popover
      // `modal`: inside a dialog, the dialog's scroll lock swallowed the
      // wheel over this portaled list. A modal popover takes its own lock,
      // which lets the list scroll — in a dialog or out of one.
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Tooltip open={open || !tooltip ? false : undefined}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label={ariaLabel}
              className={cn(
                "h-7 w-full justify-between gap-1 px-2 text-xs font-normal",
                CONTROL_SURFACE_TRIGGER,
                !label && "text-muted-foreground",
                className,
              )}
            >
              <span className="min-w-0 truncate">{label || placeholder}</span>
              <span className="flex shrink-0 items-center gap-1">
                {selectedConfidence !== null && (
                  <ConfidencePill value={selectedConfidence} />
                )}
                {loading ? (
                  <Loader2 className="size-3 animate-spin opacity-50" />
                ) : (
                  <ChevronDown className="size-3 opacity-50" />
                )}
              </span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {tooltip && (
          <TooltipContent side="top" className="max-w-80">
            {tooltip}
          </TooltipContent>
        )}
      </Tooltip>

      <PopoverContent
        // At least 340px, as sole-webapp's menu, for the confidence labels.
        className="w-[340px] max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search category..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading categories…
              </div>
            ) : shown.length === 0 && shownAi.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {groups.length === 0
                  ? "No categories found"
                  : "No matches found"}
              </p>
            ) : (
              <>
                {shownAi.length > 0 && (
                  <CommandGroup
                    className="[&_[cmdk-group-heading]]:bg-primary/[0.06] [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-primary"
                    heading={
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                        <Sparkles className="size-3.5" aria-hidden />
                        AI Model Suggestions
                      </span>
                    }
                  >
                    {shownAi.map((option) => {
                      const selected = option.id === value;
                      return (
                        <CommandItem
                          key={`ai-${option.id}`}
                          value={`ai-${option.id}`}
                          onSelect={() => pick(option)}
                          className={cn(
                            "gap-2",
                            selected && "bg-primary/10 data-[selected=true]:bg-primary/10",
                          )}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span
                              className={cn(
                                "truncate text-sm",
                                option.top && "font-semibold text-primary",
                              )}
                            >
                              {option.name}
                            </span>
                            {option.top && (
                              <span className="shrink-0 rounded bg-primary/10 px-1.5 text-xs font-medium leading-5 text-primary">
                                Top Match
                              </span>
                            )}
                          </span>
                          {option.confidence !== null && (
                            <ConfidencePill value={option.confidence} />
                          )}
                          {selected && (
                            <Check className="size-4 shrink-0 text-primary" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                {/*
                  One "All categories" section, as in sole-webapp, holding
                  this app's own lists — Income and its Capital account for
                  money in; Expenses, Assets and theirs for money out — with
                  each list's name as a small label inside it.
                */}
                {shown.length > 0 && (
                  <CommandGroup
                    className="[&_[cmdk-group-heading]]:bg-muted/60 [&_[cmdk-group-heading]]:py-2"
                    heading={
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        All Categories
                      </span>
                    }
                  >
                    {shown.map((group) => (
                      <React.Fragment key={group.label}>
                        {shown.length > 1 && (
                          <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
                            {group.label}
                          </p>
                        )}
                        {group.options.map((option) => (
                          <CommandItem
                            key={option.id}
                            value={option.id}
                            onSelect={() => pick(option)}
                          >
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {option.name}
                            </span>
                            {option.id === value && (
                              <Check className="size-4 shrink-0 text-primary" />
                            )}
                          </CommandItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** sole-webapp's confidence pill: bordered, primary-tinted, "98% confidence". */
function ConfidencePill({ value }: { value: number }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-md border border-primary/20 bg-primary/10 px-1.5 text-xs font-semibold leading-5 text-primary tabular">
      {value}% confidence
    </span>
  );
}
