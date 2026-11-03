"use client";

import * as React from "react";
import { useSetAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useSalesSettingsQuery } from "@/hooks/use-sales-settings-query";
import { useSession } from "@/components/auth/session-provider";
import { authNameAtom } from "@/lib/atoms";
import {
  accountingBasisFrom,
  bankDetailsFrom,
  businessDetailsFrom,
  EMPTY_PERSONAL_PROFILE,
  fetchPersonalProfile,
  saveAccountingBasis,
  saveBankDetails,
  saveBusinessDetails,
  savePersonalProfile,
  type BankDetailsForm,
  type BusinessDetailsForm,
  type PersonalProfileForm,
} from "@/lib/business-settings";
import {
  DEFAULT_TAX_RATE,
  fetchTaxRate,
  saveTaxRate,
  type TaxRateForm,
} from "@/lib/tax-settings";
import {
  removeLogoApi,
  saveBrandingApi,
  uploadLogoApi,
} from "@/lib/sales-settings-api";
import { useSalesSettings } from "@/lib/use-sales-settings";
import type {
  DocumentsSectionForm,
  TaxSectionForm,
} from "@/lib/settings";
import {
  DEFAULT_PREFERENCES,
  usePreferencesStore,
  type BusinessPreferences,
} from "@/stores/preferences";
import { useBusinessesStore } from "@/stores/businesses";
import { useSalesSettingsStore } from "@/stores/sales-settings";

/**
 * Settings, split by where each half actually lives.
 *
 * `useBusinessDetails` / `useBankDetails` read the open business's real record
 * and write it back to the API. `usePreferences` is the device-local
 * remainder — see `stores/preferences.ts` for why those three groups have
 * nowhere else to go yet.
 *
 * All three used to be one `sole-settings` store that invented its own
 * defaults and saved to localStorage while telling the user their business
 * details had been saved.
 */

