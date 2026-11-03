import type { Metadata } from "next";

import { ReputationScreen } from "@/components/reputation/reputation-screen";

export const metadata: Metadata = {
  title: "Reputation · Sole",
};

export default function ReputationPage() {
  return <ReputationScreen />;
}
