export type ReputationTone = "success" | "info" | "warning" | "danger" | "neutral" | "accent";

export type ReputationOverview = {
  npsScore: number;
  totalResponses: number;
  totalSent: number;
  promoters: number;
  passives: number;
  detractors: number;
  averageStarRating: number;
  publicReviewClicks: number;
  promptedForPublicReview: number;
};

export type ScoreBreakdownItem = {
  label: string;
  valueText: string;
  score: number | null;
  max: number | null;
};

export type ReputationFeedback = {
  id: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  referenceId: string | null;
  referenceName: string;
  isManual: boolean;
  starRating: number | null;
  totalScore: number | null;
  status: string;
  recoveryStatus: string;
  isClosed: boolean;
  isPublicReviewClicked: boolean;
  feedbackText: string;
  category: string;
  wantsContact: boolean | null;
  scoreBreakdown: ScoreBreakdownItem[];
  lastSentAt: string | null;
  createdAt: string | null;
};

export type SurveyStatus = "active" | "draft";

export type SurveyQuestion = Record<string, unknown> & { text: string; answerType: string };

export type ReputationSurvey = {
  id: string;
  name: string;
  description: string;
  status: SurveyStatus;
  questions: SurveyQuestion[];
  question: string;
};

export type ReputationSettings = {
  raw: Record<string, unknown>;
  isEnabled: boolean;
  googleUrl: string;
  shareSocials: boolean;
  publicThreshold: 4 | 5;
  delayHours: number;
};

export type SettingsDraft = Omit<ReputationSettings, "raw">;

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};

const text = (value: unknown): string =>
  value === null || value === undefined || value === "null" ? "" : String(value).trim();

const optionalText = (value: unknown): string | null => text(value) || null;

const count = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const flag = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

const optionalFlag = (value: unknown): boolean | null =>
  value === null || value === undefined || value === "" ? null : flag(value);

export function normalizeOverview(raw: unknown): ReputationOverview {
  const data = asRecord(raw);
  return {
    npsScore: Math.round(count(data.npsScore)),
    totalResponses: count(data.totalResponses),
    totalSent: count(data.totalSent),
    promoters: count(data.promoters),
    passives: count(data.passives),
    detractors: count(data.detractors),
    averageStarRating: count(data.averageStarRating),
    publicReviewClicks: count(data.publicReviewClicks),
    promptedForPublicReview: count(data.promptedForPublicReview),
  };
}

function normalizeBreakdown(raw: unknown): ScoreBreakdownItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = asRecord(entry);
    return {
      label: text(item.label),
      valueText: text(item.valueText),
      score: optionalNumber(item.score),
      max: optionalNumber(item.max),
    };
  });
}

export function normalizeFeedback(raw: unknown): ReputationFeedback {
  const row = asRecord(raw);
  const rating = optionalNumber(row.star_rating);
  return {
    id: text(row.id),
    clientId: optionalText(row.client_id),
    clientName: text(row.client_name),
    clientEmail: text(row.client_email),
    referenceId: optionalText(row.reference_id),
    referenceName: text(row.reference_name),
    isManual: flag(row.is_manual),
    starRating: rating && rating > 0 ? rating : null,
    totalScore: optionalNumber(row.total_score),
    status: text(row.status).toLowerCase(),
    recoveryStatus: text(row.recovery_status).toLowerCase() || "none",
    isClosed: flag(row.is_closed),
    isPublicReviewClicked: flag(row.is_public_review_clicked),
    feedbackText: text(row.feedback_text),
    category: text(row.category),
    wantsContact: optionalFlag(row.wants_contact),
    scoreBreakdown: normalizeBreakdown(row.score_breakdown),
    lastSentAt: optionalText(row.last_sent_at),
    createdAt: optionalText(row.createdAt ?? row.created_at),
  };
}

function normalizeQuestions(raw: unknown): SurveyQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const question = asRecord(entry);
    return { ...question, text: text(question.text), answerType: text(question.answerType) || STAR_ANSWER_TYPE };
  });
}

