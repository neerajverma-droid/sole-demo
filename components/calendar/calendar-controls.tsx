"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  BadgeDollarSign,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Info,
  LayoutGrid,
  List,
  ListFilter,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GoogleMark, SoleMark } from "@/components/calendar/event-chip";
import {
  EMPTY_FILTERS,
  navigateDate,
  rangeText,
  type CalendarFilters,
  type CalendarView,
  type LinkedCalendar,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS: { view: CalendarView; label: string; icon: LucideIcon }[] = [
  { view: "day", label: "Day", icon: List },
  { view: "week", label: "Week", icon: Columns3 },
  { view: "month", label: "Month", icon: Square },
  { view: "year", label: "Year", icon: LayoutGrid },
];

function Legend() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Legend"
          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="space-y-2 p-3">
        <p className="font-semibold">Legend</p>
        <p className="flex items-center gap-2">
          <BadgeDollarSign className="size-4" /> Billable task
        </p>
        <p className="flex items-center gap-2">
          <GoogleMark /> Google Calendar task
        </p>
        <p className="flex items-center gap-2">
          <SoleMark className="rounded bg-white p-px" /> Sole task, not linked to Google
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function calendarLabel(calendar: LinkedCalendar) {
  return calendar.calendar_id || "Primary";
}

/**
 * Billable-only and which linked calendars to show — the two filters the
 * `/calendar` endpoint understands. Applied together on Apply, as before.
 */
function FilterPopover({
  calendars,
  loadingCalendars,
  filters,
  onApply,
}: {
  calendars: LinkedCalendar[];
  loadingCalendars: boolean;
  filters: CalendarFilters;
  onApply: (filters: CalendarFilters) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<CalendarFilters>(filters);

  React.useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const allIds = calendars.map((calendar) => String(calendar.id));
  const allSelected = allIds.length > 0 && draft.calendar_ids.length === allIds.length;
  const activeCount = filters.calendar_ids.length + (filters.billable ? 1 : 0);

  const toggleCalendar = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      calendar_ids: prev.calendar_ids.includes(id)
        ? prev.calendar_ids.filter((item) => item !== id)
        : [...prev.calendar_ids, id],
    }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <ListFilter />
          Filter
          {activeCount > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-3">
        <div className="pb-2">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Billing</p>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            <Checkbox
              checked={draft.billable}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, billable: checked === true }))}
            />
            Billable only
          </label>
        </div>

        <div className="border-t border-border py-2">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Calendars</p>
          {loadingCalendars ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Loading calendars…</p>
          ) : calendars.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No linked calendars found</p>
          ) : (
            <div className="flex max-h-[240px] flex-col gap-px overflow-y-auto">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() =>
                    setDraft((prev) => ({ ...prev, calendar_ids: allSelected ? [] : allIds }))
                  }
                />
                Select all ({calendars.length})
              </label>
              {calendars.map((calendar) => {
                const id = String(calendar.id);
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={draft.calendar_ids.includes(id)}
                      onCheckedChange={() => toggleCalendar(id)}
                    />
                    <span
                      className="size-2.5 shrink-0 rounded-full bg-primary"
                      // The colour its events are outlined in, so a tick here matches the grid.
                      style={
                        calendar.border_color || calendar.color
                          ? { backgroundColor: calendar.border_color || calendar.color }
                          : undefined
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {calendarLabel(calendar)}
                      {calendar.email ? (
                        <span className="ml-1 text-xs text-muted-foreground">({calendar.email})</span>
                      ) : null}
                    </span>
                    {calendar.provider === "google" && <GoogleMark className="size-3.5 shrink-0" />}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              onApply(EMPTY_FILTERS);
              setOpen(false);
            }}
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The active filters as removable chips under the controls, as the design shows them. */
export function FilterChips({
  filters,
  calendars,
  onApply,
}: {
  filters: CalendarFilters;
  calendars: LinkedCalendar[];
  onApply: (filters: CalendarFilters) => void;
}) {
  if (!filters.billable && filters.calendar_ids.length === 0) return null;

  const chip = (key: string, label: string, onRemove: () => void) => (
    <span
      key={key}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.08] py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
    >
      {label}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="grid size-4 place-items-center rounded-full hover:bg-primary/15"
      >
        <X className="size-3" />
      </button>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.billable &&
        chip("billable", "Billable", () => onApply({ ...filters, billable: false }))}
      {filters.calendar_ids.map((id) => {
        const calendar = calendars.find((item) => String(item.id) === id);
        return chip(id, calendar ? calendarLabel(calendar) : "Calendar", () =>
          onApply({ ...filters, calendar_ids: filters.calendar_ids.filter((item) => item !== id) }),
        );
      })}
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onApply(EMPTY_FILTERS)}>
        Clear all
      </Button>
    </div>
  );
}

export function CalendarControls({
  selectedDate,
  onSelectedDateChange,
  view,
  onViewChange,
  eventCount,
  calendars,
  loadingCalendars,
  filters,
  onApplyFilters,
  onOpenCalendars,
}: {
  selectedDate: Date;
  onSelectedDateChange: (date: Date) => void;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  eventCount: number;
  calendars: LinkedCalendar[];
  loadingCalendars: boolean;
  filters: CalendarFilters;
  onApplyFilters: (filters: CalendarFilters) => void;
  onOpenCalendars: () => void;
}) {
  const today = new Date();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3" data-usertour="scheduling-calendar-date-nav">
        <button
          type="button"
          onClick={() => onSelectedDateChange(new Date())}
          aria-label="Go to today"
          className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card text-center shadow-sm transition-colors hover:bg-accent"
        >
          <span className="-mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {format(today, "MMM")}
          </span>
          <span className="text-lg font-semibold leading-none">{today.getDate()}</span>
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{format(selectedDate, "MMMM yyyy")}</h2>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
              {eventCount} {eventCount === 1 ? "event" : "events"}
            </span>
            <Legend />
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Previous ${view}`}
              onClick={() => onSelectedDateChange(navigateDate(selectedDate, view, "previous"))}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {rangeText(view, selectedDate)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Next ${view}`}
              onClick={() => onSelectedDateChange(navigateDate(selectedDate, view, "next"))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => onSelectedDateChange(new Date())}>
          Today
        </Button>
        <div
          role="group"
          aria-label="View"
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background p-0.5 shadow-sm"
          data-usertour="scheduling-calendar-views"
        >
          {VIEW_OPTIONS.map(({ view: option, label, icon: Icon }) => (
            <Tooltip key={option}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${label} view`}
                  aria-pressed={view === option}
                  onClick={() => onViewChange(option)}
                  className={cn(
                    "grid size-8 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted",
                    view === option && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{label} view</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={onOpenCalendars}
          disabled={loadingCalendars}
          data-usertour="scheduling-calendar-calendars"
        >
          <CalendarDays />
          Calendars
        </Button>
        <FilterPopover
          calendars={calendars}
          loadingCalendars={loadingCalendars}
          filters={filters}
          onApply={onApplyFilters}
        />
      </div>
    </div>
  );
}
