import { describe, expect, it } from "vitest";

import {
  buildSocialShareUrl,
  buildSubmission,
  FALLBACK_SHARE_URL,
  FIRM_NAME,
  hasGoogleLink,
  headline,
  normalizePublicSurvey,
  offersSocials,
  parseInitialRating,
  ratingLabel,
  routeForRating,
  type PublicSurvey,
} from "@/lib/public-survey";

describe("normalizePublicSurvey", () => {
  it("reads the feedback, settings and the linked survey's first question", () => {
    const survey = normalizePublicSurvey({
      id: 162,
      reference_name: "Kitchen renovation",
      client_name: "Jane Citizen",
      settings: { is_enabled: true, google_url: "https://g.page/r/x", public_threshold: 5 },
      survey_data: { id: 3, questions_data: [{ text: "How was the install?" }] },
    });
    expect(survey).toMatchObject({
      id: "162",
      referenceName: "Kitchen renovation",
      clientName: "Jane Citizen",
      question: "How was the install?",
    });
    expect(survey.settings).toMatchObject({ googleUrl: "https://g.page/r/x", publicThreshold: 5 });
  });

  it("has no question when no custom survey is linked", () => {
    expect(normalizePublicSurvey({ id: 1, survey_data: null }).question).toBe("");
    expect(normalizePublicSurvey({ id: 1 }).question).toBe("");
  });
});

describe("routing a rating", () => {
  it("sends anything at or above the threshold public, the rest private", () => {
    expect(routeForRating(5, 4)).toBe("public");
    expect(routeForRating(4, 4)).toBe("public");
    expect(routeForRating(3, 4)).toBe("private");
    expect(routeForRating(5, 5)).toBe("public");
    expect(routeForRating(4, 5)).toBe("private");
  });
});

describe("headline", () => {
  const base: PublicSurvey = {
    id: "1",
    referenceName: "BAS — Q3",
    clientName: "",
    settings: {
      raw: {},
      isEnabled: true,
      googleUrl: "",
      shareSocials: true,
      publicThreshold: 4,
      delayHours: 0,
    },
    question: "",
  };

  it("uses the linked survey's question when there is one, else the job name", () => {
    expect(headline(base)).toBe("How was your experience with BAS — Q3?");
    expect(headline({ ...base, question: "Rate your install" })).toBe("Rate your install");
    expect(headline({ ...base, referenceName: "" })).toBe("How was your experience with us?");
  });

  it("reads hasGoogleLink / offersSocials off settings", () => {
    expect(hasGoogleLink(base)).toBe(false);
    expect(hasGoogleLink({ ...base, settings: { ...base.settings, googleUrl: "https://g.page/x" } })).toBe(true);
    expect(offersSocials(base)).toBe(true);
    expect(offersSocials({ ...base, settings: { ...base.settings, shareSocials: false } })).toBe(false);
  });
});

describe("rating labels", () => {
  it("labels 1 through 5 and nothing else", () => {
    expect(ratingLabel(1)).toBe("Poor");
    expect(ratingLabel(5)).toBe("Excellent");
    expect(ratingLabel(0)).toBeNull();
    expect(ratingLabel(6)).toBeNull();
  });
});

describe("social share links", () => {
  it("builds a share URL per platform, falling back to a default message", () => {
    expect(buildSocialShareUrl("x", "")).toContain(encodeURIComponent("Really happy with the service!"));
    expect(buildSocialShareUrl("whatsapp", "Great work!")).toBe(
      "https://wa.me/?text=" + encodeURIComponent("Great work!"),
    );
    expect(buildSocialShareUrl("linkedin", "ignored")).toBe(
      "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(FALLBACK_SHARE_URL),
    );
    expect(buildSocialShareUrl("facebook", "Nice")).toContain(encodeURIComponent(FALLBACK_SHARE_URL));
  });

  it("names the firm in the default share message", () => {
    expect(FIRM_NAME).toBe("Sole Accounting");
  });
});

describe("buildSubmission", () => {
  it("sends feedback_text from the comment, falling back to the category", () => {
    expect(
      buildSubmission({ rating: 2, route: "private", category: "Fees were unclear", comment: "", wantsContact: true }),
    ).toEqual({ star_rating: 2, feedback_text: "Fees were unclear", category: "Fees were unclear", wants_contact: true });

    expect(
      buildSubmission({ rating: 5, route: "public", category: "", comment: "", wantsContact: null }),
    ).toEqual({ star_rating: 5, feedback_text: "", category: "", wants_contact: null });

    expect(
      buildSubmission({ rating: 1, route: "private", category: "Other", comment: "Too slow", wantsContact: false }),
    ).toMatchObject({ feedback_text: "Too slow" });
  });
});

describe("parseInitialRating", () => {
  it("accepts only an integer 1-5, otherwise zero", () => {
    expect(parseInitialRating("5")).toBe(5);
    expect(parseInitialRating("1")).toBe(1);
    expect(parseInitialRating("0")).toBe(0);
    expect(parseInitialRating("6")).toBe(0);
    expect(parseInitialRating("abc")).toBe(0);
    expect(parseInitialRating(undefined)).toBe(0);
    expect(parseInitialRating("3.5")).toBe(0);
  });
});
