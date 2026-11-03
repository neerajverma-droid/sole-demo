"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { Loader2, MapPin, Users } from "lucide-react";
import { toast } from "sonner";

import { FormSection } from "@/components/ui/form-section";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import {
  SolePayOnboardingShell,
  SolePayStepFooter,
  SOLEPAY_OVERVIEW_HREF,
  useSolePayHydration,
} from "@/components/payments/solepay/onboarding-shell";
import {
  AddressSearchField,
  SelectField,
  TextField,
  focusFirstSolePayIssue,
} from "@/components/payments/solepay/fields";
import { solePayMetaAtom, solePayOnboardingAtom } from "@/lib/atoms";
import {
  SOLEPAY_ID_TYPES,
  directorInvalidIssues,
  directorIssues,
  saveSolePayDraft,
  type SolePayAddress,
  type SolePayDirector,
  type SolePayIssues,
} from "@/lib/solepay";

const SECTION_HEADER =
  "gap-3 px-4 py-3.5 bg-primary/[0.06] dark:bg-primary/[0.12]";

/** Where `directorIssues`' keys actually live on the page, for scroll-to-error. */
const DIRECTOR_FIELD_IDS: Record<string, string> = {
  firstName: "director-first-name",
  lastName: "director-last-name",
  email: "director-email",
  phone: "director-phone",
  dateOfBirth: "director-dob",
  idType: "director-id-type",
  idNumber: "director-id-number",
  ownershipPercent: "director-ownership",
  licenceState: "director-dl-state",
  cardNumber: "director-card-number",
  "address.line1": "director-address-1",
  "address.city": "director-city",
  "address.state": "director-state",
  "address.postcode": "director-postcode",
  "address.country": "director-country",
};

/**
 * Director.
 *
 * A single form, not a list: Worldpay only ever verifies one signatory
 * (`Members[0]` server-side — there's no multi-director support to build a
 * list against), so this edits that one record directly rather than offering
 * an add/remove flow the backend can't actually honour.
 */
