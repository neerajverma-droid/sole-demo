import { AssetForm } from "@/components/assets/asset-form";

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssetForm assetId={id} />;
}
