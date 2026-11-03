import type { Metadata } from "next";

import { NexxtapOnboardingScreen } from "@/components/payments/nexxtap/onboarding-screen";

export const metadata: Metadata = {
  title: "NextTap onboarding · Sole",
};

export default function NexxtapOnboardingPage() {
  return <NexxtapOnboardingScreen />;
}
