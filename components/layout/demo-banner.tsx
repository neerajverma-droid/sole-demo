"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/components/auth/session-provider";
import { REGISTER_ROUTE } from "@/lib/api/session";
import { DEMO_HEARTBEAT_MS, isDemoUser, sendDemoHeartbeat } from "@/lib/demo";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * Strip shown on every screen of a demo visit (lib/demo.ts) — same shape as
 * `TrialBanner` and `VerifyEmailBanner`, stacked above them.
 *
 * It says the two things a visitor has to know to use the demo with
 * confidence: that they can change anything, and that it all disappears. Exit
 * is the normal sign-out, which is what wipes the account; "Create your
 * account" ends the demo the same way before heading to sign-up, so the new
 * account starts in a clean browser.
 *
 * It is also the visit's heartbeat: mounted on every screen of the app, so it
 * is what tells the backend the tab is still open.
 */
export function DemoBanner() {
  const { user, signOut } = useSession();
  const [leaving, setLeaving] = React.useState<"exit" | "signup" | null>(null);
  const demo = isDemoUser(user);

  React.useEffect(() => {
    if (!demo) return;
    const beat = () => void sendDemoHeartbeat();
    beat();
    const timer = window.setInterval(beat, DEMO_HEARTBEAT_MS);
    // Background tabs get their timers throttled; catch up the moment it's looked at again.
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo]);

  if (!demo) return null;

  const endsAt = user?.demo_expires_at ? formatTime(user.demo_expires_at) : null;

  const exit = async () => {
    setLeaving("exit");
    await signOut();
  };

  const signUp = async () => {
    setLeaving("signup");
    await signOut({ redirect: false });
    // A hard navigation, for the reason `signOut` gives for its own.
    window.location.assign(REGISTER_ROUTE);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b bg-primary/5 px-7 py-2 text-sm">
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-semibold text-foreground">
          You&apos;re exploring the Sole demo.
        </span>{" "}
        Add, edit or delete anything. Nothing is really sent or charged, and
        it all resets when you exit
        {endsAt ? (
          <>
            {" "}
            (or at <span className="font-medium text-foreground">{endsAt}</span>)
          </>
        ) : null}
        .
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={leaving !== null}
          onClick={() => void exit()}
        >
          {leaving === "exit" && <Loader2 className="animate-spin" aria-hidden />}
          Exit demo
        </Button>
        <Button
          size="sm"
          disabled={leaving !== null}
          onClick={() => void signUp()}
        >
          {leaving === "signup" && (
            <Loader2 className="animate-spin" aria-hidden />
          )}
          Create your account
        </Button>
      </div>
    </div>
  );
}
