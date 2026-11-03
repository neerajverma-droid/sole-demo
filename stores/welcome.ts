import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { JourneyId } from "@/lib/journeys";
import type { FirstRunStepId, PlanChoice } from "@/lib/welcome";

/**
 * What first run knows about the account.
 *
 * Persisted, and that's what makes the overlay survivable. It's a blocking
 * surface with no way out but through, so a reload halfway down it has to come
 * back where it was — an account that had to answer its question again
 * because a laptop went to sleep would be an account that had the product held
 * hostage twice.
 *
 * Every field here is an account attribute rather than UI state, with one
 * deliberate exception: `step`. See below.
 *
 * TODO: these belong on the account server-side. This is the client's cache of
 * them, and when there's somewhere to send them it becomes a write-through
 * rather than the record itself.
 */
type WelcomeState = {
  /**
   * Which screen the overlay is on.
   *
   * Stored, which is the one thing here that isn't an answer — and it's stored
   * rather than derived from the answers because three of the four steps don't
   * have one. The splash, the pricing step's own recommendation, and the
   * acknowledgment can all be "done" with nothing written to this field beyond
   * `step` itself, so a resume point worked out from the answers alone would
   * send someone who had read the splash back to the splash, and someone who
   * had just made a plan choice back to the question before it.
   *
   * Written on every advance, so it is never ahead of what's been answered.
   */
  step: FirstRunStepId;

  /**
   * Attribution the system derived at sign-up: a UTM parameter, a referral
   * code, a partner link.
   *
   * First run never writes this. There is no setter for it on purpose — the
   * only way to overwrite tracked attribution with a self-reported answer
   * would be to add one.
   *
   * TODO: nothing populates this yet. It's captured at sign-up once the auth
   * flow carries the query string through.
   *
   * The self-reported counterpart this used to sit beside —
   * `reportedSource`/`reportedSourceOther`, "how did you first hear about
   * Sole?" — moved to the survey popup's `referral` question
   * (`stores/onboarding-survey.ts`'s `referralSource`/`referralSourceOther`).
   * Likewise, the bookkeeping-system answer this store used to hold
   * (`currentSystem`/`migrationRoute`/`currentSystemOther`) moved to that same
   * popup's `join_from` question (`joinFrom`); the acknowledgment step now
   * reads that instead — see
   * `components/onboarding/first-run/acknowledgment-step.tsx`.
   */
  systemSource: string | null;

  /** The fourth question, asked only when the industry can't settle the route. */
  paymentAnswer: string | null;

  /** The route this account is on, resolved when the industry is answered. */
  journey: JourneyId | null;

  /** What they did with the plan we recommended — took it, or went on Free. */
  planChoice: PlanChoice | null;

  /**
   * The journey's first-value action has been done.
   *
   * Separate from `complete`, and deliberately later than it. `complete` is
   * the overlay letting go of the product; this is the account having got
   * something out of it — an invoice sent, a week's takings recorded. The gap
   * between the two is where the first-run panel in Quick Actions lives, which
   * is why the flag is stored rather than derived from the ledgers: what counts
   * as first value differs per journey, and every store it would have to be
   * inferred from ships with sample data in it.
   *
   * TODO: set from the document being created rather than from the action
   * being opened, once the editors report back what they saved.
   */
  firstValueDone: boolean;

  /**
   * First run is finished and the dashboard is live.
   *
   * Set by the acknowledgment step and by nothing else — not by answering the
   * last question, not by arriving at the acknowledgment. Dismissing is an act,
   * because it's the moment the overlay lets go of the product.
   */
  complete: boolean;

  /**
   * When the overlay was finished, as an ISO timestamp.
   *
   * Beside `complete` rather than replacing it, because the two answer
   * different questions and one of them can't answer the other's: `complete`
   * is a gate and this is a clock. Everything that escalates over time reads
   * this — the activation nudge is the first — and a boolean can't say how
   * long ago it was set.
   *
   * Null for an account that finished before this field existed. That's a real
   * state rather than a gap to paper over: we genuinely don't know when they
   * finished, and the nudge treats not knowing as "don't nudge" instead of
   * inventing a day zero and opening a modal at someone on their second year.
   */
  onboardingCompletedAt: string | null;

  /**
   * When the activation banner was last dismissed, as an ISO timestamp.
   *
   * Persisted, because dismissing it means "not today" rather than "not in
   * this tab". Its sibling — the modal's dismissal — is in `sessionStorage`
   * instead, and the split is the whole difference between the two surfaces:
   * a strip at the top of the page can come back tomorrow, and a modal that
   * came back tomorrow after being closed would be a modal someone learns to
   * close without reading.
   */
  lastBannerDismissedAt: string | null;

  /** Forward. The only way the step moves, other than `reset`. */
  goTo: (step: FirstRunStepId) => void;

  setPaymentAnswer: (id: string) => void;
  setJourney: (journey: JourneyId) => void;
  setPlanChoice: (choice: PlanChoice) => void;

  /** The acknowledgment's dismissal, which is what releases the dashboard. */
  finish: () => void;

  /** One-way: the first-value action has been taken. */
  completeFirstValue: () => void;

  /** Puts the activation banner away until tomorrow. */
  dismissActivationBanner: (at: string) => void;

  /**
   * Open the tailoring flow again, keeping every answer.
   *
   * Two fields move and nothing else: `complete` back to false so the overlay
   * mounts, and `step` back to the start so it opens where it opens. Every
   * answer stays exactly where it was, which is the whole difference between
   * this and `reset` — the questions come back pre-filled with what was said
   * last time, so walking it again is a review rather than an interrogation.
   *
   * Nothing captured outside this store is touched either. The business
   * identity, the industry and the sidebar rows all live elsewhere and all
   * survive: re-running the tailoring is not a way to un-make an account.
   */
  reopen: () => void;

  /** Back to the splash with nothing answered — `?resetPopup=1` only. */
  reset: () => void;
};

