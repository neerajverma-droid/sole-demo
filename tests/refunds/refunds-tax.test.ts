/**
 * The GST inside a refund at the business's rate — 10% in Australia (amount ÷ 11,
 * unchanged), 15% in New Zealand and South Africa — and the tax word in the
 * validation copy.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const {
  GST_INCLUSIVE_DIVISOR,
  autoGst,
  emptyRefundDraft,
  inclusiveTaxDivisor,
  refundGstError,
  refundIssues,
} = await import("@/lib/refunds");

describe("autoGst", () => {
  it("defaults to 10%: amount ÷ 11, to the last bit", () => {
    expect(autoGst("450")).toBe("40.91");
    expect(autoGst("110")).toBe("10.00");
    expect(inclusiveTaxDivisor(10)).toBe(GST_INCLUSIVE_DIVISOR);
    for (const amount of ["0.55", "123.45", "999999.99"]) {
      expect(autoGst(amount)).toBe((Number(amount) / 11).toFixed(2));
      expect(autoGst(amount, 10)).toBe(autoGst(amount));
    }
  });

  it("takes 15% out of a 15%-inclusive amount", () => {
    expect(autoGst("115", 15)).toBe("15.00");
    expect(autoGst("450", 15)).toBe("58.70");
  });

  it("leaves the figure blank when there's nothing to take out", () => {
    expect(autoGst("", 15)).toBe("");
    expect(autoGst("100", 0)).toBe("");
  });
});

describe("refund validation copy", () => {
  it("says GST by default and the country's word when given one", () => {
    expect(refundGstError("abc")).toBe(
      "Enter a valid GST amount — no letters or negatives.",
    );
    expect(refundGstError("abc", "VAT")).toBe(
      "Enter a valid VAT amount — no letters or negatives.",
    );

    const draft = {
      ...emptyRefundDraft("CRN-1", "2026-10-01"),
      amount: "100",
      gstAmount: "200",
    };
    const gstIssue = (word?: string) =>
      refundIssues(draft, word).find((issue) => issue.key === "gstAmount")
        ?.message;
    expect(gstIssue()).toBe("GST can't be more than the refund itself.");
    expect(gstIssue("VAT")).toBe("VAT can't be more than the refund itself.");
  });
});
