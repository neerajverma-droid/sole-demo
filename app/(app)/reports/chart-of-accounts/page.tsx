import type { Metadata } from "next";
import { Suspense } from "react";

import { ChartOfAccountsScreen } from "@/components/reports/chart-of-accounts-screen";

export const metadata: Metadata = {
  title: "Chart of accounts · Sole",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChartOfAccountsScreen />
    </Suspense>
  );
}
