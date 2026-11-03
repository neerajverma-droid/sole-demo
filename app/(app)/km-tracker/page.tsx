import type { Metadata } from "next";

import { KmTrackerScreen } from "@/components/km-tracker/km-tracker-screen";

export const metadata: Metadata = {
  title: "KM Tracker · Sole",
};

export default function KmTrackerPage() {
  return <KmTrackerScreen />;
}
