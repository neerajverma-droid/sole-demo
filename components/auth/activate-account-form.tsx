"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthError } from "@/components/auth/auth-states";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { resolvePostAuthRoute } from "@/lib/api/post-auth";
import { resetPasswordIssues } from "@/lib/auth";
import { activateAccount, lookupActivation, type ActivationDetails } from "@/lib/partner-activation";

/**
 * /auth/activate?token=… — the client of an accountant who set up and paid for
 * their Sole account (integration partner, F6) chooses a password, then lands in
 * the app signed in. Same look and password rules as the reset-password page.
 */
export function ActivateAccountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [state, setState] = React.useState<"checking" | "valid" | "invalid">("checking");
  const [details, setDetails] = React.useState<ActivationDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  // Check the link before showing the form, so nobody types a password into a dead link.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await lookupActivation(token);
      if (cancelled) return;
      if (result.ok) {
        setDetails(result.details);
        setState("valid");
      } else {
        setError(result.message);
        setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const issues = resetPasswordIssues(password, confirmation);
  const issueFor = (key: string) => (edited ? issues.find((issue) => issue.key === key)?.message : undefined);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEdited(true);
    if (issues.length > 0 || pending) return;

    setPending(true);
    setError(null);
    const result = await activateAccount(token, password);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }
    router.replace(await resolvePostAuthRoute(result.user));
  };

  if (state === "checking") {
    return (
      <div className="grid min-h-svh place-items-center px-6" role="status" aria-live="polite">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Checking your link…
        </span>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <AuthLayout
        heading="That link has expired"
        subtext="Set-password links work once and expire after 7 days. Ask your accountant to resend it, or reset your password if you've already set one."
        promoHeadline="Your account is ready and paid for."
        promoSupporting="One fresh link from your accountant and you're in."
      >
        <div className="space-y-4">
          <AuthError message={error} />
          <Button size="lg" className="h-10 w-full" asChild>
            <Link href="/auth/forgot-password">Reset my password</Link>
          </Button>
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const who = details?.accountant || "Your accountant";
  return (
    <AuthLayout
      heading={details?.first_name ? `Welcome, ${details.first_name}` : "Welcome to Sole"}
      subtext={`${who} has set up and paid for your Sole account${details?.business_name ? ` for ${details.business_name}` : ""}. Choose a password to get started.`}
      promoHeadline="Your account is ready and paid for."
      promoSupporting="Quotes, invoices, receipts and tax in one place, shared with your accountant."
      footer={
        <>
          Already set a password?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthError message={error} />

        <div className="space-y-1">
          <p className="text-sm font-medium">Email</p>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{details?.email}</p>
        </div>

        <PasswordField
          id="password"
          label="Create a password"
          value={password}
          onChange={(value) => {
            setEdited(true);
            setPassword(value);
          }}
          error={issueFor("password")}
          placeholder="Choose a password"
          autoComplete="new-password"
        >
          <PasswordStrengthMeter value={password} />
        </PasswordField>

        <PasswordField
          id="confirm"
          label="Confirm password"
          value={confirmation}
          onChange={(value) => {
            setEdited(true);
            setConfirmation(value);
          }}
          error={issueFor("confirm")}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          hint={!issueFor("confirm") && confirmation && confirmation === password ? "Both passwords match." : undefined}
        />

        <Button type="submit" size="lg" className="h-10 w-full" disabled={pending || (edited && issues.length > 0)}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Setting up…" : "Set password and continue"}
        </Button>
      </form>
    </AuthLayout>
  );
}
