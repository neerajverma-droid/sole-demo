import { Suspense } from "react";

import { ProfitLossScreen } from "@/components/reports/profit-loss-screen";

export default function ProfitLossPage() {
  return (
    <Suspense fallback={null}>
      <ProfitLossScreen />
    </Suspense>
  );
}
