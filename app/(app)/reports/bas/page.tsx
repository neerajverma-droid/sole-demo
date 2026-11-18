import type { Metadata } from "next";
import { Suspense } from "react";

import { BasReportScreen } from "@/components/reports/bas-report-screen";

export const metadata: Metadata = {
  title: "BAS report · Sole",
};

export default function BasReportPage() {
  return (
    <Suspense fallback={null}>
      <BasReportScreen />
    </Suspense>
  );
}
