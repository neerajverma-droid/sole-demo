import type { Metadata } from "next";

import { SalesSettingsScreen } from "@/components/sales-settings/sales-settings-screen";

export const metadata: Metadata = {
  title: "Sales settings · Sole",
};

export default function SalesSettingsPage() {
  return <SalesSettingsScreen />;
}
