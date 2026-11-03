/**
 * The floating "Ask Sole" chat widget's data layer — sole-ocr's `/internal/*`
 * and `/v2/assistant/chat` resources (`chatbot.*` in `config/api-routes.ts`).
 *
 * Three message sources feed one list: history (`fetchChatHistory`, loaded
 * once per open), the AI assistant's synchronous reply (`sendAssistantMessage`
 * — a plain request/response, not a stream; sole-webapp's own widget imports
 * `fetchEventSource` but never calls it for this), and the shared SSE
 * connection (`components/providers/sse-provider.tsx`) for anything a human
 * agent or a background job pushes (`agent_message`, `conversation_taken`,
 * …). A rule's `role: "notice"` — the agent-joined/left announcement — only
 * ever arrives that third way; it isn't a thing the assistant endpoint or a
 * failed send ever produce, and history maps the backend's own `system`
 * sender type to it rather than to the error-pill `role: "system"` below.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

export type ChatRole = "user" | "bot" | "agent" | "system" | "notice";

/** A quick-reply chip under a bot message — either fires another message
 *  (`payload`, sent as the real input while `text` shows as what the user
 *  "said") or just links out (`url`, e.g. "Download PDF"). */
export type ChatButton = { text: string; payload?: string; url?: string };

export type ChatMessage = {
  id: string;
  /** The row's real id once persisted — absent for a message that's only
   *  local (a just-sent optimistic bubble, a client-side error). Lets a
   *  later `agent_message_edited`/`agent_message_deleted` SSE event find and
   *  patch the right bubble. */
  serverId?: number | string | null;
  role: ChatRole;
  text: string;
  mediaUrl?: string | null;
  /** `"image" | "video" | "pdf" | "text"` as the backend classifies it —
   *  loose on purpose, a reimplementation can grow more without a type
   *  change ever being needed here. */
  mediaType?: string | null;
  timestamp: string;
  edited?: boolean;
  /** Bot messages only — sole-webapp never shows these under a user/agent bubble. */
  buttons?: ChatButton[];
};

/** Internal routing markers the backend's own history/SSE paths can emit —
 *  never meant to be shown, filtered out of both. */
const SKIP_TEXTS = ["[forwarded_to_agent]", "[relayed_to_agent]"];

/** The real greeting sole-webapp's own `EmptyState` shows before any history
 *  exists — a client-side default, not a backend call, so there's a face on
 *  a brand-new conversation instantly rather than after a round trip. */
export const EMPTY_STATE_TEXT =
  "Hi, welcome to Sole 👋<br/>What would you like to do today?<br/>Choose one option below.";

export const EMPTY_STATE_BUTTONS: ChatButton[] = [
  { text: "Create Invoice", payload: "create_invoice" },
  { text: "Create Expense", payload: "create_expense" },
  { text: "Create Asset", payload: "create_asset" },
  { text: "Business Insights", payload: "business_insights" },
  { text: "FAQ", payload: "faq" },
  { text: "Sole Support", payload: "sole_support" },
];

export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Always AU time — this app serves Australian sole traders only, so a
 *  message's clock shouldn't shift under a visitor whose own device is set
 *  to a different timezone. */
