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
const getAccessToken = vi.fn();
vi.mock("@/lib/api/session", () => ({ getAccessToken }));
const getBusinessId = vi.fn();
vi.mock("@/lib/api/business-id", () => ({ getBusinessId }));

const api = await import("@/lib/reputation-api");

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
  vi.stubEnv("NEXT_PUBLIC_REPUTATION_API_URL", "https://nps.example/api/v1/");
  vi.stubEnv("NEXT_PUBLIC_SOURCE_APP", "");
  getAccessToken.mockReturnValue("tok");
  getBusinessId.mockReturnValue("55");
});

afterEach(() => {
  adapter.mockReset();
  vi.unstubAllEnvs();
});

describe("the reputation client", () => {
  it("sends the bearer token, source app and business id to the configured base URL", async () => {
    reply({ success: true, data: { npsScore: 20, totalResponses: 5 } });

    const overview = await api.fetchReputationOverview();

    const request = lastRequest();
    expect(request.baseURL).toBe("https://nps.example/api/v1");
    expect(request.url).toBe("/overview");
    expect(request.headers.Authorization).toBe("Bearer tok");
    expect(request.params).toEqual({ source_app: "sole-ocr", business_id: "55" });
    expect(overview).toMatchObject({ npsScore: 20, totalResponses: 5 });
  });

  it("omits the token and business id when none is stored", async () => {
    getAccessToken.mockReturnValue(null);
    getBusinessId.mockReturnValue(null);
    vi.stubEnv("NEXT_PUBLIC_SOURCE_APP", "spm");
    reply({ success: true, data: [] });

    await api.fetchReputationSurveys();

    const request = lastRequest();
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.params).toEqual({ source_app: "spm" });
  });

  it("refuses to call anything when the service URL isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPUTATION_API_URL", "");

    await expect(api.fetchReputationFeedbacks()).rejects.toBeInstanceOf(api.ReputationNotConfiguredError);
    expect(adapter).not.toHaveBeenCalled();
  });

  it("asks for up to 500 feedback rows and drops rows without an id", async () => {
    reply({ success: true, data: [{ id: 1, star_rating: 5 }, { client_name: "ghost" }] });

    const rows = await api.fetchReputationFeedbacks();

    expect(lastRequest().params).toMatchObject({ limit: 500 });
    expect(rows.map((row) => row.id)).toEqual(["1"]);
  });

  it("throws the service's message on a success:false body", async () => {
    reply({ success: false, message: "Survey limit reached" });

    await expect(api.createReputationSurvey({ name: "A", description: "", questions_data: [], status: "active" })).rejects.toThrow(
      "Survey limit reached",
    );
  });

  it("sends the manual survey payload the old screen sent", async () => {
    reply({ success: true });

    await api.sendManualSurvey({
      surveyId: "7",
      clientId: "12",
      clientEmail: "jane@example.com",
      clientName: "Jane",
      customMessage: "<p>Hi</p>",
    });

    const request = lastRequest();
    expect(request.method).toBe("post");
    expect(request.url).toBe("/surveys/7/send-manual");
    expect(JSON.parse(request.data as string)).toEqual({
      client_id: "12",
      client_email: "jane@example.com",
      client_name: "Jane",
      reference_id: null,
      reference_name: "Service Feedback",
      custom_message: "<p>Hi</p>",
      is_recovery: false,
      include_button: true,
    });
  });

  it("carries a reference through when sending from an invoice or a job", async () => {
    reply({ success: true });

    await api.sendManualSurvey({
      surveyId: "7",
      clientId: "12",
      clientEmail: "jane@example.com",
      clientName: "Jane",
      customMessage: "<p>Hi</p>",
      referenceId: "501",
      referenceName: "INV-501",
    });

    expect(JSON.parse(lastRequest().data as string)).toMatchObject({
      reference_id: "501",
      reference_name: "INV-501",
    });
  });

  it("fetches which references already have an NPS response, as sets", async () => {
    reply({
      success: true,
      data: {
        completed_reference_ids: [501, "502"],
        completed_reference_names: ["inv-501 ", "INV-502"],
      },
    });

    const completed = await api.fetchCompletedNpsReferences();

    expect(lastRequest().url).toBe("/feedbacks/completed-references");
    expect(completed.ids).toEqual(new Set(["501", "502"]));
    expect(completed.names).toEqual(new Set(["INV-501", "INV-502"]));
  });

  it("treats a missing completed-references body as nothing completed", async () => {
    reply({ success: true });
    const completed = await api.fetchCompletedNpsReferences();
    expect(completed).toEqual({ ids: new Set(), names: new Set() });
  });

  it("resends a request, flagging recovery emails so no survey button is included", async () => {
    reply({ success: true });
    await api.resendReputationRequest("9", { customMessage: "<p>x</p>" });
    expect(lastRequest().url).toBe("/feedbacks/9/resend");
    expect(JSON.parse(lastRequest().data as string)).toEqual({ custom_message: "<p>x</p>" });

    reply({ success: true });
    await api.resendReputationRequest("9", { customMessage: "<p>y</p>", isRecovery: true });
    expect(JSON.parse(lastRequest().data as string)).toEqual({
      custom_message: "<p>y</p>",
      is_recovery: true,
      include_button: false,
    });
  });

  it("updates feedback and survey records with PUT", async () => {
    reply({ success: true });
    await api.updateReputationFeedback("9", { recovery_status: "started", is_closed: false });
    expect(lastRequest().method).toBe("put");
    expect(JSON.parse(lastRequest().data as string)).toEqual({ recovery_status: "started", is_closed: false });

    reply({ success: true });
    await api.updateReputationSurvey("3", { status: "draft" });
    expect(lastRequest().url).toBe("/surveys/3");

    reply({ success: true });
    await api.deleteReputationSurvey("3");
    expect(lastRequest().method).toBe("delete");
  });

  it("returns the saved settings, falling back to what was sent", async () => {
    reply({ success: true });
    const saved = await api.saveReputationSettings({ google_url: "https://g.page/x", public_threshold: 5 });
    expect(saved).toMatchObject({ googleUrl: "https://g.page/x", publicThreshold: 5 });
  });
});

describe("error messages", () => {
  it("prefers the first validation error, then the message, then a 401 hint", async () => {
    reply({ errors: [{ message: "google_url must be a URL" }], message: "Validation failed" }, 422);
    await expect(api.saveReputationSettings({})).rejects.toSatisfy(
      (error) => api.reputationErrorMessage(error, "x") === "google_url must be a URL",
    );

    reply({}, 401);
    await expect(api.fetchReputationOverview()).rejects.toSatisfy(
      (error) => api.reputationErrorMessage(error, "x") === "Your session couldn't be verified by the reputation service.",
    );

    expect(api.reputationErrorMessage(new api.ReputationNotConfiguredError(), "x")).toMatch(/isn't configured/);
    expect(api.reputationErrorMessage(null, "fallback")).toBe("fallback");
  });
});
