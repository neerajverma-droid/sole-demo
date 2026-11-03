"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { ItemSuggestion } from "@/lib/invoice-item-search";
import { cn } from "@/lib/utils";

/** Long enough that a fast typist makes one request, not eight. */
const DEBOUNCE_MS = 200;

/**
 * The line-item description field, with a lookup attached.
 *
 * It stays a plain text input: what's typed goes straight onto the line, and
 * an invoice can be written without ever opening the dropdown. The suggestions
 * are an accelerator — picking one fills in the price, the unit and the GST
 * treatment the item is normally billed at, and on an NDIS claim the support
 * item number too, which is the one field nobody can reasonably type by hand.
 *
 * Focus deliberately stays in the input while the list is open, so typing to
 * narrow it never needs a second click.
 */
export function ItemLookupInput({
  value,
  onChange,
  onSelect,
  search,
  queryKey,
  emptyLabel = "No matching items — type the description yourself.",
  placeholder,
  label,
  inputRef,
  className,
  invalid,
}: {
  value: string;
  /** Free typing — the description as entered. */
  onChange: (value: string) => void;
  /** A suggestion was picked; the caller applies the whole row to the line. */
  onSelect: (suggestion: ItemSuggestion) => void;
  /** Looks a query up against whichever dictionary the caller means. */
  search: (query: string) => Promise<ItemSuggestion[]>;
  /** Distinguishes this lookup's cache from every other caller's. */
  queryKey: string;
  /** Shown once a search comes back with nothing. */
  emptyLabel?: string;
  placeholder: string;
  label: string;
  inputRef?: (node: HTMLElement | null) => void;
  className?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value);
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const suggestionsQuery = useQuery({
    queryKey: ["item-lookup", queryKey, debounced],
    queryFn: () => search(debounced),
    // Only asked for while the dropdown is actually showing, so a table of
    // twelve rows doesn't fire twelve requests on mount.
    enabled: open,
    // The dictionaries change rarely; the business's own products change on
    // their own screen, which invalidates nothing here.
    staleTime: 60_000,
    // A failed lookup is a silent non-event — the field still works as text.
    retry: false,
  });

  const suggestions = suggestionsQuery.data ?? [];
  const loading = suggestionsQuery.isFetching;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          className={cn(
            "h-9",
            invalid && "border-destructive focus-visible:ring-destructive",
            className,
          )}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={invalid}
          autoComplete="off"
        />
      </PopoverAnchor>

      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-72 p-0"
        // Keeps the caret in the field: the list is for reading, the input is
        // still what's being typed into.
        onOpenAutoFocus={(event) => event.preventDefault()}
        // Radix would otherwise steal focus back on close and re-fire onFocus,
        // reopening the popover the moment it's dismissed.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {loading && suggestions.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Searching
          </p>
        ) : suggestions.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {suggestions.map((suggestion) => (
              <li key={suggestion.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  // mousedown, not click: the input's blur would close the
                  // popover before a click ever lands.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(suggestion);
                    setQuery(suggestion.name);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                >
                  <span className="text-sm font-medium leading-snug">
                    {suggestion.name}
                  </span>
                  {suggestion.detail && (
                    <span className="text-xs text-muted-foreground">
                      {suggestion.detail}
                    </span>
                  )}
                  {/* The catalogue publishes price limits per region rather
                      than a price, so it's labelled as guidance. */}
                  {!suggestion.price && suggestion.priceHint && (
                    <span className="text-xs text-muted-foreground/80">
                      Price guide: {suggestion.priceHint}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
