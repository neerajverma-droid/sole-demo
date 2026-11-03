"use client";

import * as React from "react";

import { useSalesSettingsStore } from "@/stores/sales-settings";

/**
 * Sales settings plus whether the stored copy has been applied yet.
 *
 * The store defers rehydration so the server and the first client render agree,
 * which means anything reading it during that first render sees the defaults. For
 * a screen that's harmless; for a document number seeded once into form state it
 * isn't, so callers that seed need the flag to know when to re-seed.
 */
export function useSalesSettings() {
  const settings = useSalesSettingsStore((state) => state.settings);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const store = useSalesSettingsStore.persist;
    // Absent while rendering on the server, where there's no storage to attach.
    if (!store) return;

    if (store.hasHydrated()) setHydrated(true);
    const unsubscribe = store.onFinishHydration(() => setHydrated(true));
    void store.rehydrate();
    return unsubscribe;
  }, []);

  return { settings, hydrated };
}

/**
 * A document number seeded from settings, corrected once those settings arrive.
 *
 * The number goes into form state so it can be edited, which means it's computed
 * before the stored prefix is known. This replaces it when hydration lands — but
 * only while it still matches what was computed, so a number the user has typed
 * over is never overwritten.
 */
export function useSeededNumber(
  compute: () => string,
  hydrated: boolean,
  current: string,
  onChange: (next: string) => void,
) {
  const seeded = React.useRef(current);

  React.useEffect(() => {
    if (!hydrated) return;
    const next = compute();
    if (next === seeded.current) return;
    // Untouched since we seeded it, so it's ours to correct.
    if (current === seeded.current) {
      seeded.current = next;
      onChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
}
