import type { Metadata } from "next";

import { NexxtapApplicantScreen } from "@/components/payments/nexxtap/applicant-screen";

export const metadata: Metadata = {
  title: "NextTap onboarding · Sole",
};

export default function Page() {
  return <NexxtapApplicantScreen />;
}
