import type { Metadata } from "next";

import { WalletPage } from "@/components/planner/wallet-page";

export const metadata: Metadata = {
  title: "Wallet · Sole",
};

export default function CashWalletPage() {
  return <WalletPage />;
}
