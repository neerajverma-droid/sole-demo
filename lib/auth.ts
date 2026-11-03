/**
 * Auth domain — validation, and the backend calls behind each screen.
 *
 * These talk to the same sole-ocr endpoints sole-webapp uses, with the same
 * contracts: a device is registered before any credential is spent, responses
 * come back as `{ success, message, data }`, and a successful sign-in carries
 * `data.user` with the token pair on it. The session itself is owned by
 * lib/api/session — nothing here keeps a second copy.
 *
 * Every call resolves; none throws. The screens branch on `ok`, and the message
 * is always something that can be shown to a person as-is.
 */

import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { apiPost, apiGet, type ApiResponse } from "@/lib/api/client";
import { ensureDeviceId } from "@/lib/api/device";
import { getAuthTenantSlug, PLATFORM } from "@/lib/api/env";
import { apiRoutes } from "@/lib/api/routes";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  refreshAccessToken,
  setSession,
} from "@/lib/api/session";
import type { AuthUser } from "@/lib/api/types";

export type { AuthUser };

export const CODE_LENGTH = 6;

/**
 * Seconds before a code can be sent again, when the backend doesn't say.
 *
 * Only a fallback: every successful request reports its own `resend_after`, and
 * a rate-limited one reports `retry_after`. The real value lives on the server.
 */
export const RESEND_COOLDOWN_SECONDS = 30;

const GENERIC_FAILURE = "Something went wrong. Please try again.";

/**
 * How this account came to exist, as the backend enumerates it (1–5). 1 is the
 * email-and-password door, which is the only one this app creates accounts
 * through — social sign-in is stamped by the backend during the OAuth callback.
 *
 * Required by both /auth/signup and /auth/login, which reject the call outright
 * without it.
 */
const SIGNUP_SOURCE_EMAIL = 1;

/**
 * Every credential-spending call is device-bound, and the backend rejects one
 * that arrives without a device id. Sending null anyway earns a bare
 * "device_id is required", which is a sentence about our request rather than
 * about anything the person can do — so the failure is named here instead.
 */
const DEVICE_FAILURE =
  "We couldn't set this browser up for sign-in. Refresh the page and try again.";

/** Whatever the backend said, or something sayable when it said nothing. */
const messageOf = (result: ApiResponse, fallback = GENERIC_FAILURE) =>
  result.message || fallback;

export type AuthResult = { ok: true } | { ok: false; message: string };

/** A completed sign-in: a session now exists and the user is known. */
export type SessionResult =
  | { ok: true; user: AuthUser | null; isNewAccount: boolean }
  | { ok: false; message: string };

/* ------------------------------------------------------------------ *
 * The top of the signup funnel
 * ------------------------------------------------------------------ */

/**
 * Someone on the register screen has submitted a valid address.
 *
 * Not "the signup screen rendered" — someone who lands on it and leaves has
 * not started anything. This fires on the first real attempt to create an
 * account, password or code, which is the first point at which there is a
 * signup to convert.
 *
 * The old app's equivalent step was `setup_business_profile_created`, which
 * also fires from the sidebar and the business-profile page. Signup
 * conversion there read about 1% until that was found; the real figure was
 * 33%. Measuring at one named call is what stops that happening again.
 */
export function trackSignupInitiated(): void {
  track(EVENTS.SIGNUP_INITIATED, { method: "email" });
}

/* ------------------------------------------------------------------ *
 * Codes
 * ------------------------------------------------------------------ */

export type OtpPurpose = "login" | "signup";

export type RequestOtpParams = {
  email: string;
  purpose: OtpPurpose;
  /**
   * Sign-up extras, sent only from the register screen. If the address turns
   * out to be registered already, the backend sends a sign-in code instead and
   * ignores these.
   */
  coupon_code?: string;
  ref_code?: string;
  accountant_email?: string;
  has_accountant_email?: number;
  /** The name given on the "new" step, split via `splitFullName`. */
  first_name?: string;
  last_name?: string | null;
};

export type RequestOtpResult =
  | { ok: true; resendAfter: number }
  | { ok: false; message: string; retryAfter?: number };

