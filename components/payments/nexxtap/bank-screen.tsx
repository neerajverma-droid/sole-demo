"use client";

import { Landmark, Loader2 } from "lucide-react";

import { FormSection } from "@/components/ui/form-section";
import {
  NexxtapOnboardingShell,
  NexxtapStepFooter,
  NEXXTAP_SECTION_HEADER,
} from "@/components/payments/nexxtap/onboarding-shell";
import { useNexxtapStepForm } from "@/components/payments/nexxtap/use-step-form";
import { TextField } from "@/components/payments/shared/onboarding-fields";
import { bankIssues, type NexxtapBank } from "@/lib/nexxtap";

const FIELD_IDS: Record<string, string> = {
  account_name: "nexxtap-bank-account-name",
  bsb: "nexxtap-bank-bsb",
  account_number: "nexxtap-bank-account-number",
};

/**
 * The settlement account.
 *
 * Short, and the step everything else waits on: the Documents step is locked
 * until this is saved, because the bank statement NextTap asks for is checked
 * against the account named here.
 */
export function NexxtapBankScreen() {
  const { draft, setDraft, issues, saving, save, fieldEvents } =
    useNexxtapStepForm<NexxtapBank>({
      stepId: "bank",
      select: (state) => state.bank,
      merge: (state, bank) => ({ ...state, bank }),
      validate: bankIssues,
      fieldIds: FIELD_IDS,
      savedMessage: "Settlement account saved",
    });

  const patch = (values: Partial<NexxtapBank>) =>
    setDraft({ ...draft, ...values });

  return (
    <NexxtapOnboardingShell stepId="bank">
      <div className="space-y-4" {...fieldEvents}>
        <FormSection
          icon={Landmark}
          title="Settlement bank account"
          description="Where NextTap pays the takings."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                id={FIELD_IDS.account_name}
                label="Account name"
                required
                hint="Has to match the name on the bank statement you upload, and the authorised applicant."
                placeholder="ABC Pty Ltd"
                value={draft.account_name}
                error={issues.account_name}
                onChange={(account_name) => patch({ account_name })}
              />
            </div>
            <TextField
              id={FIELD_IDS.bsb}
              label="BSB"
              required
              inputMode="numeric"
              placeholder="062000"
              value={draft.bsb}
              error={issues.bsb}
              onChange={(bsb) => patch({ bsb })}
            />
            <TextField
              id={FIELD_IDS.account_number}
              label="Account number"
              required
              inputMode="numeric"
              hint="NextTap accepts up to 9 digits."
              placeholder="12345678"
              value={draft.account_number}
              error={issues.account_number}
              onChange={(account_number) => patch({ account_number })}
            />
            <TextField
              id="nexxtap-bank-name"
              label="Bank name"
              placeholder="Commonwealth Bank"
              value={draft.bank_name}
              onChange={(bank_name) => patch({ bank_name })}
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
            "Save settlement account"
          )
        }
      />
    </NexxtapOnboardingShell>
  );
}
