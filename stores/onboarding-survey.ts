import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * What Pip's onboarding survey knows about the account.
 *
 * Ported from `sole-webapp/components/OnboardingSurveyPopup/index.js`, which
 * kept its equivalent state in a `window`-level cache
 * (`__soleOnboardingSurvey`) plus a couple of raw `sessionStorage`/
 * `localStorage` keys, because its popup remounts on every client-side
 * navigation (each page renders its own Layout there) and a plain component
 * state or `setTimeout` would restart from zero on every page. This app's
 * popup is meant to mount once, above the router, in `app/(app)/layout.tsx` —
 * so the same problem doesn't strictly recur — but persisting to storage is
 * still the right call here: it's also what survives a full reload, which
 * source's window cache never did (a laptop closed mid-flow lost source's
 * cache entirely; a reload here just re-reads it).
 *
 * Follows `stores/welcome.ts`'s exact shape: `persist` to `localStorage`,
 * `skipHydration: true` so the server and the first client render agree, and
 * a `version` to bump when a migration is needed. See
 * `lib/use-onboarding-survey-hydrated.ts` for the rehydration gate.
 *
 * Two things this store deliberately does NOT hold, both because they
 * already live somewhere else in this app and duplicating them would only
 * create a second place to keep in sync:
 *
 * - The industry answer. Source's popup asks it (`industry_id`); this app
 *   collects it mandatorily at sign-up instead
 *   (`components/onboarding/first-run` /  `CompanyProfileStep`, before the
 *   dashboard even exists to overlay — see the file doc on `lib/welcome.ts`).
 *   Read it with `useSettingsStore((s) => s.business.industry)`, the same way
 *   `FirstRunOverlay` does.
 * - Which nav ids are pinned. `lib/atoms.ts`'s `pinnedNavIdsAtom` is already
 *   the live, global, Jotai-backed pin state that the sidebar itself reads
 *   and writes — a second copy of "what's pinned" here could disagree with
 *   it. This store only remembers whether a *starter set* has ever been
 *   offered (`pinsSuggestedOnce`), which is a fact about the survey, not
 *   about the sidebar.
 *
 * ── Why two stores in this file ──────────────────────────────────────────
 *
 * `surveyCompletedThisSession` and `referralShown` are both "don't ask again
 * *this session*" flags — source's `sole_onboarding_survey_done`
 * (`sessionStorage`) and its in-memory `cache().referralShown` respectively.
 * Zustand's `persist` middleware only takes one storage per store, so getting
 * genuine `sessionStorage` semantics (cleared per tab, unlike `localStorage`)
 * means these two need a store of their own — `useOnboardingSurveySessionStore`
 * below, persisted to `sessionStorage` instead of `localStorage`.
 *
 * `referralShown` is grouped with the session store rather than with the rest
 * of this one on purpose, even though it reads at first like a plain
 * durable flag: if it lived in the `localStorage` store, dismissing the
 * referral question once would suppress it forever on that device, which is
 * a stricter behaviour than source's — source's own comment on `dismiss()`
 * is explicit that a dismissal "settles for this tab rather than forever…
 * comes back in a later session". Keeping `referralShown` session-scoped, next
 * to `surveyCompletedThisSession`, reproduces that: a new tab session clears
 * it, and the popup is free to reconsider showing the question again (still
 * gated on the server's own `should_prompt`, and on `referralTimerStartedAt`
 * below having actually elapsed — see `lib/onboarding-survey/steps.ts`'s
 * `referralPromptReady`).
 *
 * `referralTimerStartedAt` stays in the durable store, deliberately not
 * alongside `referralShown`: it has to survive a reload within the same wait
 * (that's the whole point of storing a timestamp instead of running a
 * `setTimeout`), and a session boundary shouldn't reset the clock back to
 * zero — only whether the prompt has already fired should reset.
 */
