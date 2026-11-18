/**
 * The colours of the proposal emails, worked out exactly as the backend does
 * for every document email (sole-ocr `src/emailTemplates/documentEmail.js`):
 * the business's brand colour for the header band and button, tints of it
 * for the summary card, and a text colour that stays readable on each. The
 * in-app preview uses these so it looks like the email that's sent.
 */

export const DEFAULT_BRAND_COLOR = "#4d4dff";
export const DEFAULT_CONTENT_COLOR = "#0a0d14";
export const EMAIL_MUTED = "#5b606b";
export const SOLE_LOGO_BLACK = "https://s3.ap-southeast-2.amazonaws.com/assets.soleapp.com.au/logo/logo-black.png";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const resolveColor = (value: string | null | undefined, fallback: string) => (HEX.test(value || "") ? (value as string) : fallback);
const expandHex = (hex: string) =>
  hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(expandHex(hex).slice(at, at + 2), 16));

/** The colour mixed with white; `amount` is how much of the colour is kept (0..1). */
export function tint(hex: string, amount: number): string {
  return `#${channels(hex)
    .map((channel) => Math.round(255 - (255 - channel) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** White text on dark colours, near-black on light ones. */
export function readableOn(hex: string): string {
  const [r, g, b] = channels(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#111827" : "#ffffff";
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The brand colour as text on white, darkened until it reaches 4.5:1 contrast. */
export function readableTextAccent(hex: string): string {
  let color = expandHex(hex);
  for (let step = 0; step < 12 && 1.05 / (luminance(color) + 0.05) < 4.5; step += 1) {
    color = `#${channels(color)
      .map((channel) => Math.round(channel * 0.88).toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return color;
}

/** "Joshi Advisory" → "JA" — the header's stand-in when there's no logo. */
export function emailInitials(name: string | null | undefined): string {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "B";
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export type EmailTheme = {
  accent: string;
  accentText: string;
  ink: string;
  onAccent: string;
  accentSoft: string;
  accentPill: string;
  accentBorder: string;
};

export function emailTheme({ brandColor, contentColor }: { brandColor?: string | null; contentColor?: string | null } = {}): EmailTheme {
  const accent = resolveColor(brandColor, DEFAULT_BRAND_COLOR);
  return {
    accent,
    accentText: readableTextAccent(accent),
    ink: resolveColor(contentColor, DEFAULT_CONTENT_COLOR),
    onAccent: readableOn(accent),
    accentSoft: tint(accent, 0.07),
    accentPill: tint(accent, 0.12),
    accentBorder: tint(accent, 0.2),
  };
}

/** "29 Nov 2026" — issued plus the General step's expiry days, as the email works it out; "" when unknown. */
export function emailValidUntil(issuedAt: string | null | undefined, expireInDays: string | number | null | undefined): string {
  const days = Number(expireInDays);
  const from = issuedAt ? new Date(issuedAt) : null;
  if (!from || Number.isNaN(from.getTime()) || !Number.isFinite(days) || days <= 0) return "";
  return new Date(from.getTime() + days * 86_400_000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
