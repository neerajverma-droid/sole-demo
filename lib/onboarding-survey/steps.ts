/**
 * Pip's step sequencing — which questions a given account still owes, and
 * when the one that waits gets to fire.
 *
 * Mirrors `lib/welcome.ts`'s role for the other overlay: this file holds the
 * vocabulary and the pure "what's next" logic, not the component. Ported from
 * the "when to ask" and referral-timer effects in
 * `sole-webapp/components/OnboardingSurveyPopup/index.js`, with the DOM/redux
 * reads those effects did (profile fields, `sessionStorage`, `window`-cached
 * timers) replaced by plain booleans and timestamps the caller supplies — see
 * `stores/onboarding-survey.ts` for where those come from in this app.
 *
 * Two batches, same as source:
 *
 *   MANDATORY + OFFERED, asked together, immediately —
 *   1. industry     → already asked at sign-up in this app (see the note on
 *      `SurveyStepInputs.hasIndustry` below), kept here anyway so the type
 *      stays honest about what source's flow actually asks.
 *   2. join_from     → `joinFrom` in `stores/onboarding-survey.ts`.
 *   3. pins          → sidebar shortcuts, chosen from the industry.
 *   4. first_action  → only offered to an account industry itself was asked
 *      of — see `wantedSurveySteps` below.
 *
 *   ASKED ON ITS OWN, two minutes in —
 *   5. referral      → doesn't gate anything else, so it isn't in the batch
 *      above at all; see the referral functions below.
 *
 * A user is only asked the parts they still owe, so someone who already has an
 * answer gets a shorter flow and someone with nothing missing sees nothing —
 * exactly source's own framing.
 */

export type SurveyStepId =
  | "industry"
  | "join_from"
  | "pins"
  | "first_action"
  | "referral";

/**
 * What `wantedSurveySteps` needs to know, resolved by the caller from wherever
 * each fact actually lives in this app:
 *
 * - `hasIndustry` — source reads `industry_id` off the profile and treats `0`
 *   (never asked) as missing. This app collects the industry mandatorily at
 *   sign-up (`CompanyProfileStep`, before the dashboard — see the file doc on
 *   `lib/welcome.ts`), so in practice this is expected to always resolve
 *   `true` by the time this popup could open. It's kept as an input rather
 *   than hard-coded so the function's behaviour still matches source's
 *   exactly, and so a future account type that skips that step (an invite,
 *   say) doesn't silently stop being asked.
 * - `hasJoinFrom` — whether `joinFrom` is already set
 *   (`stores/onboarding-survey.ts`).
 * - `pinsEmpty` — whether the account has zero pinned nav ids right now
 *   (`pinnedNavIdsAtom`, `lib/atoms.ts` — read live, not duplicated in the
 *   survey store).
 * - `pinsSuggestedOnce` — whether a starter set has already been offered on
 *   this device, regardless of whether anything was kept
 *   (`stores/onboarding-survey.ts`'s `pinsSuggestedOnce`, source's
 *   `sole_sidebar_pins_suggested`).
 */
export type SurveyStepInputs = {
  hasIndustry: boolean;
  hasJoinFrom: boolean;
  pinsEmpty: boolean;
  pinsSuggestedOnce: boolean;
};

/**
 * Which of the immediate-batch steps this account still owes, in the order
 * they should be asked.
 *
 * Mirrors source's "when to ask" effect field for field:
 *
 * - `industry` is wanted when it isn't on file yet.
 * - `join_from` is wanted when it isn't on file yet.
 * - `pins` is wanted when there's nothing pinned AND a starter set hasn't
 *   already been offered once — offered, not "kept": clearing every row is a
 *   legitimate answer, and re-offering it because the sidebar is empty again
 *   would be asking a question that was already answered.
 * - `first_action` rides along ONLY when `industry` was also wanted this
 *   time — source's own comment: "Only a brand-new account (no industry on
 *   file) is offered its first invoice", so nobody with a year of invoices
 *   behind them who merely hasn't picked a join_from yet gets invited to
 *   write their first one.
 *
 * An empty result means nothing is owed — the caller settles for the session,
 * same as source's `cache().settled` / `sole_onboarding_survey_done`.
 */
