"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { CountryCode } from "libphonenumber-js";

import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Field } from "@/components/documents/field";
import { BusinessPreviewCard } from "@/components/onboarding/business-preview-card";
import { OnboardingCard } from "@/components/onboarding/onboarding-card";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { authEmailAtom, authNameAtom } from "@/lib/atoms";
import {
  DEFERRED_BUSINESS_DEFAULTS,
  ONBOARDING_DONE_HREF,
  companyProfileIssues,
  type AbrRecord,
  type CompanyProfileDraft,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/auth/session-provider";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useBusinessesStore } from "@/stores/businesses";
import { useOnboardingFlowStore } from "@/stores/onboarding-flow";
import { DEFAULT_TAX_RATE, saveTaxRate } from "@/lib/tax-settings";
import {
  saveAccountName,
  saveBusinessCountry,
  saveBusinessDetails,
} from "@/lib/business-settings";
import {
  useCountriesQuery,
  useDetectedCountryQuery,
} from "@/hooks/use-countries-query";
import { countryByIso2 } from "@/lib/countries";
import { lookupBusiness } from "@/lib/business-lookup";
import {
  formatIdentifier,
  identifierError,
  maskExample,
  registrationField,
} from "@/lib/business-identifier";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";

const LOOKUP_DEBOUNCE_MS = 400;

export function CompanyProfileStep() {
  const router = useRouter();
  const email = useAtomValue(authEmailAtom);
  const setAuthName = useSetAtom(authNameAtom);
  const {
    data: countries = [],
    isPending: countriesPending,
    isError: countriesError,
  } = useCountriesQuery();
  const queryClient = useQueryClient();
  const activeId = useBusinessesStore((state) => state.activeId);
  const { refresh: refreshSession } = useSession();
  const { business: activeBusinessRecord } = useActiveBusiness();
  const activeBusinessId = activeBusinessRecord?.id ?? null;
  const renameBusiness = useBusinessesStore((state) => state.renameBusiness);

  const draft = useOnboardingFlowStore((state) => state.profile);
  const patchProfile = useOnboardingFlowStore((state) => state.patchProfile);

  const [edited, setEdited] = React.useState(false);
  const [abnTouched, setAbnTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [checkingAbn, setCheckingAbn] = React.useState(false);
  const [record, setRecord] = React.useState<AbrRecord | null>(null);
  const [lookupNote, setLookupNote] = React.useState<string | null>(null);

  const patch = (values: Partial<CompanyProfileDraft>) => {
    setEdited(true);
    patchProfile(values);
  };

  /*
   * Pre-select the country the visitor is probably in, from their IP (or
   * their timezone when the IP can't say).
   *
   * Only into an empty field, so it never overrides a choice — including one
   * made while the lookup was still in flight — and only a country on the
   * list, so it can't select something that would fail on save. `patchProfile`
   * rather than `patch`: a guess isn't the person's edit, so it mustn't wake
   * the validation up. And `suggested` keeps the hint saying it was a guess,
   * because this is the one answer here that can't be changed later.
   */
  const { data: detectedIso2 } = useDetectedCountryQuery();
  const [suggested, setSuggested] = React.useState(false);

  React.useEffect(() => {
    if (draft.countryIso2 || !detectedIso2) return;
    if (!countryByIso2(countries, detectedIso2)) return;
    patchProfile({ countryIso2: detectedIso2 });
    setSuggested(true);
  }, [detectedIso2, countries, draft.countryIso2, patchProfile]);

  const selectedCountry = countryByIso2(countries, draft.countryIso2);
  const identifierField = registrationField(
    selectedCountry?.identifierSchema ?? [],
  );
  const canLookUp = Boolean(selectedCountry?.hasLookup);
  const identifierPlaceholder = maskExample(identifierField);
  const identifierHint = React.useMemo(() => {
    if (!identifierField) return undefined;
    const digits = identifierField.pattern?.match(/\\d\{(\d+)\}/)?.[1];
    const shape = digits ? `${digits} digits` : "as issued";
    // Always "if applicable": this screen no longer requires the number
    // whatever the country's own registry says. See `companyProfileIssues`.
    return `If applicable — ${shape}.`;
  }, [identifierField]);


  const identifierMinLength = React.useMemo(() => {
    const digits = identifierField?.pattern?.match(/\\d\{(\d+)\}\$?$/)?.[1];
    return digits ? Number(digits) : undefined;
  }, [identifierField]);

  const identifierMaxLength = React.useMemo(() => {
    if (identifierField?.mask) return identifierField.mask.length;
    const digits = identifierField?.pattern?.match(/\\d\{(\d+)\}/)?.[1];
    return digits ? Number(digits) : undefined;
  }, [identifierField]);

  const issues = companyProfileIssues(
    draft,
    identifierField,
    selectedCountry?.name,
  );
  const issueFor = (key: string) =>
    edited || (key === "abn" && abnTouched)
      ? issues.find((issue) => issue.key === key)?.message
      : undefined;

  const lastLookedUp = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!canLookUp || !identifierField) return;

    const value = draft.abn.trim();
    // Only a number this country would accept is worth asking about.
    if (!value || identifierError(identifierField, value)) return;

    // Keyed on the digits, so reformatting what is already looked up (adding a
    // space) doesn't ask again.
    const key = `${draft.countryIso2}:${value.replace(/\s/g, "")}`;
    if (lastLookedUp.current === key) return;

    let cancelled = false;
    // A short wait so finishing the last digit of a valid number, then
    // correcting it, is one lookup rather than two.
    const timer = setTimeout(() => {
      lastLookedUp.current = key;
      setCheckingAbn(true);

      void lookupBusiness(value, draft.countryIso2)
        .then((result) => {
          if (cancelled) return;

          if (!result.ok) {
            /*
             * Not an error state. A register that is down, or a number it has
             * never heard of, leaves everything typeable by hand — and this
             * ran on its own rather than being asked for, so it must not
             * interrupt. The name field says what happened instead.
             */
            setLookupNote(result.message);
            setRecord(null);
            return;
          }

          const { record: found } = result;
          setLookupNote(null);
          setRecord({
            businessName: found.name,
            entityType: found.entityType ?? "Unknown",
            structure: DEFERRED_BUSINESS_DEFAULTS.structure,
            // The register not publishing a GST status is not the same as it
            // saying "no", so an absent value falls back to the default.
            gstRegistered:
              found.taxRegistered ?? DEFERRED_BUSINESS_DEFAULTS.gstRegistered,
            gstFromRegister:
              found.taxRegistered !== undefined && found.taxRegistered !== null,
          });

          // Filled, never overwritten: the register's legal name often isn't
          // the name someone invoices under, and replacing what they just
          // typed is the rudest thing a form can do.
          patchProfile({
            abn: formatIdentifier(identifierField, value),
            ...(draft.businessName.trim() ? {} : { businessName: found.name }),
          });
        })
        .finally(() => {
          if (!cancelled) setCheckingAbn(false);
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.abn, draft.countryIso2, canLookUp, identifierField]);

  const onNext = async () => {
    setEdited(true);
    if (issues.length > 0 || saving) return;

    setSaving(true);
    const businessName = draft.businessName.trim();
    // GST on by default, following the country's standard rate (10% AU, 15% NZ)
    // rather than a fixed 10% — the server prices from the registry by date, so
    // the business's country, saved just below, decides the rate. Registration is
    // only stored when the business register actually said; otherwise it stays
    // unset, which counts as registered.
    const gstOn =
      record?.gstRegistered ?? DEFERRED_BUSINESS_DEFAULTS.gstRegistered;
    void saveTaxRate(
      { ...DEFAULT_TAX_RATE, isDefault: gstOn, followsCountry: true },
      record?.gstFromRegister ? { taxRegistered: gstOn } : {},
    ).catch(() => {});

    if (businessName) renameBusiness(activeId, businessName);

    try {
      if (activeBusinessId) {
        await saveBusinessCountry(
          activeBusinessId,
          draft.countryIso2,
          draft.abn,
        );
      }

      await saveBusinessDetails({
        businessName,
        abn: draft.abn.trim(),
        industryId: null,
        companyType: record?.structure ?? DEFERRED_BUSINESS_DEFAULTS.structure,
        addressSearch: "",
        addressLine1: "",
        city: "",
        state: "",
        postcode: "",
        country: "",
        phone: draft.mobile.trim(),
        email: email || "",
        ndisNumber: "",
      });
      
      await saveAccountName(draft.fullName);
      setAuthName(draft.fullName.trim());

      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      // The country may have just changed (and GST with it), and every form reads
      // its labels, rate and identifier rules from the country context.
      await queryClient.invalidateQueries({ queryKey: ["country-context"] });
      // And the session, so the rail and the greeting pick the name up without
      // waiting for a reload.
      await refreshSession();
      toast.success("Company profile saved");
      // `replace`, so Back out of the celebration doesn't land on a form that has
      // already been submitted.
      router.replace(ONBOARDING_DONE_HREF);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Couldn't save your profile. Try again.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const abnIssue = issueFor("abn");

  return (
    <OnboardingLayout preview={<BusinessPreviewCard />}>
      <OnboardingCard
        title="Tell us about your business"
        description="This is what appears on your invoices, and what we'll shape your workspace around. Your GST registration, business structure and the rest are in Settings whenever you want them."
        onNext={() => void onNext()}
        busy={saving}
        nextDisabled={edited && issues.length > 0}
      >
        {/*
          First, because it changes what everything under it means — the ABN
          field is Australia's registration number, and the currency and tax
          label on every figure follow from this answer.
        */}
        <Field
          label="Country"
          htmlFor="country"
          required
          error={issueFor("countryIso2")}
          hint={
            issueFor("countryIso2")
              ? undefined
              : suggested && selectedCountry
                ? `We've picked ${selectedCountry.name} based on your location — change it if your business is registered somewhere else. This sets your currency and tax setup, and it can't be changed later.`
                : "Where your business is registered. This sets your currency and tax setup — and it can't be changed later, so it's worth getting right."
          }
        >
          <Select
            value={draft.countryIso2}
            disabled={countriesPending}
            onValueChange={(value) => {
              // `patchProfile`, not `patch`: choosing a country shouldn't wake
              // the validation on the other fields — that waits for the button.
              patchProfile({ countryIso2: value });
              setSuggested(false);
            }}
          >
            <SelectTrigger
              id="country"
              aria-label="Country"
              aria-invalid={!!issueFor("countryIso2")}
              className={cn(
                "h-10",
                issueFor("countryIso2") &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            >
              <SelectValue
                placeholder={
                  countriesPending ? "Loading…" : "Choose your country"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country.iso2} value={country.iso2}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {countriesError && (
            <p className="text-xs text-destructive">
              We couldn&apos;t load the country list. Refresh and try again.
            </p>
          )}
        </Field>

        {/*
          Whatever this country calls its business number.
          
          The label, the placeholder, whether it's required and how it's
          validated all come from the Country Registry — an ABN is Australia's
          answer, not the question. Hidden entirely for a country that asks for
          no number at all, rather than shown as an empty "ABN" nobody in that
          country has.
        */}
        {identifierField && (
        <Field
          label={identifierField.label}
          htmlFor="abn"
          // Never required on this screen, whatever the registry says —
          // the lookup it would drive depends on a credential that isn't
          // always configured. See `companyProfileIssues`.
          error={abnIssue}
          // The confirmation says more than the hint does, so it replaces it.
          hint={abnIssue || record ? undefined : identifierHint}
        >
          {/*
            No "check this" button: the lookup runs on its own once the number
            is valid. The spinner sits inside the field so the row doesn't
            reflow when it appears and disappears.
          */}
          <div className="relative">
            <Input
              id="abn"
              inputMode="numeric"
              value={draft.abn}
              onChange={(event) => {
                // Only the ABN's own error wakes up; the other fields wait for
                // the button.
                setAbnTouched(true);
                patchProfile({ abn: event.target.value });
              }}
              // From the registry's own mask, so the example is this country's
              // format rather than an Australian one with the wrong digits.
              placeholder={identifierPlaceholder}
              minLength={identifierMinLength}
              maxLength={identifierMaxLength}
              aria-invalid={!!abnIssue}
              aria-busy={checkingAbn}
              className={cn(
                "h-10 tabular",
                canLookUp && "pr-9",
                abnIssue && "border-destructive focus-visible:ring-destructive",
              )}
            />
            {checkingAbn && (
              <Loader2
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
          </div>
          {record && !abnIssue && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
              <Check className="size-3.5 shrink-0" aria-hidden />
              {record.businessName}
              {record.entityType && record.entityType !== "Unknown" ? (
                <span className="font-normal text-muted-foreground">
                  · {record.entityType}
                </span>
              ) : null}
            </p>
          )}
        </Field>
        )}

        <Field
          label="Business name"
          htmlFor="businessName"
          // Always required. It used to be the alternative to the number —
          // "one or the other" — which let someone through with neither a
          // verified identity nor a lookup to fix it later.
          required
          error={issueFor("businessName")}
          hint={
            issueFor("businessName")
              ? undefined
              : record
                ? `From the ${identifierField?.label ?? "business"} register — change it if you invoice under another name.`
                : lookupNote
                  ? // The automatic lookup found nothing. Said here rather than
                    // as an error: it blocks nothing, and the name is typeable.
                    `${lookupNote} Enter your business name below.`
                  : canLookUp
                    ? `Filled in for you from your ${identifierField?.label ?? "business number"}.`
                    : undefined
          }
        >
          <Input
            id="businessName"
            value={draft.businessName}
            onChange={(event) => patch({ businessName: event.target.value })}
            placeholder="Turner Consulting"
            autoComplete="organization"
            aria-invalid={!!issueFor("businessName")}
            className={cn(
              "h-10",
              issueFor("businessName") &&
              "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>

        {/*
          Who holds the account. Asked here rather than at sign-up: that step
          is "confirm it's you", and a name is not a credential — it belongs
          beside the business it prints next to on an invoice.
        */}
        <Field
          label="Your name"
          htmlFor="fullName"
          required
          error={issueFor("fullName")}
          hint={
            issueFor("fullName")
              ? undefined
              : "The person behind the business — shown on your invoices and quotes."
          }
        >
          <Input
            id="fullName"
            value={draft.fullName}
            onChange={(event) => patch({ fullName: event.target.value })}
            placeholder="Jane Smith"
            autoComplete="name"
            aria-invalid={!!issueFor("fullName")}
            className={cn(
              "h-10",
              issueFor("fullName") &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>

        {/*
          Validated against the country chosen above rather than a fixed
          shape — a valid AU mobile is routinely not a valid NZ one, and
          there's no register to fall back on the way the ABN has.
        */}
        <Field
          label="Mobile number"
          htmlFor="mobile"
          required
          error={issueFor("mobile")}
          hint={
            issueFor("mobile")
              ? undefined
              : "So we — and your clients — can reach you."
          }
        >
          <PhoneInput
            id="mobile"
            value={draft.mobile}
            defaultCountry={(draft.countryIso2 || "AU") as CountryCode}
            onChange={(value) => patch({ mobile: value })}
            required
            invalid={!!issueFor("mobile")}
          />
        </Field>

      </OnboardingCard>
    </OnboardingLayout>
  );
}
