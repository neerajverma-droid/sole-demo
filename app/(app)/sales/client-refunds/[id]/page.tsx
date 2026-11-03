import { RefundForm } from "@/components/refunds/refund-form";

export default async function EditClientRefundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RefundForm refundId={id} />;
}
