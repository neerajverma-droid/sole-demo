import type { Metadata } from "next";

import { CompanyProfileStep } from "@/components/onboarding/company-profile-step";

export const metadata: Metadata = {
  title: "Tell us about your business · Sole",
};

export default function OnboardingPage() {
  return <CompanyProfileStep />;
}
