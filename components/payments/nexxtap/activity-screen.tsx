"use client";

import { CreditCard, Loader2, Percent } from "lucide-react";

import { FormSection } from "@/components/ui/form-section";
import {
  NexxtapOnboardingShell,
  NexxtapStepFooter,
  NEXXTAP_SECTION_HEADER,
} from "@/components/payments/nexxtap/onboarding-shell";
import { useNexxtapStepForm } from "@/components/payments/nexxtap/use-step-form";
import {
  RadioField,
  TextField,
} from "@/components/payments/shared/onboarding-fields";
import {
  MAX_ANNUAL_TURNOVER,
  YES_NO,
  activityIssues,
  hasTrust,
  type NexxtapActivity,
} from "@/lib/nexxtap";

const FIELD_IDS: Record<string, string> = {
  trust_name: "nexxtap-activity-trust-name",
  estimated_annual_turnover: "nexxtap-activity-turnover",
  average_number_of_credit_card_sales_per_month: "nexxtap-activity-card-sales",
  face_to_face_usage_percentage: "nexxtap-activity-face-to-face",
  ecommerce_usage_percentage: "nexxtap-activity-ecommerce",
};

/**
 * How the business trades.
 *
 * The risk questions and the volumes, which is what NextTap actually prices
 * the merchant on. Two rules here aren't obvious from the fields:
 *
 * - A trust name is only asked for, and only sent, when the business says it
 *   has a trust — and answering yes is also what makes a trust deed required
 *   in the Documents step.
 * - The payment mix has to total exactly 100. It's two numbers rather than
 *   one slider because NextTap stores both, and a merchant who is 100% in
 *   person should be able to say so by typing it.
 */
export function NexxtapActivityScreen() {
  const { draft, setDraft, issues, saving, save, fieldEvents } =
    useNexxtapStepForm<NexxtapActivity>({
      stepId: "activity",
      select: (state) => state.activity,
      merge: (state, activity) => ({ ...state, activity }),
      validate: activityIssues,
      fieldIds: FIELD_IDS,
      savedMessage: "Business activity saved",
    });

  const patch = (values: Partial<NexxtapActivity>) =>
    setDraft({ ...draft, ...values });

  const trust = hasTrust(draft);
  const mix =
    Number(draft.face_to_face_usage_percentage || 0) +
    Number(draft.ecommerce_usage_percentage || 0);

  return (
    <NexxtapOnboardingShell stepId="activity">
      <div className="space-y-4" {...fieldEvents}>
        <FormSection
          icon={CreditCard}
          title="Business activity"
          description="What NextTap needs to know about how the business trades."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <RadioField
              id="nexxtap-activity-trust"
              label="Is the business held in a trust?"
              required
              hint="Answering yes means NextTap will also want the trust deeds."
              options={YES_NO}
              value={draft.company_have_a_trust}
              onChange={(company_have_a_trust) =>
                patch({
                  company_have_a_trust,
                  // Cleared when the answer goes back to no, so a stale name
                  // can't travel on an application that has no trust.
                  trust_name:
                    company_have_a_trust === "1" ? draft.trust_name : "",
                })
              }
            />
            {/* Only asked when it applies — a permanently visible field that
                is usually blank reads as one the applicant forgot. */}
            {trust && (
              <TextField
                id={FIELD_IDS.trust_name}
                label="Trust name"
                required
                placeholder="The Smith Family Trust"
                value={draft.trust_name}
                error={issues.trust_name}
                onChange={(trust_name) => patch({ trust_name })}
              />
            )}
            <RadioField
              id="nexxtap-activity-terminated"
              label="Has a merchant facility ever been terminated?"
              required
              options={YES_NO}
              value={draft.had_a_merchant_facility_terminated}
              onChange={(had_a_merchant_facility_terminated) =>
                patch({ had_a_merchant_facility_terminated })
              }
            />
            <RadioField
              id="nexxtap-activity-current-facilities"
              label="Any merchant facilities at the moment?"
              required
              options={YES_NO}
              value={draft.currently_have_any_merchant_facilities}
              onChange={(currently_have_any_merchant_facilities) =>
                patch({ currently_have_any_merchant_facilities })
              }
            />
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <TextField
              id={FIELD_IDS.estimated_annual_turnover}
              label="Estimated annual turnover"
              required
              type="number"
              inputMode="numeric"
              hint={`NextTap boards up to $${MAX_ANNUAL_TURNOVER.toLocaleString()} a year on this application.`}
              placeholder="500000"
              value={draft.estimated_annual_turnover}
              error={issues.estimated_annual_turnover}
              onChange={(estimated_annual_turnover) =>
                patch({ estimated_annual_turnover })
              }
            />
            <TextField
              id={FIELD_IDS.average_number_of_credit_card_sales_per_month}
              label="Average card sales a month"
              required
              type="number"
              inputMode="numeric"
              hint="How many card transactions, not how much they come to."
              placeholder="350"
              value={draft.average_number_of_credit_card_sales_per_month}
              error={issues.average_number_of_credit_card_sales_per_month}
              onChange={(average_number_of_credit_card_sales_per_month) =>
                patch({ average_number_of_credit_card_sales_per_month })
              }
            />
          </div>
        </FormSection>

        <FormSection
          icon={Percent}
          title="Payment mix"
          description="How the takings split between in person and online. The two have to add up to 100%."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={FIELD_IDS.face_to_face_usage_percentage}
              label="Face-to-face %"
              required
              type="number"
              inputMode="numeric"
              placeholder="80"
              value={draft.face_to_face_usage_percentage}
              error={issues.face_to_face_usage_percentage}
              onChange={(face_to_face_usage_percentage) =>
                patch({ face_to_face_usage_percentage })
              }
            />
            <TextField
              id={FIELD_IDS.ecommerce_usage_percentage}
              label="Ecommerce %"
              required
              type="number"
              inputMode="numeric"
              placeholder="20"
              value={draft.ecommerce_usage_percentage}
              error={issues.ecommerce_usage_percentage}
              onChange={(ecommerce_usage_percentage) =>
                patch({ ecommerce_usage_percentage })
              }
            />
          </div>

          {/* The running total, said as it stands rather than only once Save
              has rejected it — the rule is arithmetic, so it can be checked
              while it's being typed. */}
          <p
            className={
              mix === 100
                ? "text-xs text-muted-foreground tabular"
                : "text-xs text-destructive tabular"
            }
          >
            Currently {mix}% of 100%
          </p>
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
            "Save business activity"
          )
        }
      />
    </NexxtapOnboardingShell>
  );
}
