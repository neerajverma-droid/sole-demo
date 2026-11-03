import type { Metadata } from "next";

import { PerksScreen } from "@/components/perks/perks-screen";

export const metadata: Metadata = {
  title: "Sole Perks · Sole",
};

export default function PartnersPage() {
  return <PerksScreen />;
}
