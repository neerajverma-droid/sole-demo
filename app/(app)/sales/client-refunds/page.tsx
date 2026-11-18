import type { Metadata } from "next";

import { RefundsScreen } from "@/components/refunds/refunds-screen";

export const metadata: Metadata = {
  title: "Client refunds · Sole",
};

export default function ClientRefundsPage() {
  return <RefundsScreen />;
}
