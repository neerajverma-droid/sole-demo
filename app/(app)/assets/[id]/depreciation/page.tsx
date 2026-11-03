import { DepreciationScreen } from "@/components/assets/depreciation-screen";

export default async function AssetDepreciationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DepreciationScreen assetId={id} />;
}
