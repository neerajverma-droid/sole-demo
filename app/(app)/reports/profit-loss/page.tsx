import type { Metadata } from "next";
import { Suspense } from "react";

import { ProfitLossScreen } from "@/components/reports/profit-loss-screen";

export const metadata: Metadata = {
  title: "Profit & loss · Sole",
};

export default function ProfitLossPage() {
  return (
    <Suspense fallback={null}>
      <ProfitLossScreen />
    </Suspense>
  );
}
