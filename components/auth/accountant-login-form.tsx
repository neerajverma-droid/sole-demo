"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PasswordField } from "@/components/auth/password-field";
import { useSession } from "@/components/auth/session-provider";
import { authEmailAtom, authErrorAtom, authPendingAtom } from "@/lib/atoms";
import { resolvePostAuthRoute } from "@/lib/api/post-auth";
import { emailError, signInWithPassword } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * The partner sign-in.
 *
 * Same credentials endpoint as the business form — the account's role is what
 * makes it a partner, not the door it came through — so this is a second
 * entrance rather than a second system. It's kept separate because an
 * accountant signs in to a list of clients rather than to one business, and the
 * wording on the way in should say so.
 */
export function AccountantLoginForm() {
  const router = useRouter();
  const { adopt } = useSession();
  const [email, setEmail] = useAtom(authEmailAtom);
  const [pending, setPending] = useAtom(authPendingAtom);
  const [error, setError] = useAtom(authErrorAtom);
  const [password, setPassword] = React.useState("");
  const [edited, setEdited] = React.useState(false);

  React.useEffect(() => {
    setError(null);
    setPending(false);
  }, [setError, setPending]);

  const emailIssue = edited
    ? (emailError(email) ??
      (email.trim() ? undefined : "Enter your email address."))
    : undefined;
  const passwordIssue =
    edited && !password ? "Enter your password." : undefined;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEdited(true);
    if (!email.trim() || emailError(email) || !password || pending) return;

    setPending(true);
    setError(null);

    const result = await signInWithPassword(email, password);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      if (result.reason === "unverified") {
        router.push(
          `/auth/verify-email?email=${encodeURIComponent(email.trim())}`,
        );
      }
      return;
    }

    adopt(result.user);
    router.replace(await resolvePostAuthRoute(result.user));
  };

  return (
    <AuthLayout
      heading="Accountants and bookkeepers"
      subtext="Sign in with the credentials for your practice — one login across every client you manage."
      promoHeadline="Every client's books, one login."
      promoSupporting="Switch between client files, review their coding and lodge on their behalf."
      footer={
        <>
          No practice account yet?{" "}
          <a
            href="mailto:partners@sole.com.au?subject=Partner%20portal%20access"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Register your practice
          </a>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthError message={error} />

        <Field label="Work email" htmlFor="accountant-email" error={emailIssue}>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="accountant-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => {
                setEdited(true);
                setEmail(event.target.value);
                if (error) setError(null);
              }}
              placeholder="you@practice.com.au"
              aria-invalid={!!emailIssue}
              className={cn(
                "h-10 pl-9",
                emailIssue &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>
        </Field>

        <PasswordField
          id="accountant-password"
          label="Password"
          value={password}
          onChange={(value) => {
            setEdited(true);
            setPassword(value);
            if (error) setError(null);
          }}
          error={passwordIssue}
          autoComplete="current-password"
          placeholder="Enter your password"
        >
          <div className="flex justify-end">
            <Link
              href={`/auth/forgot-password?email=${encodeURIComponent(email.trim())}`}
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
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Signing in…" : "Sign in"}
        </Button>

        <Button variant="ghost" size="sm" className="w-full" asChild>
          <Link href="/login">
            <ArrowLeft />
            Back to business sign in
          </Link>
        </Button>
      </form>
    </AuthLayout>
  );
}
