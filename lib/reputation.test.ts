import { describe, expect, it } from "vitest";

import {
  buildSettingsPayload,
  buildSurveyPayload,
  canResend,
  duplicateSurveyPayload,
  feedbackFilterCounts,
  feedbackReferenceLabel,
  feedbackScore,
  feedbackSegment,
  feedbackStatus,
  htmlHasText,
  initialsOf,
  isReferenceNpsCompleted,
  issueCategory,
  matchesFeedbackFilter,
  matchesRequestFilter,
  needsFollowUp,
  normalizeFeedback,
  normalizeGoogleUrl,
  normalizeOverview,
  normalizeSettings,
  normalizeSurvey,
  npsBand,
  percentOf,
  requestSentDate,
  requestStatus,
  settingsDraft,
  surveyRequestMessage,
  wantsCallback,
} from "@/lib/reputation";

const feedback = (overrides: Record<string, unknown> = {}) =>
  normalizeFeedback({ id: 1, client_name: "Jane Citizen", status: "sent", ...overrides });

describe("normalising service rows", () => {
  it("reads the overview figures, defaulting anything missing or non-numeric to zero", () => {
    expect(
      normalizeOverview({ npsScore: -33.4, totalResponses: 3, totalSent: "4", averageStarRating: "3.0", promoters: null }),
    ).toEqual({
      npsScore: -33,
      totalResponses: 3,
      totalSent: 4,
      promoters: 0,
      passives: 0,
      detractors: 0,
      averageStarRating: 3,
      publicReviewClicks: 0,
      promptedForPublicReview: 0,
    });
    expect(normalizeOverview(undefined).npsScore).toBe(0);
  });

  it("maps a feedback row's snake_case fields and treats a zero rating as unrated", () => {
    const row = normalizeFeedback({
      id: 9,
      client_id: 12,
      client_name: " Jane ",
      client_email: "jane@example.com",
      reference_id: 77,
      star_rating: 0,
      status: "SENT",
      is_closed: 0,
      is_public_review_clicked: "true",
      wants_contact: null,
      createdAt: "2026-08-15T00:00:00Z",
    });
    expect(row).toMatchObject({
      id: "9",
      clientId: "12",
      clientName: "Jane",
      referenceId: "77",
      starRating: null,
      status: "sent",
      recoveryStatus: "none",
      isClosed: false,
      isPublicReviewClicked: true,
      wantsContact: null,
      createdAt: "2026-08-15T00:00:00Z",
    });
  });

  it("reads a survey's first question and collapses any non-active status to draft", () => {
    const survey = normalizeSurvey({
      id: 3,
      name: "End of job",
      status: "inactive",
      questions_data: [{ text: "How was it?", answerType: "Star rating", block_id: "0" }],
    });
    expect(survey).toMatchObject({ id: "3", status: "draft", question: "How was it?" });
    expect(survey.questions[0]).toMatchObject({ block_id: "0" });
    expect(normalizeSurvey({ id: 4, status: "active" })).toMatchObject({ status: "active", question: "", questions: [] });
  });

  it("defaults settings the way the old screen did and clamps the threshold to 4 or 5", () => {
    const settings = normalizeSettings({ google_url: "null", public_threshold: 3, delay_hours: 24 });
    expect(settings).toMatchObject({
      isEnabled: true,
      googleUrl: "",
      shareSocials: true,
      publicThreshold: 4,
      delayHours: 24,
    });
    expect(normalizeSettings({ public_threshold: 5, is_enabled: false }).publicThreshold).toBe(5);
    expect(normalizeSettings({ is_enabled: false }).isEnabled).toBe(false);
  });
});

describe("settings payload", () => {
  it("keeps the service's other fields and overrides only what the tab edits", () => {
    const settings = normalizeSettings({ id: 1, send_reminder: true, delay_hours: 0, google_url: "" });
    const draft = { ...settingsDraft(settings), delayHours: 48, publicThreshold: 5 as const };
    expect(buildSettingsPayload(settings, draft, "https://g.page/r/x/review")).toEqual({
      id: 1,
      send_reminder: true,
      delay_hours: 48,
      google_url: "https://g.page/r/x/review",
      is_enabled: true,
      share_socials: true,
      public_threshold: 5,
    });
  });

  it("adds https to a bare Google link and rejects one that isn't a URL", () => {
    expect(normalizeGoogleUrl("")).toEqual({ ok: true, value: "" });
    expect(normalizeGoogleUrl("g.page/r/abc/review")).toEqual({ ok: true, value: "https://g.page/r/abc/review" });
    expect(normalizeGoogleUrl("http://example.com")).toEqual({ ok: true, value: "http://example.com" });
    expect(normalizeGoogleUrl("not a link")).toEqual({ ok: false });
    expect(normalizeGoogleUrl("localhost")).toEqual({ ok: false });
  });
});

