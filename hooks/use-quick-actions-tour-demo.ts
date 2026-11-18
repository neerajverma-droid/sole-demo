"use client";

import * as React from "react";
import usertour from "usertour.js";

import { QUICK_ACTIONS_TOUR_ID } from "@/lib/unibox-demo";
import { useTourDemoStore } from "@/stores/tour-demo";

/** How often the page asks whether the tour is still running. */
const POLL_MS = 400;

/**
 * Keeps the sample rows in step with the Quick Actions tour: on while it runs,
 * off the moment it is finished, skipped or closed — and off when the page is
 * left, whatever the tour is doing.
 *
 * Asks the Usertour script rather than listening for its events, because a
 * question has one answer however the tour started (on its own, from "Take the
 * tour", or resumed on a return visit) and an event has to be caught the
 * moment it fires. `isStarted` is a cheap in-memory read.
 */
export function useQuickActionsTourDemo() {
  const setActive = useTourDemoStore((state) => state.setActive);
  const reset = useTourDemoStore((state) => state.reset);

  React.useEffect(() => {
    const check = () => {
      try {
        setActive(usertour.isStarted(QUICK_ACTIONS_TOUR_ID));
      } catch {
        setActive(false);
      }
    };
    check();
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      window.clearInterval(timer);
      reset();
    };
  }, [setActive, reset]);
}
