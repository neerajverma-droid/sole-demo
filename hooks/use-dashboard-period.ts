"use client";

import * as React from "react";
import { atom, useAtom } from "jotai";

import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import {
  DEFAULT_DASHBOARD_PERIOD,
  dashboardWindow,
  type DashboardPeriod,
  type DashboardWindow,
} from "@/lib/dashboard-period";

/**
 * The period the dashboard reports over. One atom for the page, so the header
 * dropdown and every card agree; not persisted, so the dashboard opens on
 * Yearly as sole-webapp's did.
 */
export const dashboardPeriodAtom = atom<DashboardPeriod>(DEFAULT_DASHBOARD_PERIOD);

/** The chosen period, a setter, and the dates it covers on the business's year. */
export function useDashboardPeriod(): {
  period: DashboardPeriod;
  setPeriod: (period: DashboardPeriod) => void;
  window: DashboardWindow;
} {
  const [period, setPeriod] = useAtom(dashboardPeriodAtom);
  const fiscalYearStart = useFiscalYearStart();
  // Keyed on today's date so a tab left open past midnight on the 30th rolls
  // over to the new month (or year) on its next render.
  const today = new Date().toDateString();
  const periodWindow = React.useMemo(
    () => dashboardWindow(period, new Date(today), fiscalYearStart),
    [period, today, fiscalYearStart],
  );
  return { period, setPeriod, window: periodWindow };
}
