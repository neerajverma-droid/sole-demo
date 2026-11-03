"use client";

import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The card the one onboarding screen sits in: heading, form, then the single
 * button that finishes it.
 *
 * It was StepShell once, carrying a "Step 1 of 4" line, a Back link and a Skip.
 * All three described a wizard that no longer exists — what's left is a form
 * with one way forward, so there is nothing to number, nothing to go back to
 * and nothing to skip past.
 *
 * The button says where it goes and wears a tick rather than a forward arrow.
 * "Next" behind an arrow promised a second screen; there isn't one, and the
 * thing on the other side of this press is the product.
 */
export function OnboardingCard({
  title,
  description,
  onNext,
  nextLabel = "Go to Sole",
  nextDisabled,
  busy,
  children,
}: {
  title: string;
  description: string;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onNext();
        }}
      >
        {children}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
          <Button
            type="submit"
            size="lg"
            disabled={busy || nextDisabled}
            className="h-11 min-w-40"
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {busy ? "Saving…" : nextLabel}
            {!busy && <Check aria-hidden />}
          </Button>
        </div>
      </form>
    </div>
  );
}
