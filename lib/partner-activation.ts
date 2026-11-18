/**
 * Accountant-paid accounts (integration partners, F6).
 *
 * The client's accountant set the account up and paid for it through a partner
 * system; the welcome email links here with a one-time token. The client only
 * chooses a password: the backend verifies the email (the link proves it), marks
 * the referral active and signs them in.
 *
 * The token is sent in a POST body, never in a request URL, so it doesn't end
 * up in logs.
 */

import { apiPost } from "@/lib/api/client";
import { ensureDeviceId } from "@/lib/api/device";
import { apiRoutes } from "@/lib/api/routes";
import { setSession } from "@/lib/api/session";
import type { AuthUser } from "@/lib/api/types";

export type ActivationDetails = {
  email: string;
  first_name: string | null;
  business_name: string | null;
  /** The accountant or practice that paid. */
  accountant: string | null;
};

const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Whether a link token is even shaped right, before asking the server. */
export function isActivationToken(value: string | null | undefined): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export type LookupResult = { ok: true; details: ActivationDetails } | { ok: false; message: string };

export async function lookupActivation(token: string): Promise<LookupResult> {
  if (!isActivationToken(token)) {
    return { ok: false, message: "This link is incomplete. Ask your accountant to resend it." };
  }
  const result = await apiPost<ActivationDetails>(apiRoutes.partnerReferral.activateLookup, { token });
  if (!result.success || !result.data) {
    return { ok: false, message: result.message || "This link has expired or was already used." };
  }
  return { ok: true, details: result.data };
}

export type ActivateResult = { ok: true; user: AuthUser } | { ok: false; message: string };

/** Set the password and sign in. On success the session is already stored. */
export async function activateAccount(token: string, password: string): Promise<ActivateResult> {
  const device_id = await ensureDeviceId();
  if (!device_id) {
    return { ok: false, message: "We couldn't set this browser up for sign-in. Refresh the page and try again." };
  }
  const result = await apiPost<{ user?: AuthUser }>(apiRoutes.partnerReferral.activate, {
    token,
    password,
    confirm_password: password,
    device_id,
  });
  const user = result.data?.user;
  if (!result.success || !user) {
    return { ok: false, message: result.message || "We couldn't set your password. Try again." };
  }
  setSession(user);
  return { ok: true, user };
}
