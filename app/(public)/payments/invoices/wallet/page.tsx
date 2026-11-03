import { WalletScreen } from "@/components/payments/public-pay/wallet-screen";

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const { p } = await searchParams;
  const token = Array.isArray(p) ? p[0] : (p ?? "");
  return <WalletScreen token={token} />;
}
