import { Suspense } from "react";

import { TransactionListingScreen } from "@/components/reports/transaction-listing-screen";

export default function TransactionListingPage() {
  return (
    <Suspense fallback={null}>
      <TransactionListingScreen />
    </Suspense>
  );
}
