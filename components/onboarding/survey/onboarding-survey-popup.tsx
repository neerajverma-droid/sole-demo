"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useAtomValue, useSetAtom } from "jotai";
import { ArrowRight, RotateCcw, Sparkles, X } from "lucide-react";

import { useSession } from "@/components/auth/session-provider";
import { FirstActionCards } from "@/components/onboarding/survey/first-action-cards";
import { MascotGuide } from "@/components/onboarding/mascot/mascot-guide";
import {
  MascotQuestionStep,
  type ChipOption,
} from "@/components/onboarding/survey/mascot-question-step";
import { SidebarPicker } from "@/components/onboarding/survey/sidebar-picker";
import { Button } from "@/components/ui/button";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { pinnedNavIdsAtom } from "@/lib/atoms";
import type { FirstAction } from "@/lib/onboarding-survey/first-actions";
import industryLine from "@/lib/onboarding-survey/industry-lines";
import { MIGRATION_HREF } from "@/lib/migrations";
import {
  JOIN_FROM_OPTIONS,
  joinFromNeedsMigration,
} from "@/lib/onboarding-survey/join-from";
import suggestedPinIds from "@/lib/onboarding-survey/pin-suggestions";
import defaultReferralSourceOptions, {
  REFERRAL_SOURCE_OTHER,
} from "@/lib/onboarding-survey/referral-sources";
import {
  industrySaveRequest,
  joinFromSaveRequest,
  referralSaveRequest,
  sidebarPinsSaveRequest,
  type SaveRequest,
} from "@/lib/onboarding-survey/save-requests";
import {
  referralPromptReady,
  referralRemainingMs,
  wantedSurveySteps,
  type SurveyStepId,
} from "@/lib/onboarding-survey/steps";
import { CUSTOM_INDUSTRY_OPTION } from "@/lib/onboarding";
import { useOnboardingSurveyHydrated } from "@/lib/use-onboarding-survey-hydrated";
import { cn } from "@/lib/utils";
import {
  useOnboardingSurveySessionStore,
  useOnboardingSurveyStore,
} from "@/stores/onboarding-survey";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useActiveBusinessIndustry } from "@/hooks/use-active-business-industry";
import { useIndustriesQuery } from "@/hooks/use-industries-query";
import { useSidebarPinsLoaded } from "@/hooks/use-sidebar-sync";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/utils/axiosInstance";

/**
 * Everything signup no longer asks, and the setup those answers earn.
 *
 * Ported from `sole-webapp/components/OnboardingSurveyPopup/index.js` — read
 * that file's doc comment first, it's the behavioural spec this component
 * follows almost line for line. The short version, in this app's own terms:
 *
 *   MANDATORY, asked together, immediately —
 *   1. industry     → already asked at sign-up here (`CompanyProfileStep`), so
 *      this step is expected to almost never fire — kept only so the type
 *      stays honest about what `wantedSurveySteps` can return.
 *   2. join_from     → `stores/onboarding-survey.ts`'s `joinFrom`.
 *
 *   OFFERED, right after, only for an account industry itself was asked of —
 *   3. pins          → sidebar shortcuts, chosen from the industry.
 *   4. first_action  → a first thing to make.
 *
 *   ASKED ON ITS OWN, two minutes in —
 *   5. referral      → doesn't gate anything else, so it isn't in the batch
 *      above — see the second effect below.
 *
 * `wantedSurveySteps` (`lib/onboarding-survey/steps.ts`) decides which of
 * these a given account still owes; this component's job is purely to drive
 * the dialog off that answer, save each one as it's given, and advance.
 *
 * Steps 1–4 don't wait: the popup opens as soon as something is missing,
 * picking an answer moves straight to the next question, and each answer is
 * saved fire-and-forget rather than held to the end — there's no Continue
 * button anywhere except the pins step's explicit save/skip, because for
 * every other step the answer IS the button. Saves are fire-and-forget on
 * purpose: a failed one isn't worth trapping anyone over, and it fixes
 * itself — the profile still reads as missing, so a later session asks again.
 *
 * `steps` is frozen in component state the moment the dialog opens rather
 * than re-derived on every render: answering one question changes the very
 * inputs `wantedSurveySteps` reads (industry, join_from, pins), and a
 * derived list would drop a step out from under the user mid-flow.
 *
 * Escape and the header's X button both call `dismiss()`. The batch is shown
 * at most once per (user, business): opening it marks it seen in the
 * backend's `business_config`, and the profile's copy of that flag is what
 * keeps it from coming back at the next login. Outside
 * clicks and the backdrop are inert: a stray tap while scrolling the pins
 * list on a phone shouldn't throw the flow away.
 *
 * Mounted unconditionally in `app/(app)/layout.tsx`, alongside the other
 * self-gating overlays there (`CommandPalette`, `SupportChat`) —
 * it decides for itself whether to do anything, the same way `FirstRunOverlay`
 * gates on its own hydration hook before rendering. Gated on two things: a
 * proved session (`useSession().status === "authenticated"` — nothing here
 * should fire a network request against an anonymous or not-yet-resolved
 * session), and both onboarding-survey stores having rehydrated
 * (`useOnboardingSurveyHydrated`, without which every field reads as its
 * unanswered default for a tick on every load, which would ask a settled
 * account its questions again).
 */

