import { Suspense } from "react";

import { ChartOfAccountsScreen } from "@/components/reports/chart-of-accounts-screen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChartOfAccountsScreen />
    </Suspense>
  );
}
