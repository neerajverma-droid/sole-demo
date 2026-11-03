"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { BrandingTab } from "@/components/sales-settings/branding-tab";
import { CommunicationTab } from "@/components/sales-settings/communication-tab";
import { FieldsTab } from "@/components/sales-settings/fields-tab";
import { StylingTab } from "@/components/sales-settings/styling-tab";
import { FooterTab } from "@/components/sales-settings/footer-tab";
import { SettingsTab } from "@/components/sales-settings/settings-tab";
import { TabFooter } from "@/components/sales-settings/tab-shell";
import { salesDraftAtom, salesTabAtom } from "@/lib/atoms";
import {
  SALES_TABS,
  brandingTabIssues,
  footerTabIssues,
  settingsTabIssues,
  tabDirty,
  tabSlice,
  type SalesSettings,
  type SalesTab,
} from "@/lib/sales-settings";
import {
  enableTextMessageApi,
  removeLogoApi,
  saveBrandingApi,
  saveNotificationPreferenceApi,
  saveReminderPreferenceApi,
  saveSeqNumbersApi,
  uploadLogoApi,
} from "@/lib/sales-settings-api";
import { useSalesSettings } from "@/lib/use-sales-settings";
import { useSalesSettingsQuery } from "@/hooks/use-sales-settings-query";
import { useSalesSettingsStore } from "@/stores/sales-settings";

/** Which tabs share the single get-branding/save-branding record. */
const BRANDING_RECORD_TABS: readonly SalesTab[] = [
  "branding",
  "footer",
  "invoice-fields",
  "quote-fields",
  "invoice-styling",
  "quote-styling",
];

export function SalesSettingsScreen() {
  useSalesSettingsQuery();
  const queryClient = useQueryClient();
  const { settings: stored } = useSalesSettings();
  const save = useSalesSettingsStore((state) => state.patch);
  const [tab, setTab] = useAtom(salesTabAtom);
  const [draft, setDraft] = useAtom(salesDraftAtom);
  const [saving, setSaving] = React.useState(false);

  /**
   * One draft across the whole screen, but every save and dirty check is scoped
   * to the open tab's keys — so an edit left open on another tab can neither be
   * saved by accident nor reverted by a sibling's save.
   */
  const values = { ...stored, ...draft } as SalesSettings;
  const patch = (next: Partial<SalesSettings>) =>
    setDraft({ ...(draft ?? {}), ...next });

  const dirty = tabDirty(tab, values, stored);
  const issues =
    tab === "settings"
      ? settingsTabIssues(values)
      : tab === "branding"
        ? brandingTabIssues(values)
        : tab === "footer"
          ? footerTabIssues(values)
          : [];

  /**
   * The actual network call for the open tab. Mirrors sole-webapp's per-endpoint
   * save handlers (`InvoiceQuoteReferences`, `Branding.js`, `CommunicationPreference`)
   * — every tab in `BRANDING_RECORD_TABS` posts to the one save-branding record,
   * so it's sent in full (`values` already carries every tab's current state)
   * rather than just this tab's slice, or a sibling tab's saved fields would be
   * blanked out.
   */
  const persistTab = async (): Promise<Partial<SalesSettings>> => {
    if (tab === "settings") {
      const saved = await saveSeqNumbersApi({
        invoicePrefix: values.invoicePrefix,
        nextInvoiceNumber: values.nextInvoiceNumber,
        quotePrefix: values.quotePrefix,
        nextQuoteNumber: values.nextQuoteNumber,
      });
      // The editors cache the number a new invoice/quote starts with; without
      // this a new prefix wouldn't show on one for up to five minutes.
      void queryClient.invalidateQueries({ queryKey: ["next-invoice-number"] });
      void queryClient.invalidateQueries({ queryKey: ["next-quote-number"] });
      return saved;
    }

    if (tab === "branding") {
      let logo = values.logo;
      if (logo && logo.startsWith("data:")) {
        logo = await uploadLogoApi(logo);
      } else if (logo === null && stored.logo) {
        await removeLogoApi();
      }
      await saveBrandingApi({ ...values, logo });
      return { logo };
    }

    if (BRANDING_RECORD_TABS.includes(tab)) {
      await saveBrandingApi(values);
      return {};
    }

    // communication — only the switches that actually changed are sent.
    const tasks: Promise<void>[] = [];
    if (values.textMessagesEnabled !== stored.textMessagesEnabled) {
      tasks.push(enableTextMessageApi(values.textMessagesEnabled));
    }
    if (values.bccInvoiceEmails !== stored.bccInvoiceEmails) {
      tasks.push(
        saveNotificationPreferenceApi("invoice", values.bccInvoiceEmails),
      );
    }
    if (values.bccQuoteEmails !== stored.bccQuoteEmails) {
      tasks.push(saveNotificationPreferenceApi("quote", values.bccQuoteEmails));
    }
    if (values.remindInvoiceDue !== stored.remindInvoiceDue) {
      tasks.push(
        saveReminderPreferenceApi("inv_before", values.remindInvoiceDue),
      );
    }
    if (values.remindInvoiceOverdue !== stored.remindInvoiceOverdue) {
      tasks.push(
        saveReminderPreferenceApi("inv_after", values.remindInvoiceOverdue),
      );
    }
    if (values.remindQuoteExpiry !== stored.remindQuoteExpiry) {
      tasks.push(
        saveReminderPreferenceApi("quo_before", values.remindQuoteExpiry),
      );
    }
    await Promise.all(tasks);
    return {};
  };

  const onSave = async () => {
    if (issues.length > 0) {
      toast.error(issues[0].message);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const resolved = await persistTab();
      const slice = { ...tabSlice(tab, values), ...resolved };
      save(slice);
      // Only this tab's keys leave the draft; a sibling's edits stay open.
      setDraft(
        Object.fromEntries(
          Object.entries(draft ?? {}).filter(([key]) => !(key in slice)),
        ),
      );
      toast.success("Changes saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save changes",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={ReceiptText}
        title="Sales settings"
        description="Defaults for everything you send out — numbering, branding, what prints on a document, and how clients are reminded."
      />

      <Tabs value={tab} onValueChange={(next) => setTab(next as SalesTab)}>
        {/* Eight tabs is more than fits on a phone, so the row scrolls. */}
        <TabsList
          className="h-auto w-full flex-nowrap justify-start overflow-x-auto"
          data-usertour="sales-settings-tabs"
        >
          {SALES_TABS.map((entry) => (
            <TabsTrigger
              key={entry.id}
              value={entry.id}
              className="shrink-0"
              data-usertour={`sales-settings-tab-${entry.id}`}
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "settings" && <SettingsTab values={values} patch={patch} />}
      {tab === "branding" && <BrandingTab values={values} patch={patch} />}
      {tab === "footer" && <FooterTab values={values} patch={patch} />}
      {tab === "invoice-fields" && (
        <FieldsTab kind="Invoice" values={values} patch={patch} />
      )}
      {tab === "quote-fields" && (
        <FieldsTab kind="Quote" values={values} patch={patch} />
      )}
      {tab === "invoice-styling" && (
        <StylingTab kind="Invoice" values={values} patch={patch} />
      )}
      {tab === "quote-styling" && (
        <StylingTab kind="Quote" values={values} patch={patch} />
      )}
      {tab === "communication" && (
        <CommunicationTab values={values} patch={patch} />
      )}

      <TabFooter
        dirty={dirty}
        issue={issues[0]?.message}
        saving={saving}
        onSave={onSave}
      />
    </div>
  );
}
