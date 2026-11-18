import type { Metadata } from "next";

import { SolePayDirectorScreen } from "@/components/payments/solepay/director-screen";

export const metadata: Metadata = {
  title: "SolePay onboarding · Sole",
};

export default function SolePayDirectorsPage() {
  return <SolePayDirectorScreen />;
}
