/**
 * Matching rules: auto-categorise imported transactions. A rule is a condition
 * (what to check → how to compare → values) plus what to assign when it hits.
 *
 * `RULE_CATEGORIES`/`RuleCategory`/`ruleCategoryParent` are kept for the
 * transactions module's own (still local) category pickers — matching rules
 * themselves no longer use them; a rule's real "account category" is a real
 * `account_subcategory_id`, fetched via `fetchRuleCategories`.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { invoiceMoney } from "@/lib/invoices";
import type { TransactionCategoryType } from "@/lib/transactions";

export const RULE_TYPES = ["Credit (income)", "Debit (expense)"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

type ApiTransactionType = "C" | "D";

const RULE_TYPE_TO_API: Record<RuleType, ApiTransactionType> = {
  "Credit (income)": "C",
  "Debit (expense)": "D",
};

const API_TO_RULE_TYPE: Record<ApiTransactionType, RuleType> = {
  C: "Credit (income)",
  D: "Debit (expense)",
};

/**
 * Exactly sole-webapp's own `conditionTypes` (`components/MatchingRule/AddRules.js`)
 * — the backend only ever compares a transaction's description or its amount
 * (`VALID_CONDITION_TYPES` in sole-ocr's `services/v2/matchingRules.js`), so
 * there's nothing else to offer here.
 */
export const RULE_CHECKS = ["Description", "Amount"] as const;
export type RuleCheck = (typeof RULE_CHECKS)[number];

type ApiConditionType = "DESCRIPTION" | "AMOUNT";

const RULE_CHECK_TO_API: Record<RuleCheck, ApiConditionType> = {
  Description: "DESCRIPTION",
  Amount: "AMOUNT",
};

const API_TO_RULE_CHECK: Record<ApiConditionType, RuleCheck> = {
  DESCRIPTION: "Description",
  AMOUNT: "Amount",
};

/**
 * Every comparison the backend accepts (sole-ocr's `VALID_CONDITIONS`), named
 * exactly as sole-webapp's own `conditions`/`conditionsAmount` arrays do. Which
 * of these a rule can actually pick from depends on `check` — see
 * `ruleComparesFor` — Description only ever offers the first two.
 */
export const RULE_COMPARES = [
  "Contain",
  "Equal To",
  "Greater Than",
  "Greater Than Equal To",
  "Lesser Than",
  "Lesser Than Equal To",
] as const;
export type RuleCompare = (typeof RULE_COMPARES)[number];

type ApiCondition =
  "CONTAIN" | "EQUAL" | "GREATER" | "GREATER EQUAL" | "LESSER" | "LESSER EQUAL";

const RULE_COMPARE_TO_API: Record<RuleCompare, ApiCondition> = {
  Contain: "CONTAIN",
  "Equal To": "EQUAL",
  "Greater Than": "GREATER",
  "Greater Than Equal To": "GREATER EQUAL",
  "Lesser Than": "LESSER",
  "Lesser Than Equal To": "LESSER EQUAL",
};

/** The exact inverse of `RULE_COMPARE_TO_API` — every code round-trips losslessly. */
const API_TO_RULE_COMPARE: Record<ApiCondition, RuleCompare> = {
  CONTAIN: "Contain",
  EQUAL: "Equal To",
  GREATER: "Greater Than",
  "GREATER EQUAL": "Greater Than Equal To",
  LESSER: "Lesser Than",
  "LESSER EQUAL": "Lesser Than Equal To",
};

/**
 * The compare options valid for a given check — Description can only Contain
 * or Equal To; Amount gets the full numeric set. Mirrors sole-webapp's own
 * `conditions` (Description) vs `conditionsAmount` (Amount) arrays exactly,
 * including the order they're offered in.
 */
const COMPARES_BY_CHECK: Record<RuleCheck, readonly RuleCompare[]> = {
  Description: ["Contain", "Equal To"],
  Amount: [
    "Equal To",
    "Greater Than",
    "Greater Than Equal To",
    "Lesser Than",
    "Lesser Than Equal To",
  ],
};

