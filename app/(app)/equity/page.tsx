import type { Metadata } from "next";

import { EquityScreen } from "@/components/equity/equity-screen";

export const metadata: Metadata = {
  title: "Equity · Sole",
};

export default function EquityPage() {
  return <EquityScreen />;
}
