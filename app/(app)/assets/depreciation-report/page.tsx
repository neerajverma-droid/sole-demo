import type { Metadata } from "next";
import { AdvancedAssetsGate } from "@/components/assets/asset-access";

import { DepreciationReportScreen } from "@/components/assets/depreciation-report-screen";

export const metadata: Metadata = {
  title: "Depreciation reports · Sole",
};

export default function AssetDepreciationReportPage() {
  return (
    <AdvancedAssetsGate feature="The depreciation report" needs="view">
      <DepreciationReportScreen />
    </AdvancedAssetsGate>
  );
}
