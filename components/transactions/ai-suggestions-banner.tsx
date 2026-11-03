"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ReviewSuggestionsDialog } from "@/components/transactions/review-suggestions-dialog";
import { useSuggestionsCount } from "@/hooks/use-bank-transactions-query";
import { cn } from "@/lib/utils";

/**
 * The attribute the table stamps on rows awaiting a decision.
 *
 * A data attribute rather than an id or a ref, so the table and anything above
 * it can find those rows without threading a ref up through the screen.
 * Exported so the two can't disagree about the selector.
 *
 * Nothing scrolls to it now that the banner opens the review dialog instead —
 * it stays because it's what marks a pending row in the DOM, which is worth
 * having whether or not something is currently reading it.
 */
export const SUGGESTION_ROW_ATTR = "data-suggested";

/**
 * The banner over the transactions list, when the matcher has something to say.
 *
 * Conditional on there being work: nothing renders at zero rather than a banner
 * reading "0 suggestions", because a banner announcing nothing is a banner
 * people learn to look past. Approving the last one takes the count to zero and
 * the banner goes with it — nothing to dismiss, because it was never news once
 * it was empty.
 *
 * The whole thing is one button. A banner with a single action and a click
 * target the size of a paragraph shouldn't make anyone aim for the button, and
 * making the container the control is how that works without nesting one
 * button inside another.
 *
 * It owns the review dialog as well as announcing it. The two are one feature —
 * the count is the dialog's row count — and keeping them in one component is
 * what guarantees they agree: the same array is counted here and handed down
 * there, so there is no second query to drift.
 */
/**
 * The review's way in. The count is every unmatched line waiting — money in
 * and out — from the server, as sole-webapp counts it, not just the rows on
 * the current page.
 */
export function AiSuggestionsBanner() {
  const [open, setOpen] = React.useState(false);
  const countQuery = useSuggestionsCount();
  const count = countQuery.data ?? 0;

  /*
   * Approving or rejecting the last one closes the dialog — in an effect, so
   * every way of reaching zero closes it.
   */
  React.useEffect(() => {
    if (countQuery.isSuccess && count === 0) setOpen(false);
  }, [count, countQuery.isSuccess]);

  /*
   * The dialog stays mounted at zero even though the banner doesn't.
   *
   * Unmounting both together would tear the dialog off the screen mid-animation
   * the instant Approve All lands, which reads as a crash rather than a
   * completed job. The banner is what disappears; the dialog closes.
   */
  return (
    <>
      {count > 0 && <Banner count={count} onReview={() => setOpen(true)} />}
      <ReviewSuggestionsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** The banner itself, once there's something to announce. */
function Banner({
  count,
  onReview,
}: {
  count: number;
  onReview: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onReview}
      aria-label={`Review ${count} ${count === 1 ? "suggestion" : "suggestions"}`}
      className={cn(
        "group/banner flex w-full flex-wrap items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-left outline-none",
        // Top-left to bottom-right: the brand indigo easing into the violet
        // beside it, both faint enough to read as a tint rather than a colour.
        "bg-gradient-to-br from-primary/[0.08] via-primary/[0.06] to-violet-500/[0.05]",
        // A defined edge without an outline — the indigo identity at a
        // fifteenth of its strength.
        "border border-primary/15",
        "focus-visible:ring-2 focus-visible:ring-ring",
        // The lift is the only thing hover moves. `motion-safe` gates it, so a
        // reader who has asked for less motion gets the shadow and nothing that
        // shifts under the pointer.
        "motion-safe:transition-all motion-safe:duration-200",
        "hover:border-primary/25 hover:shadow-lg hover:shadow-primary/10",
        "motion-safe:hover:-translate-y-px",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {/*
          The tile's depth is a radial gradient rather than a flat tint —
          brighter at the middle, falling off to the edge, so the sparkle sits
          in light rather than on a square.
        */}
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            "bg-[radial-gradient(circle_at_35%_30%,hsl(var(--primary)/0.28),hsl(var(--primary)/0.10))]",
            "text-primary",
          )}
          aria-hidden
        >
          <Sparkles className="size-4 motion-safe:animate-ai-pulse" />
        </span>

        <span className="min-w-0">
          {/* indigo-900 in light, where it clears AA on this wash; the
              primary-heading token in dark, which is what that token is for. */}
          <span className="block text-sm font-semibold leading-tight text-indigo-900 dark:text-primary-heading">
            Sole AI has suggestions for you
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              We found {count} sub-category{" "}
              {count === 1 ? "suggestion" : "suggestions"} across your
              transactions
            </span>
            <Badge
              variant="outline"
              className="shrink-0 whitespace-nowrap rounded-full border-transparent bg-primary/10 px-1.5 py-0 text-[11px] font-semibold text-primary tabular"
            >
              {count} {count === 1 ? "suggestion" : "suggestions"}
            </Badge>
          </span>
        </span>
      </span>

      {/*
        A span, not a Button: the banner itself is the button, and one inside
        another is invalid markup the browser reparses. It takes the primary
        Button's classes so it's the same control to look at, and `pointer-events-none`
        so every click — including the ones that land on it — is the banner's.
      */}
      <span
        className={cn(
          "pointer-events-none inline-flex h-7 shrink-0 items-center justify-center gap-2 rounded-md px-3",
          "bg-primary text-xs font-medium text-primary-foreground",
          // The glow, and a little more of it on hover. Both gated: an
          // intensifying shadow is motion too.
          "shadow-[0_0_12px_hsl(var(--primary)/0.35)]",
          "motion-safe:transition-shadow motion-safe:duration-200",
          "motion-safe:group-hover/banner:shadow-[0_0_18px_hsl(var(--primary)/0.5)]",
        )}
      >
        Review Suggestions
      </span>
    </button>
  );
}
