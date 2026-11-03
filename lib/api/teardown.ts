/**
 * Everything this browser remembers about the account, removed in one call.
 *
 * Signing out used to clear three cookies and nothing else. What survived was
 * most of the account: `sole-session` (the whole user profile),
 * `sole-businesses`, `sole-preferences`, `sole-onboarding-*` and every other
 * persisted Zustand store in localStorage, the survey's sessionStorage flags,
 * and React Query's in-memory cache — so the next person at the same browser
 * saw the previous user's name in the rail and their figures on the dashboard
 * until each query happened to refetch.
 *
 * Called from `clearSession()`, so it runs on every way out: the sign-out
 * button, a refresh token the server rejected, and a 401 three screens deep.
 *
 * Order matters at exactly one point — cookies go first, because they hold the
 * tokens, and a teardown that stalls partway through should at least have
 * stopped the browser being able to authenticate.
 */

/**
 * Device-scoped keys that are not account data and are deliberately kept.
 *
 * `theme` is the only one: losing dark mode every time someone signs out is a
 * visible regression with no security value behind it. Anything account-shaped
 * belongs in the wipe — if in doubt, leave it out of this list.
 */
const KEPT_STORAGE_KEYS = new Set(["theme"]);

/**
 * React Query's cache lives in a client held in `Providers`' component state,
 * which a plain module function can't reach. `Providers` registers it here on
 * mount so the teardown can clear it without the sign-out path having to be
 * threaded through React.
 */
type CacheHandle = { clear: () => void };
let queryCache: CacheHandle | null = null;

export function registerQueryCache(client: CacheHandle): () => void {
  queryCache = client;
  return () => {
    if (queryCache === client) queryCache = null;
  };
}

/**
 * Every cookie readable from this document, including the ones a previous
 * build of this app wrote under names nothing reads any more.
 *
 * Each name is expired at several paths and domain scopes because a cookie is
 * only overwritten by a `document.cookie` write whose path and domain match
 * the one that set it — clearing `path=/` alone leaves a cookie set on
 * `/api` in place, still attached to every request to it.
 */
function clearCookies(): void {
  if (typeof document === "undefined") return;

  const names = document.cookie
    .split(";")
    .map((pair) => pair.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return;

  const { hostname, pathname } = window.location;

  // "", ".example.com", ".com" — walked from the full host upwards so a cookie
  // set on a parent domain (shared with sole-webapp) is reached too. The
  // trailing single label is skipped: no one can set a cookie on a TLD.
  const parts = hostname.split(".");
  const domains: (string | null)[] = [null, hostname];
  for (let i = 0; i < parts.length - 1; i += 1) {
    domains.push(`.${parts.slice(i).join(".")}`);
  }

  // Root, plus every ancestor of the current path — a cookie scoped to the
  // page it was set on is otherwise untouchable from anywhere else.
  const segments = pathname.split("/").filter(Boolean);
  const paths = ["/"];
  for (let i = 0; i < segments.length; i += 1) {
    paths.push(`/${segments.slice(0, i + 1).join("/")}`);
  }

  const expiry = "expires=Thu, 01 Jan 1970 00:00:00 GMT";

  for (const name of names) {
    for (const path of paths) {
      for (const domain of domains) {
        document.cookie = `${name}=; ${expiry}; path=${path}${
          domain ? `; domain=${domain}` : ""
        }`;
      }
    }
  }
}

/**
 * localStorage and sessionStorage, minus `KEPT_STORAGE_KEYS`.
 *
 * Keys are collected before anything is removed: removing during iteration
 * reindexes the store and skips every second key.
 */
function clearWebStorage(): void {
  if (typeof window === "undefined") return;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && !KEPT_STORAGE_KEYS.has(key)) keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
    } catch {
      // A private window can refuse storage access outright. Nothing to do —
      // a store that can't be read can't be holding the last user's data.
    }
  }
}

/**
 * Zustand's persisted stores, in memory.
 *
 * Emptying localStorage above only removes what they'd rehydrate from on the
 * NEXT load. The live store objects still hold the previous user's state, and
 * nothing re-mounts between signing out and the sign-in screen rendering — so
 * without this the rail keeps naming their business on the way out.
 *
 * Imported lazily and defensively: this module is in the import path of the
 * API client, and pulling every store into it at module scope would make a
 * data call depend on the whole state layer.
 */
