"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom } from "jotai";
import { Loader2, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
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
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { SocialButtons } from "@/components/auth/social-buttons";
import { useAuthEntry, withEmail } from "@/components/auth/use-auth-entry";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";
import { rememberSocialStart, trackWithProfile } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { authEmailAtom, authErrorAtom, authPendingAtom } from "@/lib/atoms";
import { LOGIN_ROUTE } from "@/lib/api/session";
import {
  emailError,
  meetsPasswordRules,
  signUpWithPassword,
} from "@/lib/auth";
import { attributionSignupFields } from "@/lib/partner-attribution";
import {
  SignupCountryLine,
  useSignupCountry,
} from "@/components/auth/signup-country";
import {
  buildSpmReferralPayload,
  captureSpmReferral,
  clearSpmReferral,
  signUpFromInvite,
  type SpmReferral,
} from "@/lib/spm-referral";

/**
 * /register — a new account.
 *
 * Everything is on one form and sent straight to the backend: no lookup first
 * to find out whether the address is new. If it isn't, signup says so and the
 * screen points at /login with the address carried over.
 *
 * A password is the main path. "Email me a code instead" creates the account
 * without one; the sign-up extras ride on the code and are spent once it's
 * redeemed. Should that address already be an account, the backend sends a
 * sign-in code instead, so the code path signs them in rather than failing.
 *
 * The URL can carry a coupon (?code=), a referral (?refer-code=) and an
 * accountant invite (?id=accountant&accountant_email=), as the old combined
 * screen accepted. It can also carry an SPM accountant's referral
 * (?spm_accountant_id=&email=…, see lib/spm-referral): then the password path
 * goes through the invite sign-up, which records the referral, and the code
 * path carries it on the code.
 */
export function RegisterScreen() {
  const router = useRouter();
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(
    () => new URLSearchParams(rawSearchParams?.toString() ?? ""),
    [rawSearchParams],
  );
  const { land, resolving } = useAuthEntry();
  const code = useEmailCode();

  const [email, setEmail] = useAtom(authEmailAtom);
  const [pending, setPending] = useAtom(authPendingAtom);
  const [error, setError] = useAtom(authErrorAtom);

  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [emailEdited, setEmailEdited] = React.useState(false);
  const [passwordEdited, setPasswordEdited] = React.useState(false);
  const [confirmationEdited, setConfirmationEdited] = React.useState(false);
  /** Which request is in flight, so only its own control says so. */
  const [sendingCode, setSendingCode] = React.useState(false);
  /** The address is already an account — the way on is signing in. */
  const [exists, setExists] = React.useState(false);

  /*
   * Referral and coupon codes usually arrive on the URL, so the field stays
   * collapsed until someone actually has one to type. Read once: the URL
   * cannot change underneath us without a remount.
   */
  const [coupon, setCoupon] = React.useState(
    () => searchParams.get("code") ?? "",
  );
  const [showCoupon, setShowCoupon] = React.useState(() =>
    Boolean(searchParams.get("code")),
  );
  const [referCode] = React.useState(
    () => searchParams.get("refer-code") ?? "",
  );

  /** ?id=accountant puts the partner's address on the form. */
  const [wantsAccountant] = React.useState(
    () => searchParams.get("id") === "accountant",
  );
  const [accountantEmail, setAccountantEmail] = React.useState(
    () => searchParams.get("accountant_email") ?? "",
  );

  /*
   * An SPM accountant's invite: off this URL, or kept from an earlier hop. Its
   * email is the client's own address, and its coupon a prefill like any other.
   * Read after mount, because it lives in localStorage.
   */
  const [spmReferral, setSpmReferral] = React.useState<SpmReferral | null>(
    null,
  );
  React.useEffect(() => {
    const invite = captureSpmReferral();
    if (!invite) return;
    setSpmReferral(invite);
    setEmail(invite.email);
    if (invite.coupon_code && !searchParams.get("code")) {
      setCoupon(invite.coupon_code);
      setShowCoupon(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- *
   * Validation
   * ---------------------------------------------------------------- */

  const emailIssue = emailEdited ? requiredEmailIssue(email) : undefined;

  const accountantIssue =
    wantsAccountant && accountantEmail.trim() && emailError(accountantEmail)
      ? "Enter a valid accountant/bookkeeper email address."
      : undefined;

  const passwordIssue = !passwordEdited
    ? undefined
    : !password
      ? "Choose a password."
      : !meetsPasswordRules(password)
        ? "Your password doesn't meet the requirements below yet."
        : undefined;

  const confirmationIssue = !confirmationEdited
    ? undefined
    : !confirmation
      ? "Re-enter your password."
      : confirmation !== password
        ? "Both passwords must match."
        : undefined;

  const signupCountry = useSignupCountry(spmReferral?.country_iso2);


  const extras = () => ({
    coupon_code: coupon.trim() || undefined,
    ref_code: !coupon.trim() && referCode ? referCode : undefined,
    // Saved by the proxy from a partner link (?ref=&partner=); the backend keeps it on new accounts only.
    ...attributionSignupFields(),
    // The country shown under the form (a guess from location unless changed).
    country_iso2: signupCountry.iso2 ?? undefined,
    accountant_email: wantsAccountant
      ? accountantEmail.trim() || undefined
      : undefined,
    has_accountant_email: wantsAccountant ? 2 : 1,
    spm_referral: buildSpmReferralPayload(spmReferral),
  });

  /** An invite only ever applies to a brand-new account. */
  const forgetInviteIfTaken = (taken: boolean) => {
    if (!taken || !spmReferral) return;
    clearSpmReferral();
    setSpmReferral(null);
  };

  /**
   * The password path for an invited client: the dedicated sign-up, which
   * records the referral and, for a trusted invite, activates the account on
   * the spot. Everything else the invite carried goes up with it and is saved
   * by the backend; whatever is missing is asked for in onboarding.
   */
  const createInvitedAccount = async (invite: SpmReferral) => {
    const [firstName, ...rest] = (invite.name || "").split(/\s+/);
    const accountant =
      (wantsAccountant && accountantEmail.trim()) || invite.accountant_email;
    const result = await signUpFromInvite({
      email,
      password,
      ...(firstName ? { first_name: firstName, last_name: rest.join(" ") } : {}),
      coupon_code: coupon.trim() || undefined,
      join_from: invite.switching_from || undefined,
      accountant_email: accountant || undefined,
      has_accountant_email: accountant ? 2 : 1,
      business_email: invite.business_email || undefined,
      business_name: invite.business_name || undefined,
      abn: invite.abn || undefined,
      // What is shown under the form: the person's pick, else the accountant's, else a location guess.
      country_iso2: signupCountry.iso2 ?? (invite.country_iso2 || undefined),
      industry_id: invite.industry_id || undefined,
      spm_referral: buildSpmReferralPayload(invite),
    });

    if (!result.ok) {
      setPending(false);
      setError(result.message);
      setExists(result.reason === "exists");
      forgetInviteIfTaken(result.reason === "exists");
      return;
    }

    trackWithProfile(EVENTS.SIGNUP_DETAILS_ENTERED, {
      primary_email: email.trim(),
      signup_method: "email",
    });
    if (result.status === "verify") {
      router.push(withEmail("/auth/verify-email", email));
      return;
    }
    // Left pending: the redirect is in flight.
    await land(result.user);
  };

  /* ---------------------------------------------------------------- *
   * Submitting
   * ---------------------------------------------------------------- */

  const createAccount = async () => {
    setEmailEdited(true);
    setPasswordEdited(true);
    setConfirmationEdited(true);
    if (
      requiredEmailIssue(email) ||
      accountantIssue ||
      !meetsPasswordRules(password) ||
      confirmation !== password ||
      pending
    ) {
      return;
    }

    setPending(true);
    setError(null);
    setExists(false);

    if (spmReferral) {
      await createInvitedAccount(spmReferral);
      return;
    }

    const result = await signUpWithPassword(email, password, extras());
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      setExists(result.reason === "exists");
      if (result.reason === "unverified") {
        router.push(withEmail("/auth/verify-email", email));
      }
      return;
    }

    trackWithProfile(EVENTS.SIGNUP_DETAILS_ENTERED, {
      primary_email: email.trim(),
      signup_method: "email",
    });
    // Left pending: the redirect is in flight.
    await land(result.user);
  };

  const sendCode = async () => {
    setEmailEdited(true);
    if (requiredEmailIssue(email) || accountantIssue || pending) return;

    setPending(true);
    setSendingCode(true);
    setError(null);
    setExists(false);
    const message = await code.send({
      email: email.trim(),
      purpose: "signup",
      ...extras(),
    });
    if (message) setError(message);
    else {
      trackWithProfile(EVENTS.SIGNUP_DETAILS_ENTERED, {
        primary_email: email.trim(),
        signup_method: "email",
      });
    }
    setSendingCode(false);
    setPending(false);
  };

  const closeCode = () => {
    code.close();
    setError(null);
  };

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  if (resolving) return <BrandSplashLoader persist />;

  const codeStep = code.request !== null;

  return (
    <AuthLayout
      heading={codeStep ? "Enter your code" : "Create your account"}
      subtext={
        codeStep
          ? undefined
          : spmReferral
            ? "Your accountant invited you to Sole. Set a password to get started, or we'll email you a code instead."
            : "Set a password to get started, or we'll email you a code instead."
      }
      promoHeadline="Your books, sorted from day one."
      promoSupporting="Cancel whenever, keep your data either way."
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
      {/* One live region for the screen: a sent or resent code changes nothing
          visible, and neither is an error. */}
      <p className="sr-only" role="status" aria-live="polite">
        {code.statusLine}
      </p>

      {codeStep ? (
        <EmailCodeStep
          code={code}
          submitLabel="Verify and continue"
          onVerified={land}
          onChangeEmail={closeCode}
        />
      ) : (
        <>
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
              <Button
                variant="outline"
                size="lg"
                className="h-10 w-full"
                asChild
              >
                <Link href={withEmail(LOGIN_ROUTE, email)}>
                  Sign in instead
                </Link>
              </Button>
            )}

            <EmailField
              value={email}
              onChange={(next) => {
                setEmailEdited(true);
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
                setPasswordEdited(true);
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
              onChange={(next) => {
                setConfirmationEdited(true);
                setConfirmation(next);
              }}
              error={confirmationIssue}
              autoComplete="new-password"
              placeholder="Type it again"
            />

            {wantsAccountant && (
              <Field
                label="Accountant or bookkeeper's email"
                htmlFor="accountant-email"
                error={accountantIssue}
                hint="We'll invite them to your books once you're set up."
              >
                <Input
                  id="accountant-email"
                  type="email"
                  inputMode="email"
                  value={accountantEmail}
                  onChange={(event) => setAccountantEmail(event.target.value)}
                  placeholder="accountant@practice.com.au"
                  aria-invalid={!!accountantIssue}
                  className="h-10"
                />
              </Field>
            )}

            <SignupCountryLine signupCountry={signupCountry} disabled={pending} />

            {showCoupon ? (
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
            ) : referCode ? (
              // Carried in on the link itself — nothing to type, so it's stated
              // rather than offered as a field.
              <p className="text-center text-sm text-muted-foreground">
                Referral code{" "}
                <span className="font-medium text-foreground">{referCode}</span>{" "}
                applied.
              </p>
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
            )}

            <Button
              type="submit"
              size="lg"
              className="h-10 w-full"
              disabled={pending}
            >
              {pending && !sendingCode && (
                <Loader2 className="animate-spin" aria-hidden />
              )}
              {pending && !sendingCode
                ? "Creating your account…"
                : "Create account"}
            </Button>

            {/* Available, not suggested: a text link under the button rather
                than a second button competing with it. */}
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
                {sendingCode ? "Sending code…" : "Email me a code instead"}
              </button>
            </p>
          </form>

          <AuthDivider />
          <SocialButtons
            verb="Sign up"
            onStart={(provider) => rememberSocialStart(provider, "register")}
          />
        </>
      )}
    </AuthLayout>
  );
}
