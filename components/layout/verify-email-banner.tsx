"use client";

import Link from "next/link";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/components/auth/session-provider";

/**
 * Strip for an account that signed in without ever confirming its address —
 * same shape as `TrialBanner`, stacked above it. `send=1` tells
 * `/auth/verify-email` that nothing has been emailed yet, so it sends a fresh
 * verification link on arrival — an unverified password sign-in lands there
 * too, but the backend has already sent its link by then.
 */
export function VerifyEmailBanner() {
  const { user } = useSession();

  const verified =
    user?.account_verified === true || Number(user?.account_verified) === 1;

  if (!user || verified) return null;

  const email = user.email ?? "";

  return (
    <div className="flex items-center gap-2.5 border-b bg-muted/50 px-7 py-2 text-sm">
      <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="flex-1 text-muted-foreground">
        Please verify your email address to keep full access to your account.
      </p>
      <Button size="sm" asChild className="shrink-0">
        <Link href={`/auth/verify-email?email=${encodeURIComponent(email)}&send=1`}>
          Verify email
        </Link>
      </Button>
    </div>
  );
}
