import { Suspense } from "react";

import { TransactionsScreen } from "@/components/transactions/transactions-screen";

/**
 * Suspense because the screen reads `?status=` — the deep link from the
 * dashboard's "N transactions need categorising". `useSearchParams` opts a route
 * out of prerendering, and without a boundary the production build fails on it.
 * The same wrapper Invoices and Quotes already carry, for the same reason.
 */
export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsScreen />
    </Suspense>
  );
}
