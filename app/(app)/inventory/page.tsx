import type { Metadata } from "next";
import { Suspense } from "react";

import { InventoryScreen } from "@/components/inventory/inventory-screen";

export const metadata: Metadata = {
  title: "Inventory · Sole",
};

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryScreen />
    </Suspense>
  );
}
