import { Suspense } from "react";

import { QuotesScreen } from "@/components/quotes/quotes-screen";

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <QuotesScreen />
    </Suspense>
  );
}
