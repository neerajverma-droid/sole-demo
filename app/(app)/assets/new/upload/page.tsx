import type { Metadata } from "next";
import { AssetPermissionGate } from "@/components/assets/asset-access";

import { AssetForm } from "@/components/assets/asset-form";

export const metadata: Metadata = {
  title: "Upload asset · Sole",
};

export default function NewAssetUploadPage() {
  return (
    <AssetPermissionGate needs="add">
      <AssetForm mode="upload" />
    </AssetPermissionGate>
  );
}
