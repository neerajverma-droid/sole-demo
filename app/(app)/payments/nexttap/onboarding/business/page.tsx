import type { Metadata } from "next";

import { NexxtapBusinessScreen } from "@/components/payments/nexxtap/business-screen";

export const metadata: Metadata = {
  title: "NextTap onboarding · Sole",
};

export default function Page() {
  return <NexxtapBusinessScreen />;
}
