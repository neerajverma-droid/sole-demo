import { BankTransferScreen } from "@/components/payments/public-pay/bank-transfer-screen";

export default async function BankTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const { p } = await searchParams;
  const token = Array.isArray(p) ? p[0] : (p ?? "");
  return <BankTransferScreen token={token} />;
}
