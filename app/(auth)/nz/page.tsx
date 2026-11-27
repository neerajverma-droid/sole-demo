import { Suspense } from "react";
import type { Metadata } from "next";

import { DemoEntry } from "@/components/auth/demo-entry";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";

export const metadata: Metadata = {
  title: "Sole demo · New Zealand",
};

export default function NewZealandDemoPage() {
  return (
    <Suspense fallback={<BrandSplashLoader />}>
      <DemoEntry country="NZ" />
    </Suspense>
  );
}
