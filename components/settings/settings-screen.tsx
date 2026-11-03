"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAtomValue } from "jotai";

import { AccountSharingSection } from "@/components/settings/account-sharing/account-sharing-section";
import { BankSection } from "@/components/settings/bank-section";
import { BusinessSection } from "@/components/settings/business-section";
import { DangerZoneSection } from "@/components/settings/danger-zone-section";
// import { DocumentsSection } from "@/components/settings/documents-section";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { ProfileCard } from "@/components/settings/profile-card";
import { ProfileSection } from "@/components/settings/profile-section";
import { SecuritySection } from "@/components/settings/security-section";
import { SubscriptionSection } from "@/components/settings/subscription-section";
import { TaxSection } from "@/components/settings/tax-section";
import {
  bankDraftAtom,
  businessDraftAtom,
  // documentsDraftAtom,
  notificationsDraftAtom,
  taxDraftAtom,
} from "@/lib/atoms";
import {
  SETTINGS_SECTIONS,
  isSettingsSection,
  sameValues,
  type SettingsSection,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
  useBankDetails,
  useBusinessDetails,
  // useDocumentDefaults,
  usePreferences,
  useTaxSettings,
} from "@/hooks/use-business-settings";
import { useActiveBusiness } from "@/hooks/use-active-business";

const DEFAULT_SECTION: SettingsSection = "profile";

/**
 * Which tab is open, read from (and written back to) the URL's `?section=`
 * query param — `/settings?section=business`, `/settings?section=tax` — the
 * same param name the rest of the app already deep-links with (the trial
 * banner's "Subscribe now", the invoice/quote choosers, payroll's billing
 * link). A second param name here would just be a second thing those links
 * have to agree with this screen about.
 *
 * The param is the only source of truth — no atom alongside it to go stale —
 * so a tab is linkable, survives a refresh, and the back button steps through
 * tabs the way any other URL-driven navigation does.
 */
function useSettingsSection(): [SettingsSection, (next: SettingsSection) => void] {
  const router = useRouter();
  const pathname = usePathname() ?? "/settings";
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(
    () => new URLSearchParams(rawSearchParams?.toString() ?? ""),
    [rawSearchParams],
  );

  const param = searchParams.get("section");
  const section = isSettingsSection(param ?? "") ? (param as SettingsSection) : DEFAULT_SECTION;

  const setSection = React.useCallback(
    (next: SettingsSection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return [section, setSection];
}

export function SettingsScreen() {
  const [section, setSection] = useSettingsSection();

  // Each section gates on its own source now — the server record for
  // business and bank, `usePreferences` for the three local ones — so there is
  // no single store for this screen to wait on.

  return (
    <div className="space-y-[15px]">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your business, tax and billing details.
        </p>
      </div>

      <ProfileCard />

      <div className="flex flex-col gap-[15px] lg:flex-row">
        <SettingsNav active={section} onChange={setSection} />
        <div className="min-w-0 flex-1">
          {section === "profile" && <ProfileSection />}
          {section === "business" && <BusinessSection />}
          {/* {section === "documents" && <DocumentsSection />} */}
          {section === "tax" && <TaxSection />}
          {section === "bank" && <BankSection />}
          {section === "security" && <SecuritySection />}
          {section === "subscription" && <SubscriptionSection />}
          {section === "account-sharing" && <AccountSharingSection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "danger-zone" && <DangerZoneSection />}
        </div>
      </div>
    </div>
  );
}

function SettingsNav({
  active,
  onChange,
}: {
  active: SettingsSection;
  onChange: (next: SettingsSection) => void;
}) {
  const dirty = useDirtySections();

  return (
    <nav
      data-tour="settings-sections"
      data-usertour="settings-sections"
      aria-label="Settings sections"
      className="lg:sticky lg:top-6 lg:h-fit lg:w-56 lg:shrink-0"
    >
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {SETTINGS_SECTIONS.map((entry) => {
          const isActive = entry.id === active;
          return (
            <li key={entry.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onChange(entry.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  entry.id === "danger-zone"
                    ? isActive
                      ? "bg-destructive/10 font-medium text-destructive"
                      : "text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                    : isActive
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {dirty[entry.id] && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-primary"
                    aria-label="Unsaved changes"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Which sections hold unsaved edits — drives the dot in the nav.
 *
 * Each draft is compared against whatever that section's own source of truth
 * is now, which is no longer one place: the business record for business and
 * bank, the tax-settings record and the business record for tax, the branding
 * record for documents, and the device-local preferences for what's left of
 * each. Every one of those sources is read through the same hook the section
 * itself uses, so the dot can't disagree with the Save button beside it.
 */
function useDirtySections(): Partial<Record<SettingsSection, boolean>> {
  const { values: businessStored } = useBusinessDetails();
  const { values: bankStored } = useBankDetails();
  const { values: taxStored } = useTaxSettings();
  // const { values: documentsStored } = useDocumentDefaults();
  const notificationsStored = useNotificationSettings();
  const { business } = useActiveBusiness();
  const businessId = business?.id ?? null;

  const businessDraft = useAtomValue(businessDraftAtom);
  // const documentsDraft = useAtomValue(documentsDraftAtom);
  const taxDraft = useAtomValue(taxDraftAtom);
  const bankDraft = useAtomValue(bankDraftAtom);
  const notificationsDraft = useAtomValue(notificationsDraftAtom);

  /*
   * A draft tagged with some OTHER business's id isn't "unsaved changes" on
   * this one — it's a business that's been switched away from, and the dot
   * must not light up a section nobody has touched yet on the one that's
   * actually open. See `useSectionDraft`.
   */
  const isDirty = <T extends object>(
    draft: { businessId: string; values: T } | null,
    stored: T,
  ) => draft?.businessId === businessId && !sameValues(draft.values, stored);

  return {
    business: isDirty(businessDraft, businessStored),
    // documents: isDirty(documentsDraft, documentsStored),
    tax: isDirty(taxDraft, taxStored),
    bank: isDirty(bankDraft, bankStored),
    notifications: isDirty(notificationsDraft, notificationsStored),
  };
}
