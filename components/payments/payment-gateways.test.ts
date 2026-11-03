import { describe, expect, it } from "vitest";

import {
  calcStripeProgress,
  normaliseSolePayStatus,
  type SolePayMerchant,
  type StripeAccount,
} from "@/components/payments/payment-gateways";

describe("calcStripeProgress — the Stripe gateway card's progress bar", () => {
  it("is 0 before any Stripe account exists", () => {
    expect(calcStripeProgress(null)).toBe(0);
    expect(calcStripeProgress({})).toBe(0);
  });

  it("is 100 once Stripe reports onboarding_complete, regardless of the sub-flags", () => {
    const account: StripeAccount = {
      stripe_account_id: "acct_1",
      onboarding_complete: true,
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
    };
    expect(calcStripeProgress(account)).toBe(100);
  });

  it("is the share of the three sub-steps done, once an account id exists but onboarding isn't complete", () => {
    expect(
      calcStripeProgress({
        stripe_account_id: "acct_1",
        details_submitted: true,
        charges_enabled: false,
        payouts_enabled: false,
      }),
    ).toBe(33);

    expect(
      calcStripeProgress({
        stripe_account_id: "acct_1",
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: false,
      }),
    ).toBe(67);

    expect(
      calcStripeProgress({
        stripe_account_id: "acct_1",
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
      }),
    ).toBe(0);
  });
});

describe("normaliseSolePayStatus — the SolePay gateway card's status derivation", () => {
  it("is 'not-started' with no merchant record at all", () => {
    expect(normaliseSolePayStatus(null)).toEqual({
      status: "not-started",
      action: "Create New Account",
      completion: 0,
    });
  });

  it("is only 'connected' for a real approval string — completed, complete, approved, active", () => {
    expect(normaliseSolePayStatus({ merchant_status: "completed" }).status).toBe("connected");
    expect(normaliseSolePayStatus({ merchant_status: "complete" }).status).toBe("connected");
    expect(normaliseSolePayStatus({ application_status: "approved" }).status).toBe("connected");
    expect(normaliseSolePayStatus({ application_status: "active" }).status).toBe("connected");
  });

  it("reads merchant_status ahead of application_status when both are present", () => {
    const result = normaliseSolePayStatus({
      merchant_status: "completed",
      application_status: "pending",
    });
    expect(result.status).toBe("connected");
  });

  it("is case-insensitive on the status string", () => {
    expect(normaliseSolePayStatus({ merchant_status: "COMPLETED" }).status).toBe("connected");
  });

  /*
   * `is_complete` / `action: "complete"` mean the draft was SENT to Worldpay,
   * not that Worldpay approved it — the bug this card used to have was
   * treating "submitted" as "connected", which told a merchant they could
   * take SolePay payments while the application was still Pending, Data
   * Required, or Escalated to Risk on Worldpay's side.
   */
  it("is 'pending', not 'connected', when only is_complete is true and no approval string is present", () => {
    const merchant: SolePayMerchant = { is_complete: true };
    const result = normaliseSolePayStatus(merchant);
    expect(result.status).toBe("pending");
    expect(result.action).toBe("View application");
    expect(result.completion).toBe(100);
    expect(result.statusNote).toBe("Pending review");
  });

  it("is 'pending', not 'connected', when only action is 'complete'", () => {
    const result = normaliseSolePayStatus({ action: "complete" });
    expect(result.status).toBe("pending");
    expect(result.statusNote).toBe("Pending review");
  });

  it("surfaces the raw Worldpay status once submitted — e.g. a plain 'Pending'", () => {
    const result = normaliseSolePayStatus({ is_complete: true, application_status: "Pending" });
    expect(result.status).toBe("pending");
    expect(result.statusNote).toBe("Pending");
  });

  it("is 'onboarding' with an 'Update application' action when Worldpay asks for Data Required", () => {
    const result = normaliseSolePayStatus({
      is_complete: true,
      application_status: "Data Required",
    });
    expect(result.status).toBe("onboarding");
    expect(result.action).toBe("Update application");
    expect(result.completion).toBe(90);
    expect(result.statusNote).toBe("Data Required");
  });

  it("groups Escalated to Risk with 'pending' — under review, nothing for the merchant to fix yet", () => {
    const result = normaliseSolePayStatus({
      is_complete: true,
      application_status: "Escalated to Risk",
    });
    expect(result.status).toBe("pending");
    expect(result.statusNote).toBe("Escalated to Risk");
  });

  it("is a plain draft — 'onboarding', 30%, no status note — once a merchant record exists but was never submitted", () => {
    const result = normaliseSolePayStatus({ merchant_status: "pending" });
    expect(result).toEqual({
      status: "onboarding",
      action: "Continue Application",
      completion: 30,
    });
  });
});
