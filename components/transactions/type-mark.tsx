"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import type { Transaction } from "@/lib/transactions";
import { cn } from "@/lib/utils";

/**
 * A row's direction as plain text, not a pill — green ↙ CR for money in,
 * red ↗ DR for money out, grey on a personal or transfer mark (the money
 * moved, but it isn't the business's). Short on screen, as on a statement;
 * the full word for screen readers and on hover.
 */
export function TypeMark({ row }: { row: Transaction }) {
  const credit = row.type === "Credit";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-semibold",
        directionTone(row),
      )}
      title={row.type}
    >
      {credit ? (
        <ArrowDownLeft className="size-3.5" aria-hidden />
      ) : (
        <ArrowUpRight className="size-3.5" aria-hidden />
      )}
      <span aria-hidden>{credit ? "CR" : "DR"}</span>
      <span className="sr-only">{row.type}</span>
    </span>
  );
}

/**
 * The colour a row's direction is drawn in — green for money in, red for
 * money out, muted on a personal or transfer mark. Shared by the type marker
 * and the amount, so the two always agree.
 */
export function directionTone(row: Transaction): string {
  if (row.personal || row.transfer) return "text-muted-foreground";
  return row.type === "Credit" ? "text-success" : "text-destructive";
}
