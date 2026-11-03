"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * What the tracker needs from a step.
 *
 * Two fields, so any step list can be passed in — the setup wizard's steps
 * carry a title, a subtitle and an icon as well, and none of that belongs to a
 * row of circles.
 */
export type StepTrackerStep = {
  id: string;
  label: string;
};

/**
 * Five circles and the lines between them.
 *
 * Three states rather than two, and the third is the point: green means
 * answered, indigo means you're on it, muted means it's ahead. A tracker that
 * only knew "current" and "not current" would make step five look identical to
 * step one on the way through.
 *
 * The connector is its own element between items so "filled to here" belongs to
 * the gap rather than to either circle beside it.
 *
 * Shared from here rather than living inside the setup wizard, because SolePay's
 * onboarding wants the same tracker over a different set of steps — and a second
 * copy is a second place for the three states to drift.
 */
export function StepTracker({
  steps,
  current,
  done,
  onJump,
  label = "Setup progress",
  allowJumpAhead = false,
}: {
  steps: readonly StepTrackerStep[];
  /** Index of the step being shown. */
  current: number;
  /** Ids of the steps that count as complete. */
  done: readonly string[];
  onJump?: (index: number) => void;
  label?: string;
  /**
   * Whether steps ahead of the current one can be jumped to.
   *
   * Off for a wizard, where the sequence is the design and everything behind
   * you is already reachable. On where the steps are pages in their own right
   * and the tracker is the way between them — you can't fill in a step you
   * can't get to.
   */
  allowJumpAhead?: boolean;
}) {
  return (
    <ol className="flex items-start" aria-label={label}>
      {steps.map((step, index) => {
        const complete = done.includes(step.id);
        const isCurrent = index === current;
        const jumpable =
          !!onJump && (allowJumpAhead ? !isCurrent : complete && !isCurrent);

        const circle = (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold",
              "motion-safe:transition-colors",
              complete
                ? "border-success bg-success text-success-foreground"
                : isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            {complete ? <Check className="size-4" aria-hidden /> : index + 1}
          </span>
        );

        return (
          <React.Fragment key={step.id}>
            {index > 0 && (
              <li
                aria-hidden
                className={cn(
                  "mt-4 h-0.5 min-w-3 flex-1 motion-safe:transition-colors",
                  done.includes(steps[index - 1].id)
                    ? "bg-success"
                    : "bg-border",
                )}
              />
            )}
            <li
              className="flex w-[4.5rem] flex-col items-center gap-2 sm:w-28"
              aria-current={isCurrent ? "step" : undefined}
            >
              {/* Answered steps are a click away again. Everything behind you is
                  already reachable, so this is a shortcut rather than a new way
                  to break the sequence. */}
              {jumpable ? (
                <button
                  type="button"
                  onClick={() => onJump?.(index)}
                  aria-label={
                    complete ? `Back to ${step.label}` : `Go to ${step.label}`
                  }
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {circle}
                </button>
              ) : (
                circle
              )}
              <span
                className={cn(
                  "text-center text-[12px] leading-tight",
                  complete || isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}
