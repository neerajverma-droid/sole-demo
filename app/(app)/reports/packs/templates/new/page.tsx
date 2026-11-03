import { Suspense } from "react";

import { NewTemplateScreen } from "@/components/reports/packs/pack-routes";

export default function NewTemplatePage() {
  return (
    <Suspense fallback={null}>
      <NewTemplateScreen />
    </Suspense>
  );
}
