import { Suspense } from "react";

import { TrialBalanceScreen } from "@/components/reports/trial-balance-screen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TrialBalanceScreen />
    </Suspense>
  );
}
