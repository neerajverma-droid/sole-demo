/**
 * "Where did you hear about Sole from?"
 *
 * Ported verbatim from `sole-webapp/config/referralSourceOptions.js`, options
 * and comments both — this port doesn't have the API endpoint that supplies
 * the authoritative list either (that's `user.referralSource`, added in
 * `config/api-routes.ts` by this same change), so the same "this copy can
 * drift, the server can't" caveat applies here too.
 *
 * ── THIS FILE IS A COPY. THE SOURCE OF TRUTH IS THE API ────────────────────
 *
 * In source, `sole-ocr/src/utils/referralSources.js` holds the real list, and
 * the API REJECTS anything not in it with a 400. So an option here that is not
 * there is a button that throws the user's answer away — which is exactly
 * what had happened there: that file offered 20 options, the API accepted 11,
 * and ten buttons (Reddit, X, both app stores and every AI assistant) failed
 * silently from the user's point of view.
 *
 * The authenticated popup should not read this file as its primary source
 * once the backend for `user.referralSource` exists: the API should hand it
 * `options` in its response, so that path can't drift. This copy exists for
 * the same two jobs source's does:
 *
 *   1. a public, session-less surface (source's `/hear-about-us` page), which
 *      has no session and so cannot ask the authenticated endpoint for the
 *      list;
 *   2. a fallback for the popup if the endpoint call fails or returns no
 *      options.
 *
 * Order and grouping match source's list, because the popup renders them in
 * order and a reader scans for their own category.
 */

/** Picking this one turns the free-text box into the real answer. */
export const REFERRAL_SOURCE_OTHER = "Other";

const referralSourceOptions: string[] = [
  // Search
  "Google Search",

  // Social
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Reddit",
  "X",

  // AI assistants
  "ChatGPT",
  "Claude",
  "Gemini",
  "Grok",
  "Copilot",

  // App stores
  "iOS App Store",
  "Play store",

  // People
  "Friend or word of mouth",
  "My accountant",

  // Content
  "Podcast or radio",
  "Blog or article",

  REFERRAL_SOURCE_OTHER,
];

export default referralSourceOptions;
