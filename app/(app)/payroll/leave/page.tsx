import type { Metadata } from "next";

import { LeaveScreen } from "@/components/payroll/leave/leave-screen";

export const metadata: Metadata = {
  title: "Leave · Sole",
};

export default function PayrollLeavePage() {
  return <LeaveScreen />;
}