describe("survey payloads", () => {
  it("sends one star-rating question, trimmed, with the chosen status", () => {
    expect(buildSurveyPayload({ name: " Std ", description: " After jobs ", question: " How was it? " }, "draft")).toEqual({
      name: "Std",
      description: "After jobs",
      questions_data: [{ text: "How was it?", answerType: "Star rating" }],
      status: "draft",
    });
  });

  it("keeps the existing question's other fields when editing", () => {
    const existing = normalizeSurvey({ id: 1, questions_data: [{ text: "Old", answerType: "Star rating", block_id: "0" }] });
    expect(buildSurveyPayload({ name: "A", description: "", question: "New" }, "active", existing).questions_data).toEqual([
      { text: "New", answerType: "Star rating", block_id: "0" },
    ]);
  });

  it("duplicates as a draft copy", () => {
    const survey = normalizeSurvey({ id: 1, name: "Std", status: "active", questions_data: [{ text: "Q" }] });
    expect(duplicateSurveyPayload(survey)).toMatchObject({ name: "Std (Copy)", status: "draft", description: null });
  });
});

describe("NPS bands and segments", () => {
  it("bands the score", () => {
    expect(npsBand(-100).label).toBe("Needs improvement");
    expect(npsBand(0).label).toBe("Fair");
    expect(npsBand(29).label).toBe("Fair");
    expect(npsBand(30).label).toBe("Good");
    expect(npsBand(70).label).toBe("Excellent");
  });

  it("segments by star rating and leaves unrated requests out of every segment", () => {
    expect(feedbackSegment(feedback({ star_rating: 5 }))).toBe("promoter");
    expect(feedbackSegment(feedback({ star_rating: 4 }))).toBe("passive");
    expect(feedbackSegment(feedback({ star_rating: 1 }))).toBe("detractor");
    expect(feedbackSegment(feedback())).toBeNull();
  });

  it("counts filters without putting unrated rows under Detractors", () => {
    const rows = [feedback({ star_rating: 5 }), feedback({ star_rating: 3 }), feedback()];
    expect(feedbackFilterCounts(rows)).toEqual({ All: 3, Promoters: 1, Passives: 0, Detractors: 1 });
    expect(matchesFeedbackFilter(rows[2], "All")).toBe(true);
    expect(matchesFeedbackFilter(rows[2], "Detractors")).toBe(false);
  });

  it("needs a follow-up only for an open low rating", () => {
    expect(needsFollowUp(feedback({ star_rating: 2 }))).toBe(true);
    expect(needsFollowUp(feedback({ star_rating: 2, is_closed: true }))).toBe(false);
    expect(needsFollowUp(feedback({ star_rating: 4 }))).toBe(false);
    expect(needsFollowUp(feedback())).toBe(false);
  });

  it("guards percentages against an empty base", () => {
    expect(percentOf(1, 0)).toBe(0);
    expect(percentOf(1, 4)).toBe(25);
  });
});

