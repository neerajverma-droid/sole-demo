import type { Metadata } from "next";
import { AssetPermissionGate } from "@/components/assets/asset-access";

import { CreateAssetChooser } from "@/components/assets/create-asset-chooser";

export const metadata: Metadata = {
  title: "New asset · Sole",
};

export default function NewAssetPage() {
  return (
    <AssetPermissionGate needs="add">
      <CreateAssetChooser />
    </AssetPermissionGate>
  );
}
