import type { Metadata } from "next";
import { AssetPermissionGate } from "@/components/assets/asset-access";

import { AssetForm } from "@/components/assets/asset-form";

export const metadata: Metadata = {
  title: "New asset · Sole",
};

export default function NewAssetManualPage() {
  return (
    <AssetPermissionGate needs="add">
      <AssetForm />
    </AssetPermissionGate>
  );
}
