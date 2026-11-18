import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";

/**
 * Add-on marketplace content, for the super-admin Add-ons editor.
 *
 * Backed by sole-ocr's `/api/super/addon-content`
 * (src/controllers/superAddonContent.js), super-admin only. It edits the
 * `content` JSON on an add-on's plan rows — the category tag, the industries
 * it's tailored to, the detail page's copy and the video link — which the
 * marketplace reads through GET /subscription/plans (`withCatalogueContent` in
 * lib/addons.ts). Prices and Stripe ids aren't editable here.
 */

/* -------------------------------------------------------------------------- *
 * Types
 * -------------------------------------------------------------------------- */

export type AddonCategory = "finance" | "operations";

export const ADDON_CATEGORIES: { value: AddonCategory; label: string }[] = [
  { value: "finance", label: "Finance" },
  { value: "operations", label: "Operations" },
];

/** The content column as the API sends and takes it — snake_case, like the row. */
export type AddonContentPayload = {
  category: AddonCategory;
  industries: number[];
  subtext?: string;
  video_title?: string;
  video_url?: string | null;
  overview?: string;
  what_it_does?: string;
  why_it_helps?: string;
  how_it_works?: string;
  benefits?: string[];
  included?: string[];
};

export type AdminAddon = {
  slug: string;
  name: string;
  description: string | null;
  comingSoon: boolean;
  isActive: boolean;
  prices: { monthly?: number; annual?: number };
  content: Partial<AddonContentPayload> | null;
};

/**
 * The editor's form. Every field a string (or three of them), so inputs stay
 * controlled; `included` is one line per item in a textarea.
 */
export type AddonContentForm = {
  category: AddonCategory;
  /** Industry ids as strings, matching `IndustryOption.id`. */
  industries: string[];
  subtext: string;
  videoTitle: string;
  videoUrl: string;
  overview: string;
  whatItDoes: string;
  whyItHelps: string;
  howItWorks: string;
  benefits: [string, string, string];
  included: string;
};

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

type RawAdminAddon = {
  slug?: string;
  name?: string;
  description?: string | null;
  coming_soon?: unknown;
  is_active?: unknown;
  prices?: { monthly?: number | string; annual?: number | string } | null;
  content?: unknown;
};

/* -------------------------------------------------------------------------- *
 * Conversions
 * -------------------------------------------------------------------------- */

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isCategory(value: unknown): value is AddonCategory {
  return ADDON_CATEGORIES.some((entry) => entry.value === value);
}

function normaliseAddon(raw: RawAdminAddon): AdminAddon | null {
  if (!raw.slug) return null;
  const price = (value: unknown) =>
    value == null || Number.isNaN(Number(value)) ? undefined : Number(value);
  return {
    slug: raw.slug,
    name: raw.name || raw.slug,
    description: raw.description ?? null,
    comingSoon: Boolean(raw.coming_soon),
    isActive: Boolean(raw.is_active),
    prices: { monthly: price(raw.prices?.monthly), annual: price(raw.prices?.annual) },
    content:
      raw.content && typeof raw.content === "object" && !Array.isArray(raw.content)
        ? (raw.content as Partial<AddonContentPayload>)
        : null,
  };
}

/** What the form opens with: the stored content, or blanks for a row with none. */
export function contentToForm(content: Partial<AddonContentPayload> | null): AddonContentForm {
  const benefits = strings(content?.benefits);
  return {
    category: isCategory(content?.category) ? content.category : "finance",
    industries: (Array.isArray(content?.industries) ? content.industries : []).map(String),
    subtext: str(content?.subtext),
    videoTitle: str(content?.video_title),
    videoUrl: str(content?.video_url),
    overview: str(content?.overview),
    whatItDoes: str(content?.what_it_does),
    whyItHelps: str(content?.why_it_helps),
    howItWorks: str(content?.how_it_works),
    benefits: [benefits[0] ?? "", benefits[1] ?? "", benefits[2] ?? ""],
    included: strings(content?.included).join("\n"),
  };
}

/**
 * The form as the API takes it. Blank text goes up blank — the server drops
 * it, and the marketplace falls back to the web app's own copy for that field.
 */
export function formToContent(form: AddonContentForm): AddonContentPayload {
  const benefits = form.benefits.map((line) => line.trim());
  return {
    category: form.category,
    industries: form.industries.map(Number).filter(Number.isInteger),
    subtext: form.subtext.trim(),
    video_title: form.videoTitle.trim(),
    video_url: form.videoUrl.trim() || null,
    overview: form.overview.trim(),
    what_it_does: form.whatItDoes.trim(),
    why_it_helps: form.whyItHelps.trim(),
    how_it_works: form.howItWorks.trim(),
    benefits: benefits.every((line) => !line) ? [] : benefits,
    included: form.included
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

/**
 * What's wrong with the form before it's sent — the same rules the server
 * applies, so the message lands beside the field rather than in a toast.
 */
export function addonContentErrors(form: AddonContentForm): Partial<Record<keyof AddonContentForm, string>> {
  const errors: Partial<Record<keyof AddonContentForm, string>> = {};
  const url = form.videoUrl.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      errors.videoUrl = "Enter a full link starting with https://";
    }
  }
  const filled = form.benefits.filter((line) => line.trim()).length;
  if (filled !== 0 && filled !== 3) errors.benefits = "Write all three benefits, or leave all three empty.";
  return errors;
}

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

const routes = apiRoutes.addonContent;

/** The body's data, or a thrown Error carrying the server's message on `success: false`. */
function unwrap<T>(body: ApiEnvelope<T> | undefined): T {
  if (body?.success === false) throw new Error(body.message || "Request failed");
  return body?.data as T;
}

export async function fetchAdminAddons(): Promise<AdminAddon[]> {
  const { data } = await api.get<ApiEnvelope<RawAdminAddon[]>>(routes.list);
  return (unwrap(data) ?? []).flatMap((raw) => {
    const addon = normaliseAddon(raw);
    return addon ? [addon] : [];
  });
}

export async function updateAddonContent(slug: string, content: AddonContentPayload): Promise<AdminAddon | null> {
  const { data } = await api.patch<ApiEnvelope<RawAdminAddon>>(routes.update(slug), { content });
  const raw = unwrap(data);
  return raw ? normaliseAddon(raw) : null;
}
