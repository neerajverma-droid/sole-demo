"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import usertour from "usertour.js";

import { fetchDashboardBankAccounts } from "@/lib/dashboard";
import {
  DASHBOARD_DEMO_ENDED_EVENT,
  dashboardDemoEndedLocally,
  dashboardDemoLocalKey,
  endDashboardDemo,
  fetchDashboardDemoDone,
  retryPendingDashboardDemoEnd,
} from "@/lib/dashboard-demo";
import { useExpensesStore } from "@/stores/expenses";
import { useInvoicesStore } from "@/stores/invoices";
import { useOnboardingSurveySessionStore } from "@/stores/onboarding-survey";
import { sessionUserId, useSessionStore } from "@/stores/session";

/**
 * Whether the dashboard shows sample figures or the account's own.
 *
 *  - "loading": not decided yet; the dashboard shows a skeleton rather than
 *    flashing $0 and then the sample (or the other way round).
 *  - "demo":    a brand-new account whose dashboard tour hasn't ended.
 *  - "live":    everyone else.
 */
export type DashboardMode = "loading" | "demo" | "live";

type DashboardDemoValue = { mode: DashboardMode };

// Outside the provider nothing is ever a sample.
const DashboardDemoContext = React.createContext<DashboardDemoValue>({ mode: "live" });

const TOUR_STATUS_KEY = ["tour", "dashboard-demo"] as const;

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

const USERTOUR_TOKEN = process.env.NEXT_PUBLIC_USERTOUR_TOKEN;

/** Usertour content id of the dashboard tour — the last one a new user sees. */
const DASHBOARD_TOUR_ID = process.env.NEXT_PUBLIC_USERTOUR_DASHBOARD_TOUR_ID ?? "";

/**
 * Usertour content ids of the tours that run before it, comma-separated —
 * e.g. the sidebar's module tour. Optional; listing them keeps the sample up
 * while they run, and lets a skip part-way through end it.
 */
