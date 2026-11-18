import type { Metadata } from "next";

import { BillForm } from "@/components/bills/bill-form";

export const metadata: Metadata = {
  title: "Bill · Sole",
};

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BillForm billId={id} />;
}
