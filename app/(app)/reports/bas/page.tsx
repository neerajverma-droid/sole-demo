import { Suspense } from "react";

import { BasReportScreen } from "@/components/reports/bas-report-screen";

export default function BasReportPage() {
  return (
    <Suspense fallback={null}>
      <BasReportScreen />
    </Suspense>
  );
}
