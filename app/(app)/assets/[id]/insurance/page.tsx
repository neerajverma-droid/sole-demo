import type { Metadata } from "next";
import { AdvancedAssetsGate } from "@/components/assets/asset-access";

import { InsuranceScreen } from "@/components/assets/insurance-screen";

export const metadata: Metadata = {
  title: "Asset insurance · Sole",
};

export default async function AssetInsurancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdvancedAssetsGate feature="Insurance" needs="edit">
      <InsuranceScreen assetId={id} />
    </AdvancedAssetsGate>
  );
}
