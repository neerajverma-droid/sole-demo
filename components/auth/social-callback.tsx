"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useSession } from "@/components/auth/session-provider";
import { resolvePostAuthRoute } from "@/lib/api/post-auth";
import { setSession } from "@/lib/api/session";
import { fetchProfile } from "@/lib/auth";

/**
 * Where backend-driven SSO lands.
 *
 * The backend completes the provider handshake server-side and redirects here
 * with the session on the URL:
 *
 *   /auth/social-callback?token=<t>&refresh_token=<r>&login_source=google
 *
 * Both tokens are persisted and the profile is then loaded, which is the step
 * that matters: the guard treats "no user" as signed out, so writing only the
 * cookie would leave SSO users bouncing back to sign-in the moment they touched
 * a real screen.
 */
export function SocialCallback() {
  const router = useRouter();
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(
    () => new URLSearchParams(rawSearchParams?.toString() ?? ""),
    [rawSearchParams],
  );
  const { adopt } = useSession();
  const handled = React.useRef(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refresh_token");
    const ssoError = searchParams.get("error");

    const failTo = (reason: string) => {
      setError("Sign in failed. Taking you back…");
      router.replace(`/login?error=${encodeURIComponent(reason)}`);
    };

    if (ssoError) {
      failTo(ssoError);
      return;
    }
    if (!token) {
      failTo("sso_failed");
      return;
    }

    void (async () => {
      setSession({ token, refresh_token: refreshToken });

      const user = await fetchProfile();
      if (!user) {
        failTo("sso_profile_failed");
        return;
      }

      adopt(user);
      router.replace(await resolvePostAuthRoute(user));
    })();
  }, [adopt, router, searchParams]);

  return (
    <div
      className="grid min-h-svh place-items-center px-6"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {error || "Signing you in…"}
      </span>
    </div>
  );
}