export function normalizeSurvey(raw: unknown): ReputationSurvey {
  const row = asRecord(raw);
  const questions = normalizeQuestions(row.questions_data);
  return {
    id: text(row.id),
    name: text(row.name),
    description: text(row.description),
    status: text(row.status).toLowerCase() === "active" ? "active" : "draft",
    questions,
    question: questions[0]?.text ?? "",
  };
}

export const DELAY_OPTIONS: { hours: number; label: string }[] = [
  { hours: 0, label: "Immediately" },
  { hours: 24, label: "After 1 day" },
  { hours: 48, label: "After 2 days" },
  { hours: 72, label: "After 3 days" },
];

export function normalizeSettings(raw: unknown): ReputationSettings {
  const data = asRecord(raw);
  const threshold = count(data.public_threshold);
  return {
    raw: data,
    isEnabled: data.is_enabled === undefined ? true : flag(data.is_enabled),
    googleUrl: text(data.google_url),
    shareSocials: data.share_socials === undefined ? true : flag(data.share_socials),
    publicThreshold: threshold === 5 ? 5 : 4,
    delayHours: Math.max(0, count(data.delay_hours)),
  };
}

export function settingsDraft(settings: ReputationSettings): SettingsDraft {
  return {
    isEnabled: settings.isEnabled,
    googleUrl: settings.googleUrl,
    shareSocials: settings.shareSocials,
    publicThreshold: settings.publicThreshold,
    delayHours: settings.delayHours,
  };
}

export type GoogleUrlCheck = { ok: true; value: string } | { ok: false };

export function normalizeGoogleUrl(input: string): GoogleUrlCheck {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: "" };
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    const valid = (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
    return valid ? { ok: true, value: candidate } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function buildSettingsPayload(settings: ReputationSettings, draft: SettingsDraft, googleUrl: string) {
  return {
    ...settings.raw,
    is_enabled: draft.isEnabled,
    google_url: googleUrl,
    share_socials: draft.shareSocials,
    public_threshold: draft.publicThreshold,
    delay_hours: draft.delayHours,
  };
}

export const STAR_ANSWER_TYPE = "Star rating";

export type SurveyDraft = {
  name: string;
  description: string;
  question: string;
};

export function surveyDraftFrom(survey: ReputationSurvey | null): SurveyDraft {
  return {
    name: survey?.name ?? "",
    description: survey?.description ?? "",
    question: survey?.question ?? "",
  };
}

export function buildSurveyPayload(
  draft: SurveyDraft,
  status: SurveyStatus,
  existing: ReputationSurvey | null = null,
) {
  const base = existing?.questions[0] ?? {};
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    questions_data: [{ ...base, text: draft.question.trim(), answerType: STAR_ANSWER_TYPE }],
    status,
  };
}

export function duplicateSurveyPayload(survey: ReputationSurvey) {
  return {
    name: `${survey.name} (Copy)`,
    description: survey.description || null,
    questions_data: survey.questions,
    status: "draft" as SurveyStatus,
  };
}

export type NpsBand = { label: string; tone: ReputationTone };

export function npsBand(score: number): NpsBand {
  if (score < 0) return { label: "Needs improvement", tone: "danger" };
  if (score < 30) return { label: "Fair", tone: "warning" };
  if (score < 70) return { label: "Good", tone: "info" };
  return { label: "Excellent", tone: "success" };
}

export const percentOf = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

export type FeedbackSegment = "promoter" | "passive" | "detractor";

export function feedbackSegment(feedback: ReputationFeedback): FeedbackSegment | null {
  if (!feedback.starRating) return null;
  if (feedback.starRating >= 5) return "promoter";
  if (feedback.starRating === 4) return "passive";
  return "detractor";
}

export const FEEDBACK_FILTERS = ["All", "Promoters", "Passives", "Detractors"] as const;
export type FeedbackFilter = (typeof FEEDBACK_FILTERS)[number];

const FILTER_SEGMENT: Record<Exclude<FeedbackFilter, "All">, FeedbackSegment> = {
  Promoters: "promoter",
  Passives: "passive",
  Detractors: "detractor",
};

export function matchesFeedbackFilter(feedback: ReputationFeedback, filter: FeedbackFilter): boolean {
  return filter === "All" || feedbackSegment(feedback) === FILTER_SEGMENT[filter];
}

