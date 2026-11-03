import type { Metadata } from "next";

import { BusinessesScreen } from "@/components/businesses/businesses-screen";

export const metadata: Metadata = {
  title: "Businesses & subscriptions · Sole",
};

export default function BusinessesPage() {
  return <BusinessesScreen />;
}
