"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom } from "jotai";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AuthError,
  AuthSuccess,
  CodeHint,
  useResendCooldown,
} from "@/components/auth/auth-states";
import { AuthLayout } from "@/components/auth/auth-layout";
import { CodeInput } from "@/components/auth/code-input";
import { useSession } from "@/components/auth/session-provider";
import { VerifyEmailLink } from "@/components/auth/verify-email-link";
import { authEmailAtom, authErrorAtom, authPendingAtom } from "@/lib/atoms";
import { resolvePostAuthRoute } from "@/lib/api/post-auth";
import { CODE_LENGTH, codeIssue, requestOtp, verifyOtp } from "@/lib/auth";

/**
 * /auth/verify-email — two arrivals, one address to confirm.
 *
 * With a `token` it's the link from the "Verify your Sole account" email
 * (sole-ocr links to /verify-email, redirected here), and it's redeemed.
 * Without one it's a sign-in or sign-up that turned out to be unverified.
 */
export function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token");
  if (token) {
    return (
      <VerifyEmailLink token={token} email={searchParams?.get("email") ?? ""} />
    );
  }
  return <CheckYourEmail />;
}

/**
 * Reached from a password sign-in or sign-up that turned out to be unverified.
 *
 * Arriving with an address on the URL means the backend has already emailed a
 * verification LINK for it — so a code is sent right away too, straight to the
 * six-digit entry screen, rather than making the person ask for one by hand.
 */
function CheckYourEmail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { adopt } = useSession();
  const [email, setEmail] = useAtom(authEmailAtom);
  const [pending, setPending] = useAtom(authPendingAtom);
  const [error, setError] = useAtom(authErrorAtom);
  const [code, setCode] = React.useState("");
  const [verified, setVerified] = React.useState(false);
  const [edited, setEdited] = React.useState(false);
  /** Whether a code has been sent — until then, the link is all they have. */
  const [codeSent, setCodeSent] = React.useState(false);
  const resend = useResendCooldown();

  /** Where to go once the address is confirmed, decided by the account. */
  const [destination, setDestination] = React.useState("/onboarding");

  React.useEffect(() => {
    setError(null);
    setPending(false);
  }, [setError, setPending]);

  /** Whether this is a resend, for the toast copy — read from a ref rather
   * than `codeSent` state so the check can't double-fire under Strict Mode's
   * replayed updaters. */
  const hasSentBefore = React.useRef(false);

  const sendCode = React.useCallback(
    async (targetEmail: string) => {
      setPending(true);
      setError(null);
      const result = await requestOtp({ email: targetEmail, purpose: "signup" });
      setPending(false);

      if (!result.ok) {
        if (result.retryAfter) resend.start(result.retryAfter);
        setError(result.message);
        return;
      }
      resend.start(result.resendAfter);
      toast.success(hasSentBefore.current ? "A new code is on its way" : "Code sent");
      hasSentBefore.current = true;
      setCodeSent(true);
    },
    [resend, setError, setPending],
  );

  // Reached on its own from a password sign-in that turned out to be
  // unverified, which carries the address rather than relying on the atom
  // surviving a full page load. The code is sent immediately — React Strict
  // Mode runs effects twice in dev, and the ref guards against that costing a
  // second email.
  const autoSent = React.useRef(false);
  React.useEffect(() => {
    const prefill = searchParams?.get("email");
    if (!prefill) return;
    setEmail(prefill);
    if (autoSent.current) return;
    autoSent.current = true;
    void sendCode(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const incomplete = codeIssue(code);
  const issue = edited ? incomplete : undefined;

  const verify = React.useCallback(
    async (value: string) => {
      if (value.length < CODE_LENGTH) return;
      setPending(true);
      setError(null);
      const result = await verifyOtp(email, value, "verify_email");

      if (!result.ok) {
        setPending(false);
        setError(result.message);
        // Clearing lets the next attempt start from the first box rather than
        // making them delete six digits by hand.
        setCode("");
        return;
      }

      // Verifying signs you in, so the landing decision is the same one every
      // other way in makes.
      adopt(result.user);
      setDestination(await resolvePostAuthRoute(result.user));
      setPending(false);
      setVerified(true);
    },
    [adopt, email, setError, setPending],
  );

  const resendCode = () => {
    if (resend.cooling || pending) return;
    return sendCode(email);
  };

  return (
    <AuthLayout
      heading={
        verified ? undefined : codeSent ? "Verify your email" : "Check your email"
      }
      subtext={
        verified
          ? undefined
          : codeSent
            ? "We've sent a six-digit code. Enter it below to confirm this is you."
            : "We've emailed you a link to verify your account. Open it to confirm this is you — it expires in 30 minutes."
      }
      promoHeadline="Start your free trial — no card required."
      promoSupporting="Thirty days of everything. Cancel whenever, keep your data either way."
      footer={
        verified ? undefined : (
          <>
            Wrong address?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Change it
            </Link>
          </>
        )
      }
    >
      {verified ? (
        <AuthSuccess
          icon={Check}
          title="Email verified successfully"
          description="Your account is ready. One screen to set up your business details and GST, then you're in."
          action={
            <Button
              size="lg"
              className="h-10 w-full"
              // A new account still owes us its business profile; an existing
              // one goes straight into the app.
              onClick={() => router.replace(destination)}
            >
              Continue
            </Button>
          }
        />
      ) : !codeSent ? (
        <div className="space-y-4">
          <AuthError message={error} />
          <CodeHint>
            Sent to{" "}
            <span className="font-medium text-foreground">
              {email || "your email address"}
            </span>
            .
          </CodeHint>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 w-full"
            disabled={resend.cooling || pending}
            onClick={() => void resendCode()}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {resend.cooling
              ? `Email me a code in ${resend.seconds}s`
              : "Email me a code instead"}
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setEdited(true);
            void verify(code);
          }}
        >
          <AuthError message={error} />

          <div className="space-y-2">
            <CodeInput
              value={code}
              onChange={(next) => {
                setEdited(true);
                setCode(next);
                if (error) setError(null);
              }}
              // Six digits is the whole form; waiting for a click would be
              // asking for a step the person has already finished.
              onComplete={(next) => void verify(next)}
              invalid={!!issue || !!error}
              disabled={pending}
              label="Email verification code"
            />
            {issue ? (
              <p className="text-xs text-destructive">{issue}</p>
            ) : (
              <CodeHint>
                Sent to{" "}
                <span className="font-medium text-foreground">
                  {email || "your email address"}
                </span>
                .
              </CodeHint>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            className="h-10 w-full"
            disabled={pending || code.length < CODE_LENGTH}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Verifying…" : "Verify email"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={resend.cooling || pending}
            onClick={() => void resendCode()}
          >
            {resend.cooling
              ? `Resend code in ${resend.seconds}s`
              : "Resend code"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
