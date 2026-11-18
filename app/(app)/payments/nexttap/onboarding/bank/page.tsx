import type { Metadata } from "next";

import { NexxtapBankScreen } from "@/components/payments/nexxtap/bank-screen";

export const metadata: Metadata = {
  title: "NextTap onboarding · Sole",
};

export default function Page() {
  return <NexxtapBankScreen />;
}
