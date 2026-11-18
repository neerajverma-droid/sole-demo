import type { Metadata } from "next";
import { Suspense } from "react";

import { AssetsScreen } from "@/components/assets/assets-screen";

export const metadata: Metadata = {
  title: "Assets · Sole",
};

/**
 * Suspense because the screen reads `?edit=` — the link from the BAS review
 * that opens an asset for editing (undoing its match first if it has one).
 */
export default function AssetsPage() {
  return (
    <Suspense fallback={null}>
      <AssetsScreen />
    </Suspense>
  );
}
