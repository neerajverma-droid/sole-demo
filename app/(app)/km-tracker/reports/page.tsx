import type { Metadata } from "next";

import { KmReportsScreen } from "@/components/km-tracker/km-reports-screen";

export const metadata: Metadata = {
  title: "KM Tracker reports · Sole",
};

export default function KmTrackerReportsPage() {
  return <KmReportsScreen />;
}
