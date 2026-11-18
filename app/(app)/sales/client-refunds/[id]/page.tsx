import type { Metadata } from "next";

import { RefundForm } from "@/components/refunds/refund-form";

export const metadata: Metadata = {
  title: "Client refund · Sole",
};

export default async function EditClientRefundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RefundForm refundId={id} />;
}
