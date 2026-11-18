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
  SIGNUP_INITIATED: "signup_initiated",
  SIGNUP_DETAILS_ENTERED: "signup_details_entered",
  /** Onboarding's company step, "Choose your plan" pressed and saved. */
  ONBD_CHOOSE_PLAN_CLICKED: "onbd_choose_plan_clicked",
  /** Onboarding's plan step; `subscription_plan_selected` is everywhere else. */
  ONBD_SUBSCRIPTION_PLAN_SELECTED: "onbd_subscription_plan_selected",
  /** The onboarding payment confirmed — sign-up is complete only once paid. */
  SIGNUP_COMPLETED: "signup_completed",

  ONBD_SURVEY_SHOWN: "onbd_survey_shown",
  ONBD_INDUSTRY_SELECTED: "onbd_industry_selected",
  ONBD_BEFORE_SOLE: "onbd_before_sole",
  ONBD_WIDGETS_ADDED: "onbd_widgets_added",
  ONBD_FIRST_JOB_OPTION_SELECTED: "onbd_first_job_option_selected",
  ONBD_SURVEY_CLOSED: "onbd_survey_closed",

  ADD_BUSINESS_INITIATED: "add_business_initiated",
  BUSINESS_DETAILS_ADDED: "business_details_added",
  SUBSCRIPTION_PLAN_SELECTED: "subscription_plan_selected",

  MODULE_CLICKED: "module_clicked",
  SUB_MODULE_CLICKED: "sub_module_clicked",

  INVOICE_CREATION_INITIATED: "invoice_creation_initiated",
  INVOICE_CREATED: "invoice_created",
  INVOICE_SENT: "invoice_sent",

  CONTACT_CREATION_INITIATED: "contact_creation_initiated",
  CONTACT_CREATED: "contact_created",

  BANK_ACCOUNT_CONNECTED: "bank_account_connected",

  SCHEDULE_SUPPORT_CLICKED: "schedule_support_clicked",
  SUPPORT_MEETING_BOOKED: "support_meeting_booked",

  QUOTE_CREATION_INITIATED: "quote_creation_initiated",
  QUOTE_CREATED: "quote_created",
  QUOTE_SENT: "quote_sent",

  INVENTORY_ADDITION_INITIATED: "inventory_addition_initiated",
  INVENTORY_ADDED: "inventory_added",

  CUSTOM_PRODUCT_CREATION_INITIATED: "custom_product_creation_initiated",
  CUSTOM_PRODUCT_ADDED: "custom_product_added",

  ADD_EXPENSE_INITIATED: "add_expense_initiated",
  EXPENSE_ADDED: "expense_added",

  MATCHING_RULE_INITIATED: "matching_rule_initiated",
  MATCHING_RULE_CREATED: "matching_rule_created",

  CLIENT_REFUND_INITIATED: "client_refund_initiated",
  CLIENT_REFUND_ISSUED: "client_refund_issued",

  CREATE_GOAL_INITIATED: "create_goal_initiated",
  GOAL_CREATED: "goal_created",

  CONTRIBUTION_ADD_INITIATED: "contribution_add_initiated",
  CONTRIBUTION_ADDED: "contribution_added",

  PAYROLL_ENABLED: "payroll_enabled",

  EMPLOYEE_ADDITION_INITIATED: "employee_addition_initiated",
  EMPLOYEE_ADDED: "employee_added",

  BULK_UPLOAD_INITIATED: "bulk_upload_initiated",
  FILE_UPLOADED: "file_uploaded",
  DATA_MAPPED: "data_mapped",
  DATA_REVIEW_INITIATED: "data_review_initiated",
  DATA_IMPORTED: "data_imported",
  CONTINUE_TO_SOLE_FIELDS_CLICKED: "continue_to_sole_fields_clicked",

  INVOICE_BRANDING_UPLOAD: "invoice_branding_upload",

  VEHICLE_ADDITION_INITIATED: "vehicle_addition_initiated",
  VEHICLE_ADDED: "vehicle_added",
  TRIP_ADDITION_INITIATED: "trip_addition_initiated",
  TRIP_ADDED: "trip_added",

  ADD_TRANSACTION_INITIATED: "add_transaction_initiated",

  ASSET_ADDITION_INITIATED: "asset_addition_initiated",
  ASSET_DETAILS_ADDED: "asset_details_added",
  ASSET_PHOTO_UPLOAD_INITIATED: "asset_photo_upload_initiated",
  ASSET_ADDED: "asset_added",

  ADD_ON_SELECTED: "add_on_selected",
  /*
   * The plan's row 66 reads `add_added_to_plan`, which drops the "on" from
   * add-on; named to match `add_on_selected` instead.
   */
  ADD_ON_ADDED_TO_PLAN: "add_on_added_to_plan",

  /*
   * Not in the tracking plan — fired when an AI-suggested document match is
   * approved on a bank line. Kept because it is the only signal of that
   * feature being used; add it to the plan rather than removing it.
   */
  TRANSACTION_RECONCILED: "transaction_reconciled",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const REQUIRED_PROPS: Partial<Record<string, readonly string[]>> = {
  [EVENTS.SIGNUP_INITIATED]: ["signup_method"],
  [EVENTS.SIGNUP_DETAILS_ENTERED]: ["primary_email", "signup_method"],
  [EVENTS.ONBD_CHOOSE_PLAN_CLICKED]: ["user_id", "primary_business_name"],
  [EVENTS.ONBD_SUBSCRIPTION_PLAN_SELECTED]: ["plan_name", "plan_duration", "paid_amount", "is_onboarding"],
  [EVENTS.SIGNUP_COMPLETED]: ["user_id", "primary_email", "plan_name"],
  [EVENTS.ONBD_INDUSTRY_SELECTED]: ["industry"],
  [EVENTS.ONBD_BEFORE_SOLE]: ["prior_tool"],
  [EVENTS.ONBD_FIRST_JOB_OPTION_SELECTED]: ["option"],
  [EVENTS.BUSINESS_DETAILS_ADDED]: ["business_id", "business_name"],
  [EVENTS.SUBSCRIPTION_PLAN_SELECTED]: ["plan_name", "plan_duration", "paid_amount", "currency", "is_onboarding"],
  [EVENTS.CONTACT_CREATION_INITIATED]: ["module_name"],
  [EVENTS.ASSET_DETAILS_ADDED]: ["asset_type"],
  [EVENTS.ASSET_PHOTO_UPLOAD_INITIATED]: ["asset_type"],
  [EVENTS.MODULE_CLICKED]: ["module_name"],
  [EVENTS.SUB_MODULE_CLICKED]: ["module_name", "sub_module_name"],
  [EVENTS.MATCHING_RULE_INITIATED]: ["module_name"],
  [EVENTS.MATCHING_RULE_CREATED]: ["module_name"],
  [EVENTS.BULK_UPLOAD_INITIATED]: ["module_name", "sub_module_name"],
  [EVENTS.FILE_UPLOADED]: ["module_name", "sub_module_name"],
  [EVENTS.DATA_MAPPED]: ["section_name", "sub_module_name"],
  [EVENTS.DATA_REVIEW_INITIATED]: ["module_name", "sub_module_name"],
  [EVENTS.DATA_IMPORTED]: ["module_name", "sub_module_name"],
  [EVENTS.CONTINUE_TO_SOLE_FIELDS_CLICKED]: ["module_name", "sub_module_name"],
  [EVENTS.INVOICE_CREATED]: ["invoice_id", "amount"],
  [EVENTS.INVOICE_SENT]: ["invoice_id", "amount"],
  [EVENTS.CONTACT_CREATED]: ["contact_type"],
  [EVENTS.QUOTE_CREATED]: ["quote_id", "amount"],
  [EVENTS.QUOTE_SENT]: ["quote_id", "amount"],
  [EVENTS.INVENTORY_ADDED]: ["product_name", "product_type"],
  [EVENTS.CUSTOM_PRODUCT_ADDED]: ["product_name", "product_type"],
};

export const ALL_EVENT_NAMES: readonly string[] = Object.values(EVENTS);
