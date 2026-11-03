import { RefundForm } from "@/components/refunds/refund-form";

export default async function NewClientRefundPage({
  searchParams,
}: {
  /** `?copy=` arrives from Client refunds → Duplicate. */
  searchParams: Promise<{ copy?: string }>;
}) {
  const { copy } = await searchParams;
  return <RefundForm copyOfId={copy} />;
}
