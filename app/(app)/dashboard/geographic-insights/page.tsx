import type { Metadata } from "next";

import { GeographicInsightsScreen } from "@/components/dashboard/geographic-insights-screen";

export const metadata: Metadata = {
  title: "Geographic insights · Sole",
};

export default function GeographicInsightsPage() {
  return <GeographicInsightsScreen />;
}