const INTRO_LINES: Record<SurveyStepId, string> = {
  industry:
    "Please select your industry so we can tailor the app to your work.",
  join_from:
    "What were you using before Sole? This tells us what your existing records look like.",
  referral: "Last one, promise: how did you find Sole?",
  pins: "Right — here are the shortcuts I'd put in your sidebar.",
  first_action: "Everything's ready. Want to make something now?",
};

const HEADINGS: Record<SurveyStepId, string> = {
  industry: "Please select your industry",
  join_from: "What were you using before Sole?",
  referral: "One more question — how did you find Sole?",
  pins: "Choose your sidebar shortcuts",
  first_action: "Let's put it to work",
};

const EYEBROWS: Record<SurveyStepId, string> = {
  industry: "Your work",
  join_from: "Before Sole",
  referral: "How you found us",
  pins: "Your shortcuts",
  first_action: "First job",
};

const FOOTERS: Record<SurveyStepId, string> = {
  industry: "For example: personal trainer, cleaner, beauty, admin, trades, retail.",
  join_from: "Nothing to move across? Pick “First time user”.",
  referral: "It only helps us reach more people like you.",
  pins: "Already switched on for you — tap any row to add or remove it.",
  first_action: "You can do any of these later — nothing is locked in.",
};

/**
 * Which half of the flow a step belongs to — decides only the one line Pip
 * says when the flow crosses from asking to setting up. See source's own
 * comment on this table for why there's no visible "Part 1 of 2" any more.
 */
const STEP_PART: Record<SurveyStepId, 1 | 2> = {
  industry: 1,
  join_from: 1,
  referral: 2,
  pins: 2,
  first_action: 2,
};

/** This popup's key in `business_config.popups` (backend allowlists it). */
const SURVEY_POPUP_KEY = "onboarding_survey";

const PART_TRANSITION_LINE =
  "That's the essentials sorted. Just a couple more to personalise things — ";

/** Dev-only trace, mirroring source's `warn` — a failed save is never fatal. */
function warn(what: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const detail =
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? (error as { message?: string })?.message ?? error;
  console.warn(`[OnboardingSurveyPopup] ${what}:`, detail);
}

/** `request.method` picks the one HTTP verb these saves ever use. */
function dispatchSave(request: SaveRequest) {
  return request.method === "put"
    ? api.put(request.url, request.body)
    : api.post(request.url, request.body);
}

