import type { Metadata } from "next";
import { AssetPermissionGate } from "@/components/assets/asset-access";

import { AssetBulkUploadDialog } from "@/components/assets/asset-bulk-upload-dialog";

export const metadata: Metadata = {
  title: "Bulk upload assets · Sole",
};

export default function BulkUploadPage() {
  return (
    <AssetPermissionGate needs="add">
      <AssetBulkUploadDialog page />
    </AssetPermissionGate>
  );
}
