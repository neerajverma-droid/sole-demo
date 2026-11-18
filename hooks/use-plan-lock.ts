"use client";

import { useSession } from "@/components/auth/session-provider";
import { useAccess } from "@/hooks/use-access";
import { usePayrollSeatsQuery } from "@/hooks/use-payroll-query";
import { payrollLocked } from "@/lib/payroll";
import { gateForPath, type PlanGate } from "@/lib/plan-gates";

/**
 * Which gate, if any, is shut in front of a path for this session.
 *
 * Open until there's an answer — the profile's feature list, or for payroll
 * its seats. A page that flashed locked on a slow connection, or an older
 * server that sends no list locking everyone out, would both be worse than
 * the server refusing the data on its own. Accountants are let through for the same reason the first
 * subscription gate lets them through — their access is the client's, not a
 * plan of their own.
 */
export function usePlanLock(): (path: string | undefined | null) => PlanGate | undefined {
  const { user } = useSession();
  const access = useAccess();
  const features = access.features;
  const seats = usePayrollSeatsQuery().data;

  return (path) => {
    if (user?.isAccountant || user?.is_demo) return undefined;
    const gate = gateForPath(path);
    if (!gate) return undefined;
    // Payroll is its seats, read the same way: locked only on an answer.
    if (gate.seats) return payrollLocked(seats) ? gate : undefined;
    if (!access.ready || !features || !gate.feature) return undefined;
    return features.includes(gate.feature) ? undefined : gate;
  };
}
