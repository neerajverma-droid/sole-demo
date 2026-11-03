import type { Metadata } from "next";

import { PaymentsScreen } from "@/components/payments/payments-screen";

export const metadata: Metadata = {
  title: "Payments · Sole",
};

export default function PaymentsPage() {
  return <PaymentsScreen />;
}
