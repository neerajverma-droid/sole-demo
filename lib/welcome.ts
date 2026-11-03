/**
 * First run — the four screens that open over the dashboard, once.
 *
 * It's an overlay rather than a route, and that swap is the whole design. As
 * routed pages the flow was somewhere you were *sent*: a URL you could edit, a
 * Back button that could strand you half-answered, and a product you hadn't
 * seen yet on the other side of it. As a modal over the dashboard, the thing
 * being set up is visible underneath the questions setting it up — dimmed and
 * inert, but there — so the answers are obviously about something rather than
 * a form standing between you and the app.
 *
 * What it does *not* ask is who the business is. The ABN, the trading name and
 * the industry are collected on one page straight after sign-up, before the
 * dashboard exists to overlay — they're the account's identity rather than a
 * preference about it, they're needed before an invoice can be raised, and a
 * required text field is a badly-behaved citizen of a flow otherwise built
 * from single taps. This surface only tailors. The industry it tailors *to* is
 * read back out of the settings store, where that page put it.
 *
 * It also no longer asks how someone heard about Sole or what they were
 * keeping their books in before — those two questions moved to the separate,
 * mascot-guided survey popup (`components/onboarding/survey/*`,
 * `stores/onboarding-survey.ts`) that opens immediately after sign-up, ahead of
 * this overlay, as `referral` and `join_from` respectively. This file kept
 * `MigrationRoute` (re-exported, still the vocabulary
 * `lib/onboarding-survey/join-from.ts`'s `migrationRouteForJoinFrom` returns)
 * but dropped the option lists and lookups that used to back the two removed
 * questions here.
 *
 * Nothing collected here is a preference someone might want to revisit: all of
 * it is editable in Settings afterwards, which is what makes asking once, in a
 * surface with no way out but through, an acceptable thing to do.
 *
 * This file holds the vocabulary — the order of the steps, the option lists,
 * and what each answer means. The overlay owns the sequencing.
 */

/**
 * Re-opens the flow for an account that has already finished it.
 *
 * A query parameter rather than a dev-only toggle, because the flow shows once
 * per account and "once" is the hardest thing about it to test: without this
 * the only way to see the second screen again is to clear storage, which also
 * clears the answers you were trying to check.
 */
export const RESET_PARAM = "resetPopup";

/* ------------------------------------------------------------------ *
 * The steps
 * ------------------------------------------------------------------ */

export type FirstRunStepId = "splash" | "payment" | "pricing" | "ack";

/**
 * Every step, in order, including the conditional one.
 *
 * The payment step is in the list rather than spliced in: whether it's shown
 * depends on the industry, so a list that changed shape as the account did
 * would be one the resume logic had to re-derive on every render. It's
 * filtered at the point of use instead — see `visibleFirstRunSteps`.
 */
export const FIRST_RUN_STEPS: FirstRunStepId[] = [
  "splash",
  "payment",
  "pricing",
  "ack",
];

/**
 * The steps the progress bar counts, which is not all of them.
 *
 * Only the question — there is exactly one left, now that acquisition and
 * current-system moved to the separate survey popup. The splash is an
 * invitation and the two confirmations report rather than ask — a bar that
 * counted them would claim progress on a screen where nothing had been asked
 * yet, and would still be creeping forward after the last question was
 * answered. Kept as a list rather than a single id so a future question can
 * join it the same way payment did.
 */
export const FIRST_RUN_QUESTION_STEPS: FirstRunStepId[] = ["payment"];

/** The steps actually walked, with the conditional one in or out. */
export function visibleFirstRunSteps(asksPayment: boolean): FirstRunStepId[] {
  return FIRST_RUN_STEPS.filter((step) => step !== "payment" || asksPayment);
}

/**
 * The step to draw, given what's stored and what this account actually walks.
 *
 * The stored value, almost always. The two exceptions are both cases where a
 * resume point can name a step this account doesn't have: the payment question
 * is conditional, so an industry corrected after it was answered can leave a
 * `payment` resume point on an account that no longer asks it; and a step can
 * be retired outright, as `menu` was when the pricing step replaced it.
 *
 * It matters more than a display detail because the overlay has no close
 * button. A step nothing renders is a blank blocking card, and the advance is
 * computed by position — from a step that isn't in the list, "the next one"
 * resolves to the first, which walks the flow backwards to the splash.
 *
 * Forward to the next step this account does walk, never back: everything
 * before the stored point has been answered, and re-asking it is the one
 * outcome worse than skipping something.
 */
