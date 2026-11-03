/**
 * The event contract.
 *
 * WHY A CONTRACT AND NOT JUST STRINGS. In the previous integration three events
 * were renamed over the course of a few weeks. Each rename silently zeroed a
 * funnel, because in a funnel report a renamed event and a deleted one look
 * identical — both read nothing — and nobody noticed for weeks. The names below
 * are a union, so a typo or a rename fails the build instead of a dashboard.
 *
 * RULES
 *
 *   1. Never rename an entry. Add a new one and leave the old one; a name that
 *      has shipped is a key in someone's saved report.
 *   2. Never reuse a name for a different meaning.
 *   3. An event fires when something SUCCEEDED, not when a screen opened. The
 *      previous integration shipped 9,432 rows of `module_used` carrying
 *      `action: "viewed"`, which answers nothing about whether anybody did
 *      anything.
 *   4. A multi-step sequence is one event with a `step` property, not one event
 *      per step. Adding a step later then needs no new name and no change to
 *      the funnel reading it.
 */

export const EVENTS = {
  // ── auth and signup ──────────────────────────────────────────────────────
  // Names shared deliberately with the previous project so the two signup
  // funnels can be read side by side across the switch.
  SIGNUP_INITIATED: "signup_initiated",
  SIGNUP_PASSWORD_SUBMITTED: "signup_password_submitted",
  SIGNUP_OTP_REQUESTED: "signup_otp_requested",
  SIGNUP_OTP_VERIFIED: "signup_otp_verified",
  SIGNIN_COMPLETED: "signin_completed",
  // New here — the previous app had no two-factor step at all.
  TWO_FACTOR_CHALLENGED: "two_factor_challenged",
  TWO_FACTOR_VERIFIED: "two_factor_verified",

  // ── onboarding ───────────────────────────────────────────────────────────
  // Already live in this app. Do not touch the strings.
  ONBOARDING_SURVEY_SHOWN: "onboarding_survey_shown",
  ONBOARDING_SURVEY_COMPLETED: "onboarding_survey_completed",
  ONBOARDING_SURVEY_DISMISSED: "onboarding_survey_dismissed",
  ONBOARDING_SURVEY_INDUSTRY_SELECTED: "onboarding_survey_industry_selected",
  ONBOARDING_SURVEY_PINS_SAVED: "onboarding_survey_pins_saved",
  ONBOARDING_REFERRAL_PROMPT_SHOWN: "onboarding_referral_prompt_shown",
  ACTIVATION_NUDGE_SHOWN: "activation_nudge_shown",
  ACTIVATION_NUDGE_CTA_CLICKED: "activation_nudge_cta_clicked",
  ACTIVATION_NUDGE_DISMISSED: "activation_nudge_dismissed",

  // ── identity and session ─────────────────────────────────────────────────
  PAGE_VIEW: "page_view",
  /** A signed-in session with no backend id. A defect, reported rather than hidden. */
  IDENTIFY_FAILED: "identify_failed",

  // ── businesses ───────────────────────────────────────────────────────────
  BUSINESS_CREATED: "business_created",
  BUSINESS_SWITCHED: "business_switched",

  // ── money in ─────────────────────────────────────────────────────────────
  INVOICE_CREATED: "invoice_created",
  INVOICE_SENT: "invoice_sent",
  INVOICE_PAID: "invoice_paid",
  QUOTE_CREATED: "quote_created",
  QUOTE_SENT: "quote_sent",
  QUOTE_ACCEPTED: "quote_accepted",
  CLIENT_REFUND_RECORDED: "client_refund_recorded",
  /*
   * No `payment_recorded`. This app has no standalone record-a-payment flow —
   * an invoice is settled either by the cash dialog or by a bank match, and
   * both are `invoice_paid`. A second name for the same action would be
   * double-counted by anyone who summed them.
   */

  // ── money out ────────────────────────────────────────────────────────────
  EXPENSE_LOGGED: "expense_logged",
  SUPER_CONTRIBUTION_RECORDED: "super_contribution_recorded",
  /*
   * No `receipt_captured`: a receipt is attached while logging an expense,
   * never on its own, so it is a property of `expense_logged` (`has_receipt`)
   * rather than an event. And no `vendor_refund_recorded` — /expenses/
   * vendor-refunds is a read-only list with no create route, so nothing in
   * this app could ever fire it.
   */

  // ── banking and transactions ─────────────────────────────────────────────
  BANK_ACCOUNT_CONNECTED: "bank_account_connected",
  TRANSACTION_RECONCILED: "transaction_reconciled",
  TRANSACTION_RULE_CREATED: "transaction_rule_created",
  TRANSACTIONS_BULK_ACTIONED: "transactions_bulk_actioned",

  // ── assets ───────────────────────────────────────────────────────────────
  // The previous app stopped at "added". The lifecycle after that is most of
  // what this module does.
  ASSET_ADDED: "asset_added",
  ASSET_DISPOSED: "asset_disposed",
  ASSET_INSURANCE_RECORDED: "asset_insurance_recorded",
  DEPRECIATION_REPORT_RUN: "depreciation_report_run",

  // ── ledger ───────────────────────────────────────────────────────────────
  CONTACT_CREATED: "contact_created",
  CONTACTS_IMPORTED: "contacts_imported",
  /*
   * One name, not two. /sales/products and /inventory are two screens over the
   * same `createInventoryItemApi` call — the products screen's own comment
   * says "both actions create a Custom item" — so a separate `product_created`
   * would have been a second name for one action, and anyone summing the two
   * would have counted every item twice.
   */
  INVENTORY_ITEM_CREATED: "inventory_item_created",
  LIABILITY_ADDED: "liability_added",
  EQUITY_RECORDED: "equity_recorded",

  // ── operations ───────────────────────────────────────────────────────────
  // Same name the previous app fired from its KM tracker, so the two can be
  // read side by side across the switch.
  KM_TRIP_LOGGED: "km_trip_logged",
  // The previous app's name too; fired for a manual log and a saved timer
  // session, the two ways time gets recorded.
  TIME_ENTRY_LOGGED: "time_entry_logged",

  // ── planning and tax ─────────────────────────────────────────────────────
  BUDGET_CREATED: "budget_created",
  GOAL_CREATED: "goal_created",
  // No `plan_created`: the business planner is budgets, goals and the wallet.
  // There is no "plan" entity behind it and no endpoint that would create one.
  TAX_ESTIMATOR_USED: "tax_estimator_used",
  GST_SETTINGS_CONFIGURED: "gst_settings_configured",

  // ── scheduling ───────────────────────────────────────────────────────────
  // The previous project's own name, kept so its calendar report carries on.
  CALENDAR_EVENT_CREATED: "calendar_event_created",

  // ── reports ──────────────────────────────────────────────────────────────
  // One name with a `report` property, not ten names. There are ten report
  // routes today and there will be more.
  REPORT_VIEWED: "report_viewed",
  REPORT_EXPORTED: "report_exported",

  /*
   * ── migration ────────────────────────────────────────────────────────────
   *
   * "Migration" in this app is the five-step bring-your-data-in checklist, not
   * a transfer out of a named accounting package. There is no source system to
   * record and no failure state — a step either imported rows or it did not —
   * so the `migration_started` / `migration_failed` / `source_system` shape
   * this list first carried described a product that does not exist here.
   * Corrected before anything shipped, which is the only time a name can be
   * changed without orphaning somebody's saved report.
   */
  MIGRATION_STEP_COMPLETED: "migration_step_completed",
  MIGRATION_COMPLETED: "migration_completed",

  /*
   * ── payment provider onboarding ──────────────────────────────────────────
   *
   * No SolePay or NextTap names here, by request — both out until each module
   * is called stable. Neither is reused for anything else: when they come
   * back, same names, same shape, one `step` per endpoint (see the plan doc,
   * group 11).
   */

  // ── subscription ─────────────────────────────────────────────────────────
  // Every one of these was dead or near-dead in the previous project. Confirm
  // each actually fires before trusting a conversion number built on it.
  PAYWALL_HIT: "paywall_hit",
  UPGRADE_INTENT: "upgrade_intent",
  PLAN_UPGRADED: "plan_upgraded",
  PLAN_CANCELED: "plan_canceled",
  SUBSCRIPTION_REACTIVATED: "subscription_reactivated",

  // ── account ──────────────────────────────────────────────────────────────
  ACCOUNT_DELETED: "account_deleted",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Properties an event is useless without.
 *
 * "Invoice sent" without the amount does not answer "invoice sent with invoice
 * value", which is the question actually being asked of it. The validator in
 * `lib/analytics.ts` enforces these in development, where the person who left
 * one out is still looking at the screen.
 */
export const REQUIRED_PROPS: Partial<Record<EventName, readonly string[]>> = {
  [EVENTS.INVOICE_CREATED]: ["amount"],
  [EVENTS.INVOICE_SENT]: ["amount"],
  [EVENTS.INVOICE_PAID]: ["amount", "days_to_payment"],
  [EVENTS.QUOTE_CREATED]: ["amount"],
  [EVENTS.QUOTE_SENT]: ["amount"],
  [EVENTS.QUOTE_ACCEPTED]: ["amount"],
  [EVENTS.CLIENT_REFUND_RECORDED]: ["amount"],
  [EVENTS.EXPENSE_LOGGED]: ["amount"],
  [EVENTS.SUPER_CONTRIBUTION_RECORDED]: ["amount"],
  [EVENTS.ASSET_ADDED]: ["value"],
  [EVENTS.ASSET_DISPOSED]: ["value"],
  [EVENTS.LIABILITY_ADDED]: ["amount"],
  [EVENTS.EQUITY_RECORDED]: ["amount"],
  [EVENTS.KM_TRIP_LOGGED]: ["distance_km"],
  [EVENTS.TIME_ENTRY_LOGGED]: ["duration_minutes", "source"],
  [EVENTS.BUDGET_CREATED]: ["amount"],
  [EVENTS.GOAL_CREATED]: ["amount"],
  [EVENTS.TAX_ESTIMATOR_USED]: ["estimated_tax"],
  [EVENTS.CONTACTS_IMPORTED]: ["count"],
  [EVENTS.REPORT_VIEWED]: ["report"],
  [EVENTS.REPORT_EXPORTED]: ["report", "format"],
  [EVENTS.MIGRATION_STEP_COMPLETED]: ["step", "count"],
  [EVENTS.MIGRATION_COMPLETED]: ["record_count"],
  [EVENTS.PLAN_UPGRADED]: ["plan", "amount"],
  [EVENTS.PAYWALL_HIT]: ["feature"],
  [EVENTS.PAGE_VIEW]: ["path"],
};

/** Every name that has shipped, for the contract test and the smoke test. */
export const ALL_EVENT_NAMES: readonly EventName[] = Object.values(EVENTS);
