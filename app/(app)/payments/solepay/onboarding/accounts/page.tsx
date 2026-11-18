import type { Metadata } from "next";

import { SolePayAccountsScreen } from "@/components/payments/solepay/accounts-screen";

export const metadata: Metadata = {
  title: "SolePay onboarding · Sole",
};

export default function SolePayAccountsPage() {
  return <SolePayAccountsScreen />;
}
