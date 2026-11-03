import type { Metadata } from "next";

import { PayrunCreateScreen } from "@/components/payroll/payruns/payrun-create-screen";

export const metadata: Metadata = {
  title: "New pay run · Sole",
};

export default function NewPayrunPage() {
  return <PayrunCreateScreen />;
}