export function resolveFirstRunStep(
  stored: FirstRunStepId,
  steps: FirstRunStepId[],
): FirstRunStepId {
  if (steps.includes(stored)) return stored;
  const from = FIRST_RUN_STEPS.indexOf(stored);
  // Not a step this flow has ever had — storage predates the list, or holds
  // something hand-edited. The splash is the only safe place to start.
  if (from < 0) return steps[0];
  return (
    FIRST_RUN_STEPS.slice(from + 1).find((step) => steps.includes(step)) ??
    steps[steps.length - 1]
  );
}

/**
 * One segment or none.
 *
 * Derived from the same filter as the steps themselves, so the bar can't
 * promise a question that never arrives — which is the one thing a segmented
 * bar is worse at than a spinner, if the count is allowed to drift.
 */
export function firstRunQuestionSteps(asksPayment: boolean): FirstRunStepId[] {
  return FIRST_RUN_QUESTION_STEPS.filter(
    (step) => step !== "payment" || asksPayment,
  );
}

/* ------------------------------------------------------------------ *
 * The pricing step's two ways out
 * ------------------------------------------------------------------ */

/**
 * What someone did with the plan we recommended.
 *
 * - `accepted` — took the package and whichever add-ons were left ticked.
 * - `free` — declined it and went in on Free.
 *
 * Both are real answers and both advance. There's no third: the checkboxes are
 * how the recommendation gets edited, so "accepted with changes" is still
 * accepted — recording it separately would be recording the state of a
 * checkbox twice, once here and once in the add-ons it wrote.
 *
 * This replaced `MenuChoice`, which recorded what someone did with a proposed
 * sidebar. That screen is gone: the rail's rows were already applied by the
 * page after sign-up, so confirming them was a step that changed nothing, and
 * the add-ons on this screen are what actually decide what's in the nav now.
 */
export type PlanChoice = "accepted" | "free";

/* ------------------------------------------------------------------ *
 * The remaining question's option shape
 * ------------------------------------------------------------------ */

/**
 * One answer to one of this overlay's questions — currently only the payment
 * step's, since acquisition and current-system moved to the survey popup (see
 * `lib/onboarding-survey/join-from.ts` and
 * `lib/onboarding-survey/referral-sources.ts` for their option lists now).
 *
 * Kept as a general shape, rather than folded into the payment step alone,
 * because `QuestionStep` is generic over it and a future question here would
 * reuse both.
 */
export type WelcomeOption = {
  id: string;
  label: string;
  /**
   * The option is open-ended, and this is the label on the field it reveals.
   *
   * On the option rather than on the screen, because whether an answer needs a
   * follow-up is a fact about that answer. A list of open-ended ids held beside
   * the options would be a second place to update every time a row was added.
   *
   * The follow-up is never required. A catch-all option exists so that someone
   * who doesn't fit the list can still answer honestly, and making them justify
   * it in prose would be taking that back.
   */
  freeTextLabel?: string;
};

/* ------------------------------------------------------------------ *
 * What migrating would involve
 * ------------------------------------------------------------------ */

/**
 * What bringing the history across actually involves.
 *
 * Carried on the answer rather than worked out later from the label, because
 * these are genuinely different jobs and the difference is the whole point of
 * asking: a direct Xero connection, a file someone has to export first, a
 * pile of paper that needs typing, and an account with no history at all.
 *
 * - `direct` — a platform with an importer. The migration offer is a connection.
 * - `file` — an app we can read an export from, but not connect to.
 * - `spreadsheet` — a CSV, which is the same import path with more mapping.
 * - `manual` — nothing machine-readable exists. Opening balances, by hand.
 * - `accountant` — someone else holds the file. The offer is to invite them.
 * - `none` — no history. Nothing to migrate, and nothing to apologise for.
 * - `catch-up` — history exists but was never recorded anywhere. The hardest
 *   case, and the one most likely to want a setup call rather than an importer.
 *
 * The question that used to back this here — "How are you keeping your books
 * at the moment?", with its own `CURRENT_SYSTEMS` option list — moved to the
 * survey popup's `join_from` question. This type stayed behind and is
 * re-exported from here because it's still the vocabulary the acknowledgment
 * step's migration CTA is built from — see
 * `lib/onboarding-survey/join-from.ts`'s `migrationRouteForJoinFrom`, which
 * returns it, and `components/onboarding/first-run/acknowledgment-step.tsx`,
 * which consumes it.
 */
export type MigrationRoute =
  | "direct"
  | "file"
  | "spreadsheet"
  | "manual"
  | "accountant"
  | "none"
  | "catch-up";
