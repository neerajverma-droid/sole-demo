import type { Metadata } from "next";

import { SolePayEntityScreen } from "@/components/payments/solepay/entity-screen";

export const metadata: Metadata = {
  title: "SolePay onboarding · Sole",
};

export default function SolePayEntityPage() {
  return <SolePayEntityScreen />;
}
