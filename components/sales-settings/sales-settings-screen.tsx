"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandingTab } from "@/components/sales-settings/branding-tab";
import { CommunicationTab } from "@/components/sales-settings/communication-tab";
import { FieldsTab } from "@/components/sales-settings/fields-tab";
import { StylingTab } from "@/components/sales-settings/styling-tab";
import { FooterTab } from "@/components/sales-settings/footer-tab";
import { SettingsTab } from "@/components/sales-settings/settings-tab";
import { TabFooter } from "@/components/sales-settings/tab-shell";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { salesDraftAtom, salesTabAtom } from "@/lib/atoms";
import {
  SALES_TABS,
  brandingTabIssues,
  migrateSalesSettings,
  footerTabIssues,
  settingsTabIssues,
  tabDirty,
  tabSlice,
  type SalesSettings,
  type SalesTab,
} from "@/lib/sales-settings";
import {
  enableTextMessageApi,
  fetchSalesSettings,
  removeLogoApi,
  saveBrandingApi,
  saveNotificationPreferenceApi,
  saveReminderPreferenceApi,
  saveSeqNumbersApi,
  uploadLogoApi,
} from "@/lib/sales-settings-api";
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
  const queryClient = useQueryClient();
  const writeThrough = useSalesSettingsStore((state) => state.patch);
  /**
   * What the server holds, read fresh every time this screen opens.
   *
   * Nothing here comes from the shared store or a cache: `gcTime: 0` drops the
   * answer when the screen unmounts, and `refetchOnMount: "always"` reads it
   * again on the next visit, so every visit starts on the loading skeleton and
   * ends on what is actually saved. The tab and the unsaved edits are plain
   * state of this component for the same reason — leaving the page throws them
   * away rather than carrying them to the next visit, and nothing is written
   * until Save Changes is pressed.
   */
  const query = useQuery({
    queryKey: ["sales-settings", "screen"],
    queryFn: fetchSalesSettings,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const stored = React.useMemo(
    () => migrateSalesSettings(query.data),
    [query.data],
  );
  const [tab, setTab] = React.useState<SalesTab>("settings");
  const [draft, setDraft] = React.useState<Partial<SalesSettings>>({});
  const [saving, setSaving] = React.useState(false);
  /**
   * True while the saved settings are being read back after a save. The page
   * shows its loading skeleton for that moment, the same as a first visit, so
   * what ends up on screen is what the server actually holds.
   */
  const [reloading, setReloading] = React.useState(false);

  /**
   * One draft across the whole screen, but every save and dirty check is scoped
   * to the open tab's keys — so an edit left open on another tab can neither be
   * saved by accident nor reverted by a sibling's save.
   */
  const values = { ...stored, ...draft } as SalesSettings;
  const patch = (next: Partial<SalesSettings>) =>
    setDraft((current) => ({ ...current, ...next }));

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
      const uploadingLogo = !!logo && logo.startsWith("data:");
      if (logo && uploadingLogo) {
        logo = await uploadLogoApi(logo);
      } else if (logo === null && stored.logo) {
        await removeLogoApi();
      }
      await saveBrandingApi({ ...values, logo });
      if (uploadingLogo) {
        track(EVENTS.INVOICE_BRANDING_UPLOAD, { source: "sales_settings" });
      }
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
      // Only this tab's keys leave the draft; a sibling's edits stay open.
      setDraft((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !(key in slice)),
        ),
      );
      toast.success("Changes saved");
      await reloadAfterSave();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save changes",
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * Reads the settings back from the server after a save, and refreshes what
   * else was cached from them.
   *
   * The other screens that use these settings (the invoice and quote editors,
   * the business settings) keep their own cached copies, so those are marked
   * stale; and the fresh answer is written through to the shared store they
   * read, so a layout or numbering change shows there without waiting. This
   * screen itself only ever reads the server's answer.
   */
  const reloadAfterSave = async () => {
    setReloading(true);
    try {
      void queryClient.invalidateQueries({ queryKey: ["invoice-branding"] });
      void queryClient.invalidateQueries({ queryKey: ["next-invoice-number"] });
      void queryClient.invalidateQueries({ queryKey: ["next-quote-number"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-settings"] });
      const fresh = await queryClient.fetchQuery({
        queryKey: ["sales-settings", "screen"],
        queryFn: fetchSalesSettings,
        staleTime: 0,
      });
      writeThrough(fresh);
    } catch {
      // The save itself worked; the screen simply carries on with what it has.
    } finally {
      setReloading(false);
    }
  };

  // Failed to load: say so, rather than painting defaults that a save would write.
  if (query.isError && !query.data) {
    return (
      <div className="space-y-[15px]">
        <PageHeader
          icon={ReceiptText}
          title="Sales settings"
          description="Defaults for everything you send out — numbering, branding, what prints on a document, and how clients are reminded."
        />
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load your sales settings.
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  /*
   * Held until the saved settings are in, on every visit and after every save.
   */
  if (query.isPending || query.isFetching || reloading) {
    return <SalesSettingsSkeleton />;
  }

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

      <div data-usertour={`sales-tab-${tab}`}>
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
      </div>

      <TabFooter
        dirty={dirty}
        issue={issues[0]?.message}
        saving={saving}
        onSave={onSave}
      />
    </div>
  );
}

/** The screen's shape while the saved settings load: header, tabs, one section. */
function SalesSettingsSkeleton() {
  return (
    <div className="space-y-[15px]" aria-busy aria-label="Loading sales settings">
      <PageHeader
        icon={ReceiptText}
        title="Sales settings"
        description="Defaults for everything you send out — numbering, branding, what prints on a document, and how clients are reminded."
      />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-32 shrink-0 rounded-md" />
        ))}
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
