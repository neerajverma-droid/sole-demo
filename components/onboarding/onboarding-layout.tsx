"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { LogoutDialog } from "@/components/layout/logout-dialog";
import { SoleLogo } from "@/components/layout/sole-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

export function OnboardingLayout({
  preview,
  wide = false,
  children,
}: {
  preview?: React.ReactNode;
  /**
   * The full width and a tighter frame, for a step that has to fit one screen
   * — the plan picker. The default column is a form's width, which a
   * two-column picker would only stack and scroll in.
   */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <div className="relative isolate min-h-svh bg-background">
      <AmbientGlow />
      <div
        className={
          wide
            ? "relative flex items-center justify-end px-6 py-4 sm:px-10"
            : "relative flex items-center justify-end px-6 py-6 sm:px-10"
        }
      >
        <div className="mr-auto">
          <SoleLogo />
        </div>
        {/*
          The way out. Onboarding is a closed room — the plan step is a hard
          paywall and the app stays shut until it's paid — so an account that
          isn't ready to pay, or signed in as the wrong person, has nowhere else
          to go. `signOut` clears the cookies and token, the storages, the
          persisted stores and the query cache, then hard-navigates to /login;
          it's the same one the profile menu uses, behind the same confirmation.
        */}
        <Button
          variant="ghost"
          className="mr-1 text-muted-foreground"
          onClick={() => setLoggingOut(true)}
        >
          <LogOut />
          Log out
        </Button>
        <ThemeToggle />
      </div>

      <div
        className={
          wide
            ? "relative mx-auto w-full max-w-6xl px-6 pb-6 sm:px-10"
            : "relative mx-auto w-full max-w-6xl px-6 pb-16 sm:px-10"
        }
      >
        {preview ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-12">
            <div className="lg:sticky lg:top-8 lg:self-start">{preview}</div>
            <div>{children}</div>
          </div>
        ) : wide ? (
          <div className="w-full">{children}</div>
        ) : (
          <div className="mx-auto w-full max-w-2xl">{children}</div>
        )}
      </div>

      <LogoutDialog open={loggingOut} onOpenChange={setLoggingOut} />
    </div>
  );
}

function AmbientGlow() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="animate-ambient-drift-a absolute -left-[14vw] top-[32%] size-[26vw] rounded-full bg-primary/[0.20] blur-3xl will-change-transform dark:bg-primary/[0.26]" />
      <div
        // Started mid-phase, so the pair doesn't set off from rest together.
        style={{ animationDelay: "-9s" }}
        className="animate-ambient-drift-b absolute -right-[13vw] bottom-[4%] size-[28vw] rounded-full bg-primary/[0.16] blur-3xl will-change-transform dark:bg-primary/[0.22]"
      />
    </div>
  );
}
