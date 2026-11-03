import { Suspense } from "react";
import type { Metadata } from "next";

import { PayrunDetailScreen } from "@/components/payroll/payruns/payrun-detail-screen";

export const metadata: Metadata = {
  title: "Pay run · Sole",
};

export default async function PayrunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The run's year is in `?year=`, read client-side with useSearchParams.
  return (
    <Suspense>
      <PayrunDetailScreen runId={decodeURIComponent(id)} />
    </Suspense>
  );
}