/** Which "how to compare" options the picker should offer for this check. */
export function ruleComparesFor(check: RuleCheck): readonly RuleCompare[] {
  return COMPARES_BY_CHECK[check];
}

/** Natural-language verb phrase for `conditionSentence`/`previewSentence` — a
 *  compare's own display label ("Contain") reads fine as a button but not
 *  mid-sentence ("transaction description contain …"). */
const COMPARE_VERB_PHRASE: Record<RuleCompare, string> = {
  Contain: "contains",
  "Equal To": "equals",
  "Greater Than": "is greater than",
  "Greater Than Equal To": "is greater than or equal to",
  "Lesser Than": "is less than",
  "Lesser Than Equal To": "is less than or equal to",
};

/**
 * The transactions module's own local category pickers (manual entry, bulk
 * upload, the transaction detail dialog) — unrelated to a matching rule's real
 * `account_subcategory_id`, so left exactly as they were.
 */
export const RULE_CATEGORIES = [
  "Sales income",
  "Consulting income",
  "Software",
  "Rent",
  "Office supplies",
  "Disposal of asset",
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export const RULE_CATEGORY_PARENTS: Record<
  RuleCategory,
  TransactionCategoryType
> = {
  "Sales income": "Income",
  "Consulting income": "Income",
  Software: "Expense",
  Rent: "Expense",
  "Office supplies": "Expense",
  "Disposal of asset": "Asset",
};

export function ruleCategoryParent(
  category: RuleCategory,
): TransactionCategoryType {
  return RULE_CATEGORY_PARENTS[category] ?? "Expense";
}

export const RULE_FILTERS = ["All", "Income", "Expense"] as const;
export type RuleFilter = (typeof RULE_FILTERS)[number];

export type Rule = {
  id: string;
  name: string;
  type: RuleType;
  check: RuleCheck;
  compare: RuleCompare;
  /** Any one matching is enough. */
  values: string[];
  /** `account_subcategory_id` — what's actually posted to the API. */
  categoryId: string;
  /**
   * Subcategory display name. Only the list/add/update/delete response
   * carries it — the `get` detail endpoint doesn't — so it's blank right
   * after a fresh detail fetch (editing resolves it from the category picker
   * instead, once that's loaded).
   */
  categoryName: string;
  /** Parent account category name, same availability as `categoryName`. */
  accountCategoryName: string;
  clientId: string | null;
  clientName: string;
  /**
   * A Debit rule's own free-text label for what it's assigning to — sole-
   * webapp's "Expense / Asset" field, independent of the supplier picked
   * above it (not a mirror of `clientName`). Required for Debit, unused and
   * always sent blank for Credit — same as the reference form.
   */
  assignName: string;
  gst: boolean;
};

export type RuleDraft = Omit<
  Rule,
  "id" | "categoryName" | "accountCategoryName"
>;

export function emptyRuleDraft(): RuleDraft {
  return {
    name: "",
    type: "Credit (income)",
    check: "Description",
    compare: "Contain",
    values: [],
    categoryId: "",
    clientId: null,
    clientName: "",
    assignName: "",
    gst: true,
  };
}

export function draftFromRule(rule: Rule): RuleDraft {
  return {
    name: rule.name,
    type: rule.type,
    check: rule.check,
    compare: rule.compare,
    values: [...rule.values],
    categoryId: rule.categoryId,
    clientId: rule.clientId,
    clientName: rule.clientName,
    assignName: rule.assignName,
    gst: rule.gst,
  };
}

/* ------------------------------------------------------------------ *
 * Readable sentences
 * ------------------------------------------------------------------ */

/** The Condition cell, e.g. `Description contains "stripe"`. */
export function conditionSentence(
  rule: Pick<Rule, "check" | "compare" | "values">,
): string {
  const values = rule.values.join(", ") || "…";
  return `${rule.check} ${COMPARE_VERB_PHRASE[rule.compare]} "${values}"`;
}

/** The live preview beneath the condition builder. */
export function previewSentence(
  draft: Pick<Rule, "check" | "compare" | "values">,
): string {
  const values = draft.values.join(", ") || "your value";
  return `If transaction ${draft.check.toLowerCase()} ${COMPARE_VERB_PHRASE[draft.compare]} "${values}", then categorise it accordingly.`;
}

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

/** Amount, and any of the numeric-only comparisons, compare numbers, not text. */
export function isNumericComparison(
  check: RuleCheck,
  compare: RuleCompare,
): boolean {
  return (
    check === "Amount" ||
    compare === "Greater Than" ||
    compare === "Greater Than Equal To" ||
    compare === "Lesser Than" ||
    compare === "Lesser Than Equal To"
  );
}

/** A plain non-negative number — the only value a numeric comparison takes. */
function isRuleNumber(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value.trim());
}

