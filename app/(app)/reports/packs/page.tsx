import { Suspense } from "react";

import { PackListScreen } from "@/components/reports/packs/pack-list-screen";

export default function ReportPacksPage() {
  return (
    <Suspense fallback={null}>
      <PackListScreen />
    </Suspense>
  );
}
