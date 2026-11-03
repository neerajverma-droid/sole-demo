import axios from "axios";

import { getBusinessId } from "@/lib/api/business-id";
import { getAccessToken } from "@/lib/api/session";
import {
  normalizeFeedback,
  normalizeOverview,
  normalizeSettings,
  normalizeSurvey,
  type CompletedNpsReferences,
  type FeedbackUpdate,
  type ReputationFeedback,
  type ReputationOverview,
  type ReputationSettings,
  type ReputationSurvey,
  type SurveyStatus,
} from "@/lib/reputation";

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

export function reputationSourceApp(): string {
  return process.env.NEXT_PUBLIC_SOURCE_APP?.trim() || "sole-ocr";
}

export function reputationBaseUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_REPUTATION_API_URL?.trim();
  return base ? base.replace(/\/+$/, "") : null;
}

export class ReputationNotConfiguredError extends Error {
  constructor() {
    super("The reputation service isn't configured for this environment.");
    this.name = "ReputationNotConfiguredError";
  }
}

const reputationApi = axios.create();

reputationApi.interceptors.request.use((config) => {
  const baseURL = reputationBaseUrl();
  if (!baseURL) throw new ReputationNotConfiguredError();
  config.baseURL = baseURL;
  const token = getAccessToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  const businessId = getBusinessId();
  config.params = {
    ...config.params,
    source_app: config.params?.source_app ?? reputationSourceApp(),
    ...(businessId ? { business_id: config.params?.business_id ?? businessId } : {}),
  };
  return config;
});

export function reputationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ReputationNotConfiguredError) return error.message;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; errors?: { message?: string }[] }
      | undefined;
    const detail = data?.errors?.[0]?.message || data?.message;
    if (detail) return detail;
    if (error.response?.status === 401) return "Your session couldn't be verified by the reputation service.";
    return fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function unwrap<T>(body: ApiEnvelope<T> | undefined, fallback: string): ApiEnvelope<T> {
  if (!body?.success) throw new Error(body?.message || fallback);
  return body;
}

const FEEDBACK_LIMIT = 500;

export async function fetchReputationOverview(): Promise<ReputationOverview> {
  const res = await reputationApi.get<ApiEnvelope<unknown>>("/overview");
  return normalizeOverview(unwrap(res.data, "Couldn't load the reputation overview").data);
}

export async function fetchReputationFeedbacks(): Promise<ReputationFeedback[]> {
  const res = await reputationApi.get<ApiEnvelope<unknown[]>>("/feedbacks", {
    params: { limit: FEEDBACK_LIMIT },
  });
  const data = unwrap(res.data, "Couldn't load feedback").data;
  return Array.isArray(data) ? data.map(normalizeFeedback).filter((row) => row.id) : [];
}

export async function updateReputationFeedback(id: string, update: FeedbackUpdate): Promise<void> {
  const res = await reputationApi.put<ApiEnvelope<unknown>>(`/feedbacks/${encodeURIComponent(id)}`, update);
  unwrap(res.data, "Failed to update feedback");
}

export async function resendReputationRequest(
  id: string,
  options: { customMessage: string; isRecovery?: boolean },
): Promise<void> {
  const res = await reputationApi.post<ApiEnvelope<unknown>>(`/feedbacks/${encodeURIComponent(id)}/resend`, {
    custom_message: options.customMessage,
    ...(options.isRecovery ? { is_recovery: true, include_button: false } : {}),
  });
  unwrap(res.data, "Failed to send the email");
}

export async function fetchReputationSurveys(): Promise<ReputationSurvey[]> {
  const res = await reputationApi.get<ApiEnvelope<unknown[]>>("/surveys");
  const data = unwrap(res.data, "Couldn't load surveys").data;
  return Array.isArray(data) ? data.map(normalizeSurvey).filter((row) => row.id) : [];
}

export type SurveyPayload = {
  name: string;
  description: string | null;
  questions_data: unknown[];
  status: SurveyStatus;
};

export async function createReputationSurvey(payload: SurveyPayload): Promise<void> {
  const res = await reputationApi.post<ApiEnvelope<unknown>>("/surveys", payload);
  unwrap(res.data, "Failed to save the survey");
}

export async function updateReputationSurvey(
  id: string,
  payload: Partial<SurveyPayload>,
): Promise<void> {
  const res = await reputationApi.put<ApiEnvelope<unknown>>(`/surveys/${encodeURIComponent(id)}`, payload);
  unwrap(res.data, "Failed to update the survey");
}

export async function deleteReputationSurvey(id: string): Promise<void> {
  const res = await reputationApi.delete<ApiEnvelope<unknown>>(`/surveys/${encodeURIComponent(id)}`);
  unwrap(res.data, "Failed to delete the survey");
}

export type ManualSurveyRequest = {
  surveyId: string;
  clientId: string | null;
  clientEmail: string;
  clientName: string;
  customMessage: string;
  /** What this survey is rating — an invoice, a job. Falls back to a generic request. */
  referenceId?: string | null;
  referenceName?: string;
};

export async function sendManualSurvey(request: ManualSurveyRequest): Promise<void> {
  const res = await reputationApi.post<ApiEnvelope<unknown>>(
    `/surveys/${encodeURIComponent(request.surveyId)}/send-manual`,
    {
      client_id: request.clientId,
      client_email: request.clientEmail,
      client_name: request.clientName,
      reference_id: request.referenceId ?? null,
      reference_name: request.referenceName || "Service Feedback",
      custom_message: request.customMessage,
      is_recovery: false,
      include_button: true,
    },
  );
  unwrap(res.data, "Failed to send the survey");
}

export async function fetchCompletedNpsReferences(): Promise<CompletedNpsReferences> {
  const res = await reputationApi.get<
    ApiEnvelope<{ completed_reference_ids?: unknown[]; completed_reference_names?: unknown[] }>
  >("/feedbacks/completed-references");
  const data = unwrap(res.data, "Couldn't check which invoices already have NPS sent").data;
  return {
    ids: new Set((data?.completed_reference_ids ?? []).map((id) => String(id))),
    names: new Set((data?.completed_reference_names ?? []).map((name) => String(name).trim().toUpperCase())),
  };
}

export async function fetchReputationSettings(): Promise<ReputationSettings> {
  const res = await reputationApi.get<ApiEnvelope<unknown>>("/settings");
  return normalizeSettings(unwrap(res.data, "Couldn't load reputation settings").data);
}

export async function saveReputationSettings(payload: Record<string, unknown>): Promise<ReputationSettings> {
  const res = await reputationApi.put<ApiEnvelope<unknown>>("/settings", payload);
  const body = unwrap(res.data, "Failed to save settings");
  return normalizeSettings(body.data ?? payload);
}
