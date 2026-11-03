"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
//Authentication
import { AuthError } from "@/components/auth/auth-states";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AuthLegalLine } from "@/components/auth/auth-legal-line";
import {
  AuthDivider,
  EmailField,
  TEXT_ACTION_CLASS,
  requiredEmailIssue,
} from "@/components/auth/auth-fields";
import { EmailCodeStep, useEmailCode } from "@/components/auth/email-code-step";
import { PasswordField } from "@/components/auth/password-field";
import { SocialButtons } from "@/components/auth/social-buttons";
import { useAuthEntry, withEmail } from "@/components/auth/use-auth-entry";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";
import { authEmailAtom, authErrorAtom, authPendingAtom } from "@/lib/atoms";
import { REGISTER_ROUTE } from "@/lib/api/session";
import { signInWithPassword } from "@/lib/auth";
import { DEMO_LOGIN_ENABLED, startDemo } from "@/lib/demo";


export function LoginScreen() {
  const router = useRouter();
  const { land, resolving } = useAuthEntry();
  const code = useEmailCode();

  const [email, setEmail] = useAtom(authEmailAtom);
  const [pending, setPending] = useAtom(authPendingAtom);
  const [error, setError] = useAtom(authErrorAtom);

  const [password, setPassword] = React.useState("");
  const [emailEdited, setEmailEdited] = React.useState(false);
  const [passwordEdited, setPasswordEdited] = React.useState(false);
  const [sendingCode, setSendingCode] = React.useState(false);
  const [startingDemo, setStartingDemo] = React.useState(false);
  const [noPassword, setNoPassword] = React.useState(false);

  const emailIssue = emailEdited ? requiredEmailIssue(email) : undefined;
  const passwordIssue =
    passwordEdited && !password ? "Enter your password." : undefined;

  const signIn = async () => {
    setEmailEdited(true);
    setPasswordEdited(true);
    if (requiredEmailIssue(email) || !password || pending) return;

    setPending(true);
    setError(null);
    setNoPassword(false);

    const result = await signInWithPassword(email, password);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      setNoPassword(result.reason === "no-password");
      if (result.reason === "unverified") {
        router.push(withEmail("/auth/verify-email", email));
      }
      return;
    }

    await land(result.user);
  };

  const sendCode = async () => {
    setEmailEdited(true);
    if (requiredEmailIssue(email) || pending) return;

    setPending(true);
    setSendingCode(true);
    setError(null);
    const message = await code.send({ email: email.trim(), purpose: "login" });
    if (message) setError(message);
    setSendingCode(false);
    setPending(false);
  };

  const exploreDemo = async () => {
    if (pending) return;

    setPending(true);
    setStartingDemo(true);
    setError(null);

    const result = await startDemo();
    if (!result.ok) {
      setStartingDemo(false);
      setPending(false);
      setError(result.message);
      return;
    }

    await land(result.user);
  };

  const closeCode = () => {
    code.close();
    setError(null);
    setNoPassword(false);
  };

  if (resolving) return <BrandSplashLoader persist />;

  const codeStep = code.request !== null;

  return (
    <AuthLayout
      heading={codeStep ? "Enter your code" : "Sign in to Sole"}
      subtext={
        codeStep
          ? undefined
          : "Welcome back. Sign in with your password or a code."
      }
      promoHeadline="Start your free trial — no card required."
      promoSupporting="Thirty days of everything. Cancel whenever, keep your data either way."
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link
            href={withEmail(REGISTER_ROUTE, email)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      }
      secondaryPath={
        codeStep ? undefined : (
          <div className="space-y-4 text-center">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-dark">
                Are you an accountant or bookkeeper?
              </p>
              <Button variant="default" size="sm" asChild>
                <Link href="/auth/accountant-login">Accountant Sign up</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <AuthLegalLine action="continuing" />
            </p>
          </div>
        )
      }
    >
      {/* One live region for the screen: a sent or resent code changes nothing
          visible, and neither is an error. */}
      <p className="sr-only" role="status" aria-live="polite">
        {code.statusLine}
      </p>

      {codeStep ? (
        <EmailCodeStep
          code={code}
          submitLabel="Verify and sign in"
          onVerified={land}
          onChangeEmail={closeCode}
        >
          {/* Only offered when there is a password to go back to. */}
          {!noPassword && (
            <p className="text-center text-sm">
              <button
                type="button"
                onClick={closeCode}
                disabled={pending}
                className={TEXT_ACTION_CLASS}
              >
                Use your password instead
              </button>
            </p>
          )}
        </EmailCodeStep>
      ) : (
        <>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <AuthError message={error} />
            {noPassword && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-10 w-full"
                disabled={pending}
                onClick={() => void sendCode()}
              >
                {sendingCode && <Loader2 className="animate-spin" aria-hidden />}
                {sendingCode ? "Sending code…" : "Email me a code"}
              </Button>
            )}

            <EmailField
              value={email}
              onChange={(next) => {
                setEmailEdited(true);
                setEmail(next);
                if (error) setError(null);
                if (noPassword) setNoPassword(false);
              }}
              error={emailIssue}
            />

            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={(next) => {
                setPasswordEdited(true);
                setPassword(next);
                if (error) setError(null);
                if (noPassword) setNoPassword(false);
              }}
              error={passwordIssue}
              autoComplete="current-password"
              placeholder="Enter your password"
            >
              <div className="flex justify-end">
                <Link
                  href={withEmail("/auth/forgot-password", email)}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </PasswordField>

            <Button
              type="submit"
              size="lg"
              className="h-10 w-full"
              disabled={pending}
            >
              {pending && !sendingCode && !startingDemo && (
                <Loader2 className="animate-spin" aria-hidden />
              )}
              {pending && !sendingCode && !startingDemo
                ? "Signing in…"
                : "Sign in"}
            </Button>

            {!noPassword && (
              <p className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => void sendCode()}
                  disabled={pending}
                  className={TEXT_ACTION_CLASS}
                >
                  {sendingCode && (
                    <Loader2
                      className="mr-1 inline size-3.5 animate-spin"
                      aria-hidden
                    />
                  )}
                  {sendingCode ? "Sending code…" : "Email me a sign-in code instead"}
                </button>
              </p>
            )}
          </form>

          <AuthDivider />
          <SocialButtons />

          {/* No account needed: a fully set-up business to click around in, wiped on exit. */}
          {DEMO_LOGIN_ENABLED && (
            <div className="space-y-2 rounded-lg border border-dashed px-4 py-3 text-center">
              <p className="text-sm text-muted-foreground">
                Just looking? Try a ready-made business. Nothing you do is
                kept.
              </p>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-10 w-full"
                disabled={pending}
                onClick={() => void exploreDemo()}
              >
                {startingDemo && <Loader2 className="animate-spin" aria-hidden />}
                {startingDemo ? "Opening the demo…" : "Explore the demo"}
              </Button>
            </div>
          )}
        </>
      )}
    </AuthLayout>
  );
}
