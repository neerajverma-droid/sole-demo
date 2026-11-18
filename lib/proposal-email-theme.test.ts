import { describe, expect, it } from "vitest";

import { emailInitials, emailTheme, emailValidUntil } from "@/lib/proposal-email-theme";

/**
 * The in-app email preview must look like the email that's sent, so its
 * colours are checked against values taken from the backend's own
 * buildTheme (sole-ocr src/emailTemplates/documentEmail.js).
 */
describe("emailTheme matches the backend's", () => {
  it.each([
    ["#4d4dff", { accent: "#4d4dff", accentText: "#4d4dff", onAccent: "#ffffff", accentSoft: "#f3f3ff", accentPill: "#eaeaff", accentBorder: "#dbdbff" }],
    ["#0f766e", { accent: "#0f766e", accentText: "#0f766e", onAccent: "#ffffff", accentSoft: "#eef5f5", accentPill: "#e2efee", accentBorder: "#cfe4e2" }],
    // A light brand colour gets dark text, and is darkened when used as text on white.
    ["#facc15", { accent: "#facc15", accentText: "#846b0b", onAccent: "#111827", accentSoft: "#fffbef", accentPill: "#fef9e3", accentBorder: "#fef5d0" }],
    ["#fff", { accent: "#fff", accentText: "#767676", onAccent: "#111827", accentSoft: "#ffffff", accentPill: "#ffffff", accentBorder: "#ffffff" }],
  ])("%s", (brandColor, expected) => {
    expect(emailTheme({ brandColor })).toEqual({ ...expected, ink: "#0a0d14" });
  });

  it("falls back to Sole blue for anything that isn't a hex colour, keeping a valid text colour", () => {
    expect(emailTheme({ brandColor: "red", contentColor: "#123456" })).toMatchObject({ accent: "#4d4dff", ink: "#123456" });
    expect(emailTheme()).toMatchObject({ accent: "#4d4dff", ink: "#0a0d14" });
  });
});

describe("emailInitials", () => {
  it("takes the first two words' first letters, as the email's header does", () => {
    expect(emailInitials("Joshi Advisory")).toBe("JA");
    expect(emailInitials("kiikan")).toBe("K");
    expect(emailInitials("Joshi Advisory Group")).toBe("JA");
    expect(emailInitials("")).toBe("B");
  });
});

describe("emailValidUntil", () => {
  it("is the issue date plus the expiry days", () => {
    expect(emailValidUntil("2026-10-30T00:00:00.000Z", "30")).toBe("29 Nov 2026");
  });

  it("is empty when either is unknown", () => {
    expect(emailValidUntil(null, "30")).toBe("");
    expect(emailValidUntil("2026-10-30", "")).toBe("");
    expect(emailValidUntil("not a date", "30")).toBe("");
  });
});
