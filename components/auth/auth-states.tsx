"use client";

import * as React from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/auth";

/**
 * The confirmation panel shared by every screen that ends in one — reset link
 * sent, password changed, email verified.
 *
 * A filled indigo disc inside two soft concentric rings, a bold heading, one
 * muted line, and a single primary action. Indigo rather than the platform's
 * success green: this is the brand confirming something finished, and these
 * screens have no green anywhere else to be consistent with.
 *
 * The heading is capped at ~18 characters of line length so it breaks onto two
 * lines rather than running the full column width, which is what gives the card
 * its centred, settled shape.
 */
export function AuthSuccess({
  icon: Icon,
  title,
  description,
  action,
  secondary,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  /** The one primary way onward. */
  action?: React.ReactNode;
  /** A quieter alternative, where the screen genuinely has one. */
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-8 py-4 text-center">
      <span
        className="relative grid size-28 shrink-0 place-items-center"
        aria-hidden
      >
        <span className="absolute inset-0 rounded-full bg-primary/[0.06]" />
        <span className="absolute inset-[14px] rounded-full bg-primary/[0.12]" />
        <span className="relative grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Icon className="size-7" strokeWidth={2.5} />
        </span>
      </span>

      <div className="space-y-3">
        {/*
          An h1: on a success state the layout drops its own heading, so this is
          the page's. Announced too, because the form it replaced has vanished.
        */}
        <h1
          role="status"
          className="mx-auto max-w-[18ch] text-2xl font-bold leading-snug tracking-tight"
        >
          {title}
        </h1>
        <p className="mx-auto max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {(action || secondary) && (
        <div className="w-full space-y-3">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

/** The error banner above a form, shared by every screen that can fail. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm"
    >
      <CircleAlert
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden
      />
      <p>{message}</p>
    </div>
  );
}

/**
 * The resend cooldown.
 *
 * Counts down in state rather than off a timestamp because nothing here has to
 * survive a reload — and it clears its interval on unmount, so leaving the
 * screen mid-countdown doesn't leave a timer running.
 */
export function useResendCooldown() {
  const [seconds, setSeconds] = React.useState(0);

  React.useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => {
      setSeconds((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return {
    seconds,
    cooling: seconds > 0,
    /**
     * The backend decides how long the wait is and reports it on every send,
     * so its number is preferred; the constant is only for the response that
     * somehow carried none.
     */
    start: (server?: number) =>
      setSeconds(
        Number.isFinite(server) && (server as number) > 0
          ? Math.ceil(server as number)
          : RESEND_COOLDOWN_SECONDS,
      ),
  };
}

/** The muted line under a code input, naming where the code went. */
export function CodeHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
  );
}