/**
 * Ask the backend to email a one-time code.
 *
 * Deliberately quiet about whether the account exists — the backend answers the
 * same either way — so this never surfaces "no such user". A failure here means
 * rate-limited or genuinely broken, and carries `retryAfter` when it's the
 * cooldown talking.
 */
export async function requestOtp(
  params: RequestOtpParams,
): Promise<RequestOtpResult> {
  const device_id = await ensureDeviceId();
  if (!device_id) return { ok: false, message: DEVICE_FAILURE };

  const result = await apiPost<{
    resend_after?: number;
    retry_after?: number;
  }>(apiRoutes.auth.otpRequest, {
    ...params,
    email: params.email.trim(),
    device_id,
    platform: PLATFORM,
    tenant: getAuthTenantSlug(),
  });

  if (!result.success) {
    return {
      ok: false,
      message: messageOf(
        result,
        "We couldn't send your code. Please try again.",
      ),
      retryAfter: Number(result.data?.retry_after) || undefined,
    };
  }

  track(EVENTS.SIGNUP_OTP_REQUESTED, { purpose: params.purpose });

  return {
    ok: true,
    resendAfter: Number(result.data?.resend_after) || RESEND_COOLDOWN_SECONDS,
  };
}

/**
 * Redeem a typed code. On success the response carries the same `data.user`
 * shape login does, so the session is persisted through the identical path.
 */
/**
 * Which screen is redeeming the code.
 *
 * One endpoint serves three different moments — finishing a signup, clearing a
 * two-step challenge, and confirming an address — and they are three different
 * funnels. Without this the two-step codes would be counted as signup
 * verifications and inflate signup conversion, which is the same shape of
 * mistake that had the old app reading 1% where the truth was 33%.
 *
 * Defaulted rather than required because the main auth screen is the common
 * case and the other two are the ones that have to say so.
 */
export type OtpContext = "auth" | "two_factor" | "verify_email";

export async function verifyOtp(
  email: string,
  code: string,
  context: OtpContext = "auth",
): Promise<SessionResult> {
  const device_id = await ensureDeviceId();
  if (!device_id) return { ok: false, message: DEVICE_FAILURE };

  const result = await apiPost<{
    user?: AuthUser;
    is_new_account?: boolean;
  }>(apiRoutes.auth.otpVerify, {
    email: email.trim(),
    code,
    device_id,
    platform: PLATFORM,
  });

  if (!result.success) {
    return {
      ok: false,
      message: messageOf(
        result,
        "That code doesn't match. Check it and try again.",
      ),
    };
  }

  setSession(result.data?.user);
  const isNewAccount = Boolean(result.data?.is_new_account);

  if (context === "two_factor") {
    track(EVENTS.TWO_FACTOR_VERIFIED);
    track(EVENTS.SIGNIN_COMPLETED, { method: "two_factor" });
  } else {
    track(EVENTS.SIGNUP_OTP_VERIFIED, {
      context,
      is_new_account: isNewAccount,
    });
    // An existing account redeeming a code has signed in, not signed up. Both
    // are true of the same call, and a funnel needs them apart.
    if (!isNewAccount) track(EVENTS.SIGNIN_COMPLETED, { method: "otp" });
  }

  return {
    ok: true,
    user: result.data?.user ?? null,
    isNewAccount,
  };
}

/**
 * Redeem the token from the "Verify your Sole account" email.
 *
 * sole-ocr sends that email — a link, not a code — whenever a password account
 * that never confirmed its address signs up or signs in again, and the link
 * comes back here. It may well be opened in a different browser than the one
 * that asked for it, so it registers a device of its own, and a success both
 * verifies the address and signs you in.
 */
export async function verifyEmailLink(
  email: string,
  token: string,
): Promise<SessionResult> {
  const device_id = await ensureDeviceId();
  if (!device_id) return { ok: false, message: DEVICE_FAILURE };

  const result = await apiPost<{ user?: AuthUser }>(apiRoutes.auth.verifyEmail, {
    email: email.trim(),
    token,
    device_id,
    platform: PLATFORM,
  });

  if (!result.success) {
    return {
      ok: false,
      message: messageOf(result, "This verification link is no longer valid."),
    };
  }

  setSession(result.data?.user);
  if (result.data?.user) track(EVENTS.SIGNIN_COMPLETED, { method: "verify_link" });

  return { ok: true, user: result.data?.user ?? null, isNewAccount: false };
}

