import { Suspense } from "react";

import { InventoryScreen } from "@/components/inventory/inventory-screen";

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryScreen />
    </Suspense>
  );
}
