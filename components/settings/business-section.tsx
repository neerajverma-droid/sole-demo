"use client";

import * as React from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressAutocomplete } from "@/components/documents/address-autocomplete";
import { Field } from "@/components/documents/field";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionDraft } from "@/components/settings/use-section-draft";
import { AvatarCropDialog } from "@/components/settings/avatar-crop-dialog";
import { useIndustriesQuery } from "@/hooks/use-industries-query";
import { useCountriesQuery } from "@/hooks/use-countries-query";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import { contactInitials } from "@/lib/contacts";
import { countryByIso2 } from "@/lib/countries";
import { useAddressRules } from "@/hooks/use-address-rules";
import { LockedCountryInput } from "@/components/documents/locked-country-field";
import {
  identifierError,
  maskExample,
  registrationField,
} from "@/lib/business-identifier";
import {
  useBusinessDetails,
  usePreferences,
} from "@/hooks/use-business-settings";
import { businessDraftAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import { websiteError } from "@/lib/onboarding";
import {
  BUSINESS_TYPES,
  NDIS_NUMBER_PLACEHOLDER,
  ndisNumberError,
} from "@/lib/settings";
import { NDIS_INDUSTRY_ID } from "@/lib/invoice-templates";
import { cn } from "@/lib/utils";

/**
 * The business's own details — read from its server record, written back to it.
 *
 * Everything here except Website is a real column on `businesses`, reached
 * through `lib/business-settings.ts`. Website has none, so it's kept with the
 * other device-local settings and labelled as such rather than quietly
 * dropped on save.
 *
 * The industry dropdown is the live `/industry` list, and what's stored is its
 * `industry_id`. It used to be a local hardcoded list of names posted as
 * `{ industry: "<name>" }` — a field `update_business_profile` doesn't read —
 * so every industry change was silently discarded.
 *
 * The address is a Google Places search over the parsed fields, the same
 * pairing the add-business form and sole-webapp's own `AddressField` use: the
 * search box fills line 1, city, state, postcode and country in one pick, and
 * every one of them stays editable afterwards for the addresses Places gets
 * wrong or has never heard of. It replaces a single free-text textarea that
 * only ever reached `address_line1`, so a business whose city and postcode
 * were on file had no way to correct either.
 */
export function BusinessSection() {
  const { values: stored, loading, save } = useBusinessDetails();
  const { values: prefs, patch: patchPrefs } = usePreferences();
  const { data: industries = [], isPending: industriesPending } =
    useIndustriesQuery();
  const { data: countries = [] } = useCountriesQuery();
  // Straight off the record rather than through the form draft: it is not
  // editable, so it has no business being in a draft that can be dirty.
  const { business: activeBusinessRecord } = useActiveBusiness();
  const country = countryByIso2(countries, activeBusinessRecord?.countryIso2);
  const rules = useAddressRules();

  const { values, dirty, patch, reset } = useSectionDraft(
    stored,
    businessDraftAtom,
    activeBusinessRecord?.id ?? null,
  );

  /**
   * Website lives in the local store, so it isn't part of the draft the Save
   * button sends — it's kept beside it and written on the same click.
   */
  const [website, setWebsite] = React.useState<string | null>(null);
  const websiteValue = website ?? prefs.website;

  const [saving, setSaving] = React.useState(false);

  // One photo per ACCOUNT, not per business — see `useAvatarUpload` for why,
  // and why this is also what the Settings profile card's avatar reads/writes.
  const avatar = useAvatarUpload();
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  /*
   * The business number field is the country's, not Australia's. The registry
   * carries its label, pattern, mask and check digit — an ABN in Australia, a
   * 13-digit NZBN in New Zealand, a `1234/567890/12` company registration in
   * South Africa. Until the countries list lands, `registrationField` returns
   * null and `identifierError` passes everything, which is the right way round:
   * it would be wrong to reject a valid NZBN for failing an ABN's rule.
   */
  const idField = registrationField(country?.identifierSchema ?? []);
  const idLabel = idField?.label ?? "ABN";
  // Never required here either — see the same decision on the onboarding
  // screen (lib/onboarding.ts): the lookup it would drive depends on a
  // credential that isn't always configured, so a business shouldn't be
  // unable to save over a field it can't necessarily verify anyway. A number
  // that IS entered is still checked against the country's own shape.
  const abnIssue = identifierError(idField, values.abn, { require: false });
  const industryIssue =
    values.industryId == null ? "Choose an industry." : undefined;
  // The field only exists for NDIS providers, so it only blocks saving there.
  const isNdis = values.industryId === NDIS_INDUSTRY_ID;
  const ndisIssue = isNdis ? ndisNumberError(values.ndisNumber) : undefined;
  const siteIssue = websiteError(websiteValue);
  const postcodeIssue = rules.postcodeError(values.postcode);
  const blocked = abnIssue ?? industryIssue ?? ndisIssue ?? siteIssue ?? postcodeIssue;

  /*
   * The address' own "Country" has never been typed for most businesses — it
   * only fills once someone picks a result from the address search. Left
   * blank it looked unanswered even for a business whose country is very
   * much on file, just one field over, in `countryIso2`. Falling back to
   * that registered country's name (not the code: this is the free-text
   * mailing address field, not the one onboarding fixed) is a display-only
   * default until Save actually sends it — it never marks the section dirty
   * on its own, the same way a placeholder wouldn't.
   */
  const countryValue = rules.countryName;

  const onSave = async () => {
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setSaving(true);
    try {
      await save({ ...values, country: countryValue });
      patchPrefs({ website: websiteValue });
      setWebsite(null);
      reset();
      toast.success("Business details saved");
    } catch (error) {
      // The draft is deliberately kept — a failed save that also cleared the
      // form would lose what was typed, and this one can genuinely fail now.
      toast.error(apiErrorMessage(error, "Couldn't save your changes."));
    } finally {
      setSaving(false);
    }
  };

  const websiteDirty = website !== null && website !== prefs.website;

  return (
    <SectionCard
      title="Business details"
      description="Your details as they appear on invoices, quotes and BAS."
      dirty={(dirty || websiteDirty) && !blocked}
      saving={saving}
      onSave={() => void onSave()}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field
          label="Photo"
          hint="Shown on your invoices and quotes, and wherever Sole greets you."
        >
          <div className="flex items-start gap-[15px]">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatar.busy}
              aria-label={avatar.logo ? "Change photo" : "Upload photo"}
              className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {avatar.logo ? (
                <img
                  src={avatar.logo}
                  alt=""
                  className="size-28 rounded-lg object-cover ring-1 ring-border"
                />
              ) : (
                <span className="grid size-28 place-items-center rounded-lg bg-primary/10 text-2xl font-semibold text-primary ring-1 ring-border">
                  {contactInitials(values.businessName)}
                </span>
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) avatar.pick(file);
                event.target.value = "";
              }}
            />
            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatar.busy}
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatar.busy ? "Uploading…" : avatar.logo ? "Change" : "Upload"}
              </Button>
              {avatar.logo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-500 bg-red-100 hover:bg-red-200 text-ellipsis"
                  disabled={avatar.busy}
                  onClick={avatar.remove}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Field>

        <AvatarCropDialog
          open={avatar.cropSrc !== null}
          src={avatar.cropSrc}
          onCancel={avatar.cancelCrop}
          onConfirm={avatar.confirmCrop}
        />
        <div className="grid gap-[15px]">
          <Field label="Business name">
            <Input
              value={values.businessName}
              disabled={loading}
              onChange={(event) => patch({ businessName: event.target.value })}
            />
          </Field>

          <Field
            label={idLabel}
            error={abnIssue}
            hint={
              idField
                ? `As registered${country?.name ? ` in ${country.name}` : ""}${maskExample(idField) ? `, e.g. ${maskExample(idField)}` : ""}.`
                : undefined
            }
          >
            <Input
              value={values.abn}
              inputMode="numeric"
              disabled={loading}
              placeholder={maskExample(idField)}
              onChange={(event) => patch({ abn: event.target.value })}
              aria-invalid={!!abnIssue}
              aria-label={idLabel}
              className={cn(
                "tabular",
                abnIssue && "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>
        </div>
      </div>
      <div className="grid gap-[15px] sm:grid-cols-2">
        <Field
          label="Industry"
          required
          error={industryIssue}
          hint="Decides which invoice types and templates you're offered."
        >
          <Select
            // The list is the server's, so the value is an id rendered as a
            // string — Radix's Select only deals in strings.
            value={values.industryId != null ? String(values.industryId) : ""}
            disabled={loading || industriesPending}
            onValueChange={(value) => patch({ industryId: Number(value) })}
          >
            <SelectTrigger aria-label="Industry">
              <SelectValue
                placeholder={industriesPending ? "Loading…" : "Choose one"}
              />
            </SelectTrigger>
            <SelectContent>
              {industries.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Business type">
          <Select
            value={values.companyType}
            disabled={loading}
            onValueChange={(value) => patch({ companyType: value })}
          >
            <SelectTrigger aria-label="Business type">
              <SelectValue placeholder="Choose one" />
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

        {/* NDIS providers only — it's what unlocks NDIS invoicing. Spans the
            grid so it reads as its own row rather than pairing with Phone. */}
        {isNdis && (
          <div className="sm:col-span-2">
            <Field
              label="NDIS provider number"
              required
              error={ndisIssue}
              hint="9 digits, as registered with the NDIS Commission. NDIS invoicing stays off until this is saved."
            >
              <Input
                value={values.ndisNumber}
                inputMode="numeric"
                placeholder={NDIS_NUMBER_PLACEHOLDER}
                onChange={(event) => patch({ ndisNumber: event.target.value })}
                aria-invalid={!!ndisIssue}
                className={cn(
                  "tabular sm:max-w-xs",
                  ndisIssue &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </Field>
          </div>
        )}

        <Field label="Phone">
          <Input
            value={values.phone}
            inputMode="tel"
            disabled={loading}
            onChange={(event) => patch({ phone: event.target.value })}
            className="tabular"
          />
        </Field>

        <Field label="Business Email">
          <Input
            type="email"
            value={values.email}
            disabled={loading}
            onChange={(event) => patch({ email: event.target.value })}
          />
        </Field>

        <Field
          label="Website"
          error={siteIssue}
          hint={
            siteIssue
              ? undefined
              : "Optional. Saved on this device only."
          }
        >
          <Input
            type="url"
            inputMode="url"
            value={websiteValue}
            placeholder="yourbusiness.com.au"
            aria-invalid={!!siteIssue}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-[15px]">
        <Field
          label="Business address"
          htmlFor="settings-address-search"
          hint="Start typing and pick a match, or fill the fields below."
        >
          <AddressAutocomplete
            id="settings-address-search"
            value={values.addressSearch}
            placeholder="Start typing an address"
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
                country: rules.countryName,
              });
            }}
          />
        </Field>

        <div className="grid gap-[15px] sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Address line 1" htmlFor="settings-address-line1">
              <Input
                id="settings-address-line1"
                value={values.addressLine1}
                placeholder="Street address"
                disabled={loading}
                onChange={(event) =>
                  patch({ addressLine1: event.target.value })
                }
              />
            </Field>
          </div>

          <Field label="City / suburb" htmlFor="settings-address-city">
            <Input
              id="settings-address-city"
              value={values.city}
              disabled={loading}
              onChange={(event) => patch({ city: event.target.value })}
            />
          </Field>

          <Field label={rules.regionLabel} htmlFor="settings-address-state">
            <Input
              id="settings-address-state"
              value={values.state}
              list={rules.regionOptions.length ? "settings-address-regions" : undefined}
              placeholder={rules.regionOptions[0]}
              disabled={loading}
              onChange={(event) => patch({ state: event.target.value })}
            />
          </Field>

          <Field label={rules.postcodeLabel} htmlFor="settings-address-postcode" error={postcodeIssue}>
            <Input
              id="settings-address-postcode"
              value={values.postcode}
              inputMode="numeric"
              disabled={loading}
              onChange={(event) => patch({ postcode: event.target.value })}
              className="tabular"
            />
          </Field>

          <Field label="Country" htmlFor="settings-address-country">
            <LockedCountryInput id="settings-address-country" value={countryValue} />
          </Field>
          <datalist id="settings-address-regions">
            {rules.regionOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>
    </SectionCard>
  );
}
