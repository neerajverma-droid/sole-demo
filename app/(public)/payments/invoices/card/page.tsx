import { CardPaymentScreen } from "@/components/payments/public-pay/card-payment-screen";

export default async function CardPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const { p } = await searchParams;
  const token = Array.isArray(p) ? p[0] : (p ?? "");
  return <CardPaymentScreen token={token} />;
}