/** The open business's details, straight off the server record. */
export function useBusinessDetails(): {
  values: BusinessDetailsForm;
  loading: boolean;
  save: (next: BusinessDetailsForm) => Promise<void>;
} {
  const { business, loading } = useActiveBusiness();
  const queryClient = useQueryClient();
  const renameBusiness = useBusinessesStore((state) => state.renameBusiness);

  const values = React.useMemo(
    () => businessDetailsFrom(business),
    [business],
  );

  const save = React.useCallback(
    async (next: BusinessDetailsForm) => {
      await saveBusinessDetails(next);

      /*
       * The switcher at the top of the rail reads the name from the businesses
       * store, so renaming has to reach it or the rail keeps the old name
       * until the next full load. Applied before the refetch rather than
       * instead of it: this is the optimistic half, the invalidate below is
       * what makes it true.
       */
      if (business?.id && next.businessName.trim()) {
        renameBusiness(business.id, next.businessName.trim());
      }

      // The saved record is the new source of truth for every screen reading
      // `useActiveBusiness`, so re-read it rather than patching a local copy.
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
    [business?.id, queryClient, renameBusiness],
  );

  return { values, loading, save };
}

/** The React Query key the Profile tab reads and writes through. */
const PERSONAL_PROFILE_QUERY_KEY = ["personal-profile"] as const;

/**
 * The account holder's own profile — name, mobile, (read-only) email.
 *
 * Unlike every other hook in this file, this one isn't read off
 * `useActiveBusiness` — these are facts about the signed-in person, the same
 * regardless of which of their businesses is open, so there's nothing to key
 * by business id and no stale-draft-after-switching risk the way the
 * business-scoped Settings sections have (see `useSectionDraft`).
 */
export function usePersonalProfile(): {
  values: PersonalProfileForm;
  loading: boolean;
  save: (next: PersonalProfileForm) => Promise<void>;
} {
  const query = useQuery({
    queryKey: PERSONAL_PROFILE_QUERY_KEY,
    queryFn: fetchPersonalProfile,
  });
  const queryClient = useQueryClient();
  const setAuthName = useSetAtom(authNameAtom);
  const { refresh: refreshSession } = useSession();

  const values = query.data ?? EMPTY_PERSONAL_PROFILE;

  const save = React.useCallback(
    async (next: PersonalProfileForm) => {
      await savePersonalProfile(next);

      // The device-local copy the dashboard header and greetings read,
      // updated optimistically the same way `useBusinessDetails` renames the
      // switcher before its own refetch lands.
      setAuthName(next.fullName.trim());

      await queryClient.invalidateQueries({ queryKey: PERSONAL_PROFILE_QUERY_KEY });
      // And the session itself, so `full_name` elsewhere (not just the
      // device-local greetings) agrees without waiting for a reload.
      await refreshSession();
    },
    [queryClient, refreshSession, setAuthName],
  );

  return { values, loading: query.isPending, save };
}

/** The payout account, same record and same save path. */
export function useBankDetails(): {
  values: BankDetailsForm;
  loading: boolean;
  save: (next: BankDetailsForm) => Promise<void>;
} {
  const { business, loading } = useActiveBusiness();
  const queryClient = useQueryClient();

  const values = React.useMemo(() => bankDetailsFrom(business), [business]);

  const save = React.useCallback(
    async (next: BankDetailsForm) => {
      await saveBankDetails(next);
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
    [queryClient],
  );

  return { values, loading, save };
}

/**
 * The device-local settings for the open business.
 *
 * `hydrated` matters for the same reason it does on the other persisted
 * stores: rehydration is deferred so the server and the first client render
 * agree, which means a reader sees the defaults for a tick. A Settings form
 * seeded during that tick would show a factory value over a stored one.
 */
export function usePreferences(): {
  values: BusinessPreferences;
  hydrated: boolean;
  patch: (values: Partial<BusinessPreferences>) => void;
} {
  const { business } = useActiveBusiness();
  const businessId = business?.id ?? null;

  /*
   * The stored entry, selected by reference. Do not merge inside a selector.
   *
   * Zustand selectors run through `useSyncExternalStore`, which compares what
   * the selector returns against the previous render's to decide whether
   * anything changed. A selector that spreads the defaults over the entry
   * builds a fresh object every call — never equal to the last one — so every
   * render scheduled another and React caught it as "The result of
   * getSnapshot should be cached to avoid an infinite loop".
   *
   * The raw entry's reference only changes when the stored value does. The
   * merge happens below, in a memo.
   */
  const stored = usePreferencesStore((state) =>
    businessId ? state.byBusiness[businessId] : undefined,
  );
  const patchStore = usePreferencesStore((state) => state.patch);

  /*
   * Defaults filled in once per real change, rather than per render — and
   * `DEFAULT_PREFERENCES` returned as-is when nothing is stored, so that case
   * is a constant reference too.
   */
  const values = React.useMemo<BusinessPreferences>(
    () => (stored ? { ...DEFAULT_PREFERENCES, ...stored } : DEFAULT_PREFERENCES),
    [stored],
  );

  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // Absent while rendering on the server, where there's no storage to attach.
    const store = usePreferencesStore.persist;
    if (!store) return;

    if (store.hasHydrated()) setHydrated(true);
    const unsubscribe = store.onFinishHydration(() => setHydrated(true));
    void store.rehydrate();
    return unsubscribe;
  }, []);

  const patch = React.useCallback(
    (next: Partial<BusinessPreferences>) => {
      if (!businessId) return;
      patchStore(businessId, next);
    },
    [businessId, patchStore],
  );

  return {
    // With no business open there is nothing to key by, so `stored` is
    // undefined and `values` is already `DEFAULT_PREFERENCES` — the honest
    // answer, rather than another business's entry.
    values,
    hydrated,
    patch,
  };
}

/* ------------------------------------------------------------------ *
 * Tax & GST
 * ------------------------------------------------------------------ */

/** The React Query key the Tax section writes and the editors read. */
export const TAX_RATE_QUERY_KEY = ["tax-settings"] as const;

/**
 * The Tax & GST section, assembled from the three places its fields live.
 *
 * The GST rate and whether it applies by default are one record on
 * `/v2/settings/tax-settings`; the accounting basis is `accounting_type` on
 * the business; BAS frequency and the financial year start have no column
 * anywhere and stay on the device. A save writes only the parts that changed,
 * so flipping a local-only dropdown doesn't post a tax rate.
 */
