import type { Metadata } from "next";
import { AdvancedAssetsGate } from "@/components/assets/asset-access";

import { DisposalScreen } from "@/components/assets/disposal-screen";

export const metadata: Metadata = {
  title: "Asset disposal · Sole",
};

export default async function AssetDisposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdvancedAssetsGate feature="Disposal" needs="edit">
      <DisposalScreen assetId={id} />
    </AdvancedAssetsGate>
  );
}
