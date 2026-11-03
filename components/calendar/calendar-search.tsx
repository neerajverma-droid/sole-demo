"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { useCalendarSearchQuery } from "@/hooks/use-calendar-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-error";
import {
  eventTitleText,
  formatSearchGroupHeading,
  formatSearchTimeLabel,
  groupSearchResults,
  normalizeSearchResults,
  type CalendarEvent,
  type CalendarFilters,
  type CalendarView,
} from "@/lib/calendar";

/**
 * Searches the visible range (with the active filters) as you type, and opens
 * the picked event's details. Debounced the old calendar's 250ms.
 */
export function CalendarSearch({
  selectedDate,
  view,
  filters,
  fallbackUserName,
  onPick,
}: {
  selectedDate: Date;
  view: CalendarView;
  filters: CalendarFilters;
  fallbackUserName: string;
  onPick: (event: CalendarEvent) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, 250);
  const searchQuery = useCalendarSearchQuery(selectedDate, view, filters, debounced, open);

  React.useEffect(() => {
    if (searchQuery.error) {
      toast.error(apiErrorMessage(searchQuery.error, "Couldn't search your calendar."));
    }
  }, [searchQuery.error]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const results = React.useMemo(
    () => normalizeSearchResults(searchQuery.data ?? [], fallbackUserName),
    [searchQuery.data, fallbackUserName],
  );
  const groups = React.useMemo(() => groupSearchResults(results), [results]);
  const loading = trimmed !== debounced || searchQuery.isFetching;

  return (
    <div ref={containerRef} className="relative w-full sm:w-[260px]" data-usertour="scheduling-calendar-search">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        autoComplete="off"
        placeholder="Search events"
        aria-label="Search events"
        className="pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}

      {trimmed && open && (
        <div className="absolute right-0 top-full z-40 mt-2 max-h-[calc(100vh-220px)] w-[360px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No results</p>
          ) : (
            groups.map((group) => (
              <div key={group.date.toISOString()} className="py-1">
                <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
                  {formatSearchGroupHeading(group.date)}
                </p>
                {group.events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onPick(event);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full bg-primary"
                      style={
                        event.border_color && event.border_color.toUpperCase() !== "#1D4ED8"
                          ? { backgroundColor: event.border_color }
                          : undefined
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {eventTitleText(event) || "Untitled event"}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatSearchTimeLabel(event)}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
