"use client";

import * as React from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/components/auth/session-provider";
import { clearSession, LIVE_REGISTER_URL } from "@/lib/api/session";
import { DEMO_LOGIN_ENABLED, isDemoUser } from "@/lib/demo";

export function StartAccountButton({
  variant = "topbar",
  className,
}: {
  variant?: "topbar" | "sidebar" | "banner";
  className?: string;
}) {
  const { user, signOut } = useSession();
  const [loading, setLoading] = React.useState(false);
  const demo = DEMO_LOGIN_ENABLED || isDemoUser(user);

  if (!demo) return null;

  const handleStartAccount = async () => {
    setLoading(true);
    try {
      await signOut({ redirect: false });
    } catch {
      // Ignore errors on sign out during exit
    }
    clearSession();
    window.location.assign(LIVE_REGISTER_URL);
  };

  if (variant === "sidebar") {
    return (
      <div className="px-2 py-1.5">
        <Button
          type="button"
          onClick={() => void handleStartAccount()}
          disabled={loading}
          className="w-full justify-between bg-primary text-primary-foreground font-semibold shadow-sm hover:bg-primary/90 h-9 px-3 rounded-lg text-xs"
        >
          <span className="flex items-center gap-1.5">
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-3.5 text-primary-foreground" aria-hidden />
            )}
            <span>Start my account</span>
          </span>
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => void handleStartAccount()}
      disabled={loading}
      className={`relative inline-flex items-center gap-1.5 font-semibold text-xs sm:text-sm h-8 px-3 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all shrink-0 ${className || ""}`}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-3.5 text-primary-foreground" aria-hidden />
      )}
      <span className="hidden xs:inline sm:inline">Start my account</span>
      <span className="inline xs:hidden sm:hidden">Sign up</span>
      <ArrowRight className="size-3.5 hidden sm:inline" aria-hidden />
    </Button>
  );
}
