"use client";

import { useQuery } from "@tanstack/react-query";

import { useSalesSettingsQuery } from "@/hooks/use-sales-settings-query";
import { fetchWeeklySummaryEnabled } from "@/lib/sales-settings-api";
import { useSalesSettings } from "@/lib/use-sales-settings";
import type { NotificationSettings } from "@/lib/settings";

export const WEEKLY_SUMMARY_QUERY_KEY = ["weekly-summary-enabled"] as const;

/**
 * The saved notification settings, all from the server's `notification_setting`
 * records: invoice and quote emails (shared with Sales settings) and the
 * Monday weekly summary, which is off until switched on.
 */
export function useNotificationSettings(): NotificationSettings {
  useSalesSettingsQuery();
  const { settings } = useSalesSettings();
  const weekly = useQuery({
    queryKey: WEEKLY_SUMMARY_QUERY_KEY,
    queryFn: fetchWeeklySummaryEnabled,
  });

  return {
    invoiceEmails: settings.bccInvoiceEmails,
    quoteEmails: settings.bccQuoteEmails,
    weeklySummary: weekly.data ?? false,
  };
}