export function feedbackFilterCounts(feedbacks: ReputationFeedback[]): Record<FeedbackFilter, number> {
  return {
    All: feedbacks.length,
    Promoters: feedbacks.filter((f) => matchesFeedbackFilter(f, "Promoters")).length,
    Passives: feedbacks.filter((f) => matchesFeedbackFilter(f, "Passives")).length,
    Detractors: feedbacks.filter((f) => matchesFeedbackFilter(f, "Detractors")).length,
  };
}

export const needsFollowUp = (feedback: ReputationFeedback): boolean =>
  !!feedback.starRating && feedback.starRating <= 3 && !feedback.isClosed;

export type Pill = { label: string; tone: ReputationTone };

const RATED_STATUSES = new Set(["excellent", "good", "service_risk", "needs_attention", "closed"]);
const FOLLOW_UP_STATUSES = new Set(["service_risk", "needs_attention"]);
const QUEUED_STATUSES = new Set(["scheduled", "pending"]);

export function feedbackStatus(feedback: ReputationFeedback): Pill {
  if (feedback.isClosed) return { label: "Closed", tone: "neutral" };
  if (feedback.recoveryStatus === "started") return { label: "Recovery started", tone: "info" };
  if (feedback.isPublicReviewClicked) return { label: "Google review clicked", tone: "success" };
  if (FOLLOW_UP_STATUSES.has(feedback.status) || (feedback.starRating && feedback.starRating <= 3)) {
    return { label: "Follow up required", tone: "danger" };
  }
  if (feedback.status === "excellent" || feedback.status === "good" || (feedback.starRating ?? 0) >= 4) {
    return { label: "Feedback received", tone: "success" };
  }
  if (feedback.status === "sent") return { label: "Sent", tone: "info" };
  if (QUEUED_STATUSES.has(feedback.status)) return { label: "Pending", tone: "neutral" };
  return { label: "Awaiting response", tone: "neutral" };
}

export function feedbackScore(feedback: ReputationFeedback): Pill | null {
  if (!feedback.starRating) return null;
  const score = feedback.totalScore ?? feedback.starRating * 20;
  if (feedback.starRating >= 5) return { label: `${score} · Excellent`, tone: "success" };
  if (feedback.starRating === 4) return { label: `${score} · Good`, tone: "info" };
  if (feedback.starRating === 3) return { label: `${score} · Average`, tone: "warning" };
  if (feedback.starRating === 2) return { label: `${score} · Needs attention`, tone: "warning" };
  return { label: `${score} · Service risk`, tone: "danger" };
}

export const feedbackRouted = (feedback: ReputationFeedback): string =>
  feedback.isPublicReviewClicked ? "Public · Google" : "Internal";

export function feedbackClientLabel(feedback: ReputationFeedback): string {
  return feedback.clientName || feedback.clientEmail || `Client ${feedback.clientId ?? "unknown"}`;
}

export function feedbackReferenceLabel(feedback: ReputationFeedback): string {
  if (feedback.referenceName) return feedback.referenceName;
  if (feedback.referenceId) return `Ref #${feedback.referenceId}`;
  return feedback.isManual ? "Manual request" : "Direct request";
}

export type CompletedNpsReferences = { ids: Set<string>; names: Set<string> };

/** Whether an NPS survey has already gone out for this reference — an invoice, a job. */
export function isReferenceNpsCompleted(
  completed: CompletedNpsReferences | undefined,
  referenceId: string | number | null | undefined,
  referenceName: string,
): boolean {
  if (!completed) return false;
  if (referenceId !== null && referenceId !== undefined && completed.ids.has(String(referenceId))) return true;
  return completed.names.has(referenceName.trim().toUpperCase());
}

export const REQUEST_FILTERS = [
  "All",
  "Google review clicked",
  "Rated",
  "Follow up required",
  "Awaiting response",
  "Closed",
  "Scheduled",
] as const;
export type RequestFilter = (typeof REQUEST_FILTERS)[number];

