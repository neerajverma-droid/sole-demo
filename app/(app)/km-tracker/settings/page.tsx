import { Suspense } from "react";
import type { Metadata } from "next";

import { KmSettingsScreen } from "@/components/km-tracker/km-settings-screen";

export const metadata: Metadata = {
  title: "KM Tracker settings · Sole",
};

/** Suspense because the screen reads `?tab=` — the trip form links straight
 *  to the Vehicles tab. */
export default function KmTrackerSettingsPage() {
  return (
    <Suspense fallback={null}>
      <KmSettingsScreen />
    </Suspense>
  );
}