export function useTaxSettings(): {
  values: TaxSectionForm;
  loading: boolean;
  save: (next: TaxSectionForm) => Promise<void>;
} {
  const { business, loading: businessLoading } = useActiveBusiness();
  const queryClient = useQueryClient();
  const { values: prefs, patch: patchPrefs } = usePreferences();

  const rateQuery = useQuery({
    queryKey: TAX_RATE_QUERY_KEY,
    queryFn: fetchTaxRate,
  });
  // The whole row, not just the two fields the form shows — a save has to
  // carry its `id` back so the endpoint updates it instead of adding a second
  // GST rate on every click.
  const rate: TaxRateForm = rateQuery.data ?? DEFAULT_TAX_RATE;

  const storedBasis = accountingBasisFrom(business);

  const values = React.useMemo<TaxSectionForm>(
    () => ({
      gstRegistered: rate.isDefault,
      gstRate: rate.percentage,
      rateMode: rate.followsCountry ? "country" : "custom",
      accountingBasis: storedBasis,
      basFrequency: prefs.tax.basFrequency,
      financialYearStart: prefs.tax.financialYearStart,
    }),
    [rate.isDefault, rate.percentage, rate.followsCountry, storedBasis, prefs.tax],
  );

  const save = React.useCallback(
    async (next: TaxSectionForm) => {
      const followsCountry = next.rateMode === "country";
      const registrationChanged = next.gstRegistered !== rate.isDefault;
      const rateChanged =
        registrationChanged ||
        followsCountry !== rate.followsCountry ||
        (!followsCountry && next.gstRate.trim() !== rate.percentage.trim());

      if (rateChanged) {
        await saveTaxRate(
          {
            ...rate,
            // Following the country, the stored figure is only what older apps
            // display; the server prices documents from the registry by date.
            percentage: followsCountry && rate.countryRate !== null ? String(rate.countryRate) : next.gstRate,
            isDefault: next.gstRegistered,
            followsCountry,
          },
          // The switch is the person saying whether they're registered — stored
          // on the business only when they flipped it.
          registrationChanged ? { taxRegistered: next.gstRegistered } : {},
        );
        await queryClient.invalidateQueries({ queryKey: TAX_RATE_QUERY_KEY });
        // The invoice and quote editors read the same record through
        // `fetchInvoiceTaxSettings` to decide a new line's GST — leaving that
        // cached would have a document disagree with the setting that made it.
        await queryClient.invalidateQueries({
          queryKey: ["invoice-tax-settings"],
        });
        // The invoice editor reads its rate and whether GST is offered from the
        // country context (`tax.effective`), so it has to be re-asked too —
        // otherwise a changed rate wouldn't reach new invoices for up to an hour.
        await queryClient.invalidateQueries({ queryKey: ["country-context"] });
      }

      if (next.accountingBasis !== storedBasis) {
        await saveAccountingBasis(next.accountingBasis);
        await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      }

      patchPrefs({
        tax: {
          basFrequency: next.basFrequency,
          financialYearStart: next.financialYearStart,
        },
      });
    },
    [rate, storedBasis, queryClient, patchPrefs],
  );

  return {
    values,
    loading: rateQuery.isPending || businessLoading,
    save,
  };
}

/* ------------------------------------------------------------------ *
 * Invoice & quote defaults
 * ------------------------------------------------------------------ */

/**
 * The Invoice & quote defaults section — the branding record plus the local
 * remainder.
 *
 * The notes and the logo are the same `save-branding` record and the same
 * profile picture the Sales settings screen edits, so this reads them from the
 * one shared store rather than keeping a second copy. `saveBrandingApi` is
 * given the whole record for the reason its own module note gives: the
 * endpoint replaces every field it's sent, so a partial body would blank out
 * whatever the Sales screen's other tabs had saved.
 *
 * `ready` is what the caller gates Save on. Posting before the GET has landed
 * would write this screen's factory defaults over the account's real branding.
 */
export function useDocumentDefaults(): {
  values: DocumentsSectionForm;
  ready: boolean;
  save: (next: DocumentsSectionForm) => Promise<void>;
} {
  const salesQuery = useSalesSettingsQuery();
  const { settings: sales } = useSalesSettings();
  const patchSales = useSalesSettingsStore((state) => state.patch);
  const { values: prefs, patch: patchPrefs } = usePreferences();

  const values = React.useMemo<DocumentsSectionForm>(
    () => ({
      ...prefs.documents,
      invoiceNotes: sales.invoiceNotes,
      quoteNotes: sales.quoteNotes,
      logo: sales.logo,
    }),
    [prefs.documents, sales.invoiceNotes, sales.quoteNotes, sales.logo],
  );

  const save = React.useCallback(
    async (next: DocumentsSectionForm) => {
      // A freshly picked file is still a data URL at this point; it becomes a
      // served URL only once the upload answers. Same order the Branding tab
      // uses — upload (or remove) first, then save the record that points at it.
      let logo = next.logo;
      if (logo && logo.startsWith("data:")) {
        logo = await uploadLogoApi(logo);
      } else if (logo === null && sales.logo) {
        await removeLogoApi();
      }

      await saveBrandingApi({
        ...sales,
        invoiceNotes: next.invoiceNotes,
        quoteNotes: next.quoteNotes,
        logo,
      });

      patchSales({
        invoiceNotes: next.invoiceNotes,
        quoteNotes: next.quoteNotes,
        logo,
      });
      patchPrefs({
        documents: {
          paymentTermsDays: next.paymentTermsDays,
          quoteExpiryDays: next.quoteExpiryDays,
          gstTreatment: next.gstTreatment,
          incomeAccount: next.incomeAccount,
        },
      });
    },
    [sales, patchSales, patchPrefs],
  );

  return { values, ready: !salesQuery.isPending, save };
}