type OnboardingSurveyState = {
  /** What they said when asked "what were you using before Sole?". */
  joinFrom: string | null;

  /**
   * Whether a starter set of sidebar shortcuts has ever been offered on this
   * device — source's `sole_sidebar_pins_suggested`. Offered, not "kept":
   * clearing every suggested pin is a legitimate answer, and this flag still
   * gets set, because it's the OFFER that shouldn't repeat, not a particular
   * outcome.
   */
  pinsSuggestedOnce: boolean;

  /** The referral answer, and the free text behind "Other". */
  referralSource: string | null;
  referralSourceOther: string | null;

  /**
   * When the two-minute wait for the referral question started, as an ISO
   * timestamp — null until the first time it's checked. Read as a wall-clock
   * diff against `REFERRAL_DELAY_MS`
   * (`lib/onboarding-survey/steps.ts#referralRemainingMs`), not fed to a
   * `setTimeout`: a timer that recomputes "how much is left" from a stored
   * instant survives a reload; one that counts down in memory doesn't.
   */
  referralTimerStartedAt: string | null;

  setJoinFrom: (value: string) => void;
  markPinsSuggested: () => void;
  setReferralAnswer: (source: string, other?: string | null) => void;
  /** The clock starts here, and only if it hasn't already — see the doc above. */
  startReferralTimer: () => void;

  /** Back to nothing answered. */
  reset: () => void;
};

const EMPTY: Omit<
  OnboardingSurveyState,
  | "setJoinFrom"
  | "markPinsSuggested"
  | "setReferralAnswer"
  | "startReferralTimer"
  | "reset"
> = {
  joinFrom: null,
  pinsSuggestedOnce: false,
  referralSource: null,
  referralSourceOther: null,
  referralTimerStartedAt: null,
};

/** Trimmed, and empty means unanswered rather than an empty string. */
function freeText(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

/** Bump when a migration to this store's persisted shape is needed. */
const ONBOARDING_SURVEY_VERSION = 1;

export const useOnboardingSurveyStore = create<OnboardingSurveyState>()(
  persist(
    (set) => ({
      ...EMPTY,

      setJoinFrom: (value) => set({ joinFrom: value }),
      markPinsSuggested: () => set({ pinsSuggestedOnce: true }),
      setReferralAnswer: (source, other) =>
        set({ referralSource: source, referralSourceOther: freeText(other) }),
      startReferralTimer: () =>
        set((state) => ({
          referralTimerStartedAt:
            state.referralTimerStartedAt ?? new Date().toISOString(),
        })),
      reset: () => set({ ...EMPTY }),
    }),
    {
      name: "sole-onboarding-survey",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: ONBOARDING_SURVEY_VERSION,
    },
  ),
);

/* ------------------------------------------------------------------ *
 * Session-scoped: cleared per tab, not per device — see the file doc above.
 * ------------------------------------------------------------------ */

type OnboardingSurveySessionState = {
  /**
   * The mandatory/offered batch (industry, join_from, pins, first_action) is
   * done asking for this tab — source's `sole_onboarding_survey_done`. Set
   * once every step in a run's `wantedSurveySteps()` is empty, or the popup is
   * dismissed/finished; never set from an errored status check, so a failed
   * request is reconsidered on the next check rather than written off.
   */
  surveyCompletedThisSession: boolean;

  /**
   * The referral popup has already been shown once in this tab session — see
   * the file doc above for why this resets per-session rather than living in
   * the durable store.
   */
  referralShown: boolean;

  markSurveyDoneThisSession: () => void;
  markReferralShown: () => void;
  reset: () => void;
};

const SESSION_EMPTY: Omit<
  OnboardingSurveySessionState,
  "markSurveyDoneThisSession" | "markReferralShown" | "reset"
> = {
  surveyCompletedThisSession: false,
  referralShown: false,
};

export const useOnboardingSurveySessionStore =
  create<OnboardingSurveySessionState>()(
    persist(
      (set) => ({
        ...SESSION_EMPTY,
        markSurveyDoneThisSession: () =>
          set({ surveyCompletedThisSession: true }),
        markReferralShown: () => set({ referralShown: true }),
        reset: () => set({ ...SESSION_EMPTY }),
      }),
      {
        name: "sole-onboarding-survey-session",
        storage: createJSONStorage(() => sessionStorage),
        skipHydration: true,
        version: 1,
      },
    ),
  );
