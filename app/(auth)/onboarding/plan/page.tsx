import { Suspense } from "react";
import type { Metadata } from "next";

import { PlanStep } from "@/components/onboarding/plan-step";

export const metadata: Metadata = {
  title: "Choose your plan · Sole",
};

/**
 * Suspense because the step reads the Stripe return (`?checkout=1&session_id=…`)
 * from the URL.
 */
export default function OnboardingPlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanStep />
    </Suspense>
  );
}
