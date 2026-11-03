"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The AI treatment's gradient and animation, and nothing else.
 *
 * Split out from the button so it can be worn by controls that aren't one — the
 * rules sync buttons take the look without the sparkle, the glow or the
 * suggestion dot, because they aren't reporting a suggestion. Colour and motion
 * only: no size, no radius, no layout, so whatever it's applied to keeps its
 * own shape.
 *
 * The gradient sits on an over-wide background and slides across it. `bg-primary`
 * from the Button variant stays underneath as the still frame: with the
 * animation off, position 0% renders the indigo end of the ramp, so a
 * reduced-motion control is simply an indigo one.
 *
 * `hover:` rather than `group-hover:`. The button below wraps itself in a group
 * for the glow, but a standalone control has no group to hover — and a
 * brightness that only responded inside a wrapper would be a hover state that
 * silently did nothing on three quarters of its uses.
 */
export const aiGradientClassName = cn(
  "bg-[linear-gradient(110deg,hsl(var(--primary)),#8B7CFF,hsl(var(--primary)))]",
  "bg-[length:200%_100%] text-primary-foreground",
  "transition-[filter] motion-safe:animate-ai-shift",
  "hover:brightness-110 motion-safe:hover:[animation-duration:1.6s]",
);

/**
 * The button that offers a match the feed has already worked out.
 *
 * Shared from here rather than reproduced per table: invoices, equity,
 * liabilities, expenses, super and assets all ask the same question in the same
 * column, and six copies of a four-layer effect is six places for it to drift.
 *
 * The label is a prop because the tables don't agree on the word — some say
 * "AI Match" and some say "Match" — and that's a copy decision each list owns,
 * not something to standardise by force.
 */
export function AiMatchButton({
  suggestions,
  onOpen,
  label = "AI Match",
}: {
  /**
   * How many the feed has suggested. Drives the dot and the spoken count only —
   * the button is offered either way, because searching for the match yourself
   * is the other half of what it opens.
   */
  suggestions: number;
  onOpen: () => void;
  label?: string;
}) {
  return (
    <span className="group relative inline-flex">
      {/*
        The glow, behind the button rather than on it: a blurred tint that
        breathes on opacity and scale, so nothing about the button's own box
        moves and the row can't reflow around it. Under reduced motion the
        animation drops and this stays at its base opacity — a fixed halo,
        which is what the effect is for.
      */}
      <span
        className="pointer-events-none absolute -inset-1 rounded-lg bg-primary/40 opacity-60 blur-md transition-colors motion-safe:animate-ai-glow group-hover:bg-primary/60"
        aria-hidden
      />
      <Button
        size="sm"
        onClick={onOpen}
        className={cn("relative", aiGradientClassName)}
      >
        <Sparkles className="motion-safe:animate-ai-twinkle motion-safe:group-hover:animate-ai-turn" />
        {label}
      </Button>

      {/*
        Ringed in the row's own background so it reads as sitting on top of the
        button rather than inside it, the way an unread dot does. The count is
        in the dialog; out here it only has to say "there's something" — so
        there's nothing to show when there isn't.
      */}
      {suggestions > 0 && (
        <>
          <span
            className="absolute -right-1 -top-1 z-10 size-2.5 rounded-full bg-success ring-2 ring-card"
            aria-hidden
          />
          <span className="sr-only">
            {suggestions === 1
              ? "1 suggested transaction"
              : `${suggestions} suggested transactions`}
          </span>
        </>
      )}
    </span>
  );
}