export function OnboardingSurveyPopup() {
  const router = useRouter();

  const { status, user } = useSession();
  const enabled = status === "authenticated";

  const surveyHydrated = useOnboardingSurveyHydrated();
  /*
   * Nothing here may be decided from local state alone.
   *
   * Every answer this popup collects is also held by the server — the
   * industry on the business record, `join_from` and the referral source on
   * the user, the pins in user-config — and the server's copy is the only one
   * that survives a sign-out, because the teardown wipes every store and both
   * storages. So the gate waits for each of those reads to SETTLE, not merely
   * for a store to rehydrate: a rehydrated-but-empty store is exactly what a
   * fresh login looks like, and reading it as "this account has no industry"
   * is what put this dialog on screen at every single sign-in.
   */
  const { business: activeBusinessRecord, settled: businessSettled } =
    useActiveBusiness();
  const storedIndustry = useActiveBusinessIndustry();
  const { data: industries = [], isPending: industriesPending } =
    useIndustriesQuery();
  /** An empty `pinnedNavIdsAtom` means nothing until the server's copy lands. */
  const pinsLoaded = useSidebarPinsLoaded();
  const queryClient = useQueryClient();
  const hydrated =
    businessSettled && !industriesPending && pinsLoaded && surveyHydrated;

  /*
   * Seen once in this business, never again — across sign-outs and devices.
   * The flag lives in the backend's `business_config` and comes back on the
   * profile; it's written the moment the popup opens (see the effect below),
   * whether or not anything gets answered.
   */
  const activeBusinessId = activeBusinessRecord?.id
    ? String(activeBusinessRecord.id)
    : "";
  const seenOnServer = Boolean(
    activeBusinessId &&
      user?.business_config?.[activeBusinessId]?.popups?.[SURVEY_POPUP_KEY],
  );

  const storeJoinFrom = useOnboardingSurveyStore((state) => state.joinFrom);
  const setJoinFrom = useOnboardingSurveyStore((state) => state.setJoinFrom);
  const pinsSuggestedOnce = useOnboardingSurveyStore(
    (state) => state.pinsSuggestedOnce,
  );
  const markPinsSuggested = useOnboardingSurveyStore(
    (state) => state.markPinsSuggested,
  );
  const setReferralAnswer = useOnboardingSurveyStore(
    (state) => state.setReferralAnswer,
  );
  const startReferralTimer = useOnboardingSurveyStore(
    (state) => state.startReferralTimer,
  );

  const surveyCompletedThisSession = useOnboardingSurveySessionStore(
    (state) => state.surveyCompletedThisSession,
  );
  const markSurveyDoneThisSession = useOnboardingSurveySessionStore(
    (state) => state.markSurveyDoneThisSession,
  );
  const referralShown = useOnboardingSurveySessionStore(
    (state) => state.referralShown,
  );
  const markReferralShown = useOnboardingSurveySessionStore(
    (state) => state.markReferralShown,
  );

  const pinnedNavIds = useAtomValue(pinnedNavIdsAtom);
  const setPinnedNavIds = useSetAtom(pinnedNavIdsAtom);
  const pinsEmpty = pinnedNavIds.length === 0;

  const [open, setOpen] = React.useState(false);
  /**
   * Which questions this run asks, frozen when the dialog opens — see the
   * file doc above for why this isn't derived on every render.
   */
  const [steps, setSteps] = React.useState<SurveyStepId[]>([]);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [line, setLine] = React.useState("");

  /** Read inside callbacks that must see the CURRENT list, not a stale one. */
  const stepsRef = React.useRef(steps);
  stepsRef.current = steps;
  const step = steps[stepIndex];

  /** A run of exactly `["referral"]` — see `dismiss`/`finish` below. */
  const isReferralRun = steps.length === 1 && steps[0] === "referral";

  // ── Per-step local state ───────────────────────────────────────────────
  const [industryQuery, setIndustryQuery] = React.useState("");
  const [industrySelected, setIndustrySelected] = React.useState<
    string | null
  >(null);
  const [industryOtherText, setIndustryOtherText] = React.useState("");

  const [joinFromSelected, setJoinFromSelected] = React.useState<
    string | null
  >(null);

  const [referralOptions, setReferralOptions] = React.useState<string[]>(
    defaultReferralSourceOptions,
  );
  const [referralSelected, setReferralSelected] = React.useState<
    string | null
  >(null);
  const [referralOtherText, setReferralOtherText] = React.useState("");

  const [pinIds, setPinIds] = React.useState<string[]>([]);
  const seededPinsRef = React.useRef(false);

  /** The trade the shortcuts and first job are chosen for. */
  const industryName = industrySelected || storedIndustry || "";

  /*
   * `industry_id` is 0 (or null) on a business that has never been asked — the
   * same "never answered" value source treats as missing. The id alone decides
   * it, deliberately: this used to require the resolved NAME as well, which
   * made a `/industry` list that hadn't arrived yet — or one that doesn't
   * happen to carry this business's id — read as "no industry on file" and ask
   * the question again. The name is still what the copy and the pin
   * suggestions are tailored from; it just doesn't get a vote on whether the
   * question is owed. The profile's own `industry_id` is read as a fallback,
   * for an account whose business list is empty or still failing.
   */
  const hasIndustry =
    Boolean(activeBusinessRecord?.industryId) ||
    Number(user?.industry_id ?? 0) > 0;

  /**
   * `join_from` lives on the user row server-side, so the profile is what
   * answers this across devices and across sign-outs. The local store is still
   * read first — it holds an answer given seconds ago, before the profile has
   * been re-read.
   */
  const serverJoinFrom =
    typeof user?.join_from === "string" ? user.join_from.trim() : "";
  const hasJoinFrom = Boolean(storeJoinFrom || serverJoinFrom);

  /*
   * Seed the local store from the server's answer.
   *
   * `finish()` reads `joinFrom` out of the store to decide whether to send
   * someone to the Data Migration Center, and a later run of the popup (the
   * pins alone, say) would otherwise read null there for an account that
   * answered this months ago.
   */
  React.useEffect(() => {
    if (!serverJoinFrom || storeJoinFrom) return;
    setJoinFrom(serverJoinFrom);
  }, [serverJoinFrom, storeJoinFrom, setJoinFrom]);

  // ── When to ask: the mandatory + offered batch ─────────────────────────
  React.useEffect(() => {
    if (!enabled || open || !hydrated || surveyCompletedThisSession) return;

    if (seenOnServer) {
      markSurveyDoneThisSession();
      return;
    }

    const wanted = wantedSurveySteps({
      hasIndustry,
      hasJoinFrom,
      pinsEmpty,
      pinsSuggestedOnce,
    });

    if (wanted.length === 0) {
      markSurveyDoneThisSession();
      return;
    }

    setSteps(wanted);
    setStepIndex(0);
    setLine(INTRO_LINES[wanted[0]]);
    setOpen(true);
    track("onboarding_survey_shown", { steps: wanted.join(",") });

    // Seen counts from the moment it opens, not when it's finished — closing
    // it is an answer too. Fire-and-forget like every save here; a failure
    // only means it shows once more at a later login.
    if (activeBusinessId) {
      api
        .post(
          apiRoutes.userConfig.popupSeen,
          { popup: SURVEY_POPUP_KEY },
          { params: { business_id: activeBusinessId } },
        )
        .catch((error) => warn("could not mark the survey as seen", error));
    }
  }, [
    enabled,
    open,
    hydrated,
    surveyCompletedThisSession,
    seenOnServer,
    activeBusinessId,
    hasIndustry,
    hasJoinFrom,
    pinsEmpty,
    pinsSuggestedOnce,
    markSurveyDoneThisSession,
  ]);

  /** Read inside the referral timer, which must see the CURRENT `open`. */
  const openRef = React.useRef(open);
  openRef.current = open;

  // ── Referral: asked on its own, two minutes in ─────────────────────────
  // Doesn't gate anything else the way industry/join_from do, so it doesn't
  // ride along with the batch above — it waits, and asks once, in the same
  // dialog shell with only `["referral"]` queued. The clock is the
  // persisted `referralTimerStartedAt` (`stores/onboarding-survey.ts`), not a
  // plain in-memory timer, so a reload partway through the wait resumes
  // rather than restarting from zero.
  React.useEffect(() => {
    if (!enabled || !hydrated || referralShown) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    type PromptStatus = { should_prompt?: boolean; options?: string[] };

    api
      .get(apiRoutes.user.referralSource)
      .then((res) => {
        const body = res?.data as { data?: PromptStatus } & PromptStatus;
        const data: PromptStatus = body?.data ?? body ?? {};
        return { ok: true, data };
      })
      .catch((error) => {
        warn("could not check the referral-source prompt", error);
        return { ok: false, data: {} as PromptStatus };
      })
      .then((status) => {
        if (cancelled || !status.ok || !status.data.should_prompt) return;

        if (Array.isArray(status.data.options) && status.data.options.length > 0) {
          setReferralOptions(status.data.options);
        }

        startReferralTimer();
        const startedAt =
          useOnboardingSurveyStore.getState().referralTimerStartedAt;
        const remaining = referralRemainingMs({ startedAt });

        timer = setTimeout(() => {
          const ready = referralPromptReady({
            shouldPrompt: true,
            shown: useOnboardingSurveySessionStore.getState().referralShown,
            mandatoryPopupOpen: openRef.current,
            timer: {
              startedAt:
                useOnboardingSurveyStore.getState().referralTimerStartedAt,
            },
          });
          if (!ready) return;

          markReferralShown();
          setSteps(["referral"]);
          setStepIndex(0);
          setLine(INTRO_LINES.referral);
          setOpen(true);
          track("onboarding_referral_prompt_shown");
        }, remaining);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Deliberately one-shot per (enabled, hydrated, referralShown) — this
    // schedules a single timer against the current wait. `referralTimerStartedAt`
    // is read fresh via `getState()` at fire time rather than subscribed to,
    // which is what keeps it out of this dependency list: subscribing would
    // re-run this effect (and re-fetch/re-schedule) the moment
    // `startReferralTimer` below writes it.
  }, [enabled, hydrated, referralShown, startReferralTimer, markReferralShown]);

  /** Seeds the pins step once per run, whether entered via `advance` or directly. */
  React.useEffect(() => {
    if (!open) {
      seededPinsRef.current = false;
      return;
    }
    if (step !== "pins" || seededPinsRef.current) return;
    seededPinsRef.current = true;
    setPinIds(suggestedPinIds(industryName));
  }, [open, step, industryName]);

  // ── Saving ──────────────────────────────────────────────────────────────
  // Fire-and-forget, exactly source's own framing: nothing here awaits a
  // save, the flow moves on immediately, and a failure just means a later
  // session asks again. Request shapes live in `save-requests.ts` so they're
  // unit-testable without a component or a network mock.

  // ── Moving through the steps ────────────────────────────────────────────

  const fireConfetti = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Dynamic import, same as `use-celebration-confetti.ts`, so the library
    // never lands in the bundle of a session that never finishes this popup.
    void import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 70,
        spread: 64,
        origin: { y: 0.6 },
        disableForReducedMotion: true,
      });
    });
  }, []);

  const finish = React.useCallback(
    (href?: string) => {
      if (!isReferralRun) markSurveyDoneThisSession();
      setOpen(false);

      // Someone switching from another tool (anything but "First time user")
      // lands on the Data Migration Center — unless they just picked a first
      // action, which is the more explicit choice. Only when this run asked
      // join_from, so a later run that's only the pins doesn't send them
      // there again.
      const migrating =
        stepsRef.current.includes("join_from") &&
        joinFromNeedsMigration(useOnboardingSurveyStore.getState().joinFrom);
      const destination = href ?? (migrating ? MIGRATION_HREF : undefined);

      if (destination) {
        router.push(destination);
        return;
      }
      fireConfetti();
    },
    [fireConfetti, isReferralRun, markSurveyDoneThisSession, router],
  );

  /**
   * Close without answering. The batch was already marked seen on the server
   * when it opened, so it won't come back at a later login either. A referral
   * run keeps its own server-side `should_prompt`. No confetti — nothing was
   * achieved.
   */
  const dismiss = React.useCallback(() => {
    track("onboarding_survey_dismissed", {
      step: step ?? "",
      step_index: stepIndex,
    });
    if (!isReferralRun) markSurveyDoneThisSession();
    setOpen(false);
  }, [isReferralRun, markSurveyDoneThisSession, step, stepIndex]);

  const advance = React.useCallback(
    (reaction: string, context: { industryName?: string } = {}) => {
      const next = stepIndex + 1;
      const nextStep = stepsRef.current[next];

      if (!nextStep) {
        track("onboarding_survey_completed", { last_step: step ?? "" });
        finish();
        return;
      }

      const trade = context.industryName || industryName;
      const crossingIntoPart2 =
        step != null && STEP_PART[step] === 1 && STEP_PART[nextStep] === 2;
      const transition = crossingIntoPart2 ? PART_TRANSITION_LINE : "";

      if (nextStep === "pins") {
        seededPinsRef.current = true;
        setPinIds(suggestedPinIds(trade));
        setLine(
          `${reaction} ${transition}I've switched on what ${
            trade ? `${trade.toLowerCase()} businesses` : "a business like yours"
          } usually need.`,
        );
      } else {
        setLine(`${reaction} ${transition}${INTRO_LINES[nextStep]}`);
      }

      setStepIndex(next);
    },
    [finish, industryName, step, stepIndex],
  );

  const chooseIndustry = React.useCallback(
    (name: string) => {
      setIndustrySelected(name);

      /*
       * Saved as `industry_id`. The options are the live `/industry` list, so
       * a picked row always resolves; free text typed into "my industry isn't
       * listed" does not, and falls back to the list's own "Other" row rather
       * than posting a name the backend drops on the floor.
       */
      const matched =
        industries.find(
          (entry) => entry.name.toLowerCase() === name.trim().toLowerCase(),
        ) ?? industries.find((entry) => entry.name === "Other");

      if (matched) {
        dispatchSave(industrySaveRequest(Number(matched.id)))
          .then(() =>
            // The record is what every screen reads the industry from, so
            // re-read it rather than keeping a second copy in sync.
            queryClient.invalidateQueries({ queryKey: ["businesses"] }),
          )
          .catch((error) => warn("could not save the industry", error));
      } else {
        warn("no industry id for this answer", name);
      }

      track("onboarding_survey_industry_selected", { industry: name });
      advance(industryLine(name), { industryName: name });
    },
    [advance, industries, queryClient],
  );

  const submitIndustryOther = React.useCallback(() => {
    const name = industryOtherText.trim();
    if (!name) return;
    chooseIndustry(name);
  }, [chooseIndustry, industryOtherText]);

  const chooseJoinFrom = React.useCallback(
    (option: { id: string; label: string }) => {
      setJoinFromSelected(option.id);
      setJoinFrom(option.label);
      dispatchSave(joinFromSaveRequest(option.label)).catch((error) =>
        warn("could not save what they switched from", error),
      );
      advance(
        option.label === "First time user"
          ? "Your first set of books — you're in good hands."
          : `${option.label}, right. It all comes across just fine.`,
      );
    },
    [advance, setJoinFrom],
  );

  const chooseSource = React.useCallback(
    (option: string) => {
      setReferralSelected(option);

      if (option === REFERRAL_SOURCE_OTHER) {
        setReferralOtherText("");
        setLine("Go on then, type it in — I'm curious.");
        return;
      }

      setReferralAnswer(option, null);
      dispatchSave(referralSaveRequest(option, "")).catch((error) =>
        warn("could not save the referral source", error),
      );
      advance(`${option} — good to know, I'll pass that on to the team.`);
    },
    [advance, setReferralAnswer],
  );

  const submitReferralOther = React.useCallback(() => {
    const text = referralOtherText.trim();
    if (!text) return;
    setReferralAnswer(REFERRAL_SOURCE_OTHER, text);
    dispatchSave(referralSaveRequest(REFERRAL_SOURCE_OTHER, text)).catch(
      (error) => warn("could not save the referral source", error),
    );
    advance("Noted — that's the useful kind of answer.");
  }, [advance, referralOtherText, setReferralAnswer]);

  const confirmPins = React.useCallback(() => {
    markPinsSuggested();
    if (pinIds.length > 0) {
      setPinnedNavIds((current) => [
        ...current,
        ...pinIds.filter((id) => !current.includes(id)),
      ]);
      dispatchSave(sidebarPinsSaveRequest(pinIds)).catch((error) =>
        warn("could not pin the shortcuts", error),
      );
    }
    track("onboarding_survey_pins_saved", { pinned: pinIds.length });
    advance(
      pinIds.length > 0
        ? `Done — ${pinIds.length} shortcut${pinIds.length === 1 ? "" : "s"} up top.`
        : "Fair enough, a clean sidebar it is.",
    );
  }, [advance, markPinsSuggested, pinIds, setPinnedNavIds]);

  const chooseAction = React.useCallback(
    (action: FirstAction | null) => {
      track("onboarding_survey_completed", {
        last_step: "first_action",
        action: action?.key ?? "later",
      });
      finish(action?.href);
    },
    [finish],
  );

  const handleBack = React.useCallback(() => {
    if (stepIndex === 0) return;
    const previous = stepIndex - 1;
    setStepIndex(previous);
    setLine(INTRO_LINES[steps[previous]]);
  }, [stepIndex, steps]);

  // Nothing at all until there's a proved session and both stores have
  // rehydrated — same reasoning as `FirstRunOverlay`'s own `visible` gate: a
  // skeleton behind a modal that may not open is a flash of furniture, and
  // reading either store before it's rehydrated risks asking a settled
  // account its questions again.
  if (!enabled || !surveyHydrated) return null;
  if (!open || !step) return null;

  const isIndustryOtherSelected =
    step === "industry" && industrySelected === CUSTOM_INDUSTRY_OPTION;
  const isReferralOtherSelected =
    step === "referral" && referralSelected === REFERRAL_SOURCE_OTHER;
  const canSubmitOther =
    (isIndustryOtherSelected && industryOtherText.trim().length > 0) ||
    (isReferralOtherSelected && referralOtherText.trim().length > 0);

  // The escape hatch is never filtered out by the search box — a query that
  // matches nothing would otherwise hide the one option `emptyMessage` points
  // someone at.
  const industryOptions: ChipOption[] = [
    /*
     * The live `/industry` list, not the local made-up one — the answer is
     * saved as an `industry_id`, so the options have to be rows that have one.
     * "Other" is left out because the escape hatch below replaces it: "Other"
     * told us nothing, a typed answer tells us which row to add next.
     */
    ...industries
      .filter(
        (entry) =>
          entry.name !== "Other" &&
          entry.name
            .toLowerCase()
            .includes(industryQuery.trim().toLowerCase()),
      )
      .map((entry) => ({ id: entry.name, label: entry.name })),
    { id: CUSTOM_INDUSTRY_OPTION, label: CUSTOM_INDUSTRY_OPTION },
  ];

  const joinFromOptions: ChipOption[] = JOIN_FROM_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
  }));

  const referralChipOptions: ChipOption[] = referralOptions.map((option) => ({
    id: option,
    label: option,
  }));

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm data-[state=open]:animate-pop data-[state=closed]:animate-unpop" />

        <DialogPrimitive.Content
          // The backdrop stays inert on purpose — a stray tap while scrolling
          // a list of switches on a phone shouldn't throw the questions away.
          // Escape and the header's X (below) both go through `onOpenChange`
          // above instead, which is what lets those close it.
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg data-[state=open]:animate-pop data-[state=closed]:animate-unpop",
            // The pins step is a list of switches rather than a question, so
            // it gets the room to show them at a size worth aiming at.
            step === "pins" ? "sm:max-w-[680px]" : "sm:max-w-[560px]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            A few quick questions
          </DialogPrimitive.Title>

          {/* Header band — a coloured lid Pip leans out of. */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-primary via-primary to-[#7C3AED] px-6 py-3">
            <div
              className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
                <Sparkles className="h-5 w-5" />
                {EYEBROWS[step]}
              </span>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close and ask me later"
                title="Close and ask me later"
                className="btn-soft-close-inverse -mr-2 size-7 shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* min-h-0 is what lets this actually scroll. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
            <MascotGuide line={line} />

            <h2 className="m-0 mt-2 text-lg font-semibold tracking-tight text-foreground">
              {HEADINGS[step]}
            </h2>

            {/* Keyed, so the step's content swaps outright and fades in. */}
            <div key={step} className="mt-4 motion-safe:animate-step-in">
              {step === "industry" && (
                <MascotQuestionStep
                  options={industryOptions}
                  selectedId={industrySelected}
                  onSelect={(id) =>
                    id === CUSTOM_INDUSTRY_OPTION
                      ? setIndustrySelected(id)
                      : chooseIndustry(id)
                  }
                  search={{
                    value: industryQuery,
                    onChange: setIndustryQuery,
                    placeholder: "Search industries…",
                  }}
                  otherId={CUSTOM_INDUSTRY_OPTION}
                  otherValue={industryOtherText}
                  onOtherChange={setIndustryOtherText}
                  onOtherSubmit={submitIndustryOther}
                  otherPlaceholder="Tell us your industry…"
                  emptyMessage='Nothing matches that — try a broader word, or pick "my industry isn’t listed".'
                />
              )}

              {step === "join_from" && (
                <MascotQuestionStep
                  options={joinFromOptions}
                  selectedId={joinFromSelected}
                  onSelect={(id) => {
                    const option = JOIN_FROM_OPTIONS.find(
                      (entry) => entry.id === id,
                    );
                    if (option) chooseJoinFrom(option);
                  }}
                />
              )}

              {step === "referral" && (
                <MascotQuestionStep
                  options={referralChipOptions}
                  selectedId={referralSelected}
                  onSelect={chooseSource}
                  otherId={REFERRAL_SOURCE_OTHER}
                  otherValue={referralOtherText}
                  onOtherChange={setReferralOtherText}
                  onOtherSubmit={submitReferralOther}
                  otherPlaceholder="Tell us where you found us…"
                />
              )}

              {step === "pins" && (
                <SidebarPicker
                  pinnedIds={pinIds}
                  recommendedIds={suggestedPinIds(industryName)}
                  onChange={setPinIds}
                />
              )}

              {step === "first_action" && (
                <FirstActionCards
                  industryName={industryName}
                  onSelect={chooseAction}
                  onSkip={() => chooseAction(null)}
                />
              )}
            </div>
          </div>

          {/* Outside the scroll area on purpose — the way out should never
              be something you have to go looking for. */}
          <div className="shrink-0 border-t border-border bg-card px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1">
                {stepIndex > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="-ml-3 text-muted-foreground"
                  >
                    Back
                  </Button>
                )}
                {step === "pins" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPinIds(suggestedPinIds(industryName))}
                    className={cn(
                      "text-muted-foreground",
                      stepIndex === 0 && "-ml-3",
                    )}
                  >
                    <RotateCcw />
                    Reset
                  </Button>
                ) : (
                  stepIndex === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {FOOTERS[step]}
                    </span>
                  )
                )}
              </div>

              {step === "pins" && (
                <Button type="button" onClick={confirmPins} className="group">
                  {pinIds.length > 0
                    ? `Add ${pinIds.length} to sidebar`
                    : "Skip for now"}
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Button>
              )}

              {canSubmitOther && (
                <Button
                  type="button"
                  onClick={
                    isIndustryOtherSelected
                      ? submitIndustryOther
                      : submitReferralOther
                  }
                  className="group"
                >
                  Done
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
