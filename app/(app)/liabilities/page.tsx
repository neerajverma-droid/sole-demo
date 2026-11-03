import type { Metadata } from "next";

import { LiabilitiesScreen } from "@/components/liabilities/liabilities-screen";

export const metadata: Metadata = {
  title: "Liabilities · Sole",
};

export default function LiabilitiesPage() {
  return <LiabilitiesScreen />;
}
