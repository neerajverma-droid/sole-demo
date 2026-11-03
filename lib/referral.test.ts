import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  REFERRAL_STATUS_COPY,
  fetchReferralInvites,
  referralEmailIssue,
  sendReferralInvite,
} from "@/lib/referral";

/**
 * Refer & Earn's two real seams: reading the invite list back exactly as the
 * server derived it, and turning `sendInvite`'s two bare error codes
 * (`already_have_account`, `already_sent`) into something that reads as a
 * sentence rather than a slug.
 */

const get = vi.fn();
const post = vi.fn();

vi.mock("@/utils/axiosInstance", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("referralEmailIssue", () => {
  it("asks for an address when the box is empty", () => {
    expect(referralEmailIssue("")).toBe("Enter the email address to invite.");
    expect(referralEmailIssue("   ")).toBe(
      "Enter the email address to invite.",
    );
  });

  it("rejects something that isn't shaped like an email", () => {
    expect(referralEmailIssue("not-an-email")).toBe(
      "Enter a valid email address.",
    );
  });

  it("accepts a well-formed address", () => {
    expect(referralEmailIssue("friend@business.com.au")).toBeUndefined();
  });
});

describe("fetchReferralInvites", () => {
  it("maps the server's rows, status and amount included", async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invites: [
            {
              invite_id: 1,
              invite_email: "a@b.com",
              invitation_send_date: "01/02/2026",
              referral_amount: "50.00",
              status: "SUCCESS",
            },
            {
              invite_id: 2,
              invite_email: "c@d.com",
              invitation_send_date: "03/04/2026",
              referral_amount: 0,
              status: "PENDING",
            },
          ],
        },
      },
    });

    const invites = await fetchReferralInvites();

    expect(invites).toEqual([
      {
        id: 1,
        email: "a@b.com",
        status: "SUCCESS",
        invitedOn: "01/02/2026",
        creditedOn: "",
        amount: 50,
      },
      {
        id: 2,
        email: "c@d.com",
        status: "PENDING",
        invitedOn: "03/04/2026",
        creditedOn: "",
        amount: 0,
      },
    ]);
  });

  it("returns an empty list rather than throwing on no invites", async () => {
    get.mockResolvedValue({ data: { success: true, data: { invites: [] } } });

    await expect(fetchReferralInvites()).resolves.toEqual([]);
  });

  it("falls back to PENDING for a status the client doesn't recognise", async () => {
    // Storage/API outlives the client — a status this build has never heard of
    // should read as "nothing has happened yet" rather than crash the screen.
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invites: [
            { invite_id: 1, invite_email: "a@b.com", status: "SOMETHING_NEW" },
          ],
        },
      },
    });

    const [invite] = await fetchReferralInvites();
    expect(invite.status).toBe("PENDING");
  });
});

describe("sendReferralInvite", () => {
  it("resolves quietly on success", async () => {
    post.mockResolvedValue({ data: { success: true } });

    await expect(sendReferralInvite("a@b.com")).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith(expect.any(String), { email: "a@b.com" });
  });

  it("trims the address before sending it", async () => {
    post.mockResolvedValue({ data: { success: true } });

    await sendReferralInvite("  a@b.com  ");
    expect(post).toHaveBeenCalledWith(expect.any(String), { email: "a@b.com" });
  });

  it("translates 'already_have_account' into a sentence", async () => {
    post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "already_have_account" } },
    });

    await expect(sendReferralInvite("a@b.com")).rejects.toThrow(
      "That address already has a Sole account.",
    );
  });

  it("translates 'already_sent' into a sentence", async () => {
    post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "already_sent" } },
    });

    await expect(sendReferralInvite("a@b.com")).rejects.toThrow(
      "You've already invited that address.",
    );
  });

  it("passes a real server message straight through unmapped", async () => {
    post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "The email field is required." } },
    });

    await expect(sendReferralInvite("a@b.com")).rejects.toThrow(
      "The email field is required.",
    );
  });

  it("falls back to a generic message when nothing comes back", async () => {
    post.mockRejectedValue(new Error());

    await expect(sendReferralInvite("a@b.com")).rejects.toThrow(
      "Couldn't send that invite.",
    );
  });
});

describe("REFERRAL_STATUS_COPY", () => {
  it("has an entry for every status the server can send", () => {
    for (const status of [
      "PENDING",
      "REGISTERED",
      "SUBSCRIBED",
      "SUCCESS",
    ] as const) {
      expect(REFERRAL_STATUS_COPY[status].label).toBeTruthy();
    }
  });

  it("only SUCCESS reads as credited", () => {
    expect(REFERRAL_STATUS_COPY.SUCCESS.tone).toBe("success");
    expect(REFERRAL_STATUS_COPY.PENDING.tone).not.toBe("success");
  });
});
