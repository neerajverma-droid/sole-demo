import { Suspense } from "react";

import { EditPackScreen } from "@/components/reports/packs/pack-routes";

export default async function ReportPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <EditPackScreen id={Number(id)} />
    </Suspense>
  );
}
