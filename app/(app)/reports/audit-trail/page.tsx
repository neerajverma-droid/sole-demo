import type { Metadata } from "next";
import { Suspense } from "react";

import { AuditTrailScreen } from "@/components/reports/audit-trail-screen";

export const metadata: Metadata = {
  title: "Audit trail · Sole",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AuditTrailScreen />
    </Suspense>
  );
}
