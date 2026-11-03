"use client";

import * as React from "react";
import { X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/booking-links/booking-ui";
import {
  CUSTOM_PRESET,
  TIME_PRESETS,
  WEEK_DAYS,
  applyPreset,
  detectPreset,
  invalidAvailabilityDays,
  normalizeTime,
  sortAvailability,
  timeLabel,
  timeOptions,
  toggleAvailabilityDay,
  type AvailabilitySlot,
} from "@/lib/booking-links";
import { cn } from "@/lib/utils";

/** "8 hrs", "7.5 hrs" — how long a day's window is, at a glance. */
function windowHours(slot: AvailabilitySlot): string {
  const toMinutes = (time: string) => {
    const [h = "0", m = "0"] = normalizeTime(time).split(":");
    return Number(h) * 60 + Number(m);
  };
  let minutes = toMinutes(slot.end_time) - toMinutes(slot.start_time);
  if (slot.is_overnight && minutes <= 0) minutes += 24 * 60;
  if (minutes <= 0) return "";
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? "hr" : "hrs"}`;
}

function TimeSelect({
  value,
  onChange,
  label,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
}) {
  const normalized = normalizeTime(value);
  return (
    <Select value={normalized} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "h-8 w-[104px] gap-1 bg-background px-2.5 text-[13px] tabular-nums shadow-none",
          invalid && "border-destructive text-destructive",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {timeOptions(normalized).map((option) => (
          <SelectItem key={option} value={option} className="text-[13px]">
            {timeLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The days guests can book and each day's hours — the old
 * AvailabilityCustomizer, in the design's day pills and rows. Shared by the
 * settings and the link wizard's last step.
 */
export function AvailabilityEditor({
  value,
  onChange,
}: {
  value: AvailabilitySlot[];
  onChange: (value: AvailabilitySlot[]) => void;
}) {
  const [preset, setPreset] = React.useState(() => detectPreset(value));
  const invalid = invalidAvailabilityDays(value);
  const rows = sortAvailability(value);

  const setTime = (day: number, field: "start_time" | "end_time", time: string) => {
    setPreset(CUSTOM_PRESET);
    onChange(value.map((slot) => (slot.day_of_week === day ? { ...slot, [field]: time } : slot)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Available days">
        {WEEK_DAYS.map((day) => {
          const on = value.some((slot) => slot.day_of_week === day.id);
          return (
            <button
              key={day.id}
              type="button"
              aria-pressed={on}
              aria-label={day.name}
              onClick={() => onChange(toggleAvailabilityDay(value, day.id, preset))}
              className={cn(
                "grid size-8 place-items-center rounded-full text-[11px] font-semibold transition-colors",
                on
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {day.short}
            </button>
          );
        })}
      </div>

      <Field label="Time preset">
        <Select
          value={preset}
          onValueChange={(next) => {
            setPreset(next);
            if (next !== CUSTOM_PRESET) onChange(applyPreset(value, next));
          }}
        >
          <SelectTrigger className="bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_PRESETS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_PRESET}>Custom hours</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div>
        <p className="text-sm font-semibold">Selected days &amp; times</p>
        {rows.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-border p-5 text-center text-[13px] text-muted-foreground">
            No days selected — turn on a day above to set its hours.
          </div>
        ) : (
          <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {rows.map((slot) => {
              const day = WEEK_DAYS[slot.day_of_week];
              const bad = invalid.includes(slot.day_of_week);
              const hours = windowHours(slot);
              return (
                <div
                  key={slot.day_of_week}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/30",
                    bad && "bg-destructive/5 hover:bg-destructive/5",
                  )}
                >
                  {/* Day on the left; its hours and times grouped on the right. */}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    <span className="sm:hidden">{day?.short}</span>
                    <span className="hidden sm:inline">{day?.name}</span>
                  </span>
                  <span
                    className={cn(
                      "mr-1 hidden text-xs tabular-nums sm:inline",
                      bad ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {bad ? "Check times" : hours}
                  </span>
                  <TimeSelect
                    label={`${day?.name} from`}
                    value={slot.start_time}
                    invalid={bad}
                    onChange={(time) => setTime(slot.day_of_week, "start_time", time)}
                  />
                  <span className="text-muted-foreground" aria-hidden>
                    –
                  </span>
                  <TimeSelect
                    label={`${day?.name} to`}
                    value={slot.end_time}
                    invalid={bad}
                    onChange={(time) => setTime(slot.day_of_week, "end_time", time)}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${day?.name}`}
                    onClick={() =>
                      onChange(value.filter((item) => item.day_of_week !== slot.day_of_week))
                    }
                    className="ml-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {invalid.length > 0 && (
          <p className="mt-2 text-xs text-destructive">
            Each day&apos;s end time needs to be after its start time.
          </p>
        )}
      </div>
    </div>
  );
}
