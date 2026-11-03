"use client";

import { Mascot } from "page-mascot";

import { cn } from "@/lib/utils";

/**
 * Pip, the ballerina who walks people through the things Sole needs from them —
 * the post-signup survey (`components/onboarding/survey/`) today, and
 * eventually the details an invoice can't go out without.
 *
 * Ported from `sole-webapp/components/Common/MascotGuide.js`. `page-mascot`
 * handles the character itself — it tracks the pointer and pulls a face when
 * it's poked, which is the whole reason the questions feel like a
 * conversation rather than a form. Everything here is the speech bubble next
 * to it, which swaps to a new line as the user moves through the steps.
 *
 * The line appears whole, same as source: it was typed out character by
 * character at first, but the popup advances the moment an answer is picked,
 * and an animation the user is waiting on is just a delay with better
 * manners.
 *
 * Colours are this app's own tokens (`primary`, matching
 * `question-step.tsx`'s selected-tile treatment) rather than source's
 * hard-coded indigo, so the bubble follows dark mode and any future retheme
 * for free.
 */
export function MascotGuide({
  line,
  className,
  mascotClassName,
}: {
  line: string;
  className?: string;
  mascotClassName?: string;
}) {
  return (
    <div className={cn("flex items-start gap-1", className)}>
      <Mascot
        directions="/mascots/ballerina-directions.webp"
        reactions="/mascots/ballerina-reactions.webp"
        size={104}
        label="Pip, the Sole guide"
        className={cn("-ml-2 shrink-0", mascotClassName)}
      />

      <div
        aria-live="polite"
        className="relative mt-4 flex-1 rounded-xl rounded-bl-sm border border-primary/20 bg-primary/[0.06] px-4 py-2.5 text-left dark:bg-primary/[0.12]"
      >
        {/* Tail, pointing back at Pip — a rotated bordered square,
            absolutely positioned, same technique as source. */}
        <span
          aria-hidden="true"
          className="absolute -left-[7px] bottom-3 h-3.5 w-3.5 rotate-45 border-b border-l border-primary/20 bg-primary/[0.06] dark:bg-primary/[0.12]"
        />
        <p className="relative m-0 text-sm leading-relaxed text-foreground/80">
          {line}
        </p>
      </div>
    </div>
  );
}
