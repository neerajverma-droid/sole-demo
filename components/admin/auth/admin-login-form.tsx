"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { PasswordField } from "@/components/auth/password-field";
import { useSession } from "@/components/auth/session-provider";
import { AdminAuthLayout } from "@/components/admin/auth/admin-auth-layout";
import { canAccessAdminPanel, safeAdminRedirect } from "@/lib/admin/access";
import { ensureDeviceId } from "@/lib/api/device";
import { emailError, signInWithPassword, signOut as signOutRequest } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NOT_AN_ADMIN =
  "This account doesn't have admin access. Sign in with an admin account.";

const DEVICE_FAILED =
  "Couldn't register this browser with Sole, so sign-in can't start. Check your connection and try again.";

/**
 * The admin sign-in.
 *
 * Same credentials endpoint as the business form — the backend reads the role
 * and the super-admin flag from the account, not from which door it came
 * through — so this is a second entrance rather than a second system, the same
 * way the accountant sign-in is.
 *
 * What's different is what happens after. A business account that signs in
 * here is signed straight back out rather than dropped into the product, so a
 * wrong account never leaves a live session behind on an admin screen.
 *
 * Local state rather than the shared `auth*` atoms: those carry an email across
 * the business sign-in's steps, and an admin address shouldn't follow anyone
 * back to that form.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, status, adopt } = useSession();

  const next = safeAdminRedirect(params?.get("next") ?? null);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Already signed in as an admin: nothing to do here.
  const alreadyAdmin = status === "authenticated" && canAccessAdminPanel(user);
  React.useEffect(() => {
    if (alreadyAdmin) router.replace(next);
  }, [alreadyAdmin, next, router]);

  const emailIssue = edited
    ? (emailError(email) ?? (email.trim() ? undefined : "Enter your email address."))
    : undefined;
  const passwordIssue = edited && !password ? "Enter your password." : undefined;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEdited(true);
    if (!email.trim() || emailError(email) || !password || pending) return;

    setPending(true);
    setError(null);

    /*
     * The device first, and awaited. The login endpoint rejects a request with
     * no device id, and without one the backend falls back to a shared row —
     * issuing an admin session against that would log out whoever else is on
     * it. A no-op when this browser already has a device cookie.
     */
    const deviceId = await ensureDeviceId();
    if (!deviceId) {
      setPending(false);
      setError(DEVICE_FAILED);
      return;
    }

    const result = await signInWithPassword(email, password);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }

    if (!canAccessAdminPanel(result.user)) {
      // The tokens are already written by now, so they're cleared rather than
      // just not adopted — otherwise the product would open signed in as this
      // account on the next visit to any other page.
      await signOutRequest();
      setPending(false);
      setError(NOT_AN_ADMIN);
      return;
    }

    adopt(result.user);
    router.replace(next);
  };

  return (
    <AdminAuthLayout
      heading="Admin sign in"
      subtext="Sign in with the admin account a super admin created for you."
      footer={
        <>
          Looking for your business account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Go to Sole sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthError message={error} />

        <Field label="Admin email" htmlFor="admin-email" error={emailIssue}>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="admin-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(event) => {
                setEdited(true);
                setEmail(event.target.value);
                if (error) setError(null);
              }}
              placeholder="you@soleapp.com.au"
              aria-invalid={!!emailIssue}
              className={cn(
                "h-10 pl-9",
                emailIssue && "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>
        </Field>

        <PasswordField
          id="admin-password"
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
        />

        <Button
          type="submit"
          size="lg"
          className="h-10 w-full"
          disabled={pending || alreadyAdmin}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Signing in…" : "Sign in to admin"}
        </Button>
      </form>
    </AdminAuthLayout>
  );
}
