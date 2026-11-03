/**
 * Where the account menu's hand-offs go.
 *
 * Each of these used to be its own page in sole-webapp — a full screen
 * explaining the partner, usually with a dozen identical CTAs pointing at the
 * one external place that mattered. The content was the ceremony around a
 * single link; this keeps the link and drops the ceremony, the same trade
 * `SupportDialog` already made for the Support Hub.
 */

/** Sole's Education Hub — courses and tutorials, hosted outside the app. */
export const EDUCATION_HUB_URL = "https://courses.soleapp.com.au/";

/** The Discourse-style forum where Sole users trade tips with each other. */
export const SOLE_COMMUNITY_URL = "https://community.soleapp.com.au/";

/**
 * Sprintlaw's sign-up, carrying the partner code every CTA on the old
 * `/sprint-law` page pointed at — three months free for a Sole account.
 */
export const SPRINTLAW_URL =
  "https://platform.sprintlaw.co/register?country=AU&type=three-month-trial&partner=sole-app";
