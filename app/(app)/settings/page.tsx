import { Suspense } from "react";

import { SettingsScreen } from "@/components/settings/settings-screen";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsScreen />
    </Suspense>
  );
}
