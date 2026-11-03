import type { Metadata } from "next";

import { PayrollOverviewScreen } from "@/components/payroll/payroll-overview-screen";

export const metadata: Metadata = {
  title: "Payroll · Sole",
};

export default function PayrollPage() {
  return <PayrollOverviewScreen />;
}