const EMPTY = {
  step: "splash" as FirstRunStepId,
  paymentAnswer: null,
  journey: null,
  planChoice: null,
  complete: false,
  onboardingCompletedAt: null,
  lastBannerDismissedAt: null,
  firstValueDone: false,
};

/**
 * Current shape of the persisted first-run state. Bump when a migration is
 * added.
 *
 * Version 1 is the first one there has ever been, and it exists to undo damage
 * rather than to reshape data. This key has outlived three versions of the
 * flow — a five-step wizard, a routed Welcome, and now the overlay — and all
 * three wrote `complete` to it. Anyone who finished the routed flow has a
 * `true` sitting in storage that the overlay reads as "already onboarded", so
 * the new flow never opens for exactly the people it was rebuilt for.
 *
 * Unversioned state reads as version 0, which is what makes this catch them.
 *
 * Version 2 is the pricing step replacing the sidebar confirmation. `menu` is
 * no longer a step, so an account that was parked on it — a reload halfway
 * through, or a session left open across the deploy — would come back to a
 * blocking card with nothing rendered in it and no button to leave by. Its
 * answers are all still good, so this one remaps rather than resets.
 *
 * Version 3 is `acquisition` and `system` moving out of this overlay entirely,
 * to the survey popup's `referral` and `join_from` questions
 * (`stores/onboarding-survey.ts`). Neither step exists here any more, so an
 * account parked on either — same reload-mid-flow scenario as `menu` above —
 * needs its `step` remapped forward the same way. Unlike `menu`, there's
 * nothing to carry the two answers *into*: they're a different question now,
 * asked by a different surface, so `reportedSource`, `reportedSourceOther`,
 * `currentSystem`, `migrationRoute` and `currentSystemOther` are dropped
 * rather than translated.
 */
const WELCOME_VERSION = 3;

/** The step `menu` became. Same position in the flow, different question. */
const MENU_REPLACEMENT: FirstRunStepId = "pricing";

/**
 * The step `acquisition` and `system` became.
 *
 * Both collapse to the same target: `payment`, the next question in the
 * remaining flow. Unconditional on purpose — `migrate` has no `asksPayment`
 * to consult, only the persisted payload — following the same style as
 * `MENU_REPLACEMENT` above, which maps `menu` straight to `pricing` without
 * checking whether `pricing` applies (it always does).
 *
 * `payment` doesn't always apply, but that's fine: `resolveFirstRunStep` is
 * called on every render with this account's actual, current
 * `visibleFirstRunSteps(asksPayment)`, and it exists precisely to forward a
 * stored step that isn't in that list on to the next one that is — the same
 * reconciliation it already does for an account whose industry was corrected
 * after `payment` was answered. Mapping here and trusting that reconciliation
 * means this migration doesn't have to re-derive `asksPayment` itself.
 */
const ACQUISITION_OR_SYSTEM_REPLACEMENT: FirstRunStepId = "payment";

/** Where a stored step lands after a retired or moved question. */
function remapRetiredStep(step: unknown): unknown {
  if (step === "menu") return MENU_REPLACEMENT;
  if (step === "acquisition" || step === "system")
    return ACQUISITION_OR_SYSTEM_REPLACEMENT;
  return step;
}