/**
 * Values already added that a numeric comparison can't use. A value is only
 * checked when it's added, so switching "What to check" to Amount (or the
 * comparison to Greater/Less than) afterwards would otherwise leave text like
 * "uber eats" sitting in a rule that compares numbers.
 */
export function invalidRuleValues(
  draft: Pick<RuleDraft, "check" | "compare" | "values">,
): string[] {
  if (!isNumericComparison(draft.check, draft.compare)) return [];
  return draft.values.filter((value) => !isRuleNumber(value));
}

/**
 * Live error for the value input. Keystrokes are never blocked — the error
 * appears and committing is refused until it's valid.
 */
export function ruleValueError(
  value: string,
  check: RuleCheck,
  compare: RuleCompare,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!isNumericComparison(check, compare)) return undefined;
  return isRuleNumber(trimmed)
    ? undefined
    : "Enter a valid number — no letters or negatives.";
}

/** Sole-webapp's own per-combination help text for the value field
 *  (`getConditionValueTooltip` in `components/MatchingRule/AddRules.js`). */
export function ruleValueHint(check: RuleCheck, compare: RuleCompare): string {
  if (check === "Amount") {
    switch (compare) {
      case "Greater Than":
        return "Enter a number to match transactions above that amount. Example: use 100 to match amounts greater than $100.";
      case "Greater Than Equal To":
        return "Enter a number to match transactions at or above that amount. Example: use 100 to match amounts of $100 or more.";
      case "Lesser Than":
        return "Enter a number to match transactions below that amount. Example: use 100 to match amounts less than $100.";
      case "Lesser Than Equal To":
        return "Enter a number to match transactions at or below that amount. Example: use 100 to match amounts of $100 or less.";
      default:
        return "Enter the exact transaction amount to match. Example: use 100 to match transactions equal to $100.";
    }
  }

  if (compare === "Equal To") {
    return "Enter the exact bank description text to match. Example: use Uber Trip to match that exact description.";
  }

  return "Enter a word or phrase from the bank description. Example: use Uber to match descriptions containing Uber.";
}

export type RuleIssue = { key: string; message: string };

/**
 * Required-field issues in on-screen order, so the form can reveal them all on
 * submit and focus the first — the same contract as the invoice editor.
 */
export function ruleIssues(draft: RuleDraft): RuleIssue[] {
  const issues: RuleIssue[] = [];

  // Sole-webapp's own schema is just `required` — no minimum length, so a
  // single-character name is genuinely valid, not something to block here.
  if (!draft.name.trim()) {
    issues.push({ key: "name", message: "Enter a name for this rule." });
  }
  if (draft.values.length === 0) {
    issues.push({ key: "values", message: "Add at least one value to match." });
  } else {
    const invalid = invalidRuleValues(draft);
    if (invalid.length > 0) {
      issues.push({
        key: "values",
        message:
          invalid.length === 1
            ? `"${invalid[0]}" isn't a number — remove it to compare numbers.`
            : `${invalid.length} values aren't numbers — remove them to compare numbers.`,
      });
    }
  }
  if (!draft.categoryId) {
    issues.push({ key: "category", message: "Select an account category." });
  }
  if (!draft.clientId && !draft.clientName.trim()) {
    issues.push({
      key: "client",
      message:
        draft.type === "Credit (income)"
          ? "Select a client for this rule."
          : "Select a supplier for this rule.",
    });
  }
  if (draft.type === "Debit (expense)" && !draft.assignName.trim()) {
    issues.push({
      key: "assignName",
      message: "Enter the expense/asset name.",
    });
  }

  return issues;
}

