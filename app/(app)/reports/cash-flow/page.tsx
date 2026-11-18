import type { Metadata } from "next";
import { Suspense } from "react";

import { CashFlowScreen } from "@/components/reports/cash-flow-screen";

export const metadata: Metadata = {
  title: "Cash flows · Sole",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CashFlowScreen />
    </Suspense>
  );
}
