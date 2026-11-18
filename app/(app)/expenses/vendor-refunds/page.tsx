import type { Metadata } from "next";

import { VendorRefundsScreen } from "@/components/vendor-refunds/vendor-refunds-screen";

export const metadata: Metadata = {
  title: "Vendor refunds · Sole",
};

export default function VendorRefundsPage() {
  return <VendorRefundsScreen />;
}