/* ------------------------------------------------------------------ *
 * Passwords
 * ------------------------------------------------------------------ */

/**
 * Why a password sign-in failed, when it did.
 *
 * "no-password" is its own outcome rather than another wrong-credentials
 * message: an account that signed up with a code has no password to get wrong,
 * and telling someone their password is incorrect when they never set one sends
 * them to the reset flow to fix a password that doesn't exist.
 *
 * "unverified" is the other one worth separating — that account exists and the
 * credentials were fine; it just hasn't confirmed its address yet.
 */
export type PasswordSignInResult =
  | { ok: true; user: AuthUser | null }
  | {
      ok: false;
      reason: "invalid" | "no-password" | "unverified" | "device";
      message: string;
    };

const looksUnverified = (message: string) => {
  const text = message.toLowerCase();
  return (
    text.includes("verif") ||
    text.includes("activat") ||
    text.includes("confirm")
  );
};

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PasswordSignInResult> {
  const device_id = await ensureDeviceId();
  if (!device_id) {
    return { ok: false, reason: "device", message: DEVICE_FAILURE };
  }

  const result = await apiPost<{ user?: AuthUser; requires_otp?: boolean }>(
    apiRoutes.auth.login,
    {
      email: email.trim(),
      password,
      signup_source: SIGNUP_SOURCE_EMAIL,
      device_id,
      platform: PLATFORM,
    },
  );

  if (!result.success) {
    const message = result.message || "";
    if (result.data?.requires_otp) {
      return {
        ok: false,
        reason: "no-password",
        message:
          message ||
          "You haven't set a password yet — sign in with a code, then add one in Settings.",
      };
    }

    if (message && looksUnverified(message)) {
      return { ok: false, reason: "unverified", message };
    }

    return {
      ok: false,
      reason: "invalid",
      message:
        message ||
        "That email and password don't match. Check both and try again.",
    };
  }

  setSession(result.data?.user);
  track(EVENTS.SIGNIN_COMPLETED, { method: "password" });
  return { ok: true, user: result.data?.user ?? null };
}

/**
 * Why creating an account failed, when it did.
 *
 * "exists" is the one the register screen has to answer differently: the
 * address is already an account (password or social), so the way forward is
 * signing in, not trying again. "unverified" is an account that exists but
 * never confirmed its address — the backend has just re-sent its code.
 */
export type SignUpResult =
  | { ok: true; user: AuthUser | null }
  | {
      ok: false;
      reason: "exists" | "unverified" | "other";
      message: string;
    };

/**
 * Create an account with a password — the register screen's main path. The
 * emailed-code path goes through `requestOtp` with `purpose: "signup"`.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  extras: {
    coupon_code?: string;
    ref_code?: string;
    accountant_email?: string;
    has_accountant_email?: number;
    first_name?: string;
    last_name?: string | null;
  } = {},
): Promise<SignUpResult> {
  const device_id = await ensureDeviceId();
  if (!device_id) {
    return { ok: false, reason: "other", message: DEVICE_FAILURE };
  }

  const result = await apiPost<{ user?: AuthUser; redirect?: unknown }>(
    apiRoutes.auth.signUp,
    {
      ...extras,
      email: email.trim(),
      password,
      confirm_password: password,
      signup_source: SIGNUP_SOURCE_EMAIL,
      device_id,
      platform: PLATFORM,
      tenant: getAuthTenantSlug(),
    },
  );

  if (!result.success) {
    const message = messageOf(
      result,
      "We couldn't create your account. Please try again.",
    );
    if (result.data?.redirect) return { ok: false, reason: "exists", message };
    if (looksUnverified(message)) {
      return { ok: false, reason: "unverified", message };
    }
    return { ok: false, reason: "other", message };
  }
  
  setSession(result.data?.user);
  track(EVENTS.SIGNUP_PASSWORD_SUBMITTED);
  return { ok: true, user: result.data?.user ?? null };
}

/**
 * Always reports success, and says so without confirming the address exists —
 * telling someone which emails are registered is a way of enumerating users.
 */
