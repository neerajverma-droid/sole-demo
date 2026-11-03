"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAtom } from "jotai";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import {
  AuthError,
  AuthSuccess,
  useResendCooldown,
} from "@/components/auth/auth-states";
import { AuthLayout } from "@/components/auth/auth-layout";
import { authEmailAtom, authErrorAtom, authPendingAtom } from "@/lib/atoms";
import { forgotPassword, forgotPasswordIssues, maskEmail } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm() {
  const [email, setEmail] = useAtom(authEmailAtom);
  const [pending, setPending] = useAtom(authPendingAtom);
  const [error, setError] = useAtom(authErrorAtom);
  const [sent, setSent] = React.useState(false);
  const [edited, setEdited] = React.useState(false);
  /** Announced, since sending again changes nothing on screen but the button. */
  const [status, setStatus] = React.useState("");
  const resend = useResendCooldown();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    setError(null);
    setPending(false);
  }, [setError, setPending]);

  // Arriving from the password step carries the address that was already typed,
  // so it isn't asked for twice.
  React.useEffect(() => {
    const prefill = searchParams?.get("email");
    if (prefill) setEmail(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const issues = forgotPasswordIssues(email);
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEdited(true);
    if (issues.length > 0 || pending) return;

    setPending(true);
    setError(null);
    const result = await forgotPassword(email);
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
    resend.start();
    setStatus(`We sent a reset link to ${maskEmail(email)}.`);
  };

  const resendLink = async () => {
    if (resend.cooling || pending) return;
    setPending(true);
    const result = await forgotPassword(email);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    resend.start();
    setStatus(`A new reset link is on its way to ${maskEmail(email)}.`);
  };

  return (
    <AuthLayout
      heading={sent ? undefined : "Forgot your password?"}
      subtext={
        sent
          ? undefined
          : "Enter the email you signed up with and we'll send you a link to set a new password."
      }
      promoHeadline="Back in, in under a minute."
      promoSupporting="One link, a new password, and your books are where you left them."
    >
      {/* Announced rather than shown: a resent link changes only a button. */}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {sent ? (
        <AuthSuccess
          icon={MailCheck}
          title="Check your inbox"
          description={
            <>
              If an account exists for{" "}
              <span className="font-medium text-foreground">{email}</span>, the
              link is on its way. Check your spam folder if it hasn&apos;t
              arrived in a few minutes.
            </>
          }
          action={
            <Button
              size="lg"
              className="h-10 w-full"
              disabled={resend.cooling || pending}
              onClick={() => void resendLink()}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {resend.cooling
                ? `Resend link in ${resend.seconds}s`
                : "Resend link"}
            </Button>
          }
          secondary={
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setSent(false);
                setStatus("");
              }}
            >
              Change email
            </Button>
          }
        />
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <AuthError message={error} />

          <Field label="Email" htmlFor="email" error={issueFor("email")}>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEdited(true);
                  setEmail(event.target.value);
                }}
                placeholder="you@business.com.au"
                aria-invalid={!!issueFor("email")}
                className={cn(
                  "h-10 pl-9",
                  issueFor("email") &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>
          </Field>

          <Button
            type="submit"
            size="lg"
            className="h-10 w-full"
            disabled={pending || (edited && issues.length > 0)}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Sending…" : "Send reset link"}
          </Button>

          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/login">
              <ArrowLeft />
              Back to sign in
            </Link>
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