/**
 * Fields dropped from the persisted shape as of version 3, moved to the survey
 * popup's own store instead of this one. Stripped explicitly on any migration
 * that might carry them, rather than left to linger unused in storage.
 */
const REMOVED_V3_FIELDS = [
  "reportedSource",
  "reportedSourceOther",
  "currentSystem",
  "migrationRoute",
  "currentSystemOther",
] as const;

function stripRemovedFields(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const rest = { ...raw };
  for (const field of REMOVED_V3_FIELDS) delete rest[field];
  return rest;
}

export const useWelcomeStore = create<WelcomeState>()(
  persist(
    (set) => ({
      ...EMPTY,
      // Not in `EMPTY`, so a reset can't clear it: tracked attribution is a
      // fact about how the account arrived, and re-running the flow for
      // testing must not be able to erase it.
      systemSource: null,

      goTo: (step) => set({ step }),

      setPaymentAnswer: (id) => set({ paymentAnswer: id }),
      setJourney: (journey) => set({ journey }),
      setPlanChoice: (choice) => set({ planChoice: choice }),

      /*
       * The clock starts here, and only if it hasn't already.
       *
       * `reopen` sends someone back through the flow — re-running the
       * tailoring from the business switcher — and finishing it a second time
       * must not reset how long they've been an account. The original
       * completion is the one every escalation is measured from.
       */
      finish: () =>
        set((state) => ({
          complete: true,
          onboardingCompletedAt:
            state.onboardingCompletedAt ?? new Date().toISOString(),
        })),
      completeFirstValue: () => set({ firstValueDone: true }),
      dismissActivationBanner: (at) => set({ lastBannerDismissedAt: at }),
      reopen: () => set({ complete: false, step: "splash" }),
      reset: () => set({ ...EMPTY }),
    }),
    {
      // Unchanged on purpose. A new key would suppress the old value rather
      // than clear it, leaving a dead `complete: true` in everyone's storage
      // for the next person to trip over.
      name: "sole-welcome",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated after mount, like every other persisted store here, so the
      // server and the first client render agree. The overlay waits for it
      // rather than reading through — see `FirstRunOverlay`.
      skipHydration: true,
      version: WELCOME_VERSION,
      /**
       * Anything written before version 1 is discarded.
       *
       * A wholesale reset rather than a field-by-field fix-up, because the
       * answers behind that stale flag were collected by a flow with different
       * steps — the overlay asks a question the routed flow never did, and its
       * `step` field didn't exist at all. Keeping half of them would mean
       * resuming a sequence that was never walked.
       *
       * `systemSource` is the one thing carried across, for the same reason
       * it's absent from `EMPTY`: it's tracked attribution, a fact about how
       * the account arrived rather than an answer anyone gave, and no upgrade
       * should be able to erase it. Read defensively — this is `unknown` off
       * localStorage, not a typed object.
       *
       * Runs once. Zustand writes the new version back on rehydration, so the
       * next load takes the fast path and an account that finishes the overlay
       * from here on keeps its `complete` for good.
       *
       * Version 1 → 2 is the opposite kind of upgrade, and that's why it's a
       * separate branch rather than one more thing the reset covers. The steps
       * either side of `menu` are unchanged and every answer was collected by
       * this same flow, so the only thing wrong with a version 1 payload is
       * that it might name a step that no longer exists. That's a substitution,
       * and resetting instead would re-ask four questions to fix one field.
       *
       * Version 2 → 3 is the same kind of upgrade again, for `acquisition` and
       * `system` — see the constants above. A version 1 payload can name
       * either of those too (they predate `menu`'s retirement, not this one),
       * so the remapping and field-stripping below run for both branches
       * rather than only the newer one.
       */
      migrate: (persisted, version) => {
        if (version >= WELCOME_VERSION) return persisted as WelcomeState;
        const raw = (persisted ?? {}) as Record<string, unknown>;

        if (version === 1) {
          // `menuChoice` is left behind rather than translated: what someone
          // did with a proposed sidebar isn't an answer to what plan they're
          // on, and inventing a `planChoice` from it would put a plan decision
          // on the account that nobody made.
          const rest = stripRemovedFields(raw);
          delete rest.menuChoice;
          return {
            ...rest,
            step: remapRetiredStep(rest.step),
            planChoice: null,
          } as WelcomeState;
        }

        if (version === 2) {
          const rest = stripRemovedFields(raw);
          return {
            ...rest,
            step: remapRetiredStep(rest.step),
          } as WelcomeState;
        }

        return {
          ...EMPTY,
          systemSource:
            typeof raw.systemSource === "string" ? raw.systemSource : null,
        } as WelcomeState;
      },
    },
  ),
);
