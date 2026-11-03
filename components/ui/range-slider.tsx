"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A two-thumb range, built from a pair of native range inputs laid over one
 * track — so keyboard, touch and screen-reader behaviour is the browser's own
 * and there's no slider dependency to carry.
 *
 * The inputs ignore the pointer except at their thumbs (`pointer-events-none`
 * on the input, `auto` on the thumb); without that the top input would cover
 * the whole track and the lower thumb could never be grabbed. The two can't
 * cross: moving either one clamps it to the other.
 */
export function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  lowLabel,
  highLabel,
  className,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  lowLabel: string;
  highLabel: string;
  className?: string;
}) {
  const span = Math.max(max - min, 1);
  const [low, high] = value;
  const lowPct = ((low - min) / span) * 100;
  const highPct = ((high - min) / span) * 100;

  const thumb = cn(
    "pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent outline-none",
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow",
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow",
    "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring",
    "focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-ring",
  );

  return (
    <div className={cn("relative h-5", className)}>
      <div className="absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
        style={{
          left: `calc(0.5rem + (100% - 1rem) * ${lowPct / 100})`,
          width: `calc((100% - 1rem) * ${(highPct - lowPct) / 100})`,
        }}
      />
      <input
        type="range"
        aria-label={lowLabel}
        min={min}
        max={max}
        step={step}
        value={low}
        onChange={(event) =>
          onChange([Math.min(Number(event.target.value), high), high])
        }
        className={thumb}
      />
      <input
        type="range"
        aria-label={highLabel}
        min={min}
        max={max}
        step={step}
        value={high}
        onChange={(event) =>
          onChange([low, Math.max(Number(event.target.value), low)])
        }
        className={thumb}
      />
    </div>
  );
}
