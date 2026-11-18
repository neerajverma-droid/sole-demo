import type { Metadata } from "next";

import { SolePayDocumentsScreen } from "@/components/payments/solepay/documents-screen";

export const metadata: Metadata = {
  title: "SolePay onboarding · Sole",
};

export default function SolePayDocumentsPage() {
  return <SolePayDocumentsScreen />;
}
