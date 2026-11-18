import type { Metadata } from "next";
import { Suspense } from "react";

import { BalanceSheetScreen } from "@/components/reports/balance-sheet-screen";

export const metadata: Metadata = {
  title: "Balance sheet · Sole",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BalanceSheetScreen />
    </Suspense>
  );
}
