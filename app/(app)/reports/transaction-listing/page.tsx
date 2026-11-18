import type { Metadata } from "next";
import { Suspense } from "react";

import { TransactionListingReport } from "@/components/reports/transaction-listing-report";

export const metadata: Metadata = {
  title: "Transaction listing · Sole",
};

export default function TransactionListingPage() {
  return (
    <Suspense fallback={null}>
      <TransactionListingReport />
    </Suspense>
  );
}
