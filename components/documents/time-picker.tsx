"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTE_STEP = 5;
const PERIODS = ["AM", "PM"] as const;

type Period = (typeof PERIODS)[number];

/** "HH:mm" (24-hour) into the picker's three parts; nothing for a blank value. */
function splitTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!match) return null;
  const hours24 = Number(match[1]);
  return {
    hour: hours24 % 12 === 0 ? 12 : hours24 % 12,
    minute: Number(match[2]),
    period: (hours24 < 12 ? "AM" : "PM") as Period,
  };
}

function joinTime(hour: number, minute: number, period: Period): string {
  const hours24 = (hour % 12) + (period === "PM" ? 12 : 0);
  return `${String(hours24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTimeLabel(value: string): string {
  const parts = splitTime(value);
  if (!parts) return "Select time";
  return `${parts.hour}:${String(parts.minute).padStart(2, "0")} ${parts.period}`;
}

function Column<T extends string | number>({
  label,
  options,
  selected,
  format,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  selected: T | undefined;
  format: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // Opens on the chosen value rather than the top of a long list.
  React.useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>("[data-selected=true]");
    active?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className="scrollbar-thin flex max-h-56 flex-col gap-0.5 overflow-y-auto p-1"
    >
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <button
            key={option}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-selected={isSelected}
            onClick={() => onSelect(option)}
            className={cn(
              "h-8 w-12 shrink-0 rounded-md text-sm tabular transition-colors hover:bg-accent",
              isSelected && "bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {format(option)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The time counterpart to DatePicker — the same outline trigger, opening a
 * popover of hour, minute and AM/PM columns instead of the browser's own
 * time input. Holds `HH:mm` in 24-hour time, as `<input type="time">` did.
 */
export function TimePicker({
  id,
  value,
  onChange,
  label = "Time",
  disabled,
  invalid,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const parts = splitTime(value);

  // Five-minute steps, plus the saved minute when it isn't on one, so an
  // existing 9:07 still shows as selected rather than silently rounding.
  const minutes = React.useMemo(() => {
    const steps = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
    if (parts && !steps.includes(parts.minute)) {
      return [...steps, parts.minute].sort((a, b) => a - b);
    }
    return steps;
  }, [parts]);

  // Picking any one part fills the rest in from what's there, or 9:00 AM.
  const update = (next: Partial<NonNullable<ReturnType<typeof splitTime>>>) => {
    const base = parts ?? { hour: 9, minute: 0, period: "AM" as Period };
    const merged = { ...base, ...next };
    onChange(joinTime(merged.hour, merged.minute, merged.period));
  };

  return (
    // Modal: inside a dialog, the dialog's scroll lock otherwise swallows wheel
    // and trackpad scrolling in the hour/minute columns (only dragging the
    // scrollbar worked). A modal popover takes the lock over while it's open.
    <Popover open={open} onOpenChange={setOpen} modal>
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
            !parts && "text-muted-foreground",
            invalid && "border-destructive",
            className,
          )}
        >
          <Clock className="size-4 text-muted-foreground" />
          {formatTimeLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex divide-x divide-border">
          <Column
            label="Hour"
            options={HOURS}
            selected={parts?.hour}
            format={(hour) => String(hour)}
            onSelect={(hour) => update({ hour })}
          />
          <Column
            label="Minute"
            options={minutes}
            selected={parts?.minute}
            format={(minute) => String(minute).padStart(2, "0")}
            onSelect={(minute) => update({ minute })}
          />
          <Column
            label="AM or PM"
            options={PERIODS}
            selected={parts?.period}
            format={(period) => period}
            onSelect={(period) => update({ period })}
          />
        </div>
        <div className="flex justify-end border-t border-border p-2">
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