export async function forgotPassword(email: string): Promise<AuthResult> {
  const result = await apiPost(apiRoutes.auth.forgotPassword, {
    email: email.trim(),
    tenant: getAuthTenantSlug(),
  });

  return result.success
    ? { ok: true }
    : {
        ok: false,
        message: messageOf(
          result,
          "Could not send the reset email. Please try again.",
        ),
      };
}

/** Is the token on a reset link still good? Asked before the form is shown. */
export async function validateResetToken(token: string): Promise<AuthResult> {
  // A GET with the token as a query parameter — the route reads req.query and
  // hands it to the same handler the /password-reset/:token path uses. Posting
  // a body here comes back as "Token is required", which reads on screen as an
  // expired link for a link that is perfectly good.
  const result = await apiGet(apiRoutes.auth.validateResetToken, {
    params: { token },
  });
  return result.success
    ? { ok: true }
    : {
        ok: false,
        message: messageOf(
          result,
          "This reset link has expired. Ask for a new one.",
        ),
      };
}

/** Spend a reset token on a new password. No session needed, or expected. */
export async function resetPassword(
  token: string,
  password: string,
): Promise<AuthResult> {
  const result = await apiPost(apiRoutes.auth.resetPassword, {
    token,
    password,
    confirm_password: password,
  });

  return result.success
    ? { ok: true }
    : {
        ok: false,
        message: messageOf(
          result,
          "We couldn't set your new password. Please try again.",
        ),
      };
}

/**
 * Add a first password, or change an existing one, on the signed-in account.
 * `current_password` is only required by the backend when one is already set.
 */
export async function setPassword(params: {
  password: string;
  current_password?: string;
}): Promise<AuthResult> {
  const result = await apiPost(
    apiRoutes.auth.setPassword,
    {
      password: params.password,
      confirm_password: params.password,
      ...(params.current_password
        ? { current_password: params.current_password }
        : {}),
    },
    { auth: "bearer" },
  );

  return result.success
    ? { ok: true }
    : {
        ok: false,
        message: messageOf(
          result,
          "We couldn't save your password. Please try again.",
        ),
      };
}

/* ------------------------------------------------------------------ *
 * The session itself
 * ------------------------------------------------------------------ */

export async function fetchProfile(): Promise<AuthUser | null> {
  // A dead session here is an answer, not an accident: the provider turns the
  // null into a signed-out state and the guard decides where that lands.
  const result = await apiGet<{ user?: AuthUser }>(apiRoutes.auth.profile, {
    auth: "bearer",
  });
  return result.success ? (result.data?.user ?? null) : null;
}

/**
 * Is this browser already signed in?
 *
 * The token is proved against the server rather than merely being present: a
 * cookie survives logout-elsewhere, expiry and password changes, so "there is a
 * token" is not the same as "there is a session". An expired access token is
 * retried once through the refresh token, which is what makes a returning
 * visitor resume rather than get bounced.
 *
 * Returns null when there is no session — and clears the dead tokens on the way
 * out, so nothing downstream keeps trying to use them.
 */
export async function resumeSession(): Promise<AuthUser | null> {
  /*
   * A missing access token is not a missing session while the refresh token is
   * still there to spend.
   *
   * The two cookies are written together but don't always die together: only
   * `token` is rewritten on every renewal, a response that carries just one of
   * the pair advances only that one's expiry, and sole-webapp shares this
   * domain and these cookie names. Bouncing on the access token alone signed
   * those people out of a session the server still considers live — and did it
   * silently, because nothing had asked the server anything yet.
   */
  if (!getAccessToken()) {
    if (!getRefreshToken()) return null;
    if (!(await refreshAccessToken())) {
      clearSession();
      return null;
    }
  }

  let user = await fetchProfile();

  if (!user) {
    const token = await refreshAccessToken();
    if (!token) {
      clearSession();
      return null;
    }
    user = await fetchProfile();
  }

  if (!user) {
    clearSession();
    return null;
  }
  return user;
}

/**
 * End the session. The backend is told so it can revoke the refresh token, but
 * the local session is cleared either way — a sign-out that fails because the
 * network is down still has to sign the person out.
 */
