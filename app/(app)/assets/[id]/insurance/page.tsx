import { InsuranceScreen } from "@/components/assets/insurance-screen";

export default async function AssetInsurancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InsuranceScreen assetId={id} />;
}
