import type { Metadata } from "next";
import { Suspense } from "react";

import { QuotesScreen } from "@/components/quotes/quotes-screen";

export const metadata: Metadata = {
  title: "Quotes · Sole",
};

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <QuotesScreen />
    </Suspense>
  );
}
