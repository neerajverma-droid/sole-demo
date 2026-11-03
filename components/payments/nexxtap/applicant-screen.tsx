"use client";

import { Loader2, MapPin, User } from "lucide-react";

import { FormSection } from "@/components/ui/form-section";
import {
  NexxtapOnboardingShell,
  NexxtapStepFooter,
  NEXXTAP_SECTION_HEADER,
} from "@/components/payments/nexxtap/onboarding-shell";
import { useNexxtapStepForm } from "@/components/payments/nexxtap/use-step-form";
import {
  RadioField,
  SelectField,
  TextField,
} from "@/components/payments/shared/onboarding-fields";
import {
  NEXXTAP_NOTIFICATION_OPTIONS,
  NEXXTAP_STATES,
  applicantIssues,
  todayIso,
  type NexxtapApplicant,
} from "@/lib/nexxtap";

const FIELD_IDS: Record<string, string> = {
  first_name: "nexxtap-applicant-first-name",
  last_name: "nexxtap-applicant-last-name",
  date_of_birth: "nexxtap-applicant-dob",
  position: "nexxtap-applicant-position",
  contact_number: "nexxtap-applicant-phone",
  email: "nexxtap-applicant-email",
  address: "nexxtap-applicant-address",
  city: "nexxtap-applicant-city",
  state: "nexxtap-applicant-state",
  post_code: "nexxtap-applicant-postcode",
};

/**
 * The authorised applicant — the one person who signs the application.
 *
 * Their residential address, not the business's: NextTap verifies the person
 * separately from the entity, so the two addresses are asked for separately
 * even though the prefill starts them the same.
 */
export function NexxtapApplicantScreen() {
  const { draft, setDraft, issues, saving, save, fieldEvents } =
    useNexxtapStepForm<NexxtapApplicant>({
      stepId: "applicant",
      select: (state) => state.applicant,
      merge: (state, applicant) => ({ ...state, applicant }),
      validate: applicantIssues,
      fieldIds: FIELD_IDS,
      savedMessage: "Applicant details saved",
    });

  const patch = (values: Partial<NexxtapApplicant>) =>
    setDraft({ ...draft, ...values });

  return (
    <NexxtapOnboardingShell stepId="applicant">
      <div className="space-y-4" {...fieldEvents}>
        <FormSection
          icon={User}
          title="Authorised applicant"
          description="Whoever signs for the business."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={FIELD_IDS.first_name}
              label="First name"
              required
              placeholder="John"
              value={draft.first_name}
              error={issues.first_name}
              onChange={(first_name) => patch({ first_name })}
            />
            <TextField
              id="nexxtap-applicant-middle-name"
              label="Middle name"
              placeholder="A"
              value={draft.middle_name}
              onChange={(middle_name) => patch({ middle_name })}
            />
            <TextField
              id={FIELD_IDS.last_name}
              label="Last name"
              required
              placeholder="Smith"
              value={draft.last_name}
              error={issues.last_name}
              onChange={(last_name) => patch({ last_name })}
            />
            <TextField
              id={FIELD_IDS.date_of_birth}
              label="Date of birth"
              required
              type="date"
              max={todayIso()}
              value={draft.date_of_birth}
              error={issues.date_of_birth}
              onChange={(date_of_birth) => patch({ date_of_birth })}
            />
            <TextField
              id={FIELD_IDS.position}
              label="Position"
              required
              placeholder="Director"
              value={draft.position}
              error={issues.position}
              onChange={(position) => patch({ position })}
            />
            <TextField
              id={FIELD_IDS.contact_number}
              label="Contact number"
              required
              inputMode="tel"
              hint="Digits only — no spaces, dashes or plus sign."
              placeholder="0412345678"
              value={draft.contact_number}
              error={issues.contact_number}
              onChange={(contact_number) => patch({ contact_number })}
            />
            <TextField
              id={FIELD_IDS.email}
              label="Email"
              required
              type="email"
              placeholder="john@example.com"
              value={draft.email}
              error={issues.email}
              onChange={(email) => patch({ email })}
            />
            <TextField
              id="nexxtap-applicant-password"
              label="NextTap portal password"
              type="password"
              hint="Optional — sets the password for the NextTap merchant portal. Leave blank and NextTap will email an invite instead."
              placeholder="Optional"
              value={draft.password}
              onChange={(password) => patch({ password })}
            />
          </div>

          <div className="border-t border-border pt-4">
            <RadioField
              id="nexxtap-applicant-notifications"
              label="Merchant notifications"
              required
              hint="Whether NextTap emails this applicant about the application and, later, settlements."
              options={NEXXTAP_NOTIFICATION_OPTIONS}
              value={draft.dont_send_notifications_to_merchant}
              onChange={(dont_send_notifications_to_merchant) =>
                patch({ dont_send_notifications_to_merchant })
              }
            />
          </div>
        </FormSection>

        <FormSection
          icon={MapPin}
          title="Residential address"
          description="Where the applicant lives, which NextTap verifies separately from the business."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                id={FIELD_IDS.address}
                label="Street address"
                required
                placeholder="45 Park Avenue"
                value={draft.address}
                error={issues.address}
                onChange={(address) => patch({ address })}
              />
            </div>
            <TextField
              id={FIELD_IDS.city}
              label="City"
              required
              placeholder="Brisbane"
              value={draft.city}
              error={issues.city}
              onChange={(city) => patch({ city })}
            />
            <SelectField
              id={FIELD_IDS.state}
              label="State"
              required
              options={NEXXTAP_STATES}
              value={draft.state}
              error={issues.state}
              placeholder="Select state"
              onChange={(state) => patch({ state })}
            />
            <TextField
              id={FIELD_IDS.post_code}
              label="Post code"
              required
              inputMode="numeric"
              placeholder="4000"
              value={draft.post_code}
              error={issues.post_code}
              onChange={(post_code) => patch({ post_code })}
            />
          </div>
        </FormSection>
      </div>

      <NexxtapStepFooter
        onSave={save}
        saveDisabled={saving}
        saveLabel={
          saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save applicant details"
          )
        }
      />
    </NexxtapOnboardingShell>
  );
}
