"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, MapPin } from "lucide-react";

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
  TextAreaField,
  TextField,
} from "@/components/payments/shared/onboarding-fields";
import {
  NEXXTAP_BUSINESS_STATUS,
  NEXXTAP_STATES,
  businessIssues,
  fetchIndustryCategories,
  fetchIndustryTypes,
  type NexxtapBusiness,
} from "@/lib/nexxtap";

/** Where `businessIssues`' keys actually live on the page, for scroll-to-error. */
const FIELD_IDS: Record<string, string> = {
  business_name: "nexxtap-business-name",
  abn: "nexxtap-business-abn",
  contact_support_number: "nexxtap-business-phone",
  industry_type: "nexxtap-business-industry",
  product_or_service: "nexxtap-business-product",
  business_description: "nexxtap-business-description",
  website: "nexxtap-business-website",
  instagram_profile: "nexxtap-business-instagram",
  facebook_profile: "nexxtap-business-facebook",
  business_address: "nexxtap-business-address",
  city: "nexxtap-business-city",
  state: "nexxtap-business-state",
  post_code: "nexxtap-business-postcode",
};

/**
 * Business details.
 *
 * One form over two sections: what the business is, and where it trades from.
 * Both save together — they're one step in the tracker, and a Save that
 * committed the business but not the address would tick a step that isn't
 * done.
 *
 * The two industry selects are the only fields here that aren't free text:
 * NextTap publishes its own industry list and, under each one, the products
 * and services it will board. Picking an industry is what loads the second
 * list, so changing it clears whatever was chosen from the old one.
 */
export function NexxtapBusinessScreen() {
  const { draft, setDraft, issues, saving, save, fieldEvents } =
    useNexxtapStepForm<NexxtapBusiness>({
      stepId: "business",
      select: (state) => state.business,
      merge: (state, business) => ({ ...state, business }),
      validate: businessIssues,
      fieldIds: FIELD_IDS,
      savedMessage: "Business details saved",
    });

  const patch = (values: Partial<NexxtapBusiness>) =>
    setDraft({ ...draft, ...values });

  const industries = useQuery({
    queryKey: ["nexxtap-industry-types"],
    queryFn: fetchIndustryTypes,
    // The list is the same for everyone and changes about never, so it's
    // fetched once for the session rather than on each visit to this step.
    staleTime: Infinity,
  });

  const categories = useQuery({
    queryKey: ["nexxtap-industry-categories", draft.industry_type],
    queryFn: () => fetchIndustryCategories(draft.industry_type),
    enabled: Boolean(draft.industry_type),
    staleTime: Infinity,
  });

  const industryOptions = React.useMemo(
    () =>
      (industries.data ?? []).map((option) => ({
        id: option.value,
        name: option.label,
      })),
    [industries.data],
  );

  const categoryOptions = React.useMemo(
    () =>
      (categories.data ?? []).map((option) => ({
        id: option.value,
        name: option.label,
      })),
    [categories.data],
  );

  return (
    <NexxtapOnboardingShell stepId="business">
      <div className="space-y-4" {...fieldEvents}>
        <FormSection
          icon={Building2}
          title="Business details"
          description="The business NextTap will be boarding."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={FIELD_IDS.business_name}
              label="Business name"
              required
              placeholder="ABC Pty Ltd"
              value={draft.business_name}
              error={issues.business_name}
              onChange={(business_name) => patch({ business_name })}
            />
            <TextField
              id="nexxtap-business-trading-name"
              label="Trading name"
              hint="Only if you trade under a different name."
              placeholder="ABC Coffee"
              value={draft.doing_business_as}
              onChange={(doing_business_as) => patch({ doing_business_as })}
            />
            <TextField
              id={FIELD_IDS.abn}
              label="ABN"
              required
              inputMode="numeric"
              placeholder="12345678901"
              value={draft.abn}
              error={issues.abn}
              onChange={(abn) => patch({ abn })}
            />
            <TextField
              id={FIELD_IDS.contact_support_number}
              label="Support phone"
              required
              inputMode="tel"
              hint="Digits only — no spaces, dashes or plus sign."
              placeholder="0412345678"
              value={draft.contact_support_number}
              error={issues.contact_support_number}
              onChange={(contact_support_number) =>
                patch({ contact_support_number })
              }
            />
            <RadioField
              id="nexxtap-business-status"
              label="Business status"
              required
              options={NEXXTAP_BUSINESS_STATUS}
              value={draft.new_or_existing_business}
              onChange={(new_or_existing_business) =>
                patch({ new_or_existing_business })
              }
            />
            <SelectField
              id={FIELD_IDS.industry_type}
              label="Industry"
              required
              options={industryOptions}
              value={draft.industry_type}
              error={issues.industry_type}
              placeholder={
                industries.isLoading ? "Loading industries…" : "Select industry"
              }
              onChange={(industry_type) =>
                // The product list belongs to the industry, so a stale
                // selection from the previous one has to go with it.
                patch({ industry_type, product_or_service: "" })
              }
            />
            <SelectField
              id={FIELD_IDS.product_or_service}
              label="Product or service"
              required
              options={categoryOptions}
              value={draft.product_or_service}
              error={issues.product_or_service}
              disabled={!draft.industry_type}
              placeholder={
                !draft.industry_type
                  ? "Select an industry first"
                  : categories.isLoading
                    ? "Loading…"
                    : "Select product or service"
              }
              onChange={(product_or_service) => patch({ product_or_service })}
            />
          </div>

          {/*
            NextTap wants somewhere it can see the business trading before it
            will board it. Any one of the three does, which is why they sit
            together under a rule rather than among the fields above.
          */}
          <div className="space-y-4 border-t border-border pt-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Online presence</p>
              <p className="text-xs text-muted-foreground">
                At least one of these is required. Each has to be a full URL
                starting with https://
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                id={FIELD_IDS.website}
                label="Website"
                placeholder="https://example.com"
                value={draft.website}
                error={issues.website}
                onChange={(website) => patch({ website })}
              />
              <TextField
                id={FIELD_IDS.instagram_profile}
                label="Instagram"
                placeholder="https://instagram.com/business"
                value={draft.instagram_profile}
                error={issues.instagram_profile}
                onChange={(instagram_profile) => patch({ instagram_profile })}
              />
              <TextField
                id={FIELD_IDS.facebook_profile}
                label="Facebook"
                placeholder="https://facebook.com/business"
                value={draft.facebook_profile}
                error={issues.facebook_profile}
                onChange={(facebook_profile) => patch({ facebook_profile })}
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <TextAreaField
              id={FIELD_IDS.business_description}
              label="Business description"
              required
              hint="What the business actually sells, in a sentence or two."
              placeholder="Describe the core products or services."
              value={draft.business_description}
              error={issues.business_description}
              onChange={(business_description) => patch({ business_description })}
            />
          </div>
        </FormSection>

        <FormSection
          icon={MapPin}
          title="Business address"
          description="Where the business trades from."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                id={FIELD_IDS.business_address}
                label="Street address"
                required
                placeholder="123 Main Street"
                value={draft.business_address}
                error={issues.business_address}
                onChange={(business_address) => patch({ business_address })}
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
            "Save business details"
          )
        }
      />
    </NexxtapOnboardingShell>
  );
}
