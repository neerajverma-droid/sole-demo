import { DisposalScreen } from "@/components/assets/disposal-screen";

export default async function AssetDisposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DisposalScreen assetId={id} />;
}
