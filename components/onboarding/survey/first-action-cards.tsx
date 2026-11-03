"use client";

import { ArrowRight } from "lucide-react";

import firstActions, {
  type FirstAction,
} from "@/lib/onboarding-survey/first-actions";

/**
 * The survey's last step: "right — want to make something?"
 *
 * Renders `firstActions(industryName)`'s best-fit CTAs as vertical rows, plus
 * the one way past them that isn't an answer — "I'll look around first",
 * which finishes the survey with no redirect. Ported from the `first_action`
 * branch of `sole-webapp/components/OnboardingSurveyPopup/index.js`, with the
 * skip action folded into this component (source renders it as a separate
 * footer button; there's nothing else in this step's footer here, so keeping
 * the two together keeps the whole step self-contained).
 */
export function FirstActionCards({
  industryName,
  onSelect,
  onSkip,
}: {
  industryName: string;
  onSelect: (action: FirstAction) => void;
  onSkip: () => void;
}) {
  const actions = firstActions(industryName);

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => onSelect(action)}
          className="group flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3 text-left transition-all hover:-translate-y-px hover:border-primary hover:shadow-md"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-foreground">
              {action.title}
            </span>
            <span className="block text-xs text-muted-foreground">
              {action.subtitle}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
        </button>
      ))}

      <button
        type="button"
        onClick={onSkip}
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        I&apos;ll look around first
      </button>
    </div>
  );
}
