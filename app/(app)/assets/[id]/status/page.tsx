import { AssetStatusScreen } from "@/components/assets/asset-status-screen";

export default async function AssetStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssetStatusScreen assetId={id} />;
}
