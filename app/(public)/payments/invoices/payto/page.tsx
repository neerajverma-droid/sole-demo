import { PayToScreen } from "@/components/payments/public-pay/payto-screen";

export default async function PayToPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const { p } = await searchParams;
  const token = Array.isArray(p) ? p[0] : (p ?? "");
  return <PayToScreen token={token} />;
}
