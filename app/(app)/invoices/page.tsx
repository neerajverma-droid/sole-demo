import { Suspense } from "react";

import { InvoicesScreen } from "@/components/invoices/invoices-screen";

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesScreen />
    </Suspense>
  );
}
