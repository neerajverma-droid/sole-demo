"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom } from "jotai";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthError, AuthSuccess } from "@/components/auth/auth-states";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { authErrorAtom, authPendingAtom } from "@/lib/atoms";
import {
  resetPassword,
  resetPasswordIssues,
  validateResetToken,
} from "@/lib/auth";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useAtom(authPendingAtom);
  const [error, setError] = useAtom(authErrorAtom);
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [edited, setEdited] = React.useState(false);

  /** The token off the emailed link — the only thing that authorises this. */
  const token = searchParams?.get("token") ?? "";

  /**
   * Whether the link is still good, checked before the form is shown.
   *
   * Letting someone choose a password, confirm it and submit it only to be told
   * the link expired forty minutes ago wastes the one thing they came to do.
   */
  const [tokenState, setTokenState] = React.useState<
    "checking" | "valid" | "invalid"
  >("checking");

  React.useEffect(() => {
    setError(null);
    setPending(false);
  }, [setError, setPending]);

  React.useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      setError("This reset link is incomplete. Ask for a new one.");
      return;
    }
    void (async () => {
      const result = await validateResetToken(token);
      if (result.ok) {
        setTokenState("valid");
        return;
      }
      setTokenState("invalid");
      setError(result.message);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const issues = resetPasswordIssues(password, confirmation);
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEdited(true);
    if (issues.length > 0 || pending) return;

    setPending(true);
    setError(null);
    const result = await resetPassword(token, password);
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
  };

  if (tokenState === "checking") {
    return (
      <div
        className="grid min-h-svh place-items-center px-6"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Checking your link…
        </span>
      </div>
    );
  }

  if (tokenState === "invalid") {
    return (
      <AuthLayout
        heading="That link has expired"
        subtext="Reset links are single-use and don't last long. Ask for a fresh one and we'll email it straight away."
        promoHeadline="Back in, in under a minute."
        promoSupporting="One link, a new password, and your books are where you left them."
      >
        <div className="space-y-4">
          <AuthError message={error} />
          <Button size="lg" className="h-10 w-full" asChild>
            <Link href="/auth/forgot-password">Send me a new link</Link>
          </Button>
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      heading={done ? undefined : "Set a new password"}
      subtext={
        done
          ? undefined
          : "Choose something you haven't used elsewhere. You'll be signed out of other devices."
      }
      promoHeadline="A fresh password, and straight back to work."
      promoSupporting="Your invoices, expenses and bank feed are exactly as you left them."
      footer={
        done ? undefined : (
          <>
            Remembered it?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )
      }
    >
      {done ? (
        <AuthSuccess
          icon={Check}
          title="Password changed successfully"
          description="Your password has been updated. You can now use your new password to sign in."
          action={
            <Button
              size="lg"
              className="h-10 w-full"
              onClick={() => router.push("/login")}
            >
              Back to sign in
            </Button>
          }
        />
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <AuthError message={error} />

          <PasswordField
            id="password"
            label="New password"
            value={password}
            onChange={(value) => {
              setEdited(true);
              setPassword(value);
            }}
            error={issueFor("password")}
            placeholder="Choose a new password"
            autoComplete="new-password"
          >
            <PasswordStrengthMeter value={password} />
          </PasswordField>

          <PasswordField
            id="confirm"
            label="Confirm new password"
            value={confirmation}
            onChange={(value) => {
              setEdited(true);
              setConfirmation(value);
            }}
            error={issueFor("confirm")}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            // The match is worth confirming as it happens, not on submit.
            hint={
              !issueFor("confirm") && confirmation && confirmation === password
                ? "Both passwords match."
                : undefined
            }
          />

          <Button
            type="submit"
            size="lg"
            className="h-10 w-full"
            disabled={pending || (edited && issues.length > 0)}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Saving…" : "Save new password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
