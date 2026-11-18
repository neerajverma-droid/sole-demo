import type { Metadata } from "next";
import { AdvancedAssetsGate } from "@/components/assets/asset-access";

import { AssetStatusScreen } from "@/components/assets/asset-status-screen";

export const metadata: Metadata = {
  title: "Asset status · Sole",
};

export default async function AssetStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdvancedAssetsGate feature="Lost, damaged or stolen reporting" needs="edit">
      <AssetStatusScreen assetId={id} />
    </AdvancedAssetsGate>
  );
}
