import type { Metadata } from "next";
import { Suspense } from "react";

import { NewTemplateScreen } from "@/components/reports/packs/pack-routes";

export const metadata: Metadata = {
  title: "New report pack template · Sole",
};

export default function NewTemplatePage() {
  return (
    <Suspense fallback={null}>
      <NewTemplateScreen />
    </Suspense>
  );
}
