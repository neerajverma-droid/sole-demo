import type { Metadata } from "next";

import { PayrollReportsScreen } from "@/components/payroll/reports/payroll-reports-screen";

export const metadata: Metadata = {
  title: "Payroll reports · Sole",
};

export default function PayrollReportsPage() {
  return <PayrollReportsScreen />;
}
