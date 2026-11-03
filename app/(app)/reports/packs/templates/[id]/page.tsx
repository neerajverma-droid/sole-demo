import { Suspense } from "react";

import { EditTemplateScreen } from "@/components/reports/packs/pack-routes";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <EditTemplateScreen id={Number(id)} />
    </Suspense>
  );
}
