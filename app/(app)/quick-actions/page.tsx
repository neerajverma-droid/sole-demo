import { Suspense } from "react";

import { QuickActionsScreen } from "@/components/actions/quick-actions-screen";

export default function QuickActionsPage() {
  return (
    <Suspense fallback={null}>
      <QuickActionsScreen />
    </Suspense>
  );
}
