import type { Metadata } from "next";

import { WeeklyLogScreen } from "@/components/time-tracker/weekly-log-screen";

export const metadata: Metadata = {
  title: "Weekly time log · Sole",
};

export default function WeeklyTimeLogPage() {
  return <WeeklyLogScreen />;
}
