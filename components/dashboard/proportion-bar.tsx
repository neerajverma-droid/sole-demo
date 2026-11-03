"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ProportionSegment = {
  key: string;
  label: string;
  /** Width as a percentage; segments should sum to 100. */
  percent: number;
  valueLabel: string;
  /** Fill colour for the segment. */
  className: string;
};

/**
 * Stacked proportion bar. Hovering or focusing a segment lifts it and dims
 * its siblings; `hovered` is lifted to the parent so legend rows and segments
 * can highlight each other.
 */
export function ProportionBar({
  segments,
  label,
  hovered,
  onHoverChange,
  empty = false,
}: {
  segments: ProportionSegment[];
  label: string;
  hovered: string | null;
  onHoverChange: (key: string | null) => void;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <div className="flex h-2" role="img" aria-label={`${label}: no data yet`}>
        <span className="h-full w-full rounded-full bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex h-2 gap-0.5" role="group" aria-label={label}>
      {segments.map((segment) => (
        <Tooltip key={segment.key}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={`${segment.label}, ${segment.valueLabel}, ${segment.percent}% of total`}
              style={{ width: `${segment.percent}%` }}
              onMouseEnter={() => onHoverChange(segment.key)}
              onMouseLeave={() => onHoverChange(null)}
              onFocus={() => onHoverChange(segment.key)}
              onBlur={() => onHoverChange(null)}
              className={cn(
                "h-full cursor-default rounded-sm outline-none transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                segment.className,
                hovered && hovered !== segment.key
                  ? "opacity-50"
                  : "opacity-100",
                hovered === segment.key && "brightness-110",
              )}
            />
          </TooltipTrigger>
          <TooltipContent>
            {segment.label} · {segment.valueLabel} · {segment.percent}%
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** Dim/lift treatment for rows that pair with a bar segment. */
export function segmentHighlight(
  hovered: string | null,
  key: string,
): string {
  return cn(
    "transition-opacity duration-150",
    hovered && hovered !== key ? "opacity-50" : "opacity-100",
  );
}
