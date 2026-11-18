import type { Metadata } from "next";
import { Suspense } from "react";

import { InvoicesScreen } from "@/components/invoices/invoices-screen";

export const metadata: Metadata = {
  title: "Invoices · Sole",
};

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesScreen />
    </Suspense>
  );
}
