"use client";

import * as React from "react";

import {
  useOnboardingSurveySessionStore,
  useOnboardingSurveyStore,
} from "@/stores/onboarding-survey";

/**
 * Whether the stored onboarding-survey answers have been applied yet.
 *
 * Mirrors `lib/use-welcome-hydrated.ts` exactly, for the same reason: both
 * stores defer rehydration (`skipHydration: true`) so the server and the
 * first client render agree, which means every field reads as its default for
 * a tick on every load. A caller deciding "is anything still owed" before
 * this is true would ask the four questions again on every page load, for
 * everyone, until the tick passed.
 *
 * Gates on BOTH of `stores/onboarding-survey.ts`'s stores — the durable one
 * and the `sessionStorage`-backed one — unlike its namesake, which only ever
 * had the one. Returns true once both have rehydrated, so a caller never sees
 * a false "nothing owed" because it read the durable store's answers before
 * the session store had reported whether this tab already asked.
 */
export function useOnboardingSurveyHydrated(): boolean {
  // Always false on the server and on the first client render, so the two agree.
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // The persist API is only attached when the middleware found a storage to
    // use, so it's absent while rendering on the server.
    const store = useOnboardingSurveyStore.persist;
    const sessionStore = useOnboardingSurveySessionStore.persist;
    if (!store || !sessionStore) return;

    let storeDone = store.hasHydrated();
    let sessionDone = sessionStore.hasHydrated();

    const settle = () => {
      if (storeDone && sessionDone) setHydrated(true);
    };
    settle();

    const unsubscribe = store.onFinishHydration(() => {
      storeDone = true;
      settle();
    });
    const unsubscribeSession = sessionStore.onFinishHydration(() => {
      sessionDone = true;
      settle();
    });

    void store.rehydrate();
    void sessionStore.rehydrate();

    return () => {
      unsubscribe();
      unsubscribeSession();
    };
  }, []);

  return hydrated;
}
