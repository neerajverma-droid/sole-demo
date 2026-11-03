/**
 * The sidebar, on the server.
 *
 * Two facts about the rail outlive the browser they were set in: which rows
 * someone pinned, and how they arranged the rest. Both are per-account rather
 * than per-business — the rail is the same shape whichever business you're in —
 * and both live on `user_config`, behind `/user-config/sidebar-pins` and
 * `/user-config/sidebar-layout`.
 *
 * Two endpoints, not one, because they are two gestures on two controls:
 * pinning is a click on a row in the rail, customising is a modal that
 * rearranges everything else. A single endpoint would make every pin rewrite
 * the layout and every drag rewrite the pins.
 *
 * Both writes send the complete value rather than a diff, so a dropped request
 * is self-correcting: the next one carries the whole thing again. That is also
 * why nothing here retries — a retry would race the write that already fixed it.
 *
 * Reads are defensive about the body because the client and the server version
 * independently, and a rail that threw on an unexpected shape would be a rail
 * that didn't render.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

/**
 * How the rail has been arranged — the four things the Customise tab writes.
 *
 * Keyed exactly as the atoms behind it are (`sidebarOrderAtom` and friends in
 * `lib/atoms.ts`), so the snapshot that goes up is the state that came down
 * with no field renaming in between. `order` is keyed by section heading,
 * `childOrder` by group nav id; `hidden` and `extras` are flat id lists.
 */
export type SidebarLayout = {
  order: Record<string, string[]>;
  childOrder: Record<string, string[]>;
  hidden: string[];
  extras: string[];
};

export const EMPTY_SIDEBAR_LAYOUT: SidebarLayout = {
  order: {},
  childOrder: {},
  hidden: [],
  extras: [],
};

/** A list of nav ids, from a body that is only claimed to hold one. */
function readIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
}

function readIdMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(value as Record<string, unknown>)) {
    const list = readIdList(ids);
    // An empty list is what a missing key already means, and keeping it would
    // make the snapshot comparison see a change where there wasn't one.
    if (list.length > 0) out[key] = list;
  }
  return out;
}

export function readSidebarLayout(value: unknown): SidebarLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_SIDEBAR_LAYOUT;
  }

  const raw = value as Record<string, unknown>;
  return {
    order: readIdMap(raw.order),
    childOrder: readIdMap(raw.childOrder),
    hidden: readIdList(raw.hidden),
    extras: readIdList(raw.extras),
  };
}

/**
 * What a read came back with, or `null` for "couldn't tell".
 *
 * `null` and an empty value are deliberately different answers. An account that
 * has never customised reads as the empty layout and the rail takes the stored
 * one it already had; a request that failed reads as `null` and the rail leaves
 * everything alone rather than treating a network error as "they unpinned
 * everything" — which, with a full-replace write behind it, would then be
 * saved.
 */
export async function fetchSidebarPins(): Promise<string[] | null> {
  try {
    const res = await api.get(apiRoutes.userConfig.sidebarPins);
    if (!res.data?.success) return null;
    return readIdList(res.data?.data?.pinnedNavIds);
  } catch (err) {
    console.error("Failed to fetch pinned sidebar items", err);
    return null;
  }
}

export async function fetchSidebarLayout(): Promise<SidebarLayout | null> {
  try {
    const res = await api.get(apiRoutes.userConfig.sidebarLayout);
    if (!res.data?.success) return null;
    return readSidebarLayout(res.data?.data?.sidebarLayout);
  } catch (err) {
    console.error("Failed to fetch sidebar layout", err);
    return null;
  }
}

/**
 * The writes, fire-and-forget.
 *
 * Nothing waits on them and nothing is told when they fail, because the thing
 * they persist has already happened on screen — the atom moved first, and a
 * toast saying a pin didn't save would be a toast about a pin that is visibly
 * pinned. Matches the sibling `userConfig` writes (the WorldPay banner
 * dismissal, the fitrec popup), none of which block or alert either.
 */
export function postSidebarPins(pinnedNavIds: string[]): void {
  api.post(apiRoutes.userConfig.sidebarPins, { pinnedNavIds }).catch((err) => {
    console.error("Failed to update pinned sidebar items", err);
  });
}

export function postSidebarLayout(sidebarLayout: SidebarLayout): void {
  api
    .post(apiRoutes.userConfig.sidebarLayout, { sidebarLayout })
    .catch((err) => {
      console.error("Failed to update sidebar layout", err);
    });
}

/**
 * A stable string for "this is the state of X".
 *
 * The sync effects run on every render that touches one of the atoms, and most
 * of those renders changed nothing they care about — a new object identity from
 * a `setOrder` that wrote the same list back, a remount, a second atom in the
 * same batch. Comparing serialised snapshots is what stops each of those
 * becoming a POST.
 *
 * One per endpoint rather than one for the pair, so toggling a pin doesn't also
 * rewrite the layout and dragging a row doesn't also rewrite the pins. They're
 * stored separately for exactly that reason; a combined snapshot would put them
 * back together on the way out.
 */
export function serialisePins(pinnedNavIds: string[]): string {
  return JSON.stringify(pinnedNavIds);
}

/**
 * Keys are sorted at every level, so two equal layouts built in a different
 * order serialise identically. Values are not sorted: their order is the
 * preference being stored.
 */
export function serialiseLayout(layout: SidebarLayout): string {
  const sortedMap = (map: Record<string, string[]>) =>
    Object.keys(map)
      .sort()
      .map((key) => [key, map[key]] as const);

  return JSON.stringify([
    sortedMap(layout.order),
    sortedMap(layout.childOrder),
    layout.hidden,
    layout.extras,
  ]);
}
