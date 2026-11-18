import type { Metadata } from "next";
import { Suspense } from "react";

import { QuickActionsScreen } from "@/components/actions/quick-actions-screen";

export const metadata: Metadata = {
  title: "Quick Actions · Sole",
};

export default function QuickActionsPage() {
  return (
    <Suspense fallback={null}>
      <QuickActionsScreen />
    </Suspense>
  );
}