export function filterRules(
  rules: Rule[],
  filter: RuleFilter,
  query: string,
): Rule[] {
  const needle = query.trim().toLowerCase();

  return rules.filter((rule) => {
    if (filter === "Income" && rule.type !== "Credit (income)") return false;
    if (filter === "Expense" && rule.type !== "Debit (expense)") return false;
    if (!needle) return true;
    return (
      rule.name.toLowerCase().includes(needle) ||
      rule.categoryName.toLowerCase().includes(needle) ||
      rule.accountCategoryName.toLowerCase().includes(needle) ||
      conditionSentence(rule).toLowerCase().includes(needle)
    );
  });
}

/* ------------------------------------------------------------------ *
 * Backend wiring — sole-ocr's /v2/matching-rules resource
 *
 * `getAll` (and the list the add/update/delete responses carry) return a
 * compact projection — name, type, category/subcategory names, client name —
 * without the condition or the ids needed to edit. So the list is hydrated
 * with one `get` call per row to fill those in; rule counts are small (a
 * handful to a few dozen), so this stays cheap in practice.
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

/** The compact projection `getAll`/`add`/`update`/`delete` all return. */
type ApiRuleListRow = {
  id: number | string;
  name: string;
  transaction_type: ApiTransactionType;
  client_name?: string | null;
  account_category_id?: number | string | null;
  account_category_name?: string | null;
  // Real backend field name — the typo is on the server, not here.
  acccount_subcategory_name?: string | null;
};

function mapApiRuleListRow(raw: ApiRuleListRow): Rule {
  return {
    id: String(raw.id),
    name: raw.name ?? "",
    type: API_TO_RULE_TYPE[raw.transaction_type] ?? "Credit (income)",
    check: "Description",
    compare: "Contain",
    values: [],
    categoryId:
      raw.account_category_id != null ? String(raw.account_category_id) : "",
    categoryName: raw.acccount_subcategory_name?.trim() || "",
    accountCategoryName: raw.account_category_name?.trim() || "",
    clientId: null,
    clientName: raw.client_name?.trim() || "",
    assignName: "",
    gst: true,
  };
}

type ApiRuleDetail = {
  id: number | string;
  name: string;
  transaction_type: ApiTransactionType;
  condition_type: string;
  condition: string;
  condition_val: string;
  account_subcategory_id: number | string;
  client_id: number | string | null;
  assign_name?: string | null;
  gst_include: number | boolean;
  client?: { id: number | string; name?: string | null } | null;
};

/** `condition_val` is a JSON-stringified array; a bare, non-JSON string is one value. */
function parseConditionValues(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((value) => String(value));
  } catch {
    // Not JSON — fall through to treating it as a single value.
  }
  return [raw];
}

function mapApiRuleDetail(raw: ApiRuleDetail): Rule {
  const conditionType = (raw.condition_type || "").toUpperCase();
  const condition = (raw.condition || "").toUpperCase();

  return {
    id: String(raw.id),
    name: raw.name ?? "",
    type: API_TO_RULE_TYPE[raw.transaction_type] ?? "Credit (income)",
    check:
      API_TO_RULE_CHECK[conditionType as ApiConditionType] ?? "Description",
    compare: API_TO_RULE_COMPARE[condition as ApiCondition] ?? "Contain",
    values: parseConditionValues(raw.condition_val),
    categoryId:
      raw.account_subcategory_id != null
        ? String(raw.account_subcategory_id)
        : "",
    categoryName: "",
    accountCategoryName: "",
    clientId: raw.client_id != null ? String(raw.client_id) : null,
    clientName: raw.client?.name?.trim() || "",
    // Debit-only free-text label, independent of the client/supplier picked
    // above — sole-webapp's "Expense / Asset" field.
    assignName: raw.assign_name?.trim() || "",
    gst: Number(raw.gst_include) === 1,
  };
}

