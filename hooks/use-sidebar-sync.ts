"use client";

import * as React from "react";
import { useAtom } from "jotai";

import { useSession } from "@/components/auth/session-provider";
import {
  pinnedNavIdsAtom,
  sidebarChildOrderAtom,
  sidebarExtraIdsAtom,
  sidebarHiddenAtom,
  sidebarOrderAtom,
} from "@/lib/atoms";
import {
  fetchSidebarLayout,
  fetchSidebarPins,
  postSidebarLayout,
  postSidebarPins,
  serialiseLayout,
  serialisePins,
  type SidebarLayout,
} from "@/lib/sidebar-sync";

/**
 * Keeps the rail's two stored facts — the pins and the layout — in step with
 * the account they belong to.
 *
 * Read once per session on the way in, written back whenever either changes.
 * One hook rather than a call at each mutation site: pins alone move from four
 * places (the pin button, a pin drag, first run's starter set, an add-on taking
 * over the row something was pinned to) and the layout from six more inside the
 * customise modal. Every one of those is an atom write already, so watching the
 * atoms covers all ten and can't be forgotten by the eleventh.
 *
 * The local copies stay. `atomWithStorage` keeps writing to localStorage, which
 * is what makes the rail render arranged on the very first paint of the next
 * load instead of flashing the shipped order until the GET lands — and what
 * keeps it arranged when the GET doesn't land at all. The server is the record;
 * storage is the cache in front of it.
 *
 * Mounted once, in `AppSidebar`. Everything that writes these atoms is inside
 * the `(app)` layout, first run included, so one mount there covers the lot.
 */

/**
 * What this browsing session has done about the server's copy.
 *
 * Module scope, not a ref, for the same reason sole-webapp's `usePinnedNavStore`
 * is a store: `AppSidebar` remounts on every navigation. Refs would make each
 * one a fresh GET — re-seeding the atoms from a response that could be a beat
 * behind a change the person just made — and would lose `synced` with it, so
 * every navigation would post the rail again unchanged.
 */
const sync = {
  /** A read has been dispatched. Stops a remount firing a second one. */
  started: false,
  /**
   * That read has settled. Writes wait for this and not for `started`: in the
   * window between them the atoms are still the local cache, and posting there
   * would send a rail the server hadn't been asked about yet.
   */
  loaded: false,
  /**
   * The last state each endpoint is known to hold, serialised.
   *
   * One per endpoint, because they're written separately: a pin toggle
   * shouldn't rewrite the layout, and a drag in the customise tab shouldn't
   * rewrite the pins.
   */
  pins: null as string | null,
  layout: null as string | null,
};

/**
 * Everyone watching for `sync.loaded` to flip.
 *
 * The flag lives at module scope so it survives `AppSidebar` remounting; a
 * component outside the rail still has to re-render when it changes, and
 * nothing here is a store it could subscribe to. `useSyncExternalStore` plus
 * this set is the smallest thing that makes it observable.
 */
const loadedListeners = new Set<() => void>();

function announceLoaded() {
  loadedListeners.forEach((listener) => listener());
}

/**
 * Whether the server's own copy of the pins has been read yet this session.
 *
 * For anyone who has to tell "this account pins nothing" apart from "the pins
 * haven't arrived". The atoms start empty on a device that has never seen the
 * account — and on every device right after a sign-out, which wipes storage —
 * so an empty `pinnedNavIdsAtom` means nothing until this is true. The
 * onboarding survey reads it before deciding whether to offer a starter set.
 */
export function useSidebarPinsLoaded(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      loadedListeners.add(listener);
      return () => loadedListeners.delete(listener);
    },
    () => sync.loaded,
    // The server is never read on the server; nothing has loaded there.
    () => false,
  );
}

/** Puts a fresh session back to square one. Called by the sign-out teardown. */
export function resetSidebarSync() {
  sync.started = false;
  sync.loaded = false;
  sync.pins = null;
  sync.layout = null;
  announceLoaded();
}

