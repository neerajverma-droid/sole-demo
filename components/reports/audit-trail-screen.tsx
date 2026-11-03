"use client";

import { ScrollText } from "lucide-react";

import { TabularReportScreen } from "@/components/reports/tabular-report-screen";
import { auditTrailConfig } from "@/lib/report-configs";

/**
 * Audit trail.
 *
 * The one report in the suite with no period and no export, because its
 * endpoint offers neither — see `auditTrailConfig`. The period atoms the other
 * reports keep would be dead state here, so this passes a fixed period the
 * screen never shows and the query key ignores.
 */
export function AuditTrailScreen() {
  return (
    <TabularReportScreen
      config={auditTrailConfig}
      icon={ScrollText}
      period="This financial year"
      onPeriodChange={() => {}}
      range={null}
      onRangeChange={() => {}}
      defaultPageSize={50}
      emptyIcon={ScrollText}
      emptyTitle="Nothing recorded yet"
      emptyDescription="Changes to your books are logged here as they happen — who made them, what changed, and when."
    />
  );
}
