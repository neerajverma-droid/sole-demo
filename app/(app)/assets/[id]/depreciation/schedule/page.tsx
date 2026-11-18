import type { Metadata } from "next";
import { AdvancedAssetsGate } from "@/components/assets/asset-access";

import { DepreciationScheduleScreen } from "@/components/assets/depreciation-schedule-screen";

export const metadata: Metadata = {
  title: "Depreciation schedule · Sole",
};

export default async function AssetDepreciationSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdvancedAssetsGate feature="The depreciation schedule" needs="view">
      <DepreciationScheduleScreen assetId={id} />
    </AdvancedAssetsGate>
  );
}