export function wantedSurveySteps(inputs: SurveyStepInputs): SurveyStepId[] {
  const wanted: SurveyStepId[] = [];

  if (!inputs.hasIndustry) {
    wanted.push("industry");
  }
  if (!inputs.hasJoinFrom) {
    wanted.push("join_from");
  }
  if (inputs.pinsEmpty && !inputs.pinsSuggestedOnce) {
    wanted.push("pins");
  }
  // Deliberately checked against `wanted`, not `inputs.hasIndustry` again: the
  // question is whether industry was JUST asked in this run of the popup, not
  // whether it happens to be missing (those agree here, but keeping the check
  // on `wanted` is what makes this line read the same as source's).
  if (wanted.includes("industry")) {
    wanted.push("first_action");
  }

  return wanted;
}

/* ------------------------------------------------------------------ *
 * Referral — asked on its own, two minutes in
 * ------------------------------------------------------------------ */

/**
 * How long after the timer starts the referral question waits before it's
 * asked. Source's `REFERRAL_DELAY_MS`, unchanged.
 */
export const REFERRAL_DELAY_MS = 2 * 60 * 1000;

/**
 * What the referral trigger needs to know. Source kept the clock in a
 * `window`-level cache because its popup remounts on every client-side
 * navigation (each page renders its own Layout) and a plain `setTimeout` would
 * restart from zero on every page. This app's popup is expected to live
 * above the router in `app/(app)/layout.tsx` instead and so may not remount
 * per navigation at all — but the same wall-clock approach is used regardless
 * (`stores/onboarding-survey.ts`'s `referralTimerStartedAt`, a persisted ISO
 * timestamp), because it survives a full reload too, which a live timer never
 * would.
 */
export type ReferralTimerState = {
  /** When the two-minute wait started, as an ISO timestamp — null if it
   * hasn't started yet (set once, on the first check after industry/join_from
   * are settled; see `startReferralTimer` in `stores/onboarding-survey.ts`). */
  startedAt: string | null;
  /** Milliseconds since the epoch to measure the wait against. Defaults to
   * `Date.now()` — a parameter only so tests can pass a fixed instant. */
  now?: number;
};

/** How much of the two-minute wait is left, floored at zero. */
export function referralRemainingMs(state: ReferralTimerState): number {
  if (!state.startedAt) {
    return REFERRAL_DELAY_MS;
  }
  const now = state.now ?? Date.now();
  const elapsed = now - new Date(state.startedAt).getTime();
  return Math.max(0, REFERRAL_DELAY_MS - elapsed);
}

/** Whether the two-minute wait has fully elapsed. */
export function referralDelayElapsed(state: ReferralTimerState): boolean {
  return referralRemainingMs(state) <= 0;
}

/**
 * Everything that has to be true for the referral popup to fire, gathered in
 * one place so the caller doesn't have to remember every guard source's timer
 * effect checked inline:
 *
 * - the server (or its bundled fallback) still owes this account the
 *   question (`shouldPrompt` — source's `status.data.should_prompt`);
 * - it hasn't already been shown once this tab (`shown` —
 *   `stores/onboarding-survey.ts`'s `referralShown`, a `sessionStorage`-backed
 *   flag; see that file's doc for why it's session-scoped and not the
 *   persisted store);
 * - the mandatory popup isn't currently up (`mandatoryPopupOpen` — source:
 *   "Don't interrupt the mandatory popup if it's still up… this mount's own
 *   effect above will offer it again once that closes");
 * - the two-minute wait has actually elapsed (`timer`).
 */
export type ReferralReadyInputs = {
  shouldPrompt: boolean;
  shown: boolean;
  mandatoryPopupOpen: boolean;
  timer: ReferralTimerState;
};

export function referralPromptReady(inputs: ReferralReadyInputs): boolean {
  return (
    inputs.shouldPrompt &&
    !inputs.shown &&
    !inputs.mandatoryPopupOpen &&
    referralDelayElapsed(inputs.timer)
  );
}
