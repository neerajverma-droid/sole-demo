"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AuthError, AuthSuccess } from "@/components/auth/auth-states";
import { useSession } from "@/components/auth/session-provider";
import { withEmail } from "@/components/auth/use-auth-entry";
import { resolvePostAuthRoute } from "@/lib/api/post-auth";
import { verifyEmailLink } from "@/lib/auth";

/**
 * Redeems the token from the "Verify your Sole account" email.
 *
 * Often opened in a different browser than the one that signed up, so the
 * token and address on the URL are all it trusts. A failure — expired, used
 * already, or the address verified some other way — sends you to sign in:
 * an account still unverified gets a fresh link from there, and one that's
 * verified simply signs in.
 */
export function VerifyEmailLink({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const { adopt } = useSession();
  const handled = React.useRef(false);
  const [error, setError] = React.useState("");
  /** Where Continue goes once verified, decided by the account. */
  const [destination, setDestination] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!email) {
      setError("This verification link is incomplete.");
      return;
    }

    void (async () => {
      const result = await verifyEmailLink(email, token);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Verified, but no session came back with it — sign in as usual.
      if (!result.user) {
        setDestination(withEmail("/login", email));
        return;
      }
      adopt(result.user);
      setDestination(await resolvePostAuthRoute(result.user));
    })();
  }, [adopt, email, token]);

  if (!error && !destination) {
    return (
      <div
        className="grid min-h-svh place-items-center px-6"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Verifying your email…
        </span>
      </div>
    );
  }

  if (destination) {
    return (
      <AuthLayout
        promoHeadline="Start your free trial — no card required."
        promoSupporting="Thirty days of everything. Cancel whenever, keep your data either way."
      >
        <AuthSuccess
          icon={Check}
          title="Email verified successfully"
          description="Your account is ready. One screen to set up your business details and GST, then you're in."
          action={
            <Button
              size="lg"
              className="h-10 w-full"
              onClick={() => router.replace(destination)}
            >
              Continue
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      heading="That link didn't work"
      subtext="Verification links work once and expire after 30 minutes. Sign in to carry on — if your address still needs confirming, we'll send you a fresh link."
      promoHeadline="Start your free trial — no card required."
      promoSupporting="Thirty days of everything. Cancel whenever, keep your data either way."
    >
      <div className="space-y-4">
        <AuthError message={error} />
        <Button size="lg" className="h-10 w-full" asChild>
          <Link href={withEmail("/login", email)}>Back to sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
