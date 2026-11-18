"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/components/auth/session-provider";
import { LOGIN_ROUTE } from "@/lib/api/session";
import BrandSplashLoader from "../layout/brand-splash-loader";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status, isSigningOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status !== "unauthenticated") return;
    // A deliberate sign-out also flips `status` to "unauthenticated" — before
    // its own hard navigation (with the right reason) actually runs. Without
    // this check, this effect wins that race and every sign-out lands on
    // sign-in reading "Your session expired" instead of "You've been signed
    // out."
    if (isSigningOut()) return;

    const params = new URLSearchParams({ error: "session_expired" });
    if (pathname && pathname !== "/") params.set("next", pathname);
    router.replace(`${LOGIN_ROUTE}?${params.toString()}`);
  }, [status, pathname, router, isSigningOut]);

  if (status !== "authenticated") {
    return (
      <div
        className="grid min-h-svh w-full place-items-center"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          
          {status === "loading" ?  <BrandSplashLoader text="Loading your account…" /> :  <BrandSplashLoader text="Signing you out…"/>}
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
