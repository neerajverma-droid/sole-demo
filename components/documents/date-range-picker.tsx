"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateLabel, parseIsoDate, toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/**
 * One click on a range calendar. react-day-picker v9 treats a first click as a
 * complete one-day range, which would close the popover before the end could
 * be picked — so the ends are tracked here: the first click starts a new range
 * with an open end, the second finishes it (either order; the same day twice
 * is a one-day range). Returns whether the range is now complete.
 */
export function useRangeClicks(
  from: string,
  onChange: (range: { from: string; to: string }) => void,
) {
  const pickingEnd = React.useRef(false);
  return {
    reset: () => {
      pickingEnd.current = false;
    },
    click: (day: Date): boolean => {
      const iso = toIsoDate(day);
      if (!pickingEnd.current || !from) {
        pickingEnd.current = true;
        onChange({ from: iso, to: "" });
        return false;
      }
      pickingEnd.current = false;
      onChange(iso < from ? { from: iso, to: from } : { from, to: iso });
      return true;
    },
  };
}

/**
 * shadcn's date range picker — the one calendar in `range` mode under a
 * DatePicker-style trigger. Values are ISO `YYYY-MM-DD`, empty for an open
 * end, the same as DatePicker's. The popover closes once both ends are picked;
 * the same day twice is a one-day range.
 */
export function DateRangePicker({
  id,
  from,
  to,
  onChange,
  toDate,
  label = "Date range",
  placeholder = "Select a date range",
  className,
}: {
  id?: string;
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Blocks days after this — e.g. a filter over work that's already happened. */
  toDate?: Date;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const clicks = useRangeClicks(from, onChange);
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const selected: DateRange | undefined = start ? { from: start, to: end } : undefined;

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
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={label}
          className={cn(
            "w-full justify-start gap-2 font-normal tabular",
            CONTROL_SURFACE_TRIGGER,
            !text && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="truncate">{text || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selected}
          defaultMonth={start ?? toDate}
          disabled={toDate ? { after: toDate } : undefined}
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
