import type { Metadata } from "next";
import { Suspense } from "react";

import { EditTemplateScreen } from "@/components/reports/packs/pack-routes";

export const metadata: Metadata = {
  title: "Report pack template · Sole",
};

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <EditTemplateScreen id={Number(id)} />
    </Suspense>
  );
}