async function resetPersistedStores(): Promise<void> {
  const stores = await Promise.allSettled([
    import("@/stores/session"),
    import("@/stores/businesses"),
    import("@/stores/preferences"),
    import("@/stores/onboarding"),
    import("@/stores/onboarding-flow"),
    import("@/stores/onboarding-survey"),
    import("@/stores/welcome"),
    import("@/stores/subscription"),
    import("@/stores/dashboard"),
  ]);

  for (const result of stores) {
    if (result.status !== "fulfilled") continue;
    for (const exported of Object.values(result.value)) {
      // A Zustand hook is a function carrying `.getState`/`.setState`; the
      // `persist` middleware adds `.persist.clearStorage`. Anything else this
      // module happens to export is skipped.
      const store = exported as {
        getState?: () => unknown;
        setState?: (partial: unknown, replace?: boolean) => void;
        getInitialState?: () => unknown;
        persist?: { clearStorage?: () => void };
      };
      if (typeof store?.getState !== "function") continue;

      try {
        store.persist?.clearStorage?.();
        const initial = store.getInitialState?.();
        // `getInitialState` is what a store looked like before anyone touched
        // it — including its actions, which is why this can replace wholesale.
        if (initial && typeof store.setState === "function") {
          store.setState(initial, true);
        }
      } catch {
        // One store refusing to reset shouldn't stop the others.
      }
    }
  }
}

/**
 * The sidebar sync's once-per-session flags.
 *
 * Not a store, so `resetPersistedStores` above doesn't reach it: it's module
 * state saying this session has already read the rail from the server. A
 * sign-out that ends in a hard navigation throws it away with everything else,
 * but a session cleared in place — a 401 three screens deep, where the tree
 * survives — would leave it set, and the next account to sign in here would
 * never read its own pins. Lazily imported for the same reason the stores are.
 */
async function resetSidebarSyncState(): Promise<void> {
  try {
    const { resetSidebarSync } = await import("@/hooks/use-sidebar-sync");
    resetSidebarSync();
  } catch {
    // Nothing to reset if it was never loaded.
  }
}

/**
 * Mixpanel's identity, in memory.
 *
 * `clearWebStorage` above already removes what the SDK persisted, so a
 * sign-out that ends in a hard navigation is covered by that alone. A session
 * cleared in place is not: a 401 three screens deep leaves the tree standing
 * and the SDK instance still holding the previous user's `distinct_id` and
 * super properties, which it would write straight back to storage on the next
 * event — so whoever signs in next at this browser is counted as them.
 *
 * `reset()` also drops the super properties, which is why `resetAnalytics`
 * puts the ones describing the app rather than the person back on.
 *
 * Lazily imported for the same reason the stores are: this module is in the
 * import path of the API client, and pulling the Mixpanel SDK in at module
 * scope would make every data call depend on it.
 */
async function resetAnalyticsIdentity(): Promise<void> {
  try {
    const { resetAnalytics } = await import("@/lib/analytics");
    resetAnalytics();
  } catch {
    // Analytics never booted — there is no identity to forget.
  }
}

/** Service-worker caches and IndexedDB — both async, neither ever blocking. */
async function clearBrowserCaches(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Unsupported or blocked — nothing of ours lives there anyway.
  }

  try {
    // `databases()` is still unimplemented in Firefox, which leaves no way to
    // enumerate them. Nothing in this app writes IndexedDB today, so there is
    // nothing to fall back to — this is here for anything that later does.
    const indexed = window.indexedDB as IDBFactory & {
      databases?: () => Promise<{ name?: string }[]>;
    };
    const databases = (await indexed?.databases?.()) ?? [];
    await Promise.allSettled(
      databases
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = window.indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              // An open connection elsewhere blocks the delete indefinitely;
              // the database is already unreadable to the next user either way.
              request.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    // Same reasoning.
  }
}

/**
 * Wipe it all.
 *
 * Synchronous for the parts that matter — tokens and storage are gone before
 * this returns, so a caller that redirects immediately afterwards cannot race
 * them. The async parts (browser caches, store modules) are deliberately not
 * awaited: holding the sign-out button on an IndexedDB handle some other tab
 * has open would be a worse failure than finishing the wipe a tick late.
 */
export function clearClientState(): void {
  if (typeof window === "undefined") return;

  clearCookies();
  clearWebStorage();

  try {
    queryCache?.clear();
  } catch {
    // Already torn down.
  }

  void resetPersistedStores();
  void resetSidebarSyncState();
  void resetAnalyticsIdentity();
  void clearBrowserCaches();
}
