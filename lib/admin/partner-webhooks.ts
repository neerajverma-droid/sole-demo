import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";
import type { PillTone } from "@/lib/admin/format";

/**
 * A partner's outbound webhook, for super admin › Partners › one partner.
 * Backed by sole-ocr's `/api/super/partners/:id/webhook*`
 * (src/modules/partner/webhooks).
 *
 * The signing secret comes back exactly once, from generating it. It is never
 * stored here, in query cache or anywhere else: the caller shows it in the
 * reveal dialog and lets it go.
 */

export type WebhookSettings = {
  url: string | null;
  enabled: boolean;
  /** Null = every event type. */
  events: string[] | null;
  hasSecret: boolean;
  availableEvents: string[];
};

export type DeliveryStatus = "pending" | "delivered" | "failed";

export type WebhookDelivery = {
  id: string;
  eventId: string;
  type: string;
  status: DeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string | null;
};

export type DeliveryAttempt = { delivered: boolean; statusCode: number | null; error: string | null };

type ApiWebhook = {
  url?: string | null;
  enabled?: boolean;
  events?: string[] | null;
  has_secret?: boolean;
  available_events?: string[];
};

type ApiDelivery = {
  id: number | string;
  event_id?: string;
  type?: string;
  status?: string;
  attempts?: number;
  last_status_code?: number | null;
  last_error?: string | null;
  next_attempt_at?: string | null;
  delivered_at?: string | null;
  created_at?: string | null;
};

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

/** What each event means, for the subscription checkboxes. */
export const WEBHOOK_EVENT_COPY: Record<string, string> = {
  "referral.signed_up": "A referred person created a Sole account",
  "referral.activated": "They finished setup and used Sole",
  "referral.paying": "They became a paying customer",
  "referral.payment": "Each payment they make",
  "referral.refunded": "A payment was refunded",
  "referral.cancelled": "They cancelled their subscription",
};

