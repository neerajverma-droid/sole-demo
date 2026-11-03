import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adapter = vi.fn<AxiosAdapter>();
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    default: { ...actual.default, create: () => actual.default.create({ adapter }) },
  };
});

const api = await import("@/lib/public-survey-api");

const reply = (data: unknown, status = 200) =>
  adapter.mockImplementationOnce(async (config: InternalAxiosRequestConfig) => {
    const response = { data, status, statusText: "", headers: {}, config };
    if (status >= 400) {
      const { AxiosError } = await import("axios");
      throw new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, null, response);
    }
    return response;
  });

const lastRequest = () => adapter.mock.calls.at(-1)?.[0] as InternalAxiosRequestConfig;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_REPUTATION_API_URL", "https://nps.example/api/v1");
});

afterEach(() => {
  adapter.mockReset();
  vi.unstubAllEnvs();
});

describe("fetchPublicSurvey", () => {
  it("GETs the token with no auth header and normalizes the result", async () => {
    reply({
      success: true,
      data: { id: 1, reference_name: "Kitchen job", settings: { google_url: "" } },
    });

    const survey = await api.fetchPublicSurvey("abc-token");

    const request = lastRequest();
    expect(request.url).toBe("/survey/abc-token");
    expect(request.headers.Authorization).toBeUndefined();
    expect(survey).toMatchObject({ id: "1", referenceName: "Kitchen job" });
  });

  it("raises SurveyAlreadySubmittedError on an already-answered link", async () => {
    reply({ success: false, message: "Feedback has already been submitted for this request", already_submitted: true }, 400);

    await expect(api.fetchPublicSurvey("x")).rejects.toBeInstanceOf((await import("@/lib/public-survey")).SurveyAlreadySubmittedError);
  });

  it("gives a plain invalid-link message for a 404 and any other failure", async () => {
    reply({ success: false, message: "Survey not found" }, 404);
    await expect(api.fetchPublicSurvey("x")).rejects.toThrow(/invalid, expired/);

    reply({}, 500);
    await expect(api.fetchPublicSurvey("x")).rejects.toThrow(/invalid, expired/);
  });

  it("refuses to call anything when the service isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPUTATION_API_URL", "");
    await expect(api.fetchPublicSurvey("x")).rejects.toThrow(/isn't configured/);
    expect(adapter).not.toHaveBeenCalled();
  });
});

describe("submitPublicSurvey", () => {
  it("posts the submission body as-is and returns the google review link", async () => {
    reply({ success: true, google_review_link: "https://g.page/r/x" });

    const result = await api.submitPublicSurvey("abc", {
      star_rating: 5,
      feedback_text: "",
      category: "",
      wants_contact: null,
    });

    expect(lastRequest().url).toBe("/survey/abc/submit");
    expect(JSON.parse(lastRequest().data as string)).toEqual({
      star_rating: 5,
      feedback_text: "",
      category: "",
      wants_contact: null,
    });
    expect(result).toEqual({ googleReviewLink: "https://g.page/r/x" });
  });

  it("defaults the review link to empty and throws the service's message on failure", async () => {
    reply({ success: true });
    expect(await api.submitPublicSurvey("abc", { star_rating: 1, feedback_text: "", category: "", wants_contact: null })).toEqual({
      googleReviewLink: "",
    });

    reply({ success: false, message: "Invalid token or feedback already submitted" }, 400);
    await expect(
      api.submitPublicSurvey("abc", { star_rating: 1, feedback_text: "", category: "", wants_contact: null }),
    ).rejects.toThrow("Invalid token or feedback already submitted");
  });
});

describe("clickPublicSurveyReview", () => {
  it("fires the request and never rejects, even on failure", () => {
    reply({}, 500);
    expect(() => api.clickPublicSurveyReview("abc")).not.toThrow();
    expect(lastRequest()?.url).toBe("/survey/abc/click-review");
  });
});
