"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AuthError,
  CodeHint,
  useResendCooldown,
} from "@/components/auth/auth-states";
import { AuthLayout } from "@/components/auth/auth-layout";
import { CodeInput } from "@/components/auth/code-input";
import { EmailVerified } from "@/components/auth/email-verified";
import { useSession } from "@/components/auth/session-provider";
import { VerifyEmailLink } from "@/components/auth/verify-email-link";
import { withEmail } from "@/components/auth/use-auth-entry";
import { authEmailAtom, authErrorAtom, authPendingAtom } from "@/lib/atoms";
import { resolvePostAuthRoute } from "@/lib/api/post-auth";
import {
  CODE_LENGTH,
  codeIssue,
  requestOtp,
  resendVerification,
  verifyOtp,
} from "@/lib/auth";

const VERIFY_ROUTE = "/auth/verify-email";

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
 * Where an unverified address waits for its link.
 *
 * The link is the default way to verify, and it is all this screen sends. A
 * six-digit code is there if they would rather type than click, but only when
 * they ask for it — it is never sent unprompted.
 *
 * Two ways in, and they differ in whether an email has just gone out:
 *   - a password sign-in or sign-up that turned out to be unverified — the
 *     backend has already emailed the link, so nothing is sent here;
 *   - the in-app "Verify email" banner (`?send=1`) — nothing has been sent, so
 *     a fresh link goes out on arrival.
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
  /** Whether they asked for a code — until then, the link is all they have. */
  const [codeSent, setCodeSent] = React.useState(false);
  /** Which request is in flight, so the spinner lands on the right button. */
  const [busy, setBusy] = React.useState<"link" | "code" | null>(null);
  // Separate clocks: asking for a code straight after arriving is reasonable,
  // and shouldn't wait on the link that was just sent.
  const linkCooldown = useResendCooldown();
  const codeCooldown = useResendCooldown();

  /** Where to go once the address is confirmed, decided by the account. */
  const [destination, setDestination] = React.useState("/onboarding");

  React.useEffect(() => {
    setError(null);
    setPending(false);
  }, [setError, setPending]);

  const sendLink = React.useCallback(
    async (target: string) => {
      setBusy("link");
      setPending(true);
      setError(null);
      const result = await resendVerification(target);
      setPending(false);
      setBusy(null);

      if (!result.ok) {
        setError(result.message);
        return;
      }
      linkCooldown.start();
      toast.success("Verification link sent");
    },
    [linkCooldown, setError, setPending],
  );

  /** Whether this is a resend, for the toast copy — read from a ref rather
   * than state so the check can't double-fire under Strict Mode's replayed
   * updaters. */
  const hasSentCodeBefore = React.useRef(false);

  const sendCode = React.useCallback(
    async (targetEmail: string) => {
      setBusy("code");
      setPending(true);
      setError(null);
      const result = await requestOtp({ email: targetEmail, purpose: "signup" });
      setPending(false);
      setBusy(null);

      if (!result.ok) {
        if (result.retryAfter) codeCooldown.start(result.retryAfter);
        setError(result.message);
        return;
      }
      codeCooldown.start(result.resendAfter);
      toast.success(
        hasSentCodeBefore.current ? "A new code is on its way" : "Code sent",
      );
      hasSentCodeBefore.current = true;
      setCodeSent(true);
    },
    [codeCooldown, setError, setPending],
  );

  // The address comes on the URL rather than relying on the atom surviving a
  // full page load. React Strict Mode runs effects twice in dev; the ref keeps
  // that from costing a second email.
  const arrived = React.useRef(false);
  React.useEffect(() => {
    const prefill = searchParams?.get("email");
    if (!prefill) return;
    setEmail(prefill);
    if (arrived.current) return;
    arrived.current = true;

    if (searchParams?.get("send")) {
      void sendLink(prefill);
      // So a refresh doesn't send another.
      router.replace(withEmail(VERIFY_ROUTE, prefill));
    } else {
      // The backend emailed the link a moment ago — don't offer another yet.
      linkCooldown.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const incomplete = codeIssue(code);
  const issue = edited ? incomplete : undefined;

  const verify = React.useCallback(
    async (value: string) => {
      if (value.length < CODE_LENGTH) return;
      setPending(true);
      setError(null);
      const result = await verifyOtp(email, value);

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

  const sentTo = (
    <>
      Sent to{" "}
      <span className="font-medium text-foreground">
        {email || "your email address"}
      </span>
      .
    </>
  );

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
      promoHeadline="Your books, sorted from day one."
      promoSupporting="Cancel whenever, keep your data either way."
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
        <EmailVerified destination={destination} />
      ) : !codeSent ? (
        <div className="space-y-4">
          <AuthError message={error} />
          <CodeHint>
            {sentTo} Can&apos;t see it? Check your spam folder.
          </CodeHint>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 w-full"
            disabled={linkCooldown.cooling || pending || !email}
            onClick={() => void sendLink(email)}
          >
            {busy === "link" && <Loader2 className="animate-spin" aria-hidden />}
            {linkCooldown.cooling
              ? `Resend link in ${linkCooldown.seconds}s`
              : "Resend link"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={codeCooldown.cooling || pending || !email}
            onClick={() => void sendCode(email)}
          >
            {busy === "code" && <Loader2 className="animate-spin" aria-hidden />}
            {codeCooldown.cooling
              ? `Email me a code in ${codeCooldown.seconds}s`
              : "Use a code instead"}
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
              <CodeHint>{sentTo}</CodeHint>
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
            disabled={codeCooldown.cooling || pending}
            onClick={() => void sendCode(email)}
          >
            {codeCooldown.cooling
              ? `Resend code in ${codeCooldown.seconds}s`
              : "Resend code"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={pending}
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setEdited(false);
              setError(null);
            }}
          >
            Use the email link instead
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
