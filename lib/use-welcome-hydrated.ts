"use client";

import * as React from "react";

import { useWelcomeStore } from "@/stores/welcome";

/**
 * Whether the stored Welcome answers have been applied yet.
 *
 * The same shape as `useSettingsHydrated`, and needed for a sharper reason: the
 * store defers rehydration so the server and the first client render agree,
 * which means `complete` reads false for a tick on every load. The gate turns
 * that value into a redirect, so acting on it before this is true would bounce
 * every finished account back into Welcome the moment they opened the app.
 */
export function useWelcomeHydrated(): boolean {
  // Always false on the server and on the first client render, so the two agree.
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // The persist API is only attached when the middleware found a storage to
    // use, so it's absent while rendering on the server.
    const store = useWelcomeStore.persist;
    if (!store) return;

    if (store.hasHydrated()) setHydrated(true);
    const unsubscribe = store.onFinishHydration(() => setHydrated(true));
    void store.rehydrate();
    return unsubscribe;
  }, []);

  return hydrated;
}
