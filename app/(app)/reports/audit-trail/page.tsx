import { Suspense } from "react";

import { AuditTrailScreen } from "@/components/reports/audit-trail-screen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AuditTrailScreen />
    </Suspense>
  );
}
