"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AuthLegalLine } from "@/components/auth/auth-legal-line";
import { EmailField, requiredEmailIssue } from "@/components/auth/auth-fields";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { useSession } from "@/components/auth/session-provider";
import { withEmail } from "@/components/auth/use-auth-entry";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";
import { trackWithProfile } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { resolvePostAuthRoute } from "@/lib/api/post-auth";
import { LOGIN_ROUTE, REGISTER_ROUTE } from "@/lib/api/session";
import { meetsPasswordRules } from "@/lib/auth";
import {
  buildSpmReferralPayload,
  captureSpmReferral,
  clearSpmReferral,
  signUpFromInvite,
  updateSpmReferral,
  type SpmReferral,
} from "@/lib/spm-referral";

/**
 * /accountant-invite — the link in an accountant's invite email:
 *
 *   /accountant-invite?spm_accountant_id=<id>&email=<client email>&…
 *   /accountant-invite?data=<encrypted invite>
 *
 * Shows the client's address (prefilled from the link, editable) and asks for a
 * password, then signs up through the invite
 * endpoint. A trusted invite is activated on the spot and lands in the app
 * (onboarding, for a new account); any other one gets the ordinary "check your
 * email" step. Business details the accountant supplied go up with the sign-up
 * and are prefilled again in onboarding — nothing more is asked for here.
 *
 * A link without a usable invite is not an invite: the visitor is sent to the
 * ordinary sign-up. Like the old page, an existing session is left alone — the
 * invited client may be on a browser someone else is signed in to.
 */
