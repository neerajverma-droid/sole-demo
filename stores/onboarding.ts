import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OnboardingStepKey =
  "invoice" | "products" | "goal" | "bank" | "accountant";

/** What a row does when it's clicked: go somewhere, or open something. */
export type OnboardingStepAction = "connect-bank" | "invite-accountant";

export type OnboardingStep = {
  key: OnboardingStepKey;
  label: string;
  href?: string;
  action?: OnboardingStepAction;
  /** Shown as skippable, and never the thing standing between you and value. */
  optional?: boolean;
  /**
   * Held back until there's something to reconcile. A bank feed is the right
   * answer to "where did this transaction come from", which isn't a question
   * anyone has before they've raised an invoice.
   */
  needsActivity?: boolean;
};

/**
 * The get-started list, in the order it's worth doing.
 *
 * Invoicing leads because it's the one item that pays for itself on the first
 * try and needs no setup at all — the product proving itself before it asks for
 * anything. Connecting a bank used to be first, and was also step 2 of a
 * four-screen wizard before anyone had seen the app; it's now optional, near
 * the bottom, and doesn't appear until there's activity to reconcile.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { key: "invoice", label: "Create your first invoice", href: "/invoices/new" },
  {
    key: "products",
    label: "Add your products & services",
    href: "/sales/products",
  },
  {
    key: "goal",
    label: "Set your revenue goal",
    href: "/expenses/business-planner",
  },
  {
    key: "bank",
    label: "Connect a bank",
    action: "connect-bank",
    optional: true,
    needsActivity: true,
  },
  {
    key: "accountant",
    label: "Invite your accountant",
    action: "invite-accountant",
    optional: true,
  },
];

/**
 * The rows worth showing right now. Both surfaces that render this list — the
 * header popover and the dashboard card — go through here, so neither can drift
 * into showing a different list or a different count from the other.
 */
export function visibleOnboardingSteps(hasActivity: boolean): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => !step.needsActivity || hasActivity);
}

/**
 * Whether a step is done. The bank asks the account list rather than the tick:
 * a connected bank is connected whether or not anyone remembered to check it
 * off, and a checklist arguing with the thing it's describing is worse than no
 * checklist.
 */
export function isOnboardingStepDone(
  done: Record<OnboardingStepKey, boolean>,
  key: OnboardingStepKey,
  connectedAccounts: number,
): boolean {
  return key === "bank" ? done.bank || connectedAccounts > 0 : done[key];
}

type OnboardingState = {
  done: Record<OnboardingStepKey, boolean>;
  toggle: (key: OnboardingStepKey) => void;
  complete: (key: OnboardingStepKey) => void;
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      done: {
        invoice: false,
        products: false,
        goal: true,
        bank: false,
        accountant: false,
      },
      toggle: (key) =>
        set((s) => ({ done: { ...s.done, [key]: !s.done[key] } })),
      complete: (key) => set((s) => ({ done: { ...s.done, [key]: true } })),
    }),
    {
      name: "sole-onboarding",
      // Rehydrated manually after mount so server and first client render match.
      skipHydration: true,
    },
  ),
);
