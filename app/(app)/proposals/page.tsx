import type { Metadata } from "next";

import { ProposalsScreen } from "@/components/proposals/proposals-screen";

export const metadata: Metadata = {
  title: "Proposals · Sole",
};

export default function ProposalsPage() {
  return <ProposalsScreen />;
}
