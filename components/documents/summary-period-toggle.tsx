"use client";

import * as React from "react";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import {
  dashboardWindow,
  type DashboardWindow,
} from "@/lib/dashboard-period";
import { cn } from "@/lib/utils";

/**
 * The This Year / This Month switch above the Invoices and Quotes summaries —
 * sole-webapp's `YearMonthFilter`. As there, the year is the business's
 * financial year and the month the current calendar month, which is what
 * `/invoice/statistics` and `/quote/statistics` scoped them to; both are
 * matched on the document's issue date.
 */
export type SummaryPeriod = "year" | "month";

const OPTIONS: { value: SummaryPeriod; label: string }[] = [
  { value: "year", label: "This year" },
  { value: "month", label: "This month" },
];

/** The chosen period, a setter, and the dates it covers on the business's year. */
export function useSummaryPeriod(): {
  period: SummaryPeriod;
  setPeriod: (period: SummaryPeriod) => void;
  window: DashboardWindow;
} {
  // The old page opened on This Year.
  const [period, setPeriod] = React.useState<SummaryPeriod>("year");
  const fiscalYearStart = useFiscalYearStart();
  // Keyed on today's date so a tab left open past midnight on the last of the
  // month rolls over on its next render.
  const today = new Date().toDateString();
  const periodWindow = React.useMemo(
    () => dashboardWindow(period, new Date(today), fiscalYearStart),
    [period, today, fiscalYearStart],
  );
  return { period, setPeriod, window: periodWindow };
}

export function SummaryPeriodToggle({
  value,
  onChange,
  label,
}: {
  value: SummaryPeriod;
  onChange: (next: SummaryPeriod) => void;
  /** Spoken name for the group, e.g. "Invoice summary period". */
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center rounded-md bg-muted p-0.5 text-muted-foreground"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "whitespace-nowrap rounded px-2.5 py-0.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
