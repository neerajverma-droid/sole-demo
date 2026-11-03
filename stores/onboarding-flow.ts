import { create } from "zustand";

import {
  emptyCompanyProfile,
  type CompanyProfileDraft,
} from "@/lib/onboarding";

/**
 * What the person is typing on the business page, while they're typing it.
 *
 * Separate from `stores/onboarding.ts`, which is the dashboard's get-started
 * checklist for an account that already exists, and from `stores/welcome.ts`,
 * which holds the tailoring answers. This one only lives for the length of one
 * screen.
 *
 * A store rather than state on the page because two components need the same
 * live value: the form on the right writes it, and the preview card on the left
 * reads it back as it's typed. Prop-drilling would work today and stop working
 * the moment anything else wants to show the same in-progress profile — and
 * "the card is a view of the draft" is a truer description of the relationship
 * than "the form owns the card".
 *
 * Not persisted. A half-finished profile surviving a browser restart is a stale
 * answer rather than a helpful one, and what's actually worth keeping is
 * committed to the settings store when the page is submitted.
 */
type OnboardingFlowState = {
  profile: CompanyProfileDraft;
  patchProfile: (values: Partial<CompanyProfileDraft>) => void;
};

export const useOnboardingFlowStore = create<OnboardingFlowState>()((set) => ({
  profile: emptyCompanyProfile(),
  patchProfile: (values) =>
    set((state) => ({ profile: { ...state.profile, ...values } })),
}));