export async function fetchRuleDetail(id: string): Promise<Rule> {
  const response = await api.post<ApiEnvelope<{ rule: ApiRuleDetail }>>(
    apiRoutes.matchingRules.get,
    buildEncryptedRequestBody({ id }),
  );
  const rule = response.data?.data?.rule;
  if (!response.data?.success || !rule) {
    throw new Error(response.data?.message || "Rule not found.");
  }
  return mapApiRuleDetail(rule);
}

/** Fills in condition/category-id/client-id per row via the detail endpoint. */
async function hydrateRuleRows(rows: ApiRuleListRow[]): Promise<Rule[]> {
  const bases = rows.map(mapApiRuleListRow);
  const details = await Promise.all(
    rows.map((row) => fetchRuleDetail(String(row.id)).catch(() => null)),
  );

  return bases.map((base, index) => {
    const detail = details[index];
    if (!detail) return base;
    return {
      ...detail,
      categoryName: base.categoryName,
      accountCategoryName: base.accountCategoryName,
    };
  });
}

export async function fetchRules(): Promise<Rule[]> {
  const response = await api.get<ApiEnvelope<{ rules: ApiRuleListRow[] }>>(
    apiRoutes.matchingRules.getAll,
  );
  // The backend reports success:false for a genuinely empty list — data.rules
  // is `[]` either way, so there's nothing to gate on `success` for here.
  return hydrateRuleRows(response.data?.data?.rules ?? []);
}

function draftToApiFields(draft: RuleDraft): Record<string, unknown> {
  return {
    transaction_type: RULE_TYPE_TO_API[draft.type],
    name: draft.name.trim(),
    condition_type: RULE_CHECK_TO_API[draft.check],
    condition: RULE_COMPARE_TO_API[draft.compare],
    condition_val: JSON.stringify(
      draft.values.map((value) => value.trim()).filter(Boolean),
    ),
    account_subcategory_id: draft.categoryId,
    client_id: draft.clientId,
    // The Debit-only "Expense / Asset" field — always sent blank for
    // Credit, same as sole-webapp's own submit logic.
    assign_name:
      draft.type === "Debit (expense)" ? draft.assignName.trim() : "",
    gst_include: draft.gst ? 1 : 0,
  };
}

export async function createRuleApi(draft: RuleDraft): Promise<Rule[]> {
  const response = await api.post<ApiEnvelope<{ rules: ApiRuleListRow[] }>>(
    apiRoutes.matchingRules.add,
    buildEncryptedRequestBody(draftToApiFields(draft)),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create rule.");
  }
  // A rule is somebody deciding the product should do the categorising from
  // now on, which is a far stronger signal than any single reconcile. The old
  // app had one generic event covering this whole module.
  track(EVENTS.TRANSACTION_RULE_CREATED);
  return hydrateRuleRows(response.data.data?.rules ?? []);
}

export async function updateRuleApi(
  id: string,
  draft: RuleDraft,
): Promise<Rule[]> {
  const response = await api.post<ApiEnvelope<{ rules: ApiRuleListRow[] }>>(
    apiRoutes.matchingRules.update,
    buildEncryptedRequestBody({ id, ...draftToApiFields(draft) }),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update rule.");
  }
  return hydrateRuleRows(response.data.data?.rules ?? []);
}

export async function deleteRuleApi(id: string): Promise<Rule[]> {
  const response = await api.post<ApiEnvelope<{ rules: ApiRuleListRow[] }>>(
    apiRoutes.matchingRules.delete,
    buildEncryptedRequestBody({ id }),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete rule.");
  }
  return hydrateRuleRows(response.data.data?.rules ?? []);
}

/* ------------------------------------------------------------------ *
 * Account categories — for the rule form's "Account category" picker
 * ------------------------------------------------------------------ */

export type RuleCategoryOption = {
  /** account_subcategory_id */
  id: string;
  name: string;
  parentName: string;
};

type ApiAccountSubcategoryOption = {
  account_subcategory_id: number | string;
  name: string;
};