export function AccountantInviteScreen() {
  const router = useRouter();
  const { adopt } = useSession();

  const [invite, setInvite] = React.useState<SpmReferral | null>(null);
  const [ready, setReady] = React.useState(false);

  const [email, setEmail] = React.useState("");
  // Never asked for here: it only travels on from the invite link, when the accountant gave one.
  const [switchingFrom, setSwitchingFrom] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [coupon, setCoupon] = React.useState("");
  const [showCoupon, setShowCoupon] = React.useState(false);

  const [submitted, setSubmitted] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [exists, setExists] = React.useState(false);

  // Read the invite from the link (or what an earlier visit stored).
  React.useEffect(() => {
    const found = captureSpmReferral();
    if (!found) {
      router.replace(REGISTER_ROUTE);
      return;
    }
    setInvite(found);
    setEmail(found.email);
    setSwitchingFrom(found.switching_from);
    setCoupon(found.coupon_code);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- *
   * Validation — shown once a submit has been tried
   * ---------------------------------------------------------------- */

  const emailIssue = submitted ? requiredEmailIssue(email) : undefined;
  const passwordIssue = !submitted
    ? undefined
    : !password
      ? "Choose a password."
      : !meetsPasswordRules(password)
        ? "Your password doesn't meet the requirements below yet."
        : undefined;
  const confirmationIssue = !submitted
    ? undefined
    : !confirmation
      ? "Re-enter your password."
      : confirmation !== password
        ? "Both passwords must match."
        : undefined;

  /* ---------------------------------------------------------------- *
   * Submitting
   * ---------------------------------------------------------------- */

  const createAccount = async () => {
    setSubmitted(true);
    if (
      !invite ||
      requiredEmailIssue(email) ||
      !meetsPasswordRules(password) ||
      confirmation !== password ||
      pending
    ) {
      return;
    }

    setPending(true);
    setError(null);
    setExists(false);

    const address = email.trim().toLowerCase();
    const code = coupon.trim();

    // Keep what the client settled on beside the invite, so onboarding and the
    // referral record agree with what was submitted.
    const saved =
      updateSpmReferral({
        email: address,
        coupon_code: code,
        switching_from: switchingFrom,
      }) ?? invite;

    const [firstName, ...rest] = (saved.name || "").split(/\s+/);
    const result = await signUpFromInvite({
      email: address,
      password,
      ...(firstName ? { first_name: firstName, last_name: rest.join(" ") } : {}),
      coupon_code: code || undefined,
      join_from: switchingFrom || undefined,
      accountant_email: saved.accountant_email || undefined,
      has_accountant_email: saved.accountant_email ? 2 : 1,
      business_email: saved.business_email || undefined,
      business_name: saved.business_name || undefined,
      abn: saved.abn || undefined,
      // The country the accountant set for this client's business (a hint; the backend checks it).
      country_iso2: saved.country_iso2 || undefined,
      industry_id: saved.industry_id || undefined,
      spm_referral: buildSpmReferralPayload(saved),
    });

    if (!result.ok) {
      setPending(false);
      if (result.reason === "exists") {
        // An invite only ever applies to a brand-new account.
        clearSpmReferral();
        setExists(true);
        setError("An account with this email already exists.");
        return;
      }
      setError(result.message);
      return;
    }

    trackWithProfile(EVENTS.SIGNUP_DETAILS_ENTERED, {
      primary_email: address,
      signup_method: "email",
    });

    if (result.status === "verify") {
      router.push(withEmail("/auth/verify-email", address));
      return;
    }

    // Activated on the spot, with a session: carry on into the app the way a
    // verified sign-in does. Left pending: the redirect is in flight.
    adopt(result.user);
    router.replace(await resolvePostAuthRoute(result.user));
  };

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  if (!ready) return <BrandSplashLoader persist />;

  const firstName = (invite?.name || "").split(/\s+/)[0];
  const couponFromInvite = Boolean(invite?.coupon_code);

  return (
    <AuthLayout
      heading={firstName ? `Welcome, ${firstName}` : "You're invited to Sole"}
      subtext="Your accountant set this up for you. Choose a password and your account will be ready straight away."
      promoHeadline="Your accountant, already on board."
      promoSupporting="Quotes, invoices, receipts and tax in one place — shared with the accountant who invited you."
      footer={
        <div className="space-y-3">
          <p>
            Already have an account?{" "}
            <Link
              href={withEmail(LOGIN_ROUTE, email)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
          <p className="text-xs">
            <AuthLegalLine action="creating an account" />
          </p>
        </div>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void createAccount();
        }}
      >
        <AuthError message={error} />

        {/* Trying again can't fix an address that's already taken. */}
        {exists && (
          <Button variant="outline" size="lg" className="h-10 w-full" asChild>
            <Link href={withEmail(LOGIN_ROUTE, email)}>Sign in instead</Link>
          </Button>
        )}

        <EmailField
          value={email}
          onChange={(next) => {
            setEmail(next);
            if (error) setError(null);
            if (exists) setExists(false);
          }}
          error={emailIssue}
        />

        <PasswordField
          id="password"
          label="Create a password"
          value={password}
          onChange={(next) => {
            setPassword(next);
            if (error && !exists) setError(null);
          }}
          error={passwordIssue}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        >
          <PasswordStrengthMeter value={password} />
        </PasswordField>

        <PasswordField
          id="confirm-password"
          label="Confirm password"
          value={confirmation}
          onChange={setConfirmation}
          error={confirmationIssue}
          autoComplete="new-password"
          placeholder="Type it again"
        />

        {/* A coupon already in the invite is sent without being shown. */}
        {!couponFromInvite &&
          (showCoupon ? (
            <Field label="Referral or coupon code" htmlFor="coupon">
              <div className="relative">
                <Tag
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="coupon"
                  value={coupon}
                  onChange={(event) => setCoupon(event.target.value)}
                  placeholder="Enter your code"
                  className="h-10 pl-9 uppercase"
                />
              </div>
            </Field>
          ) : (
            <p className="text-center text-sm">
              <button
                type="button"
                onClick={() => setShowCoupon(true)}
                className="rounded font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Have a referral or coupon code?
              </button>
            </p>
          ))}

        <Button
          type="submit"
          size="lg"
          className="h-10 w-full"
          disabled={pending}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Creating your account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
