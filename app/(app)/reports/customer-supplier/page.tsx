import { Suspense } from "react";

import { CustomerSupplierScreen } from "@/components/reports/customer-supplier-screen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CustomerSupplierScreen />
    </Suspense>
  );
}
