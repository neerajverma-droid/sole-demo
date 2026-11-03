import { normalizeSettings, type ReputationSettings } from "@/lib/reputation";

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

export type PublicSurvey = {
  id: string;
  referenceName: string;
  clientName: string;
  settings: ReputationSettings;
  /** The active custom survey's first question, when one is linked to this request. */
  question: string;
};

export function normalizePublicSurvey(raw: unknown): PublicSurvey {
  const row = asRecord(raw);
  const questions = asRecord(row.survey_data).questions_data;
  const question = Array.isArray(questions) ? text(asRecord(questions[0]).text) : "";
  return {
    id: text(row.id),
    referenceName: text(row.reference_name),
    clientName: text(row.client_name),
    settings: normalizeSettings(row.settings),
    question,
  };
}

/** `getSurveyDetails` reports an already-answered link this way rather than a plain 404. */
export class SurveyAlreadySubmittedError extends Error {}

export type SurveyStep = "rate" | "public" | "socials" | "private" | "done";

export type SurveyRoute = "public" | "private";

/** Where a star rating sends the client — public review, or private recovery. */
export function routeForRating(rating: number, threshold: number): SurveyRoute {
  return rating >= threshold ? "public" : "private";
}

export const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Not great",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

export const ratingLabel = (rating: number): string | null => RATING_LABELS[rating] ?? null;

export const ISSUE_CATEGORIES = [
  "Communication was unclear",
  "The job took longer than expected",
  "The outcome did not meet expectations",
  "I was not sure what was happening",
  "Fees were unclear",
  "Other",
] as const;

/**
 * Not returned by `getSurveyDetails` — the service has no business-name field
 * on a feedback request, only `reference_name` (the job) and `client_name`
 * (who's rating it). The old flow hardcoded this too.
 */
export const FIRM_NAME = "Sole Accounting";

export function headline(survey: PublicSurvey): string {
  if (survey.question) return survey.question;
  return `How was your experience with ${survey.referenceName || "us"}?`;
}

export const hasGoogleLink = (survey: PublicSurvey): boolean => !!survey.settings.googleUrl;
export const offersSocials = (survey: PublicSurvey): boolean => survey.settings.shareSocials;

export type SocialPlatform = "linkedin" | "x" | "facebook" | "whatsapp";

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; color: string }[] = [
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2" },
  { id: "x", label: "X", color: "#0F1419" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
  { id: "whatsapp", label: "WhatsApp", color: "#25D366" },
];

export const FALLBACK_SHARE_URL = "https://soleapp.com.au";

export function buildSocialShareUrl(platform: SocialPlatform, message: string): string {
  const shareText = message.trim() || "Really happy with the service!";
  switch (platform) {
    case "linkedin":
      return "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(FALLBACK_SHARE_URL);
    case "x":
      return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText);
    case "facebook":
      return (
        "https://www.facebook.com/sharer/sharer.php?u=" +
        encodeURIComponent(FALLBACK_SHARE_URL) +
        "&quote=" +
        encodeURIComponent(shareText)
      );
    case "whatsapp":
      return "https://wa.me/?text=" + encodeURIComponent(shareText);
  }
}

export function defaultSocialMessage(firmName: string): string {
  return `I had a great experience with ${firmName}. Highly recommend their services — very professional and easy to work with!`;
}

export type SurveyAnswers = {
  rating: number;
  route: SurveyRoute | null;
  category: string;
  comment: string;
  wantsContact: boolean | null;
};

export type SurveySubmission = {
  star_rating: number;
  feedback_text: string;
  category: string;
  wants_contact: boolean | null;
};

/** The request body `/survey/:token/submit` expects — same fields on either route. */
export function buildSubmission(answers: SurveyAnswers): SurveySubmission {
  return {
    star_rating: answers.rating,
    feedback_text: answers.comment || answers.category || "",
    category: answers.category,
    wants_contact: answers.wantsContact,
  };
}

/** `?rating=` on the link, when a caller sends one — parsed, not trusted blindly. */
export function parseInitialRating(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : 0;
}