export function formatChatTime(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ *
 * Module-aware context — which part of the app this chat was opened from
 * ------------------------------------------------------------------ */

const MODULE_LABELS: Record<string, string> = {
  "sole-clients": "Clients",
  clients: "Clients",
  contacts: "Contacts",
  invoices: "Invoices",
  quotes: "Quotes",
  expenses: "Expenses",
  assets: "Assets",
  banking: "Banking",
  transactions: "Banking",
  payments: "Payments",
  reports: "Reports",
  reporting: "Reports",
  "business-planner": "Business Planner",
  planner: "Planner",
  calendar: "Calendar",
  "time-tracking": "Time Tracking",
  projects: "Projects",
  tasks: "Tasks",
  settings: "Settings",
  dashboard: "Dashboard",
  unibox: "Unibox",
  "km-tracker": "KM Tracker",
  "investment-property": "Investment Property",
};

function titleCaseRouteSegment(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export type ChatContext = { page: string | null; module: string | null };

/** Computed fresh on every call, straight from the URL — not a prop, not
 *  cached, so it's always right regardless of how the page got here. */
export function getChatContext(): ChatContext {
  if (typeof window === "undefined") return { page: null, module: null };
  const page = window.location.pathname || "/";
  const firstSegment = page.split("/").filter(Boolean)[0] || "dashboard";
  const moduleLabel = MODULE_LABELS[firstSegment] || titleCaseRouteSegment(firstSegment);
  return { page, module: moduleLabel || "Dashboard" };
}

/* ------------------------------------------------------------------ *
 * Attachments
 * ------------------------------------------------------------------ */

/** Hides the PDF viewer's own chrome so it reads as part of the bubble
 *  rather than a nested browser window. */
export function getPdfPreviewUrl(url: string | null | undefined): string {
  if (!url) return "";
  const hideToolbar = "toolbar=0&navpanes=0&scrollbar=0";
  return url.includes("#") ? `${url}&${hideToolbar}` : `${url}#${hideToolbar}`;
}

export function isPdfAttachment(message: Pick<ChatMessage, "mediaType" | "mediaUrl">): boolean {
  if (message.mediaType === "pdf") return true;
  return /\.pdf(\?|#|$)/i.test(message.mediaUrl || "");
}

/** Force-downloads rather than navigating to the file: an S3 url opens
 *  inline by default, so this fetches it as a blob first. Falls back to a
 *  plain new-tab open if that fetch is blocked (e.g. by CORS). */
export async function downloadChatFile(url: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("fetch failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = url.split("/").pop()?.split("?")[0] || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/* ------------------------------------------------------------------ *
 * Backend wiring
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

type ApiHistoryMessage = {
  id: number | string;
  senderType?: string | null;
  contentType?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  timestamp?: string | null;
  edited?: boolean;
};

/**
 * sole-webapp's own history fetch only ever renders `user`/`bot`/`agent` rows
 * — a `system` row (the backend's sender type for an agent-joined/left
 * announcement) is filtered OUT on reload entirely, not shown as a stale
 * "notice" pill. Those only ever appear live, the moment they're pushed over
 * SSE, and never again once the panel's reopened.
 */
const HISTORY_ROLES = new Set<string>(["user", "bot", "agent"]);

function mapHistoryMessage(raw: ApiHistoryMessage): ChatMessage {
  return {
    id: `hist_${raw.id}`,
    serverId: raw.id,
    role: (raw.senderType as ChatRole) ?? "bot",
    text: raw.content ?? "",
    mediaUrl: raw.mediaUrl ?? null,
    mediaType: raw.contentType ?? null,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    edited: !!raw.edited,
  };
}

export type ChatHistoryPage = { messages: ChatMessage[]; hasMore: boolean };

export async function fetchChatHistory(
  page: number,
  limit: number,
): Promise<ChatHistoryPage> {
  const response = await api.get<
    ApiEnvelope<{ messages?: ApiHistoryMessage[]; pagination?: { hasNextPage?: boolean } }>
  >(apiRoutes.chatbot.history, { params: { page, limit } });

  const data = response.data?.data;
  const messages = (data?.messages ?? [])
    .filter(
      (raw) =>
        (!!raw.content || !!raw.mediaUrl) &&
        HISTORY_ROLES.has(raw.senderType ?? "") &&
        !SKIP_TEXTS.includes(raw.content ?? ""),
    )
    .map(mapHistoryMessage);

  return { messages, hasMore: !!data?.pagination?.hasNextPage };
}

export async function fetchChatUnreadCount(): Promise<number> {
  const response = await api.get<ApiEnvelope<{ unread?: number }>>(
    apiRoutes.chatbot.unreadCount,
  );
  return Number(response.data?.data?.unread) || 0;
}

/** Stamps the server's read marker and (best-effort — a missed read-receipt
 *  isn't worth surfacing) tells admins which screen this came from. */
export async function markChatRead(): Promise<void> {
  await api.post(apiRoutes.chatbot.markRead, getChatContext()).catch(() => {});
}

export type AssistantReply = {
  text: string;
  timestamp: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  buttons: ChatButton[];
};

type ApiAssistantMessage = {
  text: string;
  timestamp: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  buttons?: ChatButton[];
};

/**
 * `null` means the bot has nothing to say — a live agent is handling this
 * conversation, so the message was logged but never answered.
 *
 * This endpoint's own response is NOT the usual `{success, data: {...}}`
 * envelope every other call here uses — it's sole-webapp's "legacy" shape,
 * `messages`/`handoff` sitting directly on the body (`{success, messages:
 * [...], handoff: {...}}`). Reading it as `response.data.data?.messages`
 * (the normal pattern) silently resolves to `undefined` on every real
 * reply — the bug that made every message after the first go missing.
 */
export async function sendAssistantMessage(
  input: string,
): Promise<AssistantReply | null> {
  const context = getChatContext();
  const response = await api.post<{
    success: boolean;
    message?: string;
    messages?: ApiAssistantMessage[];
  }>(apiRoutes.chatbot.assistant, {
    input,
    page: context.page,
    module: context.module,
  });

  if (!response.data?.success || !Array.isArray(response.data.messages)) {
    throw new Error(response.data?.message || "Something went wrong. Please try again.");
  }
  const reply = response.data.messages[0];
  if (!reply) return null;

  return {
    text: reply.text,
    timestamp: reply.timestamp,
    mediaType: reply.mediaType ?? null,
    mediaUrl: reply.mediaUrl ?? null,
    buttons: Array.isArray(reply.buttons) ? reply.buttons : [],
  };
}

export type ChatAttachment = {
  url: string;
  contentType: string;
  name: string;
  /** A local object URL for an image, shown in the composer before it's
   *  actually sent — never the uploaded url itself, which may take a moment
   *  longer to resolve to something paintable. */
  preview: string | null;
};

const ALLOWED_ATTACHMENT_TYPES =
  "image/jpeg,image/png,image/gif,image/webp,application/pdf,video/mp4,video/quicktime";

export function chatAttachmentAccept(): string {
  return ALLOWED_ATTACHMENT_TYPES;
}

export async function uploadChatAttachment(file: File): Promise<ChatAttachment> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<ApiEnvelope<{ url?: string; contentType?: string }>>(
    apiRoutes.chatbot.upload,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  const data = response.data?.data;
  if (!data?.url) {
    throw new Error(response.data?.message || "Upload failed.");
  }

  return {
    url: data.url,
    contentType: data.contentType || file.type,
    name: file.name,
    preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
  };
}

/**
 * Sends a message while a human agent has taken the conversation over —
 * bypasses the bot entirely, and the backend 409s if the conversation isn't
 * actually `human_active` right now (the attach control is agent-mode-gated
 * client-side too, but this is the real, server-side guarantee).
 */
export async function sendAgentMessage(input: {
  text?: string;
  mediaUrl?: string;
  contentType?: string;
}): Promise<ChatMessage> {
  const context = getChatContext();
  const response = await api.post<
    ApiEnvelope<{ id: number | string; content: string; contentType?: string; mediaUrl?: string; timestamp: string }>
  >(apiRoutes.chatbot.agentMessage, { ...input, ...context });

  const data = response.data?.data;
  if (!response.data?.success || !data) {
    throw new Error(response.data?.message || "Couldn't send that — try again.");
  }

  return {
    id: generateId(),
    serverId: data.id,
    role: "user",
    text: data.content,
    mediaUrl: data.mediaUrl ?? null,
    mediaType: data.contentType ?? null,
    timestamp: data.timestamp,
  };
}

/** The server flips the conversation back to the bot and pushes
 *  `conversation_released` over SSE — that event, not this call resolving,
 *  is what should actually clear agent mode in the UI. */
export async function endAgentChat(): Promise<void> {
  await api.post(apiRoutes.chatbot.endAgentChat, {});
}
