import { DepreciationScheduleScreen } from "@/components/assets/depreciation-schedule-screen";

export default async function AssetDepreciationSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DepreciationScheduleScreen assetId={id} />;
}
