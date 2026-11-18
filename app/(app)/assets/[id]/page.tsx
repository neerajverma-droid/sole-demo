import type { Metadata } from "next";
import { AssetPermissionGate } from "@/components/assets/asset-access";

import { AssetForm } from "@/components/assets/asset-form";

export const metadata: Metadata = {
  title: "Asset · Sole",
};

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AssetPermissionGate needs="edit">
      <AssetForm assetId={id} />
    </AssetPermissionGate>
  );
}
