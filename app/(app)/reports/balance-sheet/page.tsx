import { Suspense } from "react";

import { BalanceSheetScreen } from "@/components/reports/balance-sheet-screen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BalanceSheetScreen />
    </Suspense>
  );
}
