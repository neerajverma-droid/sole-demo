import type { Metadata } from "next";

import { PayrunsScreen } from "@/components/payroll/payruns/payruns-screen";

export const metadata: Metadata = {
  title: "Pay runs · Sole",
};

export default function PayrunsPage() {
  return <PayrunsScreen />;
}
