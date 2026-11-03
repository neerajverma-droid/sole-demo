import type { Metadata } from "next";

import { TimeTrackerScreen } from "@/components/time-tracker/time-tracker-screen";

export const metadata: Metadata = {
  title: "Time Tracker · Sole",
};

export default function TimeTrackerPage() {
  return <TimeTrackerScreen />;
}
