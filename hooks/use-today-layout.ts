"use client";

import * as React from "react";

import {
  layoutKey,
  moveLayoutItem,
  parseLayout,
  recommendedLayout,
  toggleLayoutItem,
  type Layout,
  type LayoutKey,
} from "@/lib/quick-actions-today";
import { useBusinessesStore } from "@/stores/businesses";
import { sessionUserId, useSessionStore } from "@/stores/session";

/**
 * What Quick Actions shows and in what order — Customise's state — saved per
 * user and business in this browser. Starts on the recommended set until the
 * saved one is read, so the first paint matches the server's.
 */
export function useTodayLayout() {
  const user = useSessionStore((state) => state.user);
  const businessId = useBusinessesStore((state) => state.activeId) || null;
  const userId = sessionUserId(user);
  const key = userId ? layoutKey(userId, businessId) : null;

  const [layout, setLayout] = React.useState<Layout>(recommendedLayout);
  const loadedKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!key) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      /* storage blocked — the recommended set */
    }
    setLayout(parseLayout(raw));
    loadedKey.current = key;
  }, [key]);

  React.useEffect(() => {
    if (!key || loadedKey.current !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      /* private mode — holds for this visit */
    }
  }, [key, layout]);

  return {
    layout,
    toggle: (item: LayoutKey) => setLayout((current) => toggleLayoutItem(current, item)),
    move: (item: LayoutKey, direction: "up" | "down") =>
      setLayout((current) => moveLayoutItem(current, item, direction)),
    reset: () => setLayout(recommendedLayout()),
  };
}

export type TodayLayout = ReturnType<typeof useTodayLayout>;
