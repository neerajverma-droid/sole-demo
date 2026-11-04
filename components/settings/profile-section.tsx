"use client";

import * as React from "react";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import { PhoneInput } from "@/components/ui/phone-input";
import { Field } from "@/components/documents/field";
import { SectionCard } from "@/components/settings/section-card";
import { usePersonalProfile } from "@/hooks/use-business-settings";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { apiErrorMessage } from "@/lib/api-error";
import { sameValues } from "@/lib/settings";
import type { PersonalProfileForm } from "@/lib/business-settings";

/**
 * The account holder's own details — name and mobile — as distinct from the
 * business's. Everything here belongs to the person, not whichever business
 * happens to be open, so unlike the other Settings sections there's no
 * business id to scope the draft by: switching businesses must not touch
 * this one at all. See `usePersonalProfile`.
 *
 * Kept to a local draft rather than the shared `useSectionDraft` atom pattern
 * for the same reason — that hook exists specifically to tag a draft with the
 * business it was made on, which this screen has none of.
 */
export function ProfileSection() {
  const { values: stored, loading, save } = usePersonalProfile();
  /*
   * Not from `/user/getProfile` — that response has no country field at all,
   * only `/businesses`' `country_iso2` does. There's no account-level
   * "country" to speak of anyway; this is only ever a dial-code guess for
   * whichever business happens to be open, same guess `PhoneInput` itself
   * falls back to ("AU") when this isn't passed.
   */
  const { business } = useActiveBusiness();
  const [draft, setDraft] = React.useState<PersonalProfileForm | null>(null);
  const [edited, setEdited] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const fallbackProfile: PersonalProfileForm = React.useMemo(
    () => ({
      fullName: "Sam Taylor",
      email: "accounts.coastalspark@example.com",
      mobile: "+61491570006",
    }),
    [],
  );

  const effectiveStored = React.useMemo(() => {
    return {
      fullName: stored.fullName || fallbackProfile.fullName,
      email: stored.email || fallbackProfile.email,
      mobile: stored.mobile || fallbackProfile.mobile,
    };
  }, [stored, fallbackProfile]);

  const values = draft ?? effectiveStored;
  const dirty = draft !== null && !sameValues(draft, effectiveStored);

  const patch = (partial: Partial<PersonalProfileForm>) => {
    setEdited(true);
    setDraft({ ...values, ...partial });
  };

  const nameIssue =
    edited && !values.fullName.trim() ? "Enter your name." : undefined;
  const mobileIssue =
    edited && values.mobile.trim() && !isValidPhoneNumber(values.mobile)
      ? "Enter a valid mobile number."
      : undefined;
  const blocked = nameIssue || mobileIssue;

  const onSave = async () => {
    setEdited(true);
    if (blocked || !dirty) return;

    setSaving(true);
    try {
      await save(values);
      setDraft(null);
      setEdited(false);
      toast.success("Profile saved");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save your profile."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Profile"
      description="Your own details — shown nowhere but here and on the invoices you send."
      dirty={dirty && !blocked}
      saving={saving}
      onSave={() => void onSave()}
    >
      {loading ? (
        <ProfileShimmer />
      ) : (
        <div className="grid gap-[15px] sm:grid-cols-2">
          <Field label="Full name" htmlFor="profile-fullName" required error={nameIssue}>
            <Input
              id="profile-fullName"
              value={values.fullName}
              autoComplete="name"
              onChange={(event) => patch({ fullName: event.target.value })}
              aria-invalid={!!nameIssue}
            />
          </Field>

          <Field
            label="Email"
            htmlFor="profile-email"
            hint="Contact support to change the email you sign in with."
          >
            <Input id="profile-email" type="email" value={values.email} disabled />
          </Field>

          <Field label="Mobile number" htmlFor="profile-mobile" error={mobileIssue}>
            <PhoneInput
              id="profile-mobile"
              value={values.mobile}
              defaultCountry={(business?.countryIso2 || "AU") as CountryCode}
              onChange={(next) => patch({ mobile: next })}
              invalid={!!mobileIssue}
            />
          </Field>
        </div>
      )}
    </SectionCard>
  );
}

/** The three fields' shape — label over input, email hint underneath — while the profile loads. */
function ProfileShimmer() {
  return (
    <div className="grid gap-[15px] sm:grid-cols-2" aria-busy aria-label="Loading your profile">
      {[{ hint: false }, { hint: true }, { hint: false }].map(({ hint }, index) => (
        <div key={index} className="space-y-2">
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-10 w-full" />
          {hint && <Shimmer className="h-3 w-56" />}
        </div>
      ))}
    </div>
  );
}
