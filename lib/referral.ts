/**
 * Refer & Earn — invite someone by email, and see what became of it.
 *
 * Backed by sole-ocr's `/v2/invite` routes (`src/services/v2/referral.js`),
 * which is real: sending an invite lazily generates the account's `ref_code`,
 * emails the address a signup link carrying it, and rows up in `Referrals`
 * from then on — the same table this reads back.
 *
 * There is deliberately no "copy your referral link" box on this screen. The
 * backend has no endpoint that returns a `ref_code` on its own; the only way
 * one exists is for `sendInvite` to generate it as a side effect of emailing
 * someone. A link the UI invented locally could show a code the account
 * doesn't have yet, and one fetched some other way doesn't exist to fetch.
 * So the only way to refer someone is the only way the server supports:
 * typing their email in.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { apiErrorMessage } from "@/lib/api-error";
import { accountantEmailError } from "@/lib/onboarding";

/**
 * Where an invite is up to.
 *
 * Derived server-side from which date columns are set, each one further along
 * than the last — `src/services/v2/referral.js`'s `getStatus`: a payment date
 * implies a subscribe date implies a signup date. `SUCCESS` is the only one
 * that pays out; `referral_amount` is 0 everywhere short of it.
 */
export type ReferralStatus =
  "PENDING" | "REGISTERED" | "SUBSCRIBED" | "SUCCESS";

export type ReferralInvite = {
  id: number;
  email: string;
  status: ReferralStatus;
  /** `DD/MM/YYYY`, already formatted server-side, or "" if that stage hasn't happened. */
  invitedOn: string;
  creditedOn: string;
  /** Dollars earned from this invite — 0 until `status` is `SUCCESS`. */
  amount: number;
};

type ApiInvite = {
  invite_id: number;
  invite_email: string;
  invitation_send_date?: string;
  signup_date?: string;
  subscribed_date?: string;
  payment_date?: string;
  referral_credit_date?: string;
  referral_amount?: number | string | null;
  status?: string;
};

const STATUSES: ReferralStatus[] = [
  "PENDING",
  "REGISTERED",
  "SUBSCRIBED",
  "SUCCESS",
];

function toStatus(value: string | undefined): ReferralStatus {
  return STATUSES.includes(value as ReferralStatus)
    ? (value as ReferralStatus)
    : "PENDING";
}

function mapInvite(raw: ApiInvite): ReferralInvite {
  return {
    id: raw.invite_id,
    email: raw.invite_email ?? "",
    status: toStatus(raw.status),
    invitedOn: raw.invitation_send_date ?? "",
    creditedOn: raw.referral_credit_date ?? "",
    amount: Number(raw.referral_amount) || 0,
  };
}

export async function fetchReferralInvites(): Promise<ReferralInvite[]> {
  const response = await api.get<{
    success: boolean;
    data?: { invites?: ApiInvite[] };
  }>(apiRoutes.referral.inviteList);

  if (!response.data?.success) {
    throw new Error(apiErrorMessage(response, "Couldn't load your invites."));
  }
  return (response.data.data?.invites ?? []).map(mapInvite);
}

/**
 * The address to invite is either a fresh one (what someone is allowed to
 * refer in the first place) or already known to this screen (one it already
 * has a status for), and only the first produces any new sign-up invitation.
 * Enter is never asked for one twice from the same box.
 */
export function referralEmailIssue(email: string): string | undefined {
  if (!email.trim()) return "Enter the email address to invite.";
  return accountantEmailError(email);
}

/**
 * The two raw codes `sendInvite` throws as its `message` on a 409 — see
 * `src/services/v2/referral.js`. Neither is prose, so they're translated here
 * rather than shown as-is.
 */
const INVITE_ERROR_COPY: Record<string, string> = {
  already_have_account: "That address already has a Sole account.",
  already_sent: "You've already invited that address.",
};

export async function sendReferralInvite(email: string): Promise<void> {
  try {
    await api.post(apiRoutes.referral.inviteSend, { email: email.trim() });
  } catch (error) {
    /*
     * `sendInvite` answers a taken address or a repeat invite with a real
     * 409 whose `message` is a bare code (`already_have_account`,
     * `already_sent`) rather than a sentence — `apiErrorMessage` would
     * otherwise surface that code verbatim, so it's translated first and the
     * generic extractor is only the fallback for everything else (the 422
     * validation messages already read as prose and pass through untouched).
     */
    const raw = apiErrorMessage(error, "Couldn't send that invite.");
    throw new Error(INVITE_ERROR_COPY[raw] ?? raw);
  }
}

/** What each status says, and how it's badged. */
export const REFERRAL_STATUS_COPY: Record<
  ReferralStatus,
  { label: string; tone: "secondary" | "outline" | "warning" | "success" }
> = {
  PENDING: { label: "Invited", tone: "secondary" },
  REGISTERED: { label: "Signed up", tone: "outline" },
  SUBSCRIBED: { label: "Subscribed", tone: "warning" },
  SUCCESS: { label: "Credited", tone: "success" },
};
