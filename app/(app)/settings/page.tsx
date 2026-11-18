import type { Metadata } from "next";
import { Suspense } from "react";

import { SettingsScreen } from "@/components/settings/settings-screen";

export const metadata: Metadata = {
  title: "Settings · Sole",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsScreen />
    </Suspense>
  );
}