export async function signOut(): Promise<void> {
  try {
    await apiPost(
      apiRoutes.auth.logout,
      {},
      // No retry: a logout that 401s has already achieved what it was for.
      { auth: "bearer", skipAuthRetry: true },
    );
  } finally {
    clearSession();
  }
}

/** Re-send the verification code for an address that hasn't confirmed itself. */
export async function resendVerification(email: string): Promise<AuthResult> {
  const result = await apiPost(apiRoutes.auth.resendVerification, {
    email: email.trim(),
    platform: PLATFORM,
  });
  return result.success
    ? { ok: true }
    : {
        ok: false,
        message: messageOf(
          result,
          "We couldn't resend the code. Please try again.",
        ),
      };
}

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

/**
 * j…@email.com — enough to recognise your own address, not enough to read
 * someone else's off your screen. The domain stays whole: it's the half people
 * check when they're wondering which of their addresses they used.
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  return local.length <= 1 ? `${local}${domain}` : `${local[0]}…${domain}`;
}

/* ------------------------------------------------------------------ *
 * Validation — live inline errors, keystrokes never blocked
 * ------------------------------------------------------------------ */

/**
 * Permissive on purpose. A stricter pattern rejects addresses that are perfectly
 * valid — the only reliable test of an email is sending to it.
 */
export function emailError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? undefined
    : "Enter a valid email address.";
}

export type AuthIssue = { key: string; message: string };

export function forgotPasswordIssues(email: string): AuthIssue[] {
  const format = emailError(email);
  if (!email.trim()) {
    return [{ key: "email", message: "Enter your email address." }];
  }
  return format ? [{ key: "email", message: format }] : [];
}

export function resetPasswordIssues(
  password: string,
  confirmation: string,
): AuthIssue[] {
  const issues: AuthIssue[] = [];

  if (!password) {
    issues.push({ key: "password", message: "Choose a new password." });
  } else if (!meetsPasswordRules(password)) {
    issues.push({
      key: "password",
      message: "Your password doesn't meet the requirements below yet.",
    });
  }

  if (!confirmation) {
    issues.push({ key: "confirm", message: "Re-enter your new password." });
  } else if (password && confirmation !== password) {
    issues.push({ key: "confirm", message: "Both passwords must match." });
  }

  return issues;
}

/** A code is submittable once it's the full six digits. */
export function codeIssue(code: string): string | undefined {
  if (!code) return undefined;
  return code.length < CODE_LENGTH
    ? `Enter all ${CODE_LENGTH} digits.`
    : undefined;
}

export type PasswordRule = { label: string; met: boolean };

/**
 * What a new password must satisfy before it can be submitted. Shown as a live
 * checklist rather than as an error after the fact — a rule you can watch
 * yourself meet beats one that only appears once you've got it wrong.
 *
 * Sign-in deliberately does NOT enforce these: an account created before the
 * rules existed would be locked out of its own password.
 */
export function passwordRules(value: string): PasswordRule[] {
  return [
    { label: "At least 8 characters", met: value.length >= 8 },
    { label: "A letter", met: /[a-zA-Z]/.test(value) },
    { label: "A number", met: /\d/.test(value) },
  ];
}

export function meetsPasswordRules(value: string): boolean {
  return passwordRules(value).every((rule) => rule.met);
}

export type PasswordStrength = {
  /** 0–4, for the meter's filled segments. */
  score: number;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
};

/**
 * Strength is a separate question from validity: a password can pass every rule
 * and still be weak, which is worth showing without blocking on it.
 */
export function passwordStrength(value: string): PasswordStrength {
  if (!value) return { score: 0, label: "Too short" };

  const signals = [
    value.length >= 8,
    value.length >= 12,
    /[a-z]/.test(value) && /[A-Z]/.test(value),
    /\d/.test(value),
    /[^a-zA-Z0-9]/.test(value),
  ].filter(Boolean).length;

  if (value.length < 8) return { score: 1, label: "Too short" };
  if (signals <= 2) return { score: 1, label: "Weak" };
  if (signals === 3) return { score: 2, label: "Fair" };
  if (signals === 4) return { score: 3, label: "Good" };
  return { score: 4, label: "Strong" };
}
