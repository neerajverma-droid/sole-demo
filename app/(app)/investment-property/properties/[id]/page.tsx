import { Suspense } from "react";
import type { Metadata } from "next";

import { PropertyDetailScreen } from "@/components/investment-property/property-detail-screen";

export const metadata: Metadata = {
  title: "Property · Sole",
};

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <PropertyDetailScreen propertyId={id} />
    </Suspense>
  );
}
