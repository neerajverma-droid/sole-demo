import { describe, expect, it } from "vitest";

import referralSourceOptions, {
  REFERRAL_SOURCE_OTHER,
} from "@/lib/onboarding-survey/referral-sources";

describe("referralSourceOptions", () => {
  it("matches source's exact list, in source's order", () => {
    expect(referralSourceOptions).toEqual([
      "Google Search",
      "Instagram",
      "Facebook",
      "TikTok",
      "YouTube",
      "LinkedIn",
      "Reddit",
      "X",
      "ChatGPT",
      "Claude",
      "Gemini",
      "Grok",
      "Copilot",
      "iOS App Store",
      "Play store",
      "Friend or word of mouth",
      "My accountant",
      "Podcast or radio",
      "Blog or article",
      "Other",
    ]);
  });

  it("ends with REFERRAL_SOURCE_OTHER, not a second hard-coded 'Other'", () => {
    expect(referralSourceOptions.at(-1)).toBe(REFERRAL_SOURCE_OTHER);
  });

  it("REFERRAL_SOURCE_OTHER is 'Other'", () => {
    expect(REFERRAL_SOURCE_OTHER).toBe("Other");
  });

  it("has no duplicate options", () => {
    expect(new Set(referralSourceOptions).size).toBe(
      referralSourceOptions.length,
    );
  });
});