type ApiAccountCategoryOption = {
  account_category_id: number | string;
  name: string;
  account_subcategories?: ApiAccountSubcategoryOption[];
};

/**
 * Every account subcategory, unfiltered — fetched once regardless of the
 * rule's type (the chart of accounts is fixed, platform-wide data, not
 * something a Credit/Debit switch should ever re-request), and narrowed to
 * the type on hand client-side by `filterRuleCategories` instead. Matches
 * sole-webapp's own approach, which fetches this list once per page load
 * and filters entirely client-side when the type is switched.
 */
export async function fetchRuleCategories(): Promise<RuleCategoryOption[]> {
  const response = await api.get<
    ApiEnvelope<{ account_categories: ApiAccountCategoryOption[] }>
  >(apiRoutes.accountCategory.list);

  const categories = response.data?.data?.account_categories ?? [];
  return categories.flatMap((category) =>
    (category.account_subcategories ?? []).map((sub) => ({
      id: String(sub.account_subcategory_id),
      name: sub.name,
      parentName: category.name,
    })),
  );
}

/**
 * Which top-level account categories a rule of this type can assign to —
 * same split as sole-webapp's own `AddRules.js`: a Credit (income) rule picks
 * from Income or Liabilities, a Debit (expense) rule from Expenses, Assets or
 * Liabilities. Matched by the chart of accounts' own name rather than
 * sole-webapp's hardcoded category ids, since those ids are internal to its
 * own config and the real backend rows carry stable names instead
 * ("Income", "Expenses", "Assets", "Liabilities", "Capital" — verified
 * against sole-ocr's own reporting code, which switches on these exact
 * strings).
 */
const RULE_CATEGORY_PARENTS_BY_TYPE: Record<RuleType, string[]> = {
  "Credit (income)": ["income", "liabilities"],
  "Debit (expense)": ["expenses", "assets", "liabilities"],
};

/**
 * Capital/equity is otherwise excluded — sole-webapp's own form offers only
 * one specific Capital subcategory per side (money the owner put in, on the
 * credit side; money the owner drew out, on the debit side), not the whole
 * category. Matched by name since sole-ocr's own bank-matching code already
 * keys off these same two subcategory names for the credit/debit split.
 */
const RULE_CAPITAL_SUBCATEGORY_BY_TYPE: Record<RuleType, string> = {
  "Credit (income)": "owner capital input",
  "Debit (expense)": "drawings",
};

/**
 * Subcategories sole-webapp's own form drops before ever offering them —
 * receivable/contra/clearing accounts a rule has no business assigning to,
 * even though they sit under an otherwise-included parent category.
 */
const RULE_EXCLUDED_SUBCATEGORIES_BY_PARENT: Record<string, string[]> = {
  income: [
    "account receivable",
    "accounts receivable",
    "service income",
    "sales revenue",
    "general income",
  ],
  assets: [
    "accounts receivable",
    "account receivable",
    "accumulated depreciation",
    "gst receivable",
  ],
};

/** Narrows the full chart of accounts to what a rule of this type can assign to. */
export function filterRuleCategories(
  categories: RuleCategoryOption[],
  type: RuleType,
): RuleCategoryOption[] {
  const wantedParents = RULE_CATEGORY_PARENTS_BY_TYPE[type];
  const capitalSubcategoryName = RULE_CAPITAL_SUBCATEGORY_BY_TYPE[type];

  return categories.filter((category) => {
    const parentName = category.parentName?.trim().toLowerCase() ?? "";
    const subcategoryName = category.name?.trim().toLowerCase() ?? "";

    if (wantedParents.includes(parentName)) {
      const excluded = RULE_EXCLUDED_SUBCATEGORIES_BY_PARENT[parentName] ?? [];
      return !excluded.includes(subcategoryName);
    }

    return (
      parentName === "capital" && subcategoryName === capitalSubcategoryName
    );
  });
}

/* ------------------------------------------------------------------ *
 * Sync — matching rules against transactions
 * ------------------------------------------------------------------ */

