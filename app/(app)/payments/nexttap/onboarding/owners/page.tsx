import type { Metadata } from "next";

import { NexxtapOwnersScreen } from "@/components/payments/nexxtap/owners-screen";

export const metadata: Metadata = {
  title: "NextTap onboarding · Sole",
};

export default function Page() {
  return <NexxtapOwnersScreen />;
}
