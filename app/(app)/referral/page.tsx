import type { Metadata } from "next";

import { ReferralScreen } from "@/components/referral/referral-screen";

export const metadata: Metadata = {
  title: "Refer & Earn · Sole",
};

export default function ReferralPage() {
  return <ReferralScreen />;
}
