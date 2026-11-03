import { describe, expect, it } from "vitest";

import {
  REFERRAL_DELAY_MS,
  referralDelayElapsed,
  referralPromptReady,
  referralRemainingMs,
  wantedSurveySteps,
} from "@/lib/onboarding-survey/steps";

describe("wantedSurveySteps", () => {
  it("asks nothing for an account with every answer already on file", () => {
    expect(
      wantedSurveySteps({
        hasIndustry: true,
        hasJoinFrom: true,
        pinsEmpty: false,
        pinsSuggestedOnce: true,
      }),
    ).toEqual([]);
  });

  it("asks industry, then first_action, for a brand-new account", () => {
    const steps = wantedSurveySteps({
      hasIndustry: false,
      hasJoinFrom: false,
      pinsEmpty: true,
      pinsSuggestedOnce: false,
    });
    expect(steps).toEqual(["industry", "join_from", "pins", "first_action"]);
  });

  it("only asks join_from for an account with an industry but no join_from", () => {
    expect(
      wantedSurveySteps({
        hasIndustry: true,
        hasJoinFrom: false,
        pinsEmpty: false,
        pinsSuggestedOnce: true,
      }),
    ).toEqual(["join_from"]);
  });

  it("never offers first_action unless industry was asked THIS run", () => {
    // Missing join_from and empty pins, but industry is already on file —
    // first_action must not ride along.
    const steps = wantedSurveySteps({
      hasIndustry: true,
      hasJoinFrom: false,
      pinsEmpty: true,
      pinsSuggestedOnce: false,
    });
    expect(steps).not.toContain("first_action");
    expect(steps).toEqual(["join_from", "pins"]);
  });

  it("doesn't offer pins again once a starter set has been suggested, even if empty", () => {
    expect(
      wantedSurveySteps({
        hasIndustry: true,
        hasJoinFrom: true,
        pinsEmpty: true,
        pinsSuggestedOnce: true,
      }),
    ).toEqual([]);
  });

  it("does offer pins when empty and never suggested, even with everything else on file", () => {
    expect(
      wantedSurveySteps({
        hasIndustry: true,
        hasJoinFrom: true,
        pinsEmpty: true,
        pinsSuggestedOnce: false,
      }),
    ).toEqual(["pins"]);
  });
});

describe("referral timer", () => {
  const START = "2024-01-01T00:00:00.000Z";
  const startMs = new Date(START).getTime();

  it("has the full delay remaining before the timer has started", () => {
    expect(referralRemainingMs({ startedAt: null })).toBe(REFERRAL_DELAY_MS);
    expect(referralDelayElapsed({ startedAt: null })).toBe(false);
  });

  it("counts down as time passes", () => {
    const halfway = startMs + REFERRAL_DELAY_MS / 2;
    expect(
      referralRemainingMs({ startedAt: START, now: halfway }),
    ).toBe(REFERRAL_DELAY_MS / 2);
    expect(referralDelayElapsed({ startedAt: START, now: halfway })).toBe(
      false,
    );
  });

  it("floors at zero rather than going negative", () => {
    const wayPast = startMs + REFERRAL_DELAY_MS * 10;
    expect(referralRemainingMs({ startedAt: START, now: wayPast })).toBe(0);
    expect(referralDelayElapsed({ startedAt: START, now: wayPast })).toBe(
      true,
    );
  });

  it("is exactly elapsed at the boundary", () => {
    const exact = startMs + REFERRAL_DELAY_MS;
    expect(referralRemainingMs({ startedAt: START, now: exact })).toBe(0);
    expect(referralDelayElapsed({ startedAt: START, now: exact })).toBe(true);
  });
});

describe("referralPromptReady", () => {
  const READY_TIMER = {
    startedAt: "2024-01-01T00:00:00.000Z",
    now: new Date("2024-01-01T00:00:00.000Z").getTime() + REFERRAL_DELAY_MS,
  };
  const NOT_YET_TIMER = {
    startedAt: "2024-01-01T00:00:00.000Z",
    now: new Date("2024-01-01T00:00:00.000Z").getTime(),
  };

  it("is ready when every guard passes and the delay has elapsed", () => {
    expect(
      referralPromptReady({
        shouldPrompt: true,
        shown: false,
        mandatoryPopupOpen: false,
        timer: READY_TIMER,
      }),
    ).toBe(true);
  });

  it("is not ready before the delay has elapsed", () => {
    expect(
      referralPromptReady({
        shouldPrompt: true,
        shown: false,
        mandatoryPopupOpen: false,
        timer: NOT_YET_TIMER,
      }),
    ).toBe(false);
  });

  it("is not ready when the server says nothing is owed", () => {
    expect(
      referralPromptReady({
        shouldPrompt: false,
        shown: false,
        mandatoryPopupOpen: false,
        timer: READY_TIMER,
      }),
    ).toBe(false);
  });

  it("is not ready once already shown this session", () => {
    expect(
      referralPromptReady({
        shouldPrompt: true,
        shown: true,
        mandatoryPopupOpen: false,
        timer: READY_TIMER,
      }),
    ).toBe(false);
  });

  it("doesn't interrupt the mandatory popup while it's open", () => {
    expect(
      referralPromptReady({
        shouldPrompt: true,
        shown: false,
        mandatoryPopupOpen: true,
        timer: READY_TIMER,
      }),
    ).toBe(false);
  });
});
