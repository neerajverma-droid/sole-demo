"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

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

/** Replaces the native date input, per the design's calendar popover. */
export function DatePicker({
  id,
  value,
  onChange,
  fromDate,
  toDate,
  label,
  disabled,
  invalid,
  className,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  /** Blocks dates before this — e.g. an expiry can't precede the issue date. */
  fromDate?: Date;
  /** Blocks dates after this — e.g. a transaction can't be in the future. */
  toDate?: Date;
  label?: string;
  disabled?: boolean;
  /** Shows the field's error state, for a form that flags it inline. */
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseIsoDate(value);
  const blocked = [
    ...(fromDate ? [{ before: fromDate }] : []),
    ...(toDate ? [{ after: toDate }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={label}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "w-full justify-start gap-2 font-normal tabular",
            CONTROL_SURFACE_TRIGGER,
            !value && "text-muted-foreground",
            invalid && "border-destructive",
            className,
          )}
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          {formatDateLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          // The dropdowns only offer years inside the allowed range.
          startMonth={fromDate}
          endMonth={toDate}
          selected={selected}
          defaultMonth={selected ?? toDate}
          disabled={blocked.length > 0 ? blocked : undefined}
          onSelect={(date) => {
            if (date) onChange(toIsoDate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