export function useSidebarSync() {
  const { status } = useSession();

  const [pinnedIds, setPinnedIds] = useAtom(pinnedNavIdsAtom);
  const [order, setOrder] = useAtom(sidebarOrderAtom);
  const [childOrder, setChildOrder] = useAtom(sidebarChildOrderAtom);
  const [hidden, setHidden] = useAtom(sidebarHiddenAtom);
  const [extras, setExtras] = useAtom(sidebarExtraIdsAtom);

  /*
   * `sync.loaded` as something React re-renders for.
   *
   * The module flag is the one that survives a remount; this mirrors it so the
   * first write after a read doesn't have to wait for an unrelated render to
   * notice the read finished. Seeded from the flag, so a remount mid-session is
   * ready immediately rather than fetching again to find out.
   */
  const [loaded, setLoaded] = React.useState(sync.loaded);

  /*
   * Storage predates the fields it's read into — an atom persisted before a key
   * existed comes back without it — so every read of these four is widened the
   * same way the sidebar and the customise panel widen them.
   */
  const layout: SidebarLayout = React.useMemo(
    () => ({
      order: order ?? {},
      childOrder: childOrder ?? {},
      hidden: hidden ?? [],
      extras: extras ?? [],
    }),
    [order, childOrder, hidden, extras],
  );

  /* ---------------------------------------------------------------- *
   * Read
   * ---------------------------------------------------------------- */

  React.useEffect(() => {
    // Before the profile has come back there's no account to read for, and an
    // unauthenticated render would spend a 401 on it.
    if (status !== "authenticated" || sync.started) return;
    sync.started = true;

    void (async () => {
      const [serverPins, serverLayout] = await Promise.all([
        fetchSidebarPins(),
        fetchSidebarLayout(),
      ]);

      /*
       * A failed read is not an empty one.
       *
       * `null` means the request didn't land, and seeding from it would wipe
       * the rail on screen — which the write effect below would then dutifully
       * save, because these writes replace rather than merge. So a failure
       * leaves the cached copy alone and the snapshot unset, and the first
       * local change after it is what establishes the baseline.
       */
      if (serverPins) setPinnedIds(serverPins);
      if (serverLayout) {
        setOrder(serverLayout.order);
        setChildOrder(serverLayout.childOrder);
        setHidden(serverLayout.hidden);
        setExtras(serverLayout.extras);
      }

      if (serverPins) sync.pins = serialisePins(serverPins);
      if (serverLayout) sync.layout = serialiseLayout(serverLayout);

      // Last, so the write effects can't see a half-seeded rail and post it.
      sync.loaded = true;
      setLoaded(true);
      announceLoaded();
    })();

    // No cleanup that cancels: the seeding has to land even if this particular
    // mount is gone by then, because the atoms it writes outlive it and the
    // next mount reads them rather than fetching again.
  }, [status, setPinnedIds, setOrder, setChildOrder, setHidden, setExtras]);

  /* ---------------------------------------------------------------- *
   * Write
   * ---------------------------------------------------------------- */

  const pinsSnapshot = serialisePins(pinnedIds ?? []);
  const layoutSnapshot = serialiseLayout(layout);

  /*
   * Nothing goes up before the read has come back.
   *
   * On a device that has never seen this account, the atoms start empty and
   * fill from storage a tick later. Posting in that window would send an empty
   * rail, and a replace-not-merge write turns that into "they unpinned
   * everything and reset their layout".
   */
  const ready = status === "authenticated" && loaded;

  React.useEffect(() => {
    if (!ready || sync.pins === pinsSnapshot) return;
    sync.pins = pinsSnapshot;
    postSidebarPins(pinnedIds ?? []);
    // `pinsSnapshot` is the value that decides; the list comes along to be
    // sent, and can't change without changing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pinsSnapshot]);

  React.useEffect(() => {
    if (!ready || sync.layout === layoutSnapshot) return;
    sync.layout = layoutSnapshot;
    postSidebarLayout(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, layoutSnapshot]);
}
