import type { Metadata } from "next";
import { Suspense } from "react";

import { TrialBalanceScreen } from "@/components/reports/trial-balance-screen";

export const metadata: Metadata = {
  title: "Trial balance · Sole",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TrialBalanceScreen />
    </Suspense>
  );
}
