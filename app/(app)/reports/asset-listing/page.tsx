import { Suspense } from "react";

import { AssetListingScreen } from "@/components/reports/asset-listing-screen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AssetListingScreen />
    </Suspense>
  );
}
