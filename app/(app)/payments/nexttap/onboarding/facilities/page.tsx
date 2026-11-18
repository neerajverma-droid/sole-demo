import type { Metadata } from "next";

import { NexxtapFacilitiesScreen } from "@/components/payments/nexxtap/facilities-screen";

export const metadata: Metadata = {
  title: "NextTap onboarding · Sole",
};

export default function Page() {
  return <NexxtapFacilitiesScreen />;
}
