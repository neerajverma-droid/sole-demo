"use client";

import { useAtom } from "jotai";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { areaLevelAtom } from "@/lib/atoms";
import { AREA_LEVELS, isAreaLevel } from "@/lib/customer-areas";
import { cn } from "@/lib/utils";

/**
 * How to group the areas — the same control in the card header and on the
 * insights page, reading and writing one stored value, so the two can't drift
 * out of step with each other.
 *
 * A select rather than a segmented control: three options at "Suburb/City"
 * length don't fit a segmented control on a card header without truncating, and
 * this sits beside a View all button that already carries the emphasis.
 */
export function AreaLevelSelect({ className }: { className?: string }) {
  const [level, setLevel] = useAtom(areaLevelAtom);

  return (
    <Select
      value={level}
      onValueChange={(next) => {
        if (isAreaLevel(next)) setLevel(next);
      }}
    >
      <SelectTrigger
        aria-label="Group areas by"
        className={cn("h-8 w-[9.5rem] text-xs", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AREA_LEVELS.map((entry) => (
          <SelectItem key={entry.key} value={entry.key} className="text-xs">
            {entry.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