const EARLIER_TOUR_IDS = (process.env.NEXT_PUBLIC_USERTOUR_ONBOARDING_TOUR_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

/**
 * The sample is only shown where the dashboard can tell when the tour is
 * over. Without Usertour, or without the dashboard tour's id, nothing could
 * reliably end it, so it isn't shown at all.
 */
export const DASHBOARD_DEMO_ENABLED = Boolean(USERTOUR_TOKEN && DASHBOARD_TOUR_ID);

/* ------------------------------------------------------------------ *
 * Timings
 * ------------------------------------------------------------------ */

/**
 * How long the page waits for the real lists before giving up on deciding and
 * showing them as they are. A failed invoices fetch never marks the store
 * hydrated, and that mustn't leave the whole dashboard on a skeleton.
 */
const DECIDE_TIMEOUT_MS = 8000;

/** How often the watchdog looks at what Usertour is running. */
export const WATCH_INTERVAL_MS = 1000;

/**
 * Once the tour could have started (survey settled, nothing in a dialog) and
 * none has: Usertour is down, blocked, or decided not to show it.
 */
export const TOUR_START_GRACE_MS = 45_000;

/**
 * After an earlier tour, how long with nothing running before it's taken that
 * the dashboard tour isn't coming — the earlier tour was skipped. Long enough
 * to cover the hand-over between two tours, including a page change.
 */
export const BETWEEN_TOURS_GRACE_MS = 20_000;

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

/**
 * Decides the mode once and provides it to the dashboard's cards.
 *
 * Who sees the sample: an account whose dashboard tour hasn't ended — not on
 * the server, not in this browser — AND that has nothing of its own yet: no
 * invoices, no expenses, no bank accounts. Anyone with real data sees it
 * straight away, so an existing user is never shown made-up numbers.
 *
 * What ends it, whichever comes first:
 *  - the tour calling `window.soleEndDashboardDemo()` (`endDashboardDemo`);
 *  - the watchdog below seeing the tour finish, get skipped, or never start;
 *  - the same user ending it in another tab (the `storage` event).
 *
 * Fails safe: if the tour status can't be read, or the lists never load, the
 * dashboard shows real data rather than risk leaving someone on the sample.
 */
export function DashboardDemoProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => sessionUserId(state.user));

  const tourStatus = useQuery({
    queryKey: TOUR_STATUS_KEY,
    queryFn: fetchDashboardDemoDone,
    staleTime: Infinity,
    retry: 1,
    enabled: DASHBOARD_DEMO_ENABLED,
  });
  // Same key the live Connected accounts card uses, so this doesn't fetch twice.
  const bankAccounts = useQuery({
    queryKey: ["dashboard", "bank-accounts"],
    queryFn: fetchDashboardBankAccounts,
    enabled: DASHBOARD_DEMO_ENABLED,
  });
  const invoicesHydrated = useInvoicesStore((state) => state.hydrated);
  const invoiceCount = useInvoicesStore((state) => state.invoices.length);
  const expensesHydrated = useExpensesStore((state) => state.hydrated);
  const expenseCount = useExpensesStore((state) => state.expenses.length);

  /** Bumped when the sample ends — here, from the tour, or in another tab. */
  const [endedTick, setEndedTick] = React.useState(0);
  /*
   * Read after mount, not during render: the server has no localStorage, and
   * reading it in render would make the first client render disagree with the
   * server's.
   */
  const [endedLocally, setEndedLocally] = React.useState(false);
  React.useEffect(() => {
    setEndedLocally(dashboardDemoEndedLocally(userId));
  }, [userId, endedTick]);
  /** The first answer sticks for the visit, so the page never flips mid-look. */
  const [decided, setDecided] = React.useState<"demo" | "live" | null>(null);
  const [timedOut, setTimedOut] = React.useState(false);

  let mode: DashboardMode;
  if (!DASHBOARD_DEMO_ENABLED || endedLocally) {
    mode = "live";
  } else if (decided) {
    mode = decided;
  } else if (tourStatus.isError || bankAccounts.isError || timedOut) {
    mode = "live";
  } else if (
    tourStatus.isPending ||
    bankAccounts.isPending ||
    !invoicesHydrated ||
    !expensesHydrated
  ) {
    mode = "loading";
  } else {
    const hasOwnData =
      invoiceCount > 0 ||
      expenseCount > 0 ||
      (bankAccounts.data?.accounts.length ?? 0) > 0;
    mode = tourStatus.data === true || hasOwnData ? "live" : "demo";
  }

  React.useEffect(() => {
    if (mode !== "loading" && decided == null) setDecided(mode);
  }, [mode, decided]);

  React.useEffect(() => {
    if (decided != null || !DASHBOARD_DEMO_ENABLED) return;
    const timer = window.setTimeout(() => setTimedOut(true), DECIDE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [decided]);

  // An end the server missed last time is sent again.
  React.useEffect(() => {
    void retryPendingDashboardDemoEnd(userId);
  }, [userId]);

  // Ended in this tab (by the tour or the watchdog), or in another tab.
  React.useEffect(() => {
    const onEnded = () => {
      setEndedTick((tick) => tick + 1);
      queryClient.setQueryData(TOUR_STATUS_KEY, true);
    };
    const onStorage = (event: StorageEvent) => {
      if (userId && event.key === dashboardDemoLocalKey(userId) && event.newValue) onEnded();
    };
    window.addEventListener(DASHBOARD_DEMO_ENDED_EVENT, onEnded);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DASHBOARD_DEMO_ENDED_EVENT, onEnded);
      window.removeEventListener("storage", onStorage);
    };
  }, [queryClient, userId]);

  useTourWatchdog(mode === "demo", userId);

  const value = React.useMemo(() => ({ mode }), [mode]);
  return (
    <DashboardDemoContext.Provider value={value}>
      {children}
    </DashboardDemoContext.Provider>
  );
}

/* ------------------------------------------------------------------ *
 * Watchdog
 * ------------------------------------------------------------------ */

export type WatchdogState = {
  /** The dashboard tour has been seen running. */
  seenDashboardTour: boolean;
  /** Any onboarding tour (earlier or dashboard) has been seen running. */
  seenAnyTour: boolean;
  /** Time counted with nothing running while a tour could have been. */
  idleMs: number;
};

