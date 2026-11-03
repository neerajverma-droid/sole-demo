"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A searchable, scrollable checklist of categories.
 *
 * The same picker pattern as the expense filter's sub-panel — a search box, a
 * Select all row pinned above the list, and the count alongside — pulled out
 * here because the budget form needs it on a page rather than inside a dialog.
 *
 * Select all follows the search, not the whole list: with a filter typed, it
 * ticks the matches and leaves everything else alone, which is what it looks
 * like it will do.
 */
export function CategoryChecklist({
  options,
  selected,
  onChange,
  placeholder = "Search categories",
  invalid,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Draws the error border, matching the platform's other invalid controls. */
  invalid?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const visible = options.filter((option) =>
    option.toLowerCase().includes(needle),
  );

  const allVisibleSelected =
    visible.length > 0 && visible.every((option) => selected.includes(option));

  const toggle = (option: string) =>
    onChange(
      selected.includes(option)
        ? selected.filter((entry) => entry !== option)
        : [...selected, option],
    );

  const toggleAllVisible = () =>
    onChange(
      allVisibleSelected
        ? selected.filter((entry) => !visible.includes(entry))
        : [...new Set([...selected, ...visible])],
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="pl-9"
          />
        </div>
        {selected.length > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular">
            {selected.length} selected
          </span>
        )}
      </div>

      <div
        className={cn(
          "max-h-72 overflow-y-auto rounded-md border border-border",
          invalid && "border-destructive",
        )}
      >
        {visible.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            No matches for &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <>
            <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-3 border-b border-border bg-card p-3 transition-colors hover:bg-primary/5">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={toggleAllVisible}
                aria-label="Select all"
              />
              <span className="text-sm font-medium">Select all</span>
            </label>
            <ul>
              {visible.map((option) => {
                const checked = selected.includes(option);
                return (
                  <li key={option}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-primary/5",
                        checked && "bg-primary/5",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(option)}
                      />
                      <span className="min-w-0 flex-1 text-sm">{option}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
