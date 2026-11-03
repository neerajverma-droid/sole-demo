import { Suspense } from "react";
import type { Metadata } from "next";

import { EmployeesScreen } from "@/components/payroll/employees/employees-screen";

export const metadata: Metadata = {
  title: "Employees · Sole",
};

export default function PayrollEmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesScreen />
    </Suspense>
  );
}
