"use client";

// TEMPORARY — renders FirstActionCards in a popup-width box. Delete me.
import { FirstActionCards } from "@/components/onboarding/survey/first-action-cards";

export default function Probe() {
  return (
    <div className="mx-auto mt-10 w-[560px] rounded-2xl border bg-card p-6">
      <div id="box" className="mt-4">
        <FirstActionCards industryName="Plumber" onSelect={() => {}} onSkip={() => {}} />
      </div>
    </div>
  );
}
