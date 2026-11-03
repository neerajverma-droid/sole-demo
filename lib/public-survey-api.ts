import axios from "axios";

import { reputationBaseUrl } from "@/lib/reputation-api";
import {
  normalizePublicSurvey,
  SurveyAlreadySubmittedError,
  type PublicSurvey,
  type SurveySubmission,
} from "@/lib/public-survey";

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T; already_submitted?: boolean };

/**
 * No session, no business id — a client opens this from an emailed link, not
 * signed in. A fresh instance per call rather than the dashboard's shared
 * `reputationApi`: that one's interceptor exists to attach a bearer token and
 * business id neither of these three endpoints reads or needs.
 */
function publicSurveyApi() {
  const baseURL = reputationBaseUrl();
  if (!baseURL) throw new Error("The reputation service isn't configured for this environment.");
  return axios.create({ baseURL });
}

export function publicSurveyErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function fetchPublicSurvey(token: string): Promise<PublicSurvey> {
  try {
    const res = await publicSurveyApi().get<ApiEnvelope<unknown>>(`/survey/${encodeURIComponent(token)}`);
    if (!res.data?.success) throw new Error(res.data?.message || "This survey link is invalid.");
    return normalizePublicSurvey(res.data.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const body = error.response?.data as ApiEnvelope<unknown> | undefined;
      if (body?.already_submitted) {
        throw new SurveyAlreadySubmittedError(
          body.message || "This survey link has already been submitted.",
        );
      }
      if (error.response?.status === 404) {
        throw new Error("This survey link is invalid, expired, or has already been submitted.");
      }
      throw new Error(body?.message || "This survey link is invalid, expired, or has already been submitted.");
    }
    throw error;
  }
}

export async function submitPublicSurvey(
  token: string,
  submission: SurveySubmission,
): Promise<{ googleReviewLink: string }> {
  const fallback = "Failed to submit feedback. You may have already submitted it.";
  try {
    const res = await publicSurveyApi().post<ApiEnvelope<unknown>>(
      `/survey/${encodeURIComponent(token)}/submit`,
      submission,
    );
    if (!res.data?.success) throw new Error(res.data?.message || fallback);
    const body = res.data as { google_review_link?: string };
    return { googleReviewLink: body.google_review_link || "" };
  } catch (error) {
    throw new Error(publicSurveyErrorMessage(error, fallback));
  }
}

/** Fire-and-forget, exactly as the old flow did — a tracking miss shouldn't block the client's next step. */
export function clickPublicSurveyReview(token: string): void {
  publicSurveyApi()
    .post(`/survey/${encodeURIComponent(token)}/click-review`)
    .catch(() => {});
}
