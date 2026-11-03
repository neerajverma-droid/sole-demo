"use client";

import { Loader2, Repeat, WalletCards } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "@/components/ui/form-section";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/documents/field";
import {
  NexxtapOnboardingShell,
  NexxtapStepFooter,
  NEXXTAP_SECTION_HEADER,
} from "@/components/payments/nexxtap/onboarding-shell";
import { useNexxtapStepForm } from "@/components/payments/nexxtap/use-step-form";
import {
  RadioField,
  SelectField,
  TextAreaField,
} from "@/components/payments/shared/onboarding-fields";
import {
  NEXXTAP_DEVICES,
  NEXXTAP_SUBSCRIPTION_FREQUENCIES,
  NEXXTAP_SUBSCRIPTION_TERMS,
  YES_NO,
  facilitiesIssues,
  type NexxtapFacilities,
} from "@/lib/nexxtap";

const FIELD_IDS: Record<string, string> = {
  selected_devices: "nexxtap-facilities-devices",
  term_of_your_subscription: "nexxtap-facilities-term",
  frequency_of_subscriptions: "nexxtap-facilities-frequency",
};

/**
 * What the merchant wants switched on.
 *
 * Devices first, because that's the product: NextTap is tap-to-pay on a
 * phone, so which platforms the business takes payments on is the one answer
 * this step can't do without. Everything else is a facility that can be added
 * later.
 *
 * The subscription questions only appear once subscriptions are switched on —
 * and they're only sent then too, which is why they're only required then.
 */
export function NexxtapFacilitiesScreen() {
  const { draft, setDraft, issues, saving, save, fieldEvents } =
    useNexxtapStepForm<NexxtapFacilities>({
      stepId: "facilities",
      select: (state) => state.facilities,
      merge: (state, facilities) => ({ ...state, facilities }),
      validate: facilitiesIssues,
      fieldIds: FIELD_IDS,
      savedMessage: "Facilities saved",
    });

  const patch = (values: Partial<NexxtapFacilities>) =>
    setDraft({ ...draft, ...values });

  const toggleDevice = (device: string, on: boolean) =>
    patch({
      selected_devices: on
        ? [...draft.selected_devices, device]
        : draft.selected_devices.filter((current) => current !== device),
    });

  const subscriptions =
    String(draft.do_you_process_subscriptions_or_memberships) === "1";

  return (
    <NexxtapOnboardingShell stepId="facilities">
      <div className="space-y-4" {...fieldEvents}>
        <FormSection
          icon={WalletCards}
          title="Devices and facilities"
          description="What NextTap switches on for this merchant."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          {/* Checkboxes rather than a multi-select: there are two options and
              both can be on, so a trigger that hides them would cost a click
              to show the whole list. */}
          <Field
            label="Payment devices"
            htmlFor={FIELD_IDS.selected_devices}
            required
            hint="Which phones the business will take taps on."
            error={issues.selected_devices}
          >
            <div
              id={FIELD_IDS.selected_devices}
              className="flex flex-wrap gap-x-6 gap-y-2 pt-1"
            >
              {NEXXTAP_DEVICES.map((device) => (
                <Label
                  key={device.value}
                  className="flex items-center gap-2 text-sm font-normal"
                >
                  <Checkbox
                    checked={draft.selected_devices.includes(device.value)}
                    onCheckedChange={(checked) =>
                      toggleDevice(device.value, checked === true)
                    }
                  />
                  {device.label}
                </Label>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <RadioField
              id="nexxtap-facilities-ecomm"
              label="Online (ecommerce) facility"
              required
              hint="Taking card payments on a website or a payment link."
              options={YES_NO}
              value={draft.require_online_ecomm_facility}
              onChange={(require_online_ecomm_facility) =>
                patch({ require_online_ecomm_facility })
              }
            />
            <RadioField
              id="nexxtap-facilities-nexxpos"
              label="NexxPOS facility"
              required
              hint="NextTap's own point-of-sale app."
              options={YES_NO}
              value={draft.require_online_nexxpos_facility}
              onChange={(require_online_nexxpos_facility) =>
                patch({ require_online_nexxpos_facility })
              }
            />
            <RadioField
              id="nexxtap-facilities-amex"
              label="American Express"
              required
              hint="Amex is boarded separately and priced differently."
              options={YES_NO}
              value={draft.require_online_amex_facility}
              onChange={(require_online_amex_facility) =>
                patch({ require_online_amex_facility })
              }
            />
            <RadioField
              id="nexxtap-facilities-surcharge"
              label="Customer pays the surcharge"
              required
              hint="Off means the business absorbs the card fee itself."
              options={YES_NO}
              value={draft.customer_pays_surcharge}
              onChange={(customer_pays_surcharge) =>
                patch({ customer_pays_surcharge })
              }
            />
          </div>
        </FormSection>

        <FormSection
          icon={Repeat}
          title="Subscriptions and memberships"
          description="Recurring charges NextTap needs to know about up front."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <RadioField
            id="nexxtap-facilities-subscriptions"
            label="Do you charge subscriptions or memberships?"
            required
            options={YES_NO}
            value={draft.do_you_process_subscriptions_or_memberships}
            onChange={(do_you_process_subscriptions_or_memberships) =>
              patch({ do_you_process_subscriptions_or_memberships })
            }
          />

          {subscriptions && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id={FIELD_IDS.term_of_your_subscription}
                  label="Subscription term"
                  required
                  options={NEXXTAP_SUBSCRIPTION_TERMS}
                  value={draft.term_of_your_subscription}
                  error={issues.term_of_your_subscription}
                  placeholder="Select a term"
                  onChange={(term_of_your_subscription) =>
                    patch({ term_of_your_subscription })
                  }
                />
                <SelectField
                  id={FIELD_IDS.frequency_of_subscriptions}
                  label="Billing frequency"
                  required
                  options={NEXXTAP_SUBSCRIPTION_FREQUENCIES}
                  value={draft.frequency_of_subscriptions}
                  error={issues.frequency_of_subscriptions}
                  placeholder="Select a frequency"
                  onChange={(frequency_of_subscriptions) =>
                    patch({ frequency_of_subscriptions })
                  }
                />
              </div>

              <TextAreaField
                id="nexxtap-facilities-notes"
                label="Transaction notes"
                hint="Anything about these charges NextTap's risk team should see."
                placeholder="What the subscription covers, and how customers sign up."
                value={draft.transaction_information_notes}
                onChange={(transaction_information_notes) =>
                  patch({ transaction_information_notes })
                }
              />
            </div>
          )}
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
            "Save facilities"
          )
        }
      />
    </NexxtapOnboardingShell>
  );
}