export function matchesRequestFilter(request: ReputationFeedback, filter: RequestFilter): boolean {
  switch (filter) {
    case "All":
      return true;
    case "Google review clicked":
      return request.isPublicReviewClicked;
    case "Rated":
      return !!request.starRating && !FOLLOW_UP_STATUSES.has(request.status);
    case "Follow up required":
      return FOLLOW_UP_STATUSES.has(request.status);
    case "Awaiting response":
      return request.status === "sent";
    case "Closed":
      return request.isClosed;
    case "Scheduled":
      return QUEUED_STATUSES.has(request.status);
  }
}

export function requestStatus(request: ReputationFeedback): Pill {
  if (request.isClosed) return { label: "Closed", tone: "neutral" };
  if (request.isPublicReviewClicked) return { label: "Google review clicked", tone: "success" };
  if (request.status === "service_risk") return { label: "Service risk", tone: "danger" };
  if (request.status === "needs_attention") return { label: "Follow up required", tone: "warning" };
  if (request.starRating) return { label: `Rated · ${request.starRating}★`, tone: "info" };
  if (request.status === "reminder_sent") return { label: "Reminder sent", tone: "accent" };
  if (request.status === "excellent") return { label: "Excellent", tone: "success" };
  if (request.status === "good") return { label: "Good", tone: "info" };
  if (request.status === "scheduled") return { label: "Scheduled", tone: "neutral" };
  if (request.status === "pending") return { label: "Pending send", tone: "warning" };
  return { label: "Awaiting response", tone: "neutral" };
}

export const isQueued = (request: ReputationFeedback): boolean => QUEUED_STATUSES.has(request.status);

export const canResend = (request: ReputationFeedback): boolean =>
  !request.isClosed && !request.starRating && !RATED_STATUSES.has(request.status);

export function requestSentDate(request: ReputationFeedback): string {
  const stamp = request.lastSentAt ?? request.createdAt;
  if (!stamp) return "—";
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase() || "C";
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || "there";

export function surveyRequestMessage(clientName = ""): string {
  return `<p>Hi ${escapeHtml(firstName(clientName))},</p><p>Thank you for your business! We would love to hear your feedback on our services.</p><p>Best regards,<br>The Team</p>`;
}

export function resendRequestMessage(request: ReputationFeedback): string {
  const job = escapeHtml(request.referenceName || "your recent work");
  return `<p><strong>Hi ${escapeHtml(firstName(request.clientName))},</strong></p><p>Thank you for trusting us with ${job}.</p><p>We'd love to hear about your experience — it only takes 60 seconds and helps us serve you better.</p>`;
}

export function recoveryMessage(feedback: ReputationFeedback): string {
  const job = escapeHtml(feedback.referenceName || "our service");
  return `<p><strong>Hi ${escapeHtml(firstName(feedback.clientName))},</strong></p><p>Thanks for sharing your feedback on ${job}.</p><p>We noticed that your experience didn't meet your expectations, and we are committed to making things right. Please let us know how we can resolve this for you.</p>`;
}

export const htmlHasText = (html: string): boolean =>
  html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

export function wantsCallback(feedback: ReputationFeedback): boolean | null {
  const item = feedback.scoreBreakdown.find((entry) => entry.label.toLowerCase().includes("callback"));
  if (item) return item.valueText.toLowerCase().includes("yes");
  return feedback.wantsContact;
}

export function issueCategory(feedback: ReputationFeedback): string {
  if (feedback.category) return feedback.category;
  return feedback.scoreBreakdown.find((entry) => entry.label.toLowerCase().includes("issue"))?.valueText ?? "";
}

export function extraBreakdown(feedback: ReputationFeedback): ScoreBreakdownItem[] {
  return feedback.scoreBreakdown.filter((entry) => {
    const label = entry.label.toLowerCase();
    return entry.label && !label.includes("issue") && !label.includes("callback");
  });
}

export type FeedbackUpdate = { recovery_status?: "none" | "started" | "completed"; is_closed?: boolean };

export const RECOVERY_ACTIONS = {
  start: { recovery_status: "started", is_closed: false },
  complete: { recovery_status: "completed", is_closed: true },
  close: { is_closed: true },
  reopen: { is_closed: false, recovery_status: "none" },
} as const satisfies Record<string, FeedbackUpdate>;
