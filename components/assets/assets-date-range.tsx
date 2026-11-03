"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { useRangeClicks } from "@/components/documents/date-range-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateLabel, parseIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/**
 * One field for a from–to range of dates, the calendar opening beneath it.
 *
 * Values are ISO `YYYY-MM-DD` strings, empty for an open end, so they compare
 * and store the same as every other date in the filters. The popover stays open
 * until both ends are picked; picking the same day twice is a one-day range.
 */
export function AssetsDateRange({
  from,
  to,
  onChange,
  label,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  label: string;
}) {
  const [open, setOpen] = React.useState(false);
  const clicks = useRangeClicks(from, onChange);
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const selected: DateRange | undefined = start
    ? { from: start, to: end }
    : undefined;

  const text =
    !from && !to
      ? ""
      : `${from ? formatDateLabel(from) : "Any"} – ${to ? formatDateLabel(to) : "Any"}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) clicks.reset();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-muted/40 px-3 text-left text-sm tabular outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn("truncate", !text && "text-muted-foreground")}>
            {text || "Select a date range"}
          </span>
          <CalendarDays
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selected}
          defaultMonth={start}
          onSelect={(_range, day) => {
            if (clicks.click(day)) setOpen(false);
          }}
        />
        {(from || to) && (
          <div className="border-t p-2 text-right">
            <button
              type="button"
              onClick={() => {
                onChange({ from: "", to: "" });
                setOpen(false);
              }}
              className="rounded px-2 py-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Clear dates
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
