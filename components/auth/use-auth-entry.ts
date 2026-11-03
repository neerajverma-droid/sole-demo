"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSetAtom } from "jotai";

import { useSession } from "@/components/auth/session-provider";
import { authEmailAtom, authErrorAtom, authPendingAtom } from "@/lib/atoms";
import { resolvePostAuthRoute } from "@/lib/api/post-auth";
import type { AuthUser } from "@/lib/api/types";

/** Why we were sent back here, said plainly rather than left as a blank form. */
const ARRIVAL_MESSAGES: Record<string, string> = {
  session_expired: "Your session expired. Please sign in again.",
  signed_out: "You've been signed out.",
  account_deleted: "Your account has been deleted.",
  demo_ended:
    "Your demo has ended, and everything you changed has been cleared. You can start a new one any time.",
  sso_cancelled: "Sign in was cancelled. Please try again.",
  sso_unavailable:
    "Social sign in is temporarily unavailable. Please use your email instead.",
  sso_failed: "We couldn't complete social sign in. Please try again.",
  sso_profile_failed:
    "Signed in, but we couldn't load your profile. Please try again.",
};

/**
 * What /login and /register share around their forms: reading the URL on
 * arrival, sending an already-signed-in visitor straight on, and where a new
 * session lands. Shared so the two doors cannot drift on any of it.
 */
export function useAuthEntry() {
  const router = useRouter();
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(
    () => new URLSearchParams(rawSearchParams?.toString() ?? ""),
    [rawSearchParams],
  );
  const { status, user: sessionUser, adopt } = useSession();

  const setEmail = useSetAtom(authEmailAtom);
  const setPending = useSetAtom(authPendingAtom);
  const setError = useSetAtom(authErrorAtom);

  /**
   * Where to land after signing in, when the session died mid-task. Carried by
   * the guard so the task survives the interruption.
   */
  const nextRoute = searchParams.get("next");
  const reason = searchParams.get("error");

  // The URL carries what an email, an invite or a bounce-back can say. Read
  // once — it cannot change underneath us without a remount. The error is
  // always written, so one left by the other screen doesn't follow you here.
  React.useEffect(() => {
    setPending(false);
    const prefill = searchParams.get("email");
    if (prefill) setEmail(prefill);
    setError(
      reason ? (ARRIVAL_MESSAGES[reason] ?? ARRIVAL_MESSAGES.sso_failed) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Skipped when we were just bounced out: there is no point re-proving a token
   * we have been told is dead.
   */
  const bounced = Boolean(reason);

  /**
   * A sign-in that just happened here routes itself, and does it knowing
   * whether the account is new. This flag keeps the resume effect from racing
   * it to a second, less informed answer.
   */
  const signedInHere = React.useRef(false);

  // Landing here with a live session goes straight into the app — the
  // provider has already proved the token, so all that's left is the same
  // landing decision a fresh sign-in makes.
  React.useEffect(() => {
    if (bounced || signedInHere.current || status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      const route = await resolvePostAuthRoute(sessionUser);
      if (!cancelled) router.replace(nextRoute || route);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, bounced, sessionUser, nextRoute, router]);

  /**
   * Everything that happens once a session exists, however it was obtained —
   * password, emailed code or provider.
   */
  const land = React.useCallback(
    async (user: AuthUser | null) => {
      signedInHere.current = true;
      adopt(user);
      const route = await resolvePostAuthRoute(user);
      // `next` only wins for a returning user: a brand-new account has no
      // business yet, so honouring it would drop them into an empty app.
      router.replace(user?.is_first_login ? route : nextRoute || route);
    },
    [adopt, nextRoute, router],
  );

  return {
    land,
    /**
     * The provider is still proving a stored token, or it held and the effect
     * above is about to redirect. Showing the form under that would flash it.
     */
    resolving: status === "loading" || (status === "authenticated" && !bounced),
  };
}

/**
 * A link to the other door that keeps the address already typed, so switching
 * between sign-in and sign-up never means typing it twice.
 */
export function withEmail(route: string, email: string): string {
  const address = email.trim();
  return address ? `${route}?email=${encodeURIComponent(address)}` : route;
}
