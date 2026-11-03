import type { Metadata } from "next";

import { PortfolioScreen } from "@/components/investment-property/portfolio-screen";

export const metadata: Metadata = {
  title: "Investment property · Sole",
};

export default function InvestmentPropertyPage() {
  return <PortfolioScreen />;
}
