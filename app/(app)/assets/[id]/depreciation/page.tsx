import type { Metadata } from "next";
import { AdvancedAssetsGate } from "@/components/assets/asset-access";

import { DepreciationScreen } from "@/components/assets/depreciation-screen";

export const metadata: Metadata = {
  title: "Asset depreciation · Sole",
};

export default async function AssetDepreciationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdvancedAssetsGate feature="Depreciation" needs="edit">
      <DepreciationScreen assetId={id} />
    </AdvancedAssetsGate>
  );
}