export const INITIAL_WATCHDOG_STATE: WatchdogState = {
  seenDashboardTour: false,
  seenAnyTour: false,
  idleMs: 0,
};

export type WatchdogTick = {
  dashboardTourRunning: boolean;
  earlierTourRunning: boolean;
  /** A tour could start now: the survey has settled and no dialog is open. */
  tourCanStart: boolean;
  elapsedMs: number;
};

export type WatchdogReason = "tour-ended" | "tour-never-started" | "tour-skipped";

/**
 * One look at what Usertour is doing, and whether that means the sample
 * should go. Pure, so every edge of it can be tested without a browser.
 *
 *  - The dashboard tour was running and now isn't: it was finished or
 *    skipped. End now.
 *  - Nothing has run, for TOUR_START_GRACE_MS of time a tour could have
 *    started in: it isn't coming (Usertour down or blocked, or not targeted).
 *  - An earlier tour ran, then nothing for BETWEEN_TOURS_GRACE_MS: it was
 *    skipped and the dashboard tour isn't following.
 *
 * Idle time only counts while a tour could start, so a long survey, or a
 * dialog the user is working in, never ends the sample early.
 */
export function watchdogStep(
  state: WatchdogState,
  tick: WatchdogTick,
): { state: WatchdogState; end: WatchdogReason | null } {
  if (tick.dashboardTourRunning) {
    return {
      state: { seenDashboardTour: true, seenAnyTour: true, idleMs: 0 },
      end: null,
    };
  }
  if (state.seenDashboardTour) {
    return { state, end: "tour-ended" };
  }
  if (tick.earlierTourRunning) {
    return { state: { ...state, seenAnyTour: true, idleMs: 0 }, end: null };
  }

  const idleMs = tick.tourCanStart ? state.idleMs + tick.elapsedMs : state.idleMs;
  const next = { ...state, idleMs };
  if (state.seenAnyTour && idleMs >= BETWEEN_TOURS_GRACE_MS) {
    return { state: next, end: "tour-skipped" };
  }
  if (!state.seenAnyTour && idleMs >= TOUR_START_GRACE_MS) {
    return { state: next, end: "tour-never-started" };
  }
  return { state: next, end: null };
}

function isTourRunning(contentId: string): boolean {
  try {
    return usertour.isStarted(contentId);
  } catch {
    return false;
  }
}

/**
 * Ends the sample when the tour is over, even if the tour itself never calls
 * `soleEndDashboardDemo` — a skip button or close that wasn't wired to it,
 * Usertour failing to load, or the tour not being shown to this user at all.
 *
 * Polls `usertour.isStarted`, the SDK's documented check, rather than
 * listening for end events: those event names live in the remotely loaded
 * bundle and aren't part of the npm package's contract.
 */
function useTourWatchdog(active: boolean, userId: string | null) {
  React.useEffect(() => {
    if (!active || !DASHBOARD_DEMO_ENABLED) return;
    let state = INITIAL_WATCHDOG_STATE;

    const timer = window.setInterval(() => {
      const surveyDone =
        useOnboardingSurveySessionStore.getState().surveyCompletedThisSession;
      const step = watchdogStep(state, {
        dashboardTourRunning: isTourRunning(DASHBOARD_TOUR_ID),
        earlierTourRunning: EARLIER_TOUR_IDS.some(isTourRunning),
        tourCanStart:
          surveyDone &&
          document.visibilityState === "visible" &&
          !document.querySelector('[role="dialog"]'),
        elapsedMs: WATCH_INTERVAL_MS,
      });
      state = step.state;
      if (step.end) {
        window.clearInterval(timer);
        if (process.env.NODE_ENV !== "production") {
          console.info(`[dashboard-demo] ending the sample: ${step.end}.`);
        }
        void endDashboardDemo(userId);
      }
    }, WATCH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [active, userId]);
}

export function useDashboardDemo(): DashboardDemoValue {
  return React.useContext(DashboardDemoContext);
}

/** Shorthand for the cards: true while the sample is on screen. */
export function useIsDashboardDemo(): boolean {
  return useDashboardDemo().mode === "demo";
}
