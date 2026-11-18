import type { Metadata } from "next";
import { Suspense } from "react";

import { AssetListingScreen } from "@/components/reports/asset-listing-screen";

export const metadata: Metadata = {
  title: "Asset listing · Sole",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AssetListingScreen />
    </Suspense>
  );
}
