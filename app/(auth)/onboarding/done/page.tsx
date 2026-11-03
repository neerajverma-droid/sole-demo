import type { Metadata } from "next";

import { WelcomeCelebration } from "@/components/onboarding/welcome-celebration";

export const metadata: Metadata = {
  title: "You're all set · Sole",
};

export default function OnboardingDonePage() {
  return <WelcomeCelebration />;
}
