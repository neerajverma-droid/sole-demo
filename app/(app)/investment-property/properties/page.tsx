import type { Metadata } from "next";

import { PropertiesScreen } from "@/components/investment-property/properties-screen";

export const metadata: Metadata = {
  title: "All properties · Sole",
};

export default function PropertiesPage() {
  return <PropertiesScreen />;
}
