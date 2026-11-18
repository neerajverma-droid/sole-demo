import type { Metadata } from "next";
import { Suspense } from "react";

import { CustomerSupplierScreen } from "@/components/reports/customer-supplier-screen";

export const metadata: Metadata = {
  title: "Customer / supplier report · Sole",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CustomerSupplierScreen />
    </Suspense>
  );
}
