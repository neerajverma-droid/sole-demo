import type { Metadata } from "next";
import { Suspense } from "react";

import { PackListScreen } from "@/components/reports/packs/pack-list-screen";

export const metadata: Metadata = {
  title: "Report packs · Sole",
};

export default function ReportPacksPage() {
  return (
    <Suspense fallback={null}>
      <PackListScreen />
    </Suspense>
  );
}
