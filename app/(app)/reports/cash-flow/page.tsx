import { Suspense } from "react";

import { CashFlowScreen } from "@/components/reports/cash-flow-screen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CashFlowScreen />
    </Suspense>
  );
}
