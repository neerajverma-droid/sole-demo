import type { Metadata } from "next";

import { NexxtapActivityScreen } from "@/components/payments/nexxtap/activity-screen";

export const metadata: Metadata = {
  title: "NextTap onboarding · Sole",
};

export default function Page() {
  return <NexxtapActivityScreen />;
}
