import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const clientMock = {
  apiGet: vi.fn(),
  apiPost: vi.fn(),
};

vi.mock("@/lib/api/client", () => clientMock);

const {
  DECLINE_REASONS,
  PORTAL_MESSAGES,
  declineIssue,
  fetchProposalStripeCheckout,
  fetchPublicProposal,
  portalViewState,
  postPublicProposalEvent,
  signatureIssue,
  uploadSignedProposalPdf,
} = await import("@/lib/proposal-portal");

const TOKEN = "c284b332bbcc";

beforeEach(() => {
  clientMock.apiGet.mockReset();
  clientMock.apiPost.mockReset();
});

describe("portalViewState", () => {
  it.each([
    ["accepted", "accepted"],
    ["ACCEPTED", "accepted"],
    ["rejected", "rejected"],
    ["lost", "rejected"],
    ["expired", "expired"],
    ["sent", "pending"],
    ["viewed", "pending"],
    ["draft", "pending"],
    [null, "pending"],
  ])("%s → %s", (status, expected) => {
    expect(portalViewState(status)).toBe(expected);
  });
});

describe("signatureIssue", () => {
  it("needs a name of letters and spaces", () => {
    expect(signatureIssue("", true, true)).toMatch(/full legal name/);
    expect(signatureIssue("   ", true, true)).toMatch(/full legal name/);
    expect(signatureIssue("Jane 2nd", true, true)).toMatch(/letters only/);
  });

  it("needs both agreements, terms first", () => {
    expect(signatureIssue("Jane Client", false, false)).toMatch(/Terms & Conditions/);
    expect(signatureIssue("Jane Client", true, false)).toMatch(/electronically/);
  });

  it("passes a valid signature", () => {
    expect(signatureIssue("  Jane Client ", true, true)).toBeNull();
  });
});

describe("declineIssue", () => {
  it("needs a reason, and a note for Other", () => {
    expect(declineIssue("", "")).toMatch(/choose a reason/);
    expect(declineIssue("Other", "  ")).toMatch(/short reason/);
    expect(declineIssue("Other", "Went in-house")).toBeNull();
    expect(declineIssue("Pricing", "")).toBeNull();
  });

  it("offers the same reasons as sole-webapp", () => {
    expect(DECLINE_REASONS).toEqual([
      "Pricing",
      "Timing isn't right",
      "Scope doesn't fit",
      "Chose another provider",
      "Other",
    ]);
  });
});

describe("fetchPublicProposal", () => {
  it("reads the proposal by token, without a session", async () => {
    clientMock.apiGet.mockResolvedValue({ success: true, data: { id: 6, status: "sent" } });

    await expect(fetchPublicProposal(TOKEN)).resolves.toEqual({ id: 6, status: "sent" });
    expect(clientMock.apiGet).toHaveBeenCalledWith(apiRoutes.proposal.publicInfo(TOKEN), { auth: "public" });
  });

  it("encodes the token into the path", async () => {
    clientMock.apiGet.mockResolvedValue({ success: true, data: { id: 6 } });

    await fetchPublicProposal("a/b?c");
    expect(clientMock.apiGet.mock.calls[0][0]).toBe(apiRoutes.proposal.publicInfo("a%2Fb%3Fc"));
  });

  it("surfaces the server's message, else a friendly one", async () => {
    clientMock.apiGet.mockResolvedValue({ success: false, message: "Proposal link has expired" });
    await expect(fetchPublicProposal(TOKEN)).rejects.toThrow("Proposal link has expired");

    clientMock.apiGet.mockResolvedValue({ success: false });
    await expect(fetchPublicProposal(TOKEN)).rejects.toThrow(PORTAL_MESSAGES.loadFailed);
  });
});

describe("postPublicProposalEvent", () => {
  it("sends an accept encrypted, with the signature and signed PDF", async () => {
    clientMock.apiPost.mockResolvedValue({ success: true, data: { id: 6, status: "accepted" } });

    const updated = await postPublicProposalEvent(TOKEN, "accepted", {}, {
      signature_name: "Jane Client",
      signed_pdf_url: "https://s3/signed.pdf",
    });

    expect(updated.status).toBe("accepted");
    const [path, body, options] = clientMock.apiPost.mock.calls[0];
    expect(path).toBe(apiRoutes.proposal.publicEvents(TOKEN));
    expect(options).toEqual({ auth: "public" });
    expect(typeof body.data).toBe("string");
    expect(decryptPayload(body.data)).toEqual({
      event_type: "accepted",
      metadata: {},
      signature_name: "Jane Client",
      signed_pdf_url: "https://s3/signed.pdf",
    });
  });

  it("sends a decline with its reason", async () => {
    clientMock.apiPost.mockResolvedValue({ success: true, data: { id: 6, status: "rejected" } });

    await postPublicProposalEvent(TOKEN, "rejected", { reason_category: "Pricing", reason_text: "Too high" });
    expect(decryptPayload(clientMock.apiPost.mock.calls[0][1].data)).toEqual({
      event_type: "rejected",
      metadata: { reason_category: "Pricing", reason_text: "Too high" },
    });
  });

  it("fails when the server refuses", async () => {
    clientMock.apiPost.mockResolvedValue({ success: false, message: "Invalid client event" });
    await expect(postPublicProposalEvent(TOKEN, "viewed")).rejects.toThrow("Invalid client event");
  });
});

describe("uploadSignedProposalPdf", () => {
  it("uploads the PDF as a file and returns its URL", async () => {
    clientMock.apiPost.mockResolvedValue({ success: true, data: "https://s3/signed.pdf" });
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });

    await expect(uploadSignedProposalPdf(TOKEN, blob, "Website build")).resolves.toBe("https://s3/signed.pdf");

    const [path, form, options] = clientMock.apiPost.mock.calls[0];
    expect(path).toBe(apiRoutes.proposal.publicSignedDocument(TOKEN));
    expect(options).toEqual({ auth: "public" });
    expect(form).toBeInstanceOf(FormData);
    const file = (form as FormData).get("file") as File;
    expect(file.name).toBe("Website build.pdf");
    expect(file.type).toBe("application/pdf");
  });

  it("fails when no URL comes back", async () => {
    clientMock.apiPost.mockResolvedValue({ success: true, data: "" });
    await expect(uploadSignedProposalPdf(TOKEN, new Blob([]), "x")).rejects.toThrow(PORTAL_MESSAGES.uploadFailed);
  });
});

describe("fetchProposalStripeCheckout", () => {
  it("returns the checkout URL", async () => {
    clientMock.apiGet.mockResolvedValue({ success: true, data: { url: "https://checkout.stripe.com/c/pay/cs_test" } });

    await expect(fetchProposalStripeCheckout(TOKEN)).resolves.toBe("https://checkout.stripe.com/c/pay/cs_test");
    expect(clientMock.apiGet).toHaveBeenCalledWith(apiRoutes.proposal.publicStripePay(TOKEN), { auth: "public" });
  });

  it("surfaces Stripe not being ready", async () => {
    clientMock.apiGet.mockResolvedValue({ success: false, message: "Stripe account is not ready" });
    await expect(fetchProposalStripeCheckout(TOKEN)).rejects.toThrow("Stripe account is not ready");
  });
});
