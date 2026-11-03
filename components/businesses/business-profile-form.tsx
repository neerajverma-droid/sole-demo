"use client";

import * as React from "react";

import {
  Building2,
  Image as ImageIcon,
  Landmark,
  MapPin,
  SlidersHorizontal,
  User,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { FormSection } from "@/components/ui/form-section";
import { WizardDropzone } from "@/components/bulk/wizard-parts";
import { Field } from "@/components/documents/field";
import { AddressAutocomplete } from "@/components/documents/address-autocomplete";
import { EMAIL_PATTERN } from "@/lib/contacts";
import {
  ACCOUNTING_BASES,
  BUSINESS_TYPES,
  NDIS_INDUSTRY,
  NDIS_NUMBER_PLACEHOLDER,
  ndisNumberError,
} from "@/lib/settings";
import {
  identifierError,
  maskExample,
  registrationField,
  type CountryIdentifierField,
} from "@/lib/business-identifier";
import {
  bankAccountField,
  bankBranchField,
  bankFieldHelp,
  type CountryContext,
} from "@/lib/country-context";
import { countryByIso2, type Country } from "@/lib/countries";
import type { CountryCode } from "libphonenumber-js";
import { useCountryContext } from "@/hooks/use-country-context";
import { useAddressRules } from "@/hooks/use-address-rules";
import { LockedCountryInput } from "@/components/documents/locked-country-field";
import { toast } from "sonner";
import { useIndustriesQuery } from "@/hooks/use-industries-query";
import type { ApiBusinessDetail } from "@/lib/businesses";
import type { IndustryOption } from "@/lib/industries";
import { getCountryCallingAndPhoneNumber } from "@/lib/phone";
import { cn } from "@/lib/utils";

const DEFAULT_CALLING_CODE = "+61";

/**
 * Australia's business number, for the moment before the country is known.
 *
 * Every existing business is Australian, so this is the right guess — and it
 * is only a guess: once `/country-context` answers, the real field replaces it.
 * Matches the registry's own AU entry exactly.
 */
const AU_REGISTRATION_FIELD: CountryIdentifierField = {
  key: "business_registration_number",
  label: "ABN",
  required: true,
  pattern: "^\\d{11}$",
  mask: "99 999 999 999",
  validator: "abn_mod89",
  sameAs: null,
};

/**
 * The active business's country in the shape `/countries` returns, so the
 * add-business picker always has it to show even before (or without) the
 * list loading.
 */
function countryFromContext(ctx: CountryContext): Country {
  return {
    iso2: ctx.iso2,
    name: ctx.name,
    currency: ctx.currency,
    phoneDialCode: ctx.phoneDialCode,
    taxType: ctx.taxType,
    identifierSchema: ctx.identifierSchema,
    hasLookup: ctx.hasIdentifierLookup,
  };
}

/**
 * The countries the add-business picker offers: the live list, with the
 * active business's own country guaranteed to be among them.
 */
export function newBusinessCountryOptions(
  countries: Country[],
  ctx: CountryContext,
): Country[] {
  return countryByIso2(countries, ctx.iso2)
    ? countries
    : [countryFromContext(ctx), ...countries];
}

/** The chosen country's row, or null if it's neither listed nor the active one. */
export function newBusinessCountry(
  countries: Country[],
  iso2: string,
  ctx: CountryContext,
): Country | null {
  return countryByIso2(newBusinessCountryOptions(countries, ctx), iso2);
}

/**
 * The business number a country asks for — ABN, NZBN — with Australia's as
 * the guess while nothing better is known, the same fallback the form uses.
 */
export function countryRegistrationField(
  schema: CountryIdentifierField[] | null | undefined,
): CountryIdentifierField {
  return registrationField(schema ?? []) ?? AU_REGISTRATION_FIELD;
}

/**
 * The business details step, as one value.
 *
 * Flat rather than nested, because that's what the form is — a screen of fields
 * with no branching. `industry` starts empty so the Select shows a placeholder
 * instead of asserting an industry nobody chose, which is the difference between
 * a required field and a pre-answered one.
 */
export type BusinessProfileDraft = {
  email: string;
  businessName: string;
  abn: string;
  industry: string;
  accountingBasis: (typeof ACCOUNTING_BASES)[number];
  businessType: (typeof BUSINESS_TYPES)[number];
  companyName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  ndisNumber: string;
  bankName: string;
  bsb: string;
  accountHolder: string;
  accountNumber: string;
  addressSearch: string;
  addressLine1: string;
  country: string;
  city: string;
  state: string;
  postcode: string;
};

export const EMPTY_BUSINESS_DRAFT: BusinessProfileDraft = {
  email: "",
  businessName: "",
  abn: "",
  industry: "",
  // The two the brief specifies as pre-set, and the only two that are.
  accountingBasis: "Cash",
  /*
   * The brief asks for "Individual", which isn't one of `BUSINESS_TYPES` — the
   * product's four are Sole trader, Company, Partnership and Trust, and Settings
   * plus a stored-data migration both read that list. Sole trader is what an
   * individual trading on their own is called here, so it takes the default
   * rather than the shared enum gaining a fifth member nothing else knows.
   */
  businessType: "Sole trader",
  companyName: "",
  firstName: "",
  middleName: "",
  lastName: "",
  phone: "",
  ndisNumber: "",
  bankName: "",
  bsb: "",
  accountHolder: "",
  accountNumber: "",
  addressSearch: "",
  addressLine1: "",
  country: "Australia",
  city: "",
  state: "",
  postcode: "",
};

/**
 * What's wrong with the draft, by field.
 *
 * The four required ones plus the business number's shape. That number is the
 * country's, not Australia's: an 11-digit ABN here, a 13-digit NZBN in New
 * Zealand, a `1234/567890/12` company registration in South Africa. The rule
 * comes from the Country Registry's `identifier_schema` via `identifierError`,
 * which is the same function the settings screen and sign-up use — three
 * copies of a check-digit rule would eventually disagree.
 *
 * `idField` is optional so the pure function stays testable and so a caller
 * whose country hasn't loaded yet gets Australia's rule rather than none. Sole
 * requires the number whatever the country says, because it is what identifies
 * the business on an invoice — hence `require: true`.
 */
export function businessDraftIssues(
  draft: BusinessProfileDraft,
  idField?: CountryIdentifierField | null,
  /** The business country's postcode rule, from `useAddressRules`. */
  postcodeError?: (value: string) => string | undefined,
): Partial<Record<keyof BusinessProfileDraft, string>> {
  const issues: Partial<Record<keyof BusinessProfileDraft, string>> = {};

  if (!draft.email.trim()) issues.email = "Business email is required.";
  else if (!EMAIL_PATTERN.test(draft.email.trim()))
    issues.email = "That doesn't look like an email address.";

  if (!draft.businessName.trim())
    issues.businessName = "Business name is required.";

  const identifier = idField ?? AU_REGISTRATION_FIELD;
  const identifierIssue = identifierError(identifier, draft.abn, { require: true });
  if (identifierIssue) issues.abn = identifierIssue;

  if (!draft.industry) issues.industry = "Industry is required.";

  const postcodeIssue = postcodeError?.(draft.postcode);
  if (postcodeIssue) issues.postcode = postcodeIssue;

  /*
   * Optional here, unlike in Settings — that screen requires it because saving
   * it is what switches NDIS invoicing on, whereas this one is opening a
   * business. So the shape is checked only once something has been typed:
   * `ndisNumberError` treats a blank as an error, and guarding on non-empty
   * leaves just its 9-digit branch reachable.
   */
  if (draft.industry === NDIS_INDUSTRY && draft.ndisNumber.trim()) {
    const shape = ndisNumberError(draft.ndisNumber);
    if (shape) issues.ndisNumber = shape;
  }

  return issues;
}

/**
 * The reverse of `COMPANY_TYPE_BY_BUSINESS_TYPE` in lib/businesses.ts.
 * Lossy in the same direction that one is: `pvt_company` covers Company,
 * Partnership and Trust on the way out, so on the way back in it can only
 * land on one of them — Company, as the most literal reading of the code.
 */
const BUSINESS_TYPE_BY_COMPANY_TYPE: Record<
  string,
  BusinessProfileDraft["businessType"]
> = {
  solo_traders: "Sole trader",
  individual: "Sole trader",
  pvt_company: "Company",
};

/**
 * The record the detail endpoint returns, read back into the shape this form
 * edits — shared by the edit screen and by the add-business flow's
 * resume-payment step, which shows the same saved record read-only.
 */
export function draftFromDetail(
  raw: ApiBusinessDetail,
  industries: IndustryOption[],
): BusinessProfileDraft {
  const businessType =
    BUSINESS_TYPE_BY_COMPANY_TYPE[raw.company_type ?? ""] ??
    EMPTY_BUSINESS_DRAFT.businessType;

  // industry_id is the only thing the detail endpoint actually returns for
  // this — there's no denormalised name alongside it — so the picker's
  // current value has to be looked up against the same fetched list it
  // renders its options from.
  const industryName =
    raw.industry_id !== undefined && raw.industry_id !== null
      ? industries.find((entry) => entry.id === String(raw.industry_id))?.name
      : undefined;

  return {
    ...EMPTY_BUSINESS_DRAFT,
    email: raw.business_email ?? "",
    businessName: raw.business_name ?? raw.company_name ?? "",
    abn: raw.abn ?? "",
    industry: industryName ?? "",
    accountingBasis: raw.accounting_type === "accrual" ? "Accrual" : "Cash",
    businessType,
    companyName: raw.company_name ?? "",
    firstName: raw.first_name ?? "",
    middleName: raw.middle_name ?? "",
    lastName: raw.last_name ?? "",
    // The combined display value the phone input edits, rebuilt from the two
    // fields the record stores separately — same round-trip as sole-webapp's
    // own `toPhoneValue` (components/BusinessProfile/BusinessProfileFormSheet.jsx).
    phone: (() => {
      const { countryCallingCode, nationalNumber } = getCountryCallingAndPhoneNumber(
        (raw.country_code || DEFAULT_CALLING_CODE) + (raw.mobile_no || ""),
        DEFAULT_CALLING_CODE,
      );
      return countryCallingCode + nationalNumber;
    })(),
    ndisNumber: raw.ndis_no ?? "",
    bankName: raw.bank_name ?? "",
    bsb: raw.bsb ?? "",
    accountHolder: raw.account_holder ?? "",
    accountNumber: raw.account_number ?? "",
    addressSearch: raw.address ?? "",
    addressLine1: raw.address_line1 ?? "",
    country: raw.country || EMPTY_BUSINESS_DRAFT.country,
    city: raw.city ?? "",
    state: raw.state ?? "",
    postcode: raw.postcode ?? "",
  };
}

/**
 * The add-business form.
 *
 * Its own component so the page owns the shell and this owns the fields — the
 * brief has the payment step following it, and a form that knows nothing about
 * what comes next is one that can be reused when it does.
 *
 * Sections rather than one run of fields: there are twenty of them, and the
 * headings are what let someone find the bank details without reading the lot.
 * Each one is a `FormSection`, the platform's shared block — the same component
 * the quote and invoice editors use, so this form's headers are that treatment
 * rather than a copy of it. The dropzone comes from the bulk wizards, which is
 * where that shape of control already exists.
 */
export function BusinessProfileForm({
  draft,
  patch,
  issues,
  showIssues,
  logo,
  onLogo,
  onRemoveLogo,
  disabled = false,
  detailsOnly = false,
  countryChoice,
}: {
  draft: BusinessProfileDraft;
  patch: (partial: Partial<BusinessProfileDraft>) => void;
  issues: Partial<Record<keyof BusinessProfileDraft, string>>;
  /** Errors stay quiet until Continue is pressed, so a fresh form isn't red. */
  showIssues: boolean;
  logo: { name: string; size?: number; url?: string } | null;
  onLogo: (file: File) => void;
  onRemoveLogo: () => void;
  /**
   * Read-only — the resume-payment step shows a business's saved details for
   * review, not for editing. A native `<fieldset disabled>` rather than
   * threading the prop through every field: it disables every input, select
   * and button inside for free, browser-native, without touching them.
   */
  disabled?: boolean;
  /**
   * Only the "Business details" section. Adding a business asks for just the
   * required fields for now; the rest (defaults, contact, banking, address,
   * logo) are hidden, not removed, and stay editable in Settings.
   */
  detailsOnly?: boolean;
  /**
   * Adding a business: which country it's created in. The business number's
   * name and shape and the phone's dial code then follow the chosen country
   * rather than the active business's. Left out when editing — a business's
   * country is fixed once it exists, so there's no picker to offer.
   */
  countryChoice?: {
    value: string;
    countries: Country[];
    onChange: (iso2: string) => void;
  };
}) {
  /*
   * The country decides what this form asks for: the business number's name
   * and shape, and whether there is a branch field beside the account number
   * at all. New Zealand has none — its account number carries the bank and
   * branch inside it — so drawing a "BSB" box there would be asking for
   * something that does not exist.
   */
  const { country } = useCountryContext();
  const rules = useAddressRules();
  const countryOptions = countryChoice
    ? newBusinessCountryOptions(countryChoice.countries, country)
    : [];
  const chosen = countryChoice
    ? countryByIso2(countryOptions, countryChoice.value)
    : null;
  const idField = countryRegistrationField(
    (chosen ?? country).identifierSchema,
  );
  const countryName = chosen?.name ?? country.name;
  const branchField = bankBranchField(country);
  const accountField = bankAccountField(country);
  const issue = (key: keyof BusinessProfileDraft) =>
    showIssues ? issues[key] : undefined;

  // The address country is the business's own and never changes, so the draft
  // always carries it — a saved blank or a bundled default can't be sent.
  React.useEffect(() => {
    if (!detailsOnly && draft.country !== rules.countryName) {
      patch({ country: rules.countryName });
    }
  }, [detailsOnly, draft.country, rules.countryName]); // eslint-disable-line react-hooks/exhaustive-deps

  // The real list, not a locally-invented one — same ids and names
  // sole-webapp's own industry picker saves against.
  const { data: industries } = useIndustriesQuery();
  const industryOptions = industries ?? [];

  /*
   * One industry, not a list. The brief named four — NDIS provider, Disability
   * services, and so on — and the product has a single `NDIS_INDUSTRY`,
   * already the gate for the create chooser, the template gallery and the
   * NDIS invoice editor. Gating on the same constant keeps this the fourth
   * screen agreeing with those three rather than a fifth opinion about who
   * bills the NDIS.
   */
  const ndisRelevant = draft.industry === NDIS_INDUSTRY;

  const text = (
    key: keyof BusinessProfileDraft,
    placeholder?: string,
    type = "text",
  ) => (
    <Input
      id={`business-${key}`}
      type={type}
      value={draft[key] as string}
      placeholder={placeholder}
      aria-invalid={!!issue(key)}
      onChange={(event) => patch({ [key]: event.target.value })}
      className={cn(
        issue(key) && "border-destructive focus-visible:ring-destructive",
      )}
    />
  );

  return (
    <fieldset disabled={disabled} className="contents space-y-8">
      <FormSection
        icon={Building2}
        title="Business details"
        description="The four marked fields are what we need to open the business."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field
          label="Business email"
          htmlFor="business-email"
          required
          error={issue("email")}
        >
          {text("email", "hello@harbourline.com.au", "email")}
        </Field>
        <Field
          label="Business name"
          htmlFor="business-businessName"
          required
          error={issue("businessName")}
        >
          {text("businessName", "Harbourline Studio")}
        </Field>
        {countryChoice && (
          <Field
            label="Country"
            hint="Sets the business number, tax and currency. It can't be changed later."
          >
            <Select
              value={countryChoice.value}
              onValueChange={countryChoice.onChange}
            >
              <SelectTrigger aria-label="Country">
                <SelectValue placeholder="Choose a country" />
              </SelectTrigger>
              <SelectContent>
                {countryOptions.map((option) => (
                  <SelectItem key={option.iso2} value={option.iso2}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field
          label={idField.label}
          htmlFor="business-abn"
          required
          error={issue("abn")}
          hint={issue("abn") ? undefined : `As registered in ${countryName}.`}
        >
          {text("abn", maskExample(idField) ?? "")}
        </Field>
        <Field label="Industry" required error={issue("industry")}>
          <Select
            value={draft.industry}
            // Switching away from NDIS drops anything typed into the field
            // that's about to disappear — a hidden value would otherwise be
            // submitted by a form nobody could see it on.
            onValueChange={(next) =>
              patch({
                industry: next,
                ...(next === NDIS_INDUSTRY ? {} : { ndisNumber: "" }),
              })
            }
          >
            <SelectTrigger
              aria-label="Industry"
              aria-invalid={!!issue("industry")}
              className={cn(
                issue("industry") &&
                  "border-destructive focus:ring-destructive",
              )}
            >
              <SelectValue placeholder="Choose an industry" />
            </SelectTrigger>
            <SelectContent>
              {industryOptions.map((option) => (
                <SelectItem key={option.id} value={option.name}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/*
          Only for the one industry that bills the NDIS. `sm:col-start-1` pins it
          to the left of the new row it opens, under ABN — which is where the
          four fields above it would put the fifth anyway, but stated rather than
          inherited, so adding a field above can't quietly move it across.

          `animate-fade-rise` is the platform's arrival: it fades and lifts a few
          pixels, and `motion-safe` means someone who has asked for less motion
          gets the field without the movement.
        */}
        {ndisRelevant && (
          <div className="motion-safe:animate-fade-rise sm:col-start-1">
            <Field
              label="NDIS number"
              htmlFor="business-ndisNumber"
              error={issue("ndisNumber")}
              hint={
                issue("ndisNumber") ? undefined : "Only if you bill the NDIS."
              }
            >
              <Input
                id="business-ndisNumber"
                value={draft.ndisNumber}
                inputMode="numeric"
                placeholder={NDIS_NUMBER_PLACEHOLDER}
                aria-invalid={!!issue("ndisNumber")}
                onChange={(event) => patch({ ndisNumber: event.target.value })}
                className={cn(
                  "tabular",
                  issue("ndisNumber") &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </Field>
          </div>
        )}
      </FormSection>

      {/* Hidden on the add-business page for now — see `detailsOnly`. */}
      {!detailsOnly && (
        <>
          <FormSection
            icon={SlidersHorizontal}
            title="Business defaults"
            description="Both can be changed later in Settings."
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field
              label="Accounting type"
              labelTip="Cash counts money when it moves; accrual counts it when it's invoiced."
            >
              <Select
                value={draft.accountingBasis}
                onValueChange={(next) =>
                  patch({
                    accountingBasis:
                      next as BusinessProfileDraft["accountingBasis"],
                  })
                }
              >
                <SelectTrigger aria-label="Accounting type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNTING_BASES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Company type">
              <Select
                value={draft.businessType}
                onValueChange={(next) =>
                  patch({
                    businessType: next as BusinessProfileDraft["businessType"],
                  })
                }
              >
                <SelectTrigger aria-label="Company type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FormSection>

          <FormSection
            icon={User}
            title="Contact"
            description="Who to reach at this business."
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <Field label="Company name" htmlFor="business-companyName">
                {text("companyName", "Harbourline Pty Ltd")}
              </Field>
            </div>
            <Field label="First name" htmlFor="business-firstName">
              {text("firstName")}
            </Field>
            <Field label="Middle name" htmlFor="business-middleName">
              {text("middleName")}
            </Field>
            <Field label="Last name" htmlFor="business-lastName">
              {text("lastName")}
            </Field>
            <Field label="Phone number" htmlFor="business-phone" hint="Optional.">
              <PhoneInput
                id="business-phone"
                defaultCountry={
                  chosen ? (chosen.iso2 as CountryCode) : undefined
                }
                value={draft.phone}
                onChange={(next) => patch({ phone: next })}
                invalid={!!issue("phone")}
              />
            </Field>
          </FormSection>

          <FormSection
            icon={Landmark}
            title="Banking"
            description="Where invoice payments land."
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Bank name" htmlFor="business-bankName">
              {text("bankName", "Commonwealth Bank")}
            </Field>
            <Field label="Account holder" htmlFor="business-accountHolder">
              {text("accountHolder")}
            </Field>
            {branchField ? (
              <Field
                label={branchField.label}
                htmlFor="business-bsb"
                hint={bankFieldHelp(country, branchField.key) ?? undefined}
              >
                {text("bsb", branchField.mask?.replace(/9/g, "0") ?? "")}
              </Field>
            ) : null}
            <Field
              label={accountField?.label ?? "Account number"}
              htmlFor="business-accountNumber"
              hint={bankFieldHelp(country, "account_number") ?? undefined}
            >
              {text("accountNumber", accountField?.mask?.replace(/9/g, "0") ?? "12345678")}
            </Field>
          </FormSection>

          <FormSection
            icon={MapPin}
            title="Address"
            description="Where the business operates from."
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <Field
                label="Search address"
                htmlFor="business-addressSearch"
                hint="Start typing and pick a match, or fill the fields below."
              >
                <AddressAutocomplete
                  id="business-addressSearch"
                  value={draft.addressSearch}
                  placeholder="Start typing an address"
                  ariaInvalid={!!issue("addressSearch")}
                  className={cn(
                    issue("addressSearch") &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  onChange={(next) => patch({ addressSearch: next })}
                  countryRestrictions={rules.restrictions}
                  onSelect={(place) => {
                    const wrongCountry = rules.placeError(place.country);
                    if (wrongCountry) {
                      toast.error(wrongCountry);
                      patch({ addressSearch: "" });
                      return;
                    }
                    patch({
                      addressLine1: place.addressLine1,
                      city: place.city,
                      state: place.state,
                      postcode: place.postcode,
                    });
                  }}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Address line 1" htmlFor="business-addressLine1">
                {text("addressLine1", "Street address")}
              </Field>
            </div>
            <Field label="Country" htmlFor="business-country">
              <LockedCountryInput id="business-country" value={rules.countryName} />
            </Field>
            <Field label="City" htmlFor="business-city">
              {text("city")}
            </Field>
            <Field label={rules.regionLabel} htmlFor="business-state">
              {text("state", rules.regionOptions[0])}
            </Field>
            <Field
              label={rules.postcodeLabel}
              htmlFor="business-postcode"
              error={issue("postcode")}
            >
              {text("postcode")}
            </Field>
          </FormSection>

          <FormSection
            icon={ImageIcon}
            title="Profile"
            description="Upload a logo or avatar for the business."
          >
            <WizardDropzone
              file={logo}
              rowCount={0}
              parseError={null}
              onFile={onLogo}
              onRemove={onRemoveLogo}
              accept="image/png,image/jpeg,image/svg+xml"
              hint="PNG, JPG or SVG up to 2 MB"
              // A known size means this is a file just picked in this session;
              // an already-saved logo (size unknown, only a URL) is already uploaded.
              fileMeta={typeof logo?.size === "number" ? "Ready to upload" : "Uploaded"}
            />
          </FormSection>
        </>
      )}
    </fieldset>
  );
}
