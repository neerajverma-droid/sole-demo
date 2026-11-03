import type { Metadata } from "next";

import { TaxEstimatorScreen } from "@/components/tax/tax-estimator-screen";

export const metadata: Metadata = {
  title: "Tax Estimator · Sole",
};

export default function TaxEstimatorPage() {
  return <TaxEstimatorScreen />;
}
