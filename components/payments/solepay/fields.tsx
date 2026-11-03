"use client";

/**
 * SolePay's form controls.
 *
 * These now live in `components/payments/shared/onboarding-fields.tsx`, shared
 * with NextTap's onboarding — this file stays as the door SolePay's screens
 * already come through, so nothing here had to change when the second gateway
 * arrived.
 */

export {
  AddressSearchField,
  SearchableSelectField,
  SelectField,
  TextField,
  focusFirstIssue as focusFirstSolePayIssue,
  type SelectFieldOption,
} from "@/components/payments/shared/onboarding-fields";
