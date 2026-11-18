import type { Metadata } from "next";
import { Suspense } from "react";

import { BillsScreen } from "@/components/bills/bills-screen";

export const metadata: Metadata = {
  title: "Bills · Sole",
};

export default function BillsPage() {
  return (
    <Suspense fallback={null}>
      <BillsScreen />
    </Suspense>
  );
}