export function SolePayDirectorScreen() {
  const router = useRouter();
  const [state, setState] = useAtom(solePayOnboardingAtom);
  const setMeta = useSetAtom(solePayMetaAtom);

  const [director, setDirector] = React.useState<SolePayDirector>(state.director);
  const [addressSearch, setAddressSearch] = React.useState("");
  const [issues, setIssues] = React.useState<SolePayIssues>({});
  const [triedSubmit, setTriedSubmit] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Re-seeds from the atom once the real draft has actually loaded — see
  // `useSolePayHydration`'s own comment for why the plain `useState` above
  // isn't enough by itself on a hard refresh landing straight on this page.
  useSolePayHydration(() => setDirector(state.director));

  const isDrivingLicence = director.idType === "1";

  // Once a Save attempt has run, every further edit re-validates the whole
  // form live — see `entity-screen.tsx`'s `patchEntity` for the same reasoning.
  const patch = (values: Partial<SolePayDirector>) => {
    const next = { ...director, ...values };
    setDirector(next);
    if (triedSubmit) setIssues(directorIssues(next));
  };

  const patchAddress = (values: Partial<SolePayAddress>) => {
    const next = { ...director, address: { ...director.address, ...values } };
    setDirector(next);
    if (triedSubmit) setIssues(directorIssues(next));
  };

  const save = async () => {
    const found = directorIssues(director);
    setIssues(found);
    setTriedSubmit(true);

    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length;
      toast.error(
        `${count} ${count === 1 ? "field needs" : "fields need"} attention`,
      );
      focusFirstSolePayIssue(found, DIRECTOR_FIELD_IDS);
      return;
    }

    // Sends the FULL current onboarding state — see `entity-screen.tsx`'s
    // save for why a director-only payload would null out the entity.
    const next = { ...state, director };
    setSaving(true);
    try {
      const result = await saveSolePayDraft(next);
      setState(result.state);
      setMeta(result.meta);

      // See `entity-screen.tsx`'s save — the backend-only checks (DOB, AU
      // state codes, the AU phone shape, ownership range) surface here,
      // right after a real Save attempt, rather than being guessed at
      // client-side.
      const backendIssues = directorInvalidIssues(result.meta.groupedInvalid.member);
      if (Object.keys(backendIssues).length > 0) {
        setIssues(backendIssues);
        toast.error("Worldpay flagged a problem with these details.");
        focusFirstSolePayIssue(backendIssues, DIRECTOR_FIELD_IDS);
        return;
      }

      toast.success("Director saved");
      router.push(SOLEPAY_OVERVIEW_HREF);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save director",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SolePayOnboardingShell stepId="directors">
      <div className="space-y-4">
        <FormSection
          icon={Users}
          title="Director"
          description="As it appears on their photo ID."
          headerClassName={SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="director-first-name"
              label="First name"
              required
              placeholder="Michael"
              value={director.firstName}
              error={issues.firstName}
              onChange={(firstName) => patch({ firstName })}
            />
            <TextField
              id="director-last-name"
              label="Last name"
              required
              placeholder="Turner"
              value={director.lastName}
              error={issues.lastName}
              onChange={(lastName) => patch({ lastName })}
            />
            <TextField
              id="director-email"
              label="Email"
              required
              type="email"
              hint="Used for SolePay identity verification and correspondence."
              placeholder="michael.turner@email.com"
              value={director.email}
              error={issues.email}
              onChange={(email) => patch({ email })}
            />
            <Field label="Phone" htmlFor="director-phone" required error={issues.phone}>
              <PhoneInput
                id="director-phone"
                value={director.phone}
                invalid={!!issues.phone}
                required
                onChange={(phone) => patch({ phone })}
              />
            </Field>

            <div className="space-y-2">
              <Label htmlFor="director-dob" className="flex items-center gap-1.5">
                Date of birth
                <span className="text-destructive" aria-hidden>
                  *
                </span>
              </Label>
              <DatePicker
                id="director-dob"
                label="Date of birth"
                value={director.dateOfBirth}
                onChange={(dateOfBirth) => patch({ dateOfBirth })}
              />
              {issues.dateOfBirth ? (
                <p className="text-xs text-destructive">
                  {issues.dateOfBirth}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  As shown on their ID.
                </p>
              )}
            </div>
            <TextField
              id="director-ownership"
              label="Ownership %"
              required
              inputMode="decimal"
              hint="A value between 0.01 and 100."
              placeholder="100"
              value={director.ownershipPercent}
              error={issues.ownershipPercent}
              onChange={(ownershipPercent) => patch({ ownershipPercent })}
            />
          </div>

          {/* The ID, kept together under a rule: fields that only make sense
              read as a set, and the licence-only two only shown for one of
              the two ID types. */}
          <div className="space-y-4 border-t border-border pt-4">
            <p className="text-sm font-medium">Identity document</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id="director-id-type"
                label="ID type"
                required
                options={SOLEPAY_ID_TYPES}
                value={director.idType}
                error={issues.idType}
                onChange={(idType) => patch({ idType })}
              />
              <TextField
                id="director-id-number"
                label="ID number"
                required
                hint="The number on the licence or passport selected above."
                placeholder="123456789"
                value={director.idNumber}
                error={issues.idNumber}
                onChange={(idNumber) => patch({ idNumber })}
              />
              {isDrivingLicence && (
                <>
                  <TextField
                    id="director-dl-state"
                    label="DL state"
                    required
                    hint="The state that issued it."
                    placeholder="VIC"
                    value={director.licenceState}
                    error={issues.licenceState}
                    onChange={(licenceState) => patch({ licenceState })}
                  />
                  <TextField
                    id="director-card-number"
                    label="Card number"
                    required
                    hint="The number printed on the front of the card."
                    placeholder="AB1234567"
                    value={director.cardNumber}
                    error={issues.cardNumber}
                    onChange={(cardNumber) => patch({ cardNumber })}
                  />
                </>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection
          icon={MapPin}
          title="Residential address"
          description="Where this director lives."
          headerClassName={SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <AddressSearchField
            id="director-address-search"
            value={addressSearch}
            onChange={setAddressSearch}
            onSelect={(place) =>
              patchAddress({
                line1: place.addressLine1,
                country: place.country,
                city: place.city,
                state: place.state,
                postcode: place.postcode,
              })
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                id="director-address-1"
                label="Address line 1"
                required
                placeholder="18 Cremorne Street"
                value={director.address.line1}
                error={issues["address.line1"]}
                onChange={(line1) => patchAddress({ line1 })}
              />
            </div>
            <TextField
              id="director-country"
              label="Country"
              required
              value={director.address.country}
              error={issues["address.country"]}
              onChange={(country) => patchAddress({ country })}
            />
            <TextField
              id="director-city"
              label="City"
              required
              placeholder="Melbourne"
              value={director.address.city}
              error={issues["address.city"]}
              onChange={(city) => patchAddress({ city })}
            />
            <TextField
              id="director-state"
              label="State / province"
              hint="e.g. NSW, VIC, QLD."
              required
              placeholder="VIC"
              value={director.address.state}
              error={issues["address.state"]}
              onChange={(state) => patchAddress({ state })}
            />
            <TextField
              id="director-postcode"
              label="Postcode / ZIP"
              required
              inputMode="numeric"
              placeholder="3121"
              value={director.address.postcode}
              error={issues["address.postcode"]}
              onChange={(postcode) => patchAddress({ postcode })}
            />
          </div>
        </FormSection>
      </div>

      <SolePayStepFooter
        onSave={save}
        saveDisabled={saving}
        saveLabel={
          saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save director"
          )
        }
      />
    </SolePayOnboardingShell>
  );
}
