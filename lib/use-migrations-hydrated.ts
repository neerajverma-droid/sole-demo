"use client";

import * as React from "react";

import { useMigrationsStore } from "@/stores/migrations";

/**
 * Whether the stored import counts have been applied yet.
 *
 * The same shape as `useSettingsHydrated`. The store defers rehydration so the
 * server and the first client render agree on an empty set, which means every
 * step reads as not-started for a tick — and the migration page turns that into
 * a green row and a count, so acting on it early would draw the whole list in
 * the wrong state and then correct itself a frame later.
 */
export function useMigrationsHydrated(): boolean {
  // Always false on the server and on the first client render, so the two agree.
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // The persist API is only attached when the middleware found a storage to
    // use, so it's absent while rendering on the server.
    const store = useMigrationsStore.persist;
    if (!store) return;

    if (store.hasHydrated()) setHydrated(true);
    const unsubscribe = store.onFinishHydration(() => setHydrated(true));
    void store.rehydrate();
    return unsubscribe;
  }, []);

  return hydrated;
}
