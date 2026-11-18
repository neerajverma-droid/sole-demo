import type { Metadata } from "next";

import { SolePayLinkScreen } from "@/components/payments/solepay/link-screen";

export const metadata: Metadata = {
  title: "Link SolePay · Sole",
};

export default function SolePayLinkPage() {
  return <SolePayLinkScreen />;
}
