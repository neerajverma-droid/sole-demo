import type { Metadata } from "next";

import { MigrationsScreen } from "@/components/migrations/migrations-screen";

export const metadata: Metadata = {
  title: "Migrations · Sole",
};

export default function MigrationsPage() {
  return <MigrationsScreen />;
}
