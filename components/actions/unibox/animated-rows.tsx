"use client";

import * as React from "react";

import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { mergeRows, type AnimatedRow as Row, type ShownRow } from "@/lib/animated-rows";
import { cn } from "@/lib/utils";

export type AnimatedRow = Row<React.ReactNode>;
type Shown = ShownRow<React.ReactNode>;

/** Kept in step with `duration-300` below. */
const EXIT_MS = 300;
/** A newcomer waits for the row it replaces to be mostly gone. */
const ENTER_DELAY_MS = 180;

/**
 * Rows that leave and arrive rather than blink.
 *
 * Keyed: a key that disappears stays mounted — drawing the last thing it
 * rendered — while it fades, slides right and folds its height away; a key
 * that appears unfolds and fades in, after the departure when there is one,
 * so the list reads as "that one's done, here's the next". Rows that stay are
 * drawn from the current props, so their buttons stay live.
 *
 * The height fold is a `grid-template-rows` transition from 1fr to 0fr, which
 * collapses to the row's real height without measuring it.
 */
export function AnimatedRows({ rows, className }: { rows: AnimatedRow[]; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const signature = rows.map((row) => row.key).join("\u0000");

  const [state, setState] = React.useState<{ signature: string; shown: Shown[] }>(() => ({
    signature,
    shown: rows.map((row) => ({ ...row, phase: "idle", settled: true })),
  }));

  // Reconciled during render, not in an effect, so a new row's first paint is
  // already its collapsed starting point — never a frame at full size.
  let shown = state.shown;
  if (state.signature !== signature) {
    shown = mergeRows(state.shown, rows, reduced);
    setState({ signature, shown });
  }

  const hasEnter = shown.some((row) => row.phase === "enter");
  const hasExit = shown.some((row) => row.phase === "exit");

  // One frame at the start state, then let the transition run to idle.
  React.useEffect(() => {
    if (!hasEnter) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        setState((current) => ({
          ...current,
          shown: current.shown.map((row) => (row.phase === "enter" ? { ...row, phase: "idle" } : row)),
        })),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [hasEnter]);

  // Unmount the departed once they've finished going.
  React.useEffect(() => {
    if (!hasExit) return;
    const timer = window.setTimeout(
      () =>
        setState((current) => ({
          ...current,
          shown: current.shown.filter((row) => row.phase !== "exit"),
        })),
      EXIT_MS + 20,
    );
    return () => window.clearTimeout(timer);
  }, [hasExit, signature]);

  const live = new Map(rows.map((row) => [row.key, row.node]));

  return (
    <ul className={className}>
      {shown.map((row, index) => (
        <li
          key={row.key}
          aria-hidden={row.phase === "exit" || undefined}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget || row.phase !== "idle" || row.settled) return;
            setState((current) => ({
              ...current,
              shown: current.shown.map((each) => (each.key === row.key ? { ...each, settled: true } : each)),
            }));
          }}
          style={row.phase !== "exit" && hasExit ? { transitionDelay: `${ENTER_DELAY_MS}ms` } : undefined}
          className={cn(
            // One column that may shrink below its content, so a long title
            // truncates instead of pushing the amount and buttons off the row.
            "grid grid-cols-[minmax(0,1fr)] border-border/70",
            index > 0 && "border-t",
            !reduced && "transition-[grid-template-rows,opacity,transform,border-color] duration-300 ease-out",
            row.phase === "idle" && "grid-rows-[1fr] opacity-100",
            row.phase === "enter" && "grid-rows-[0fr] -translate-y-1 opacity-0",
            row.phase === "exit" && "pointer-events-none grid-rows-[0fr] translate-x-6 border-transparent opacity-0",
          )}
        >
          <div className={cn("min-h-0 min-w-0", !(row.phase === "idle" && row.settled) && "overflow-hidden")}>
            {row.phase === "exit" ? row.node : (live.get(row.key) ?? row.node)}
          </div>
        </li>
      ))}
    </ul>
  );
}
