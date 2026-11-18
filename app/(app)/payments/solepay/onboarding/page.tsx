import type { Metadata } from "next";

import { SolePayOnboardingScreen } from "@/components/payments/solepay/onboarding-screen";

export const metadata: Metadata = {
  title: "SolePay onboarding · Sole",
};

export default function SolePayOnboardingPage() {
  return <SolePayOnboardingScreen />;
}