/** Stands in for a rule id when syncing every rule at once. */
export const ALL_RULES_ID = "__all__";

export type SyncResult = {
  matched: number;
  totalMatched: number;
  totalUnmatched: number;
};

/** `ruleId: null` runs every one of the account's rules in one pass. */
export async function syncRuleApi(ruleId: string | null): Promise<SyncResult> {
  const fields = ruleId ? { rule_id: ruleId } : {};
  const response = await api.post<
    ApiEnvelope<{
      matched?: number;
      total_matched?: number;
      total_unmatched?: number;
    }>
  >(apiRoutes.matchingRules.matchTransSync, buildEncryptedRequestBody(fields));

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to sync rules.");
  }

  const data = response.data.data ?? {};
  return {
    matched: data.matched ?? 0,
    totalMatched: data.total_matched ?? 0,
    totalUnmatched: data.total_unmatched ?? 0,
  };
}

export type RecentlyMatchedTransaction = {
  id: string;
  description: string;
  type: "credit" | "debit";
  categoryName: string;
  clientName: string;
  amount: number;
};

export type RuleSyncStats = {
  autoMatchCount: number;
  matched: number;
  unmatched: number;
  total: number;
  /** Newest first, already capped to 10 by the backend. */
  recentlyMatched: RecentlyMatchedTransaction[];
};

type ApiMatchedDetail = {
  id: number | string;
  transaction_id?: number | string;
  description?: string | null;
  amount: number | string;
  type?: string | null;
  client_id?: number | string | null;
  client_name?: string | null;
  category_name?: string | null;
};

type ApiSyncStats = {
  auto_match_count?: number;
  matched?: number;
  unmatched?: number;
  total?: number;
  matched_details?: ApiMatchedDetail[];
};

export async function fetchRuleSyncStats(): Promise<RuleSyncStats> {
  const response = await api.get<ApiEnvelope<ApiSyncStats>>(
    apiRoutes.matchingRules.matchTransSyncStats,
  );
  const data = response.data?.data ?? {};

  return {
    autoMatchCount: data.auto_match_count ?? 0,
    matched: data.matched ?? 0,
    unmatched: data.unmatched ?? 0,
    total: data.total ?? 0,
    recentlyMatched: (data.matched_details ?? []).map((detail) => ({
      id: String(detail.transaction_id ?? detail.id),
      description: detail.description?.trim() || "",
      type: detail.type === "credit" ? "credit" : "debit",
      categoryName: detail.category_name?.trim() || "",
      clientName: detail.client_name?.trim() || "",
      amount: Number(detail.amount) || 0,
    })),
  };
}

/**
 * The Sync progress card's percent — matched against everything the account
 * has, to at most two decimal places (14 of 10,759 is 0.13, not
 * 0.13012362...).
 */
export function syncProgressPercent(
  stats: Pick<RuleSyncStats, "matched" | "total">,
): number {
  if (stats.total <= 0) return 0;
  const percent = (stats.matched / stats.total) * 100;
  return Math.min(100, Math.max(0, Math.round(percent * 100) / 100));
}

/**
 * The percent as text, with decimals only when they say something: "25%",
 * "38.2%", "0.13%". Rounding can still land on 0 or 100 at the extremes, so
 * those two are kept for exactly none and exactly all — "<0.01%" and
 * ">99.99%" otherwise.
 */
export function syncProgressLabel(
  stats: Pick<RuleSyncStats, "matched" | "total">,
): string {
  if (stats.total <= 0 || stats.matched <= 0) return "0%";
  if (stats.matched >= stats.total) return "100%";
  const percent = syncProgressPercent(stats);
  if (percent <= 0) return "<0.01%";
  if (percent >= 100) return ">99.99%";
  return `${percent}%`;
}

/** The Recently matched list's signed amount. */
export function signedSyncAmount(
  detail: Pick<RecentlyMatchedTransaction, "type" | "amount">,
): string {
  const amount = invoiceMoney(Math.abs(detail.amount));
  return detail.type === "credit" ? `+${amount}` : `-${amount}`;
}