describe("status and score pills", () => {
  it("labels feedback in the old screen's priority order", () => {
    expect(feedbackStatus(feedback({ star_rating: 2, is_closed: true })).label).toBe("Closed");
    expect(feedbackStatus(feedback({ star_rating: 2, recovery_status: "started" })).label).toBe("Recovery started");
    expect(feedbackStatus(feedback({ star_rating: 5, is_public_review_clicked: true })).label).toBe("Google review clicked");
    expect(feedbackStatus(feedback({ star_rating: 3 })).label).toBe("Follow up required");
    expect(feedbackStatus(feedback({ star_rating: 4 })).label).toBe("Feedback received");
    expect(feedbackStatus(feedback()).label).toBe("Sent");
    expect(feedbackStatus(feedback({ status: "scheduled" })).label).toBe("Pending");
  });

  it("scores a rating out of 100, preferring the service's own total", () => {
    expect(feedbackScore(feedback({ star_rating: 3, total_score: 60 }))?.label).toBe("60 · Average");
    expect(feedbackScore(feedback({ star_rating: 1 }))?.label).toBe("20 · Service risk");
    expect(feedbackScore(feedback())).toBeNull();
  });

  it("labels requests and decides which can be resent", () => {
    expect(requestStatus(feedback({ status: "service_risk", star_rating: 1 })).label).toBe("Service risk");
    expect(requestStatus(feedback({ star_rating: 4 })).label).toBe("Rated · 4★");
    expect(requestStatus(feedback({ status: "pending" })).label).toBe("Pending send");
    expect(requestStatus(feedback()).label).toBe("Awaiting response");
    expect(canResend(feedback())).toBe(true);
    expect(canResend(feedback({ status: "scheduled" }))).toBe(true);
    expect(canResend(feedback({ star_rating: 4 }))).toBe(false);
    expect(canResend(feedback({ status: "good" }))).toBe(false);
    expect(canResend(feedback({ is_closed: true }))).toBe(false);
  });

  it("filters requests by status", () => {
    expect(matchesRequestFilter(feedback(), "Awaiting response")).toBe(true);
    expect(matchesRequestFilter(feedback({ status: "needs_attention", star_rating: 2 }), "Follow up required")).toBe(true);
    expect(matchesRequestFilter(feedback({ status: "needs_attention", star_rating: 2 }), "Rated")).toBe(false);
    expect(matchesRequestFilter(feedback({ status: "pending" }), "Scheduled")).toBe(true);
    expect(matchesRequestFilter(feedback({ is_public_review_clicked: 1 }), "Google review clicked")).toBe(true);
  });
});

describe("labels and messages", () => {
  it("falls back through reference name, id and manual flag", () => {
    expect(feedbackReferenceLabel(feedback({ reference_name: "BAS Q3" }))).toBe("BAS Q3");
    expect(feedbackReferenceLabel(feedback({ reference_id: 5 }))).toBe("Ref #5");
    expect(feedbackReferenceLabel(feedback({ is_manual: true }))).toBe("Manual request");
    expect(feedbackReferenceLabel(feedback())).toBe("Direct request");
  });

  it("formats the sent date, preferring the last send", () => {
    expect(requestSentDate(feedback({ last_sent_at: "2026-08-15T10:00:00Z", createdAt: "2026-01-01" }))).toBe("15 Aug 2026");
    expect(requestSentDate(feedback())).toBe("—");
  });

  it("escapes the client's name in the default email", () => {
    expect(surveyRequestMessage("<b>Bob</b> Smith")).toContain("Hi &lt;b&gt;Bob&lt;/b&gt;,");
    expect(surveyRequestMessage()).toContain("Hi there,");
  });

  it("detects an empty editor", () => {
    expect(htmlHasText("<p><br></p>")).toBe(false);
    expect(htmlHasText("<p>&nbsp;</p>")).toBe(false);
    expect(htmlHasText("<p>Hi</p>")).toBe(true);
  });

  it("builds initials", () => {
    expect(initialsOf("Harper & Co")).toBe("HC");
    expect(initialsOf("abc")).toBe("A");
    expect(initialsOf("")).toBe("C");
  });

  it("reads callback and category from the breakdown before the flat fields", () => {
    const row = feedback({
      wants_contact: false,
      category: "",
      score_breakdown: [
        { label: "Callback Requested", valueText: "Yes" },
        { label: "Issue Category", valueText: "Slow replies" },
      ],
    });
    expect(wantsCallback(row)).toBe(true);
    expect(issueCategory(row)).toBe("Slow replies");
    expect(wantsCallback(feedback({ wants_contact: false }))).toBe(false);
  });
});

describe("isReferenceNpsCompleted", () => {
  const completed = { ids: new Set(["42"]), names: new Set(["INV-7"]) };

  it("matches by id or by name, case- and space-insensitively", () => {
    expect(isReferenceNpsCompleted(completed, 42, "Anything")).toBe(true);
    expect(isReferenceNpsCompleted(completed, "42", "Anything")).toBe(true);
    expect(isReferenceNpsCompleted(completed, 99, " inv-7 ")).toBe(true);
    expect(isReferenceNpsCompleted(completed, 99, "INV-8")).toBe(false);
  });

  it("is false with nothing to check against", () => {
    expect(isReferenceNpsCompleted(undefined, 42, "INV-7")).toBe(false);
    expect(isReferenceNpsCompleted(completed, null, "INV-8")).toBe(false);
  });
});
