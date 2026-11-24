"use client";

import * as React from "react";

import { ensureDeviceId } from "@/lib/api/device";
import {
  onSessionCleared,
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
} from "@/lib/api/session";
import { clearClientState } from "@/lib/api/teardown";
import { resumeSession, signOut as signOutRequest } from "@/lib/auth";
import type { AuthUser } from "@/lib/api/types";
import { DEMO_LOGIN_ENABLED, startDemo } from "@/lib/demo";
import { useSessionStore } from "@/stores/session";

/**
 * Who is signed in, for the whole app.
 *
 * "There is a token" is not the same as "there is a session" — a cookie
 * survives expiry, a password change and a sign-out somewhere else — so the
 * token is proved against /auth/profile once on load and the answer is what
 * every screen reads. Nothing else keeps a copy of the user, and nothing else
 * decides whether you're signed in.
 */

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionValue = {
  user: AuthUser | null;
  status: SessionStatus;
  /** Re-read the profile — after onboarding, or a settings change. */
  refresh: () => Promise<AuthUser | null>;
  /** Adopt a user a sign-in just produced, without a second round trip. */
  adopt: (user: AuthUser | null) => void;
  /**
   * End the session and leave for the sign-in screen.
   *
   * Pass `{ redirect: false }` only where the caller is about to render the
   * sign-in form itself — the admin login screen clearing a non-admin session
   * before showing its own form is the one case.
   */
  signOut: (options?: {
    redirect?: boolean;
    /** What the sign-in screen says on arrival. Defaults to a plain sign-out. */
    reason?: "signed_out" | "account_deleted";
  }) => Promise<void>;
  /**
   * Whether a deliberate `signOut()` is already under way.
   *
   * Signing out flips `status` to "unauthenticated" (via `clearSession`'s
   * listener) before the hard navigation below actually runs — leaving a
   * window where `AuthGuard`, still mounted on the page being left, sees the
   * same status change and fires its own redirect first, always labelled
   * "session_expired". Checking this lets it stand down and leave the
   * labelled redirect below to win.
   */
  isSigningOut: () => boolean;
};

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  /**
   * Always "loading" for the first render, on the server and the client alike.
   *
   * Reading the cookie in the initial state instead would give the two renders
   * different answers — the server has no cookies, so it renders the spinner
   * while the browser renders the form — and React reports that as a hydration
   * mismatch and throws the server's markup away. The effect below settles it
   * on the very next tick, and does so without a network call when there is no
   * token, so the form still arrives in a single paint.
   */
  const [status, setStatus] = React.useState<SessionStatus>("loading");

  /** See `isSigningOut` on `SessionValue`. A ref, not state: nothing needs to
   *  re-render off it, it only has to be readable from AuthGuard's effect. */
  const signingOutRef = React.useRef(false);
  const isSigningOut = React.useCallback(() => signingOutRef.current, []);

  const load = React.useCallback(async () => {
    // The no-network shortcut, and it has to test BOTH halves of the pair: a
    // browser holding only a refresh token still has a session to resume, and
    // `resumeSession` spends it. Only neither token means there is nothing to
    // ask the server about.
    if (!getAccessToken() && !getRefreshToken()) {
      if (typeof window !== "undefined") {
        const p = window.location.pathname;
        if (
          p.startsWith("/register") ||
          p.startsWith("/accountant-invite") ||
          p.startsWith("/auth/accountant-")
        ) {
          setUser(null);
          setStatus("unauthenticated");
          return null;
        }
      }

      if (DEMO_LOGIN_ENABLED) {
        try {
          const result = await startDemo();
          if (result.ok && result.user) {
            setUser(result.user);
            setStatus("authenticated");
            return result.user;
          }
        } catch (err) {
          console.error("Auto demo login failed:", err);
        }
      }

      setUser(null);
      setStatus("unauthenticated");
      return null;
    }

    const resumed = await resumeSession();
    if (!resumed && DEMO_LOGIN_ENABLED) {
      if (
        typeof window === "undefined" ||
        (!window.location.pathname.startsWith("/register") &&
          !window.location.pathname.startsWith("/accountant-invite") &&
          !window.location.pathname.startsWith("/auth/accountant-"))
      ) {
        try {
          const result = await startDemo();
          if (result.ok && result.user) {
            setUser(result.user);
            setStatus("authenticated");
            return result.user;
          }
        } catch (err) {
          console.error("Auto demo login fallback failed:", err);
        }
      }
    }
    setUser(resumed);
    setStatus(resumed ? "authenticated" : "unauthenticated");
    return resumed;
  }, []);

  /**
   * Boot: register this browser, then work out who is signed in.
   *
   * Device registration goes first and is awaited, because every
   * credential-spending endpoint — login, signup, otp/request, otp/verify —
   * rejects a call that arrives without a device id. Doing
   * it lazily on the first of those meant the id was being fetched at the exact
   * moment it was needed, so any hiccup surfaced as a failed sign-in rather
   * than as nothing at all.
   *
   * It doesn't hold the UI up: a visitor with no token is already
   * "unauthenticated", so the sign-in form is on screen and interactive while
   * this settles. `ensureDeviceId` is a no-op once the cookie exists, which
   * makes this a single call on a browser's first visit and free after that.
   */
  // Strict Mode mounts every component twice in dev to flag effects that
  // aren't safe to repeat — without this guard that meant two device
  // registrations and two /auth/profile calls on every single page load.
  const didBoot = React.useRef(false);

  React.useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;

    // First call out. Every credential-spending endpoint — login, signup,
    // otp/request, otp/verify — rejects a request that arrives without a
    // device id, so the row exists before the person can
    // reach any of them rather than being fetched at the moment it's needed.
    void ensureDeviceId();

    // Deliberately not chained to the line above: the profile lookup doesn't
    // take a device id, and making it queue behind a registration round trip
    // would hold the sign-in form behind a request it has no use for.
    void load();
  }, [load]);

  /**
   * Mirror the proved user into `useSessionStore`.
   *
   * That store has eight readers — the Nexxtap client's `x-user-id`, the bank
   * connection hand-off, the refunds queries, the invoice editor, the
   * businesses screen and `Providers`' query-cache scope — and until this
   * effect existed it had NO writer at all. `setUser` was declared and never
   * called once, so every one of those read `null` forever: Nexxtap onboarding
   * authenticated as nobody, and the query cache was never scoped, so
   * switching business kept serving the previous business's data.
   *
   * This provider is the only thing in the app that knows who is signed in —
   * it's what proves the token against /auth/profile — so it is the one place
   * that can write it. Anything needing the user outside React reads the
   * store; anything inside React can use either.
   *
   * Deliberately gated on the status having settled. `Providers` rehydrates
   * this store from localStorage on mount, which races a write made during
   * "loading": mirroring the initial `null` could land after that rehydrate
   * and blank a profile that was about to be confirmed anyway. Once the status
   * is known, what's here IS the truth and overwrites whatever was stored.
   */
  React.useEffect(() => {
    if (status === "loading") return;
    useSessionStore.getState().setUser(user as Record<string, unknown> | null);
  }, [user, status]);

  // A refresh that fails three screens deep clears the tokens from inside the
  // API client. Subscribing means the UI follows that immediately rather than
  // waiting for the next navigation to notice.
  React.useEffect(() => {
    return onSessionCleared(() => {
      setUser(null);
      setStatus("unauthenticated");
    });
  }, []);

  // Signing out in one tab signs out the rest.
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "sole.auth.signed-out") return;
      /*
       * The cookies and storage are shared, so the other tab's persisted state
       * is already gone — but its in-memory stores and query cache are not,
       * and nothing here re-mounts. Without this the tab that didn't sign out
       * keeps the previous user's name in the rail and their figures on the
       * dashboard until it happens to be reloaded.
       */
      clearClientState();
      setUser(null);
      setStatus("unauthenticated");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = React.useMemo<SessionValue>(
    () => ({
      user,
      status,
      refresh: load,
      adopt: (next) => {
        setUser(next);
        setStatus(next ? "authenticated" : "unauthenticated");
      },
      isSigningOut,
      signOut: async ({ redirect = true, reason = "signed_out" } = {}) => {
        // Set before anything else: `signOutRequest` clears the session, and
        // that flips `status` to "unauthenticated" synchronously, before this
        // function ever reaches its own redirect below. AuthGuard needs to
        // see this flag is already up at that moment, not after.
        signingOutRef.current = true;
        await signOutRequest();
        setUser(null);
        setStatus("unauthenticated");

        /*
         * A hard navigation, not `router.push`.
         *
         * `signOutRequest` clears the cookies, both storages, the persisted
         * stores and the query cache — but a client-side push keeps the React
         * tree, and with it every piece of component state and every cached
         * render holding the previous user's data. Throwing the whole page
         * away is the only way to be certain nothing of theirs is left for
         * whoever signs in next, which is the point of signing out.
         *
         * The reason rides on the URL so the sign-in screen can say what
         * happened rather than appearing as a blank form.
         */
        if (redirect) redirectToLogin(reason);
      },
    }),
    [user, status, load, isSigningOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = React.useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return value;
}
