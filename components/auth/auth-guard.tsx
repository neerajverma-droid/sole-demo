"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/components/auth/session-provider";
import { LOGIN_ROUTE, sessionEndReason } from "@/lib/api/session";
import BrandSplashLoader from "../layout/brand-splash-loader";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status !== "unauthenticated") return;

    const reason = sessionEndReason();
    const params = new URLSearchParams({ error: reason });
    // A demo that ended was wiped, so there's no page in it to come back to.
    if (reason !== "demo_ended" && pathname && pathname !== "/") {
      params.set("next", pathname);
    }
    router.replace(`${LOGIN_ROUTE}?${params.toString()}`);
  }, [status, pathname, router]);

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
