"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionDraft } from "@/components/settings/use-section-draft";
import { notificationsDraftAtom } from "@/lib/atoms";
import type { NotificationSettings } from "@/lib/settings";
import { useActiveBusiness } from "@/hooks/use-active-business";
import {
  WEEKLY_SUMMARY_QUERY_KEY,
  useNotificationSettings,
} from "@/hooks/use-notification-settings";
import { saveNotificationPreferenceApi } from "@/lib/sales-settings-api";
import { useSalesSettingsStore } from "@/stores/sales-settings";

const TOGGLES: {
  key: keyof NotificationSettings;
  label: string;
  hint: string;
}[] = [
  {
    key: "invoiceEmails",
    label: "Invoice notifications",
    hint: "Email me about my invoices — a copy of every invoice email lands in your inbox.",
  },
  {
    key: "quoteEmails",
    label: "Quote notifications",
    hint: "Email me about my quotes — a copy of every quote email lands in your inbox.",
  },
  {
    key: "weeklySummary",
    label: "Weekly summary",
    hint: "A Monday email with last week's money in, money out and what's overdue, plus a spreadsheet.",
  },
];

/**
 * All three switches are saved through `/v2/notification-setting`. Invoice and
 * quote are the same records as Sales settings → Communication.
 */
export function NotificationsSection() {
  const queryClient = useQueryClient();
  const saveSales = useSalesSettingsStore((state) => state.patch);
  const stored = useNotificationSettings();
  const { business } = useActiveBusiness();
  const { values, dirty, patch, reset } = useSectionDraft(
    stored,
    notificationsDraftAtom,
    business?.id ?? null,
  );
  const [saving, setSaving] = React.useState(false);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const tasks: Promise<void>[] = [];
      if (values.invoiceEmails !== stored.invoiceEmails) {
        tasks.push(saveNotificationPreferenceApi("invoice", values.invoiceEmails));
      }
      if (values.quoteEmails !== stored.quoteEmails) {
        tasks.push(saveNotificationPreferenceApi("quote", values.quoteEmails));
      }
      if (values.weeklySummary !== stored.weeklySummary) {
        tasks.push(saveNotificationPreferenceApi("weekly_summary", values.weeklySummary));
      }
      await Promise.all(tasks);
      saveSales({
        bccInvoiceEmails: values.invoiceEmails,
        bccQuoteEmails: values.quoteEmails,
      });
      queryClient.setQueryData(WEEKLY_SUMMARY_QUERY_KEY, values.weeklySummary);
      reset();
      toast.success("Notifications saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save notifications",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Notifications"
      description="Choose what Sole emails you about."
      dirty={dirty}
      saving={saving}
      onSave={onSave}
    >
      <ul className="divide-y rounded-md border">
        {TOGGLES.map((toggle) => (
          <li
            key={toggle.key}
            className="flex items-center justify-between gap-[15px] p-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{toggle.label}</p>
              <p className="text-xs text-muted-foreground">{toggle.hint}</p>
            </div>
            <Switch
              checked={values[toggle.key]}
              onCheckedChange={(checked) => patch({ [toggle.key]: checked })}
              aria-label={toggle.label}
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