export const DELIVERY_STATUS_COPY: Record<DeliveryStatus, { label: string; tone: PillTone }> = {
  pending: { label: "Retrying", tone: "warning" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export function mapWebhook(row: ApiWebhook | undefined): WebhookSettings {
  return {
    url: row?.url ?? null,
    enabled: Boolean(row?.enabled),
    events: Array.isArray(row?.events) && row.events.length ? row.events : null,
    hasSecret: Boolean(row?.has_secret),
    availableEvents: Array.isArray(row?.available_events) ? row.available_events : Object.keys(WEBHOOK_EVENT_COPY),
  };
}

export function mapDelivery(row: ApiDelivery): WebhookDelivery {
  const status: DeliveryStatus = row.status === "delivered" || row.status === "failed" ? row.status : "pending";
  return {
    id: String(row.id),
    eventId: row.event_id ?? "",
    type: row.type ?? "",
    status,
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    lastStatusCode: typeof row.last_status_code === "number" ? row.last_status_code : null,
    lastError: row.last_error ?? null,
    nextAttemptAt: row.next_attempt_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

/* -------------------------------------------------------------------------- *
 * Form
 * -------------------------------------------------------------------------- */

export type WebhookForm = { url: string; enabled: boolean; allEvents: boolean; events: string[] };

export function formFromWebhook(webhook: WebhookSettings): WebhookForm {
  return {
    url: webhook.url ?? "",
    enabled: webhook.enabled,
    allEvents: webhook.events === null,
    events: webhook.events ?? [],
  };
}

/** Same rule as the backend: https, or http://localhost while developing. */
export function isWebhookUrl(value: string, allowLocalhost = process.env.NODE_ENV !== "production"): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const local = allowLocalhost && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  return url.protocol === "https:" || local;
}

export type WebhookFormIssues = Partial<Record<"url" | "events" | "enabled", string>>;

export function webhookFormIssues(form: WebhookForm, hasSecret: boolean): WebhookFormIssues {
  const issues: WebhookFormIssues = {};
  const url = form.url.trim();
  if (url && !isWebhookUrl(url)) issues.url = "Use an https address.";
  if (!form.allEvents && form.events.length === 0) issues.events = "Choose at least one event, or send all of them.";
  if (form.enabled && !url) issues.enabled = "Add a URL before turning deliveries on.";
  else if (form.enabled && !hasSecret) issues.enabled = "Generate a signing secret before turning deliveries on.";
  return issues;
}

export function webhookBody(form: WebhookForm): Record<string, unknown> {
  return {
    webhook_url: form.url.trim() || null,
    webhook_enabled: form.enabled,
    webhook_events: form.allEvents ? null : form.events,
  };
}

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

export async function fetchWebhook(partnerId: string): Promise<WebhookSettings> {
  const response = await api.get<ApiEnvelope<{ webhook?: ApiWebhook }>>(apiRoutes.superAdmin.partnerWebhook(partnerId));
  return mapWebhook(response.data?.data?.webhook);
}

export async function updateWebhookApi(partnerId: string, form: WebhookForm): Promise<WebhookSettings> {
  const response = await api.put<ApiEnvelope<{ webhook?: ApiWebhook }>>(
    apiRoutes.superAdmin.partnerWebhook(partnerId),
    webhookBody(form),
  );
  return mapWebhook(response.data?.data?.webhook);
}

/** Show the returned secret once; never keep it. */
export async function generateWebhookSecretApi(partnerId: string): Promise<{ secret: string; replaced: boolean }> {
  const response = await api.post<ApiEnvelope<{ secret?: string; replaced?: boolean }>>(
    apiRoutes.superAdmin.partnerWebhookSecret(partnerId),
  );
  const secret = response.data?.data?.secret;
  if (!secret) throw new Error("The new secret wasn't returned. Try again.");
  return { secret, replaced: Boolean(response.data?.data?.replaced) };
}

type ApiAttempt = { result?: { delivered?: boolean; statusCode?: number | null; error?: string | null } | null; delivery?: ApiDelivery };

function mapAttempt(data: ApiAttempt | undefined): { attempt: DeliveryAttempt; delivery: WebhookDelivery | null } {
  const result = data?.result;
  return {
    attempt: {
      delivered: Boolean(result?.delivered),
      statusCode: typeof result?.statusCode === "number" ? result.statusCode : null,
      error: result?.error ?? (result ? null : "Another delivery of this event was already in progress."),
    },
    delivery: data?.delivery ? mapDelivery(data.delivery) : null,
  };
}

export async function sendTestWebhookApi(partnerId: string) {
  const response = await api.post<ApiEnvelope<ApiAttempt>>(apiRoutes.superAdmin.partnerWebhookTest(partnerId));
  return mapAttempt(response.data?.data);
}

export async function fetchWebhookDeliveries(partnerId: string): Promise<WebhookDelivery[]> {
  const response = await api.get<ApiEnvelope<{ deliveries?: ApiDelivery[] }>>(
    apiRoutes.superAdmin.partnerWebhookDeliveries(partnerId),
    { params: { limit: 25 } },
  );
  return (response.data?.data?.deliveries ?? []).map(mapDelivery);
}

export async function redeliverWebhookApi(partnerId: string, deliveryId: string) {
  const response = await api.post<ApiEnvelope<ApiAttempt>>(apiRoutes.superAdmin.partnerWebhookRedeliver(partnerId, deliveryId));
  return mapAttempt(response.data?.data);
}

/** "Delivered (202)", "Failed: HTTP 500", "Failed: ECONNREFUSED: …" */
export function describeAttempt(attempt: DeliveryAttempt): string {
  if (attempt.delivered) return `Delivered${attempt.statusCode ? ` (${attempt.statusCode})` : ""}`;
  return `Not delivered: ${attempt.error ?? (attempt.statusCode ? `HTTP ${attempt.statusCode}` : "no response")}`;
}
