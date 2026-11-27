import { Suspense } from "react";
import type { Metadata } from "next";

import { DemoEntry } from "@/components/auth/demo-entry";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";

export const metadata: Metadata = {
  title: "Sole demo · Australia",
};

export default function AustraliaDemoPage() {
  return (
    <Suspense fallback={<BrandSplashLoader />}>
      <DemoEntry country="AU" />
    </Suspense>
  );
}
