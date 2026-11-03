/**
 * The table treatment every Reporting suite report shares.
 *
 * Extracted from the P&L table when the Transaction Listing needed the same
 * sticky, tinted, ruled grid. Class strings rather than a component, because the
 * two tables have entirely different column structures and only their surfaces
 * are the same thing.
 */

import { cn } from "@/lib/utils";

/**
 * The column header's tint, at the same values `TableHeader` puts on the
 * `thead` — this is the shared table treatment, not a second one.
 *
 * Opaque, which the plain alpha version isn't. A sticky or pinned cell is lifted
 * out of its row's paint, so the row's white scrolls away beneath it and 6%
 * indigo over nothing lets the rows read straight through. A background colour
 * plus a flat gradient of the tint composites the same value into one opaque
 * paint, and stays on the token either way.
 */
export const HEAD_TINT = cn(
  "bg-card bg-[linear-gradient(hsl(var(--primary)/0.06),hsl(var(--primary)/0.06))]",
  "dark:bg-[linear-gradient(hsl(var(--primary)/0.10),hsl(var(--primary)/0.10))]",
);

/** The #F0F0FF wash on a key result or a headline total. Opaque, as above. */
export const RESULT_TINT = cn(
  "bg-card bg-[linear-gradient(hsl(var(--primary)/0.08),hsl(var(--primary)/0.08))]",
  "dark:bg-[linear-gradient(hsl(var(--primary)/0.14),hsl(var(--primary)/0.14))]",
);

/** 12px of air above and below, which is what makes a long ladder readable. */
export const CELL = "px-4 py-3 align-middle";

/** The column rule, light enough to guide the eye down rather than wall it off. */
export const RULE = "border-l border-border/70";

/** The rule that closes a total off from the rows above it. */
export const TOTAL_RULE = "border-l border-border";

/** What a row's cells are painted with. Opaque throughout, for pinned columns. */
export const ROW_TONE = {
  item: "bg-card",
  subtotal: "bg-muted",
  result: RESULT_TINT,
} as const;

export type RowTone = keyof typeof ROW_TONE;
