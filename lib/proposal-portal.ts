/**
 * The client portal — sole-webapp's `pages/client-portal`.
 *
 * The page sole-ocr emails with every sent proposal
 * (`${FRONTEND_URL}/client-portal?client_id=…&proposal_id=…&email=…&token=…`,
 * see buildResponseUrl). `token` is the only access key; the other params
 * are there for readability. Every call is `auth: "public"` against the
 * backend's `/proposal/public/:token` routes.
 */

import apiRoutes from "@/config/api-routes";
import { apiGet, apiPost } from "@/lib/api/client";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import type { ApiProposal } from "@/lib/proposals";

export const PORTAL_MESSAGES = {
  invalidLink: "This proposal link is invalid.",
  loadFailed: "This proposal link is invalid or has expired.",
  eventFailed: "Failed to record your response.",
  stripeFailed: "Failed to start Stripe checkout.",
  uploadFailed: "Failed to save the signed document.",
  pdfFailed: "Couldn't generate the signed document. Please try again.",
} as const;

export const DECLINE_REASONS = [
  "Pricing",
  "Timing isn't right",
  "Scope doesn't fit",
  "Chose another provider",
  "Other",
] as const;

export type PortalViewState = "pending" | "accepted" | "rejected" | "expired";

export function portalViewState(status: unknown): PortalViewState {
  const value = String(status ?? "").toLowerCase();
  if (value === "accepted") return "accepted";
  if (value === "rejected" || value === "lost") return "rejected";
  if (value === "expired") return "expired";
  return "pending";
}

/** Letters and spaces only — the typed legal name, as sole-webapp checks it. */
export const SIGNATURE_NAME_PATTERN = /^[A-Za-z\s]+$/;

export function signatureIssue(
  name: string,
  agreedTerms: boolean,
  agreedEsign: boolean,
): string | null {
  const trimmed = name.trim();
  if (!trimmed || !SIGNATURE_NAME_PATTERN.test(trimmed)) {
    return "Enter your full legal name using letters only.";
  }
  if (!agreedTerms) return "Please confirm you've read and agree to the Terms & Conditions.";
  if (!agreedEsign) return "Please confirm you agree to sign electronically.";
  return null;
}

export function declineIssue(reason: string, note: string): string | null {
  if (!reason) return "Please choose a reason for declining.";
  if (reason === "Other" && !note.trim()) return "Please add a short reason.";
  return null;
}

const enc = (token: string) => encodeURIComponent(token);

export async function fetchPublicProposal(token: string): Promise<ApiProposal> {
  const result = await apiGet<ApiProposal>(apiRoutes.proposal.publicInfo(enc(token)), {
    auth: "public",
  });
  if (!result.success || !result.data) {
    throw new Error(result.message || PORTAL_MESSAGES.loadFailed);
  }
  return result.data;
}

export async function postPublicProposalEvent(
  token: string,
  eventType: "viewed" | "accepted" | "rejected",
  metadata: Record<string, unknown> = {},
  extra: { signature_name?: string; signed_pdf_url?: string } = {},
): Promise<ApiProposal> {
  const result = await apiPost<ApiProposal>(
    apiRoutes.proposal.publicEvents(enc(token)),
    buildEncryptedRequestBody({ event_type: eventType, metadata, ...extra }),
    { auth: "public" },
  );
  if (!result.success || !result.data) {
    throw new Error(result.message || PORTAL_MESSAGES.eventFailed);
  }
  return result.data;
}

/** Saves the signed PDF to S3 and returns its URL. */
export async function uploadSignedProposalPdf(
  token: string,
  blob: Blob,
  fileName: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", blob, `${fileName || "Proposal"}.pdf`);
  const result = await apiPost<string>(apiRoutes.proposal.publicSignedDocument(enc(token)), form, {
    auth: "public",
  });
  if (!result.success || typeof result.data !== "string" || !result.data) {
    throw new Error(result.message || PORTAL_MESSAGES.uploadFailed);
  }
  return result.data;
}

/**
 * A Stripe Checkout URL, fetched as a plain call (not a navigation to the
 * backend redirect) so the button can show progress and a failure stays on
 * the page as a toast.
 */
export async function fetchProposalStripeCheckout(token: string): Promise<string> {
  const result = await apiGet<{ url?: string }>(apiRoutes.proposal.publicStripePay(enc(token)), {
    auth: "public",
  });
  const url = result.data?.url;
  if (!result.success || !url) {
    throw new Error(result.message || PORTAL_MESSAGES.stripeFailed);
  }
  return url;
}
