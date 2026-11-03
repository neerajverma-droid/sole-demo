"use client";

import * as React from "react";

import {
  PREVIEW_TABS,
  SectionCard,
  type PreviewTab,
} from "@/components/proposals/proposal-document";
import type { PreviewData, ProposalStep } from "@/lib/proposals";
import { cn } from "@/lib/utils";

/** The builder's own panel also previews the email — internal only. */
const PANEL_TABS: PreviewTab[] = [...PREVIEW_TABS, "Email"];

/** The panel follows the user through the steps; Add. Docs. has no tab of its own. */
const STEP_TAB: Partial<Record<ProposalStep, PreviewTab>> = {
  General: "Cover",
  Services: "Services",
  Payments: "Pricing",
  Introduction: "Introduction",
  "Terms & Sign": "Terms",
  Notification: "Email",
  "Thank You": "Thank You",
};

/** And back: a tab the user picks opens the step that fills it. */
const TAB_STEP = Object.fromEntries(
  Object.entries(STEP_TAB).map(([step, tab]) => [tab, step]),
) as Partial<Record<PreviewTab, ProposalStep>>;

export function ProposalPreviewPanel({
  step,
  preview,
  onStepSelect,
}: {
  step: ProposalStep | null;
  preview: PreviewData;
  /** A tab picked here — the builder opens and scrolls to its step. */
  onStepSelect?: (step: ProposalStep) => void;
}) {
  const [tab, setTab] = React.useState<PreviewTab>("Cover");

  const selectTab = (next: PreviewTab) => {
    setTab(next);
    const target = TAB_STEP[next];
    if (target) onStepSelect?.(target);
  };

  React.useEffect(() => {
    const mapped = step ? STEP_TAB[step] : undefined;
    if (mapped) setTab(mapped);
  }, [step]);

  return (
    <section className="flex h-full flex-col bg-muted/30 p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <nav
          className="flex shrink-0 gap-6 overflow-x-auto border-b border-border px-5 pt-4 text-sm"
          aria-label="Preview sections"
        >
          {PANEL_TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-current={tab === entry ? "page" : undefined}
              onClick={() => selectTab(entry)}
              className={cn(
                "relative whitespace-nowrap pb-3 transition-colors hover:text-foreground",
                tab === entry ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {entry}
              {tab === entry && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto bg-primary/10 p-6 lg:p-10">
          <SectionCard section={tab} preview={preview} onNavigate={selectTab} />
        </div>
      </div>
    </section>
  );
}
