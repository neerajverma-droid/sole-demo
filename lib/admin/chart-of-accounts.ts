import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";

/**
 * The shared chart of accounts, as super admins maintain it.
 *
 * One catalogue for every country, on purpose. Every journal line points at a
 * subcategory id and a dozen ids are named directly in sole-ocr's code
 * (`utils/account_config.js`, the BAS stored procedures), so a chart that
 * forked per country would fork those too. What varies per country is
 * therefore not the account but:
 *
 *   labels        {"ZA": "VAT Collected"} — what this country calls it
 *   countryIso2   null = offered everywhere; "AU" = Australia only
 *
 * Deleting is always soft. An account with postings against it must keep
 * resolving, and "no postings today" is not "none ever" — so the backend has
 * no hard delete at all, and this module has no call for one.
 */

/* -------------------------------------------------------------------------- *
 * Types
 * -------------------------------------------------------------------------- */

/** What an account is to the tax engine; null = not a tax control account. */
export const TAX_ROLES = ["tax_collected", "tax_paid", "tax_payable", "tax_expense"] as const;
export type TaxRole = (typeof TAX_ROLES)[number];

export const TAX_ROLE_LABELS: Record<TaxRole, { label: string; description: string }> = {
  tax_collected: { label: "Tax collected", description: "Tax charged on sales, held until it is paid over." },
  tax_payable: { label: "Tax payable", description: "The liability owed to the tax authority." },
  tax_paid: { label: "Tax paid", description: "Tax paid on purchases and claimable back." },
  tax_expense: { label: "Tax expense", description: "Tax that can't be claimed and becomes a cost." },
};

/** N = normal, P = personal, T = transfer — the last two are kept out of the statements. */
export const CAT_TYPES = ["N", "P", "T"] as const;
export type CatType = (typeof CAT_TYPES)[number];

export const CAT_TYPE_LABELS: Record<CatType, string> = {
  N: "Normal",
  P: "Personal",
  T: "Transfer",
};

export type ChartAccount = {
  id: number;
  categoryId: number;
  name: string;
  code: string;
  /** null = offered in every country. */
  countryIso2: string | null;
  labels: Record<string, string> | null;
  taxRole: TaxRole | null;
  catType: CatType;
  isHidden: boolean;
  orderNo: number;
  deleted: boolean;
  /** Named directly in sole-ocr's code — can't be retired or moved. */
  protected: boolean;
  protectedReason: string | null;
  /** Journal lines already posted against it. */
  postings: number;
};

export type ChartCategory = {
  id: number;
  name: string;
  countryIso2: string | null;
  labels: Record<string, string> | null;
  catType: CatType;
  isHidden: boolean;
  orderNo: number;
  deleted: boolean;
  accounts: ChartAccount[];
};

export type ChartCountry = { iso2: string; name: string };

/* -------------------------------------------------------------------------- *
 * Mapping
 * -------------------------------------------------------------------------- */

type ApiRecord = Record<string, unknown>;

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const str = (value: unknown): string =>
  typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
const bool = (value: unknown): boolean => value === true || value === 1 || value === "1";
const iso2Of = (value: unknown): string | null => str(value).trim().toUpperCase() || null;

const labelsOf = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, label]) => [key.toUpperCase(), str(label).trim()] as const)
    .filter(([, label]) => label !== "");
  return entries.length ? Object.fromEntries(entries) : null;
};

const catTypeOf = (value: unknown): CatType =>
  (CAT_TYPES as readonly string[]).includes(str(value)) ? (str(value) as CatType) : "N";

export function mapAccount(row: ApiRecord): ChartAccount {
  return {
    id: num(row.id),
    categoryId: num(row.account_category_id),
    name: str(row.name),
    code: str(row.code),
    countryIso2: iso2Of(row.country_iso2),
    labels: labelsOf(row.labels),
    taxRole: (TAX_ROLES as readonly string[]).includes(str(row.tax_role)) ? (str(row.tax_role) as TaxRole) : null,
    catType: catTypeOf(row.cat_type),
    isHidden: bool(row.is_hidden),
    orderNo: num(row.order_no),
    deleted: bool(row.deleted),
    protected: bool(row.protected),
    protectedReason: str(row.protected_reason) || null,
    postings: num(row.postings),
  };
}

export function mapCategory(row: ApiRecord): ChartCategory {
  return {
    id: num(row.id),
    name: str(row.name),
    countryIso2: iso2Of(row.country_iso2),
    labels: labelsOf(row.labels),
    catType: catTypeOf(row.cat_type),
    isHidden: bool(row.is_hidden),
    orderNo: num(row.order_no),
    deleted: bool(row.deleted),
    accounts: Array.isArray(row.subcategories) ? (row.subcategories as ApiRecord[]).map(mapAccount) : [],
  };
}

/* -------------------------------------------------------------------------- *
 * Reading a row
 * -------------------------------------------------------------------------- */

/** Where this row is offered, in words. */
export function availabilityLabel(
  row: Pick<ChartAccount, "countryIso2">,
  countries: ChartCountry[],
): string {
  if (!row.countryIso2) return "Every country";
  return countries.find((country) => country.iso2 === row.countryIso2)?.name ?? row.countryIso2;
}

/** What a country calls this account, falling back to its stored name. */
export function nameIn(row: Pick<ChartAccount, "name" | "labels">, country: string): string {
  return row.labels?.[country.toUpperCase()] ?? row.name;
}

/**
 * Why this account can't be retired, or null if it can.
 *
 * The same rule the backend enforces, stated here so the action is disabled
 * with its reason rather than failing on click.
 */
export function retireBlockedReason(row: ChartAccount): string | null {
  return row.protected
    ? `Used directly in Sole's code (${row.protectedReason ?? "referenced by id"}), so transactions would keep posting to it.`
    : null;
}

export function categoryRetireBlockedReason(category: ChartCategory): string | null {
  const live = category.accounts.filter((account) => !account.deleted).length;
  return live > 0
    ? `${live} ${live === 1 ? "account is" : "accounts are"} still in this category. Retire those first.`
    : null;
}

/** Whether clearing this account's tax role would strand a line on the return. */
export function taxRoleLocked(row: ChartAccount): boolean {
  return row.taxRole !== null;
}

/* -------------------------------------------------------------------------- *
 * Validation — what the backend would refuse, caught before the request
 * -------------------------------------------------------------------------- */

export type AccountInput = {
  name: string;
  code: string;
  categoryId: number | null;
  countryIso2: string | null;
  taxRole: TaxRole | null;
  catType: CatType;
  labels: Record<string, string>;
};

export type AccountIssues = Partial<Record<"name" | "code" | "categoryId", string>>;

export function accountIssues(input: AccountInput): AccountIssues {
  const issues: AccountIssues = {};
  if (!input.name.trim()) issues.name = "Enter a name for the account.";
  else if (input.name.trim().length > 255) issues.name = "Keep the name to 255 characters or fewer.";

  if (!input.code.trim()) issues.code = "Enter an account code.";
  else if (input.code.trim().length > 10) issues.code = "Keep the code to 10 characters or fewer.";

  if (!input.categoryId) issues.categoryId = "Choose which category this sits under.";
  return issues;
}

export type CategoryInput = {
  name: string;
  countryIso2: string | null;
  catType: CatType;
  labels: Record<string, string>;
};

export function categoryIssues(input: CategoryInput): Partial<Record<"name", string>> {
  if (!input.name.trim()) return { name: "Enter a name for the category." };
  if (input.name.trim().length > 255) return { name: "Keep the name to 255 characters or fewer." };
  return {};
}

/** Strips the blank rows a labels editor leaves behind. */
export function cleanLabels(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(labels)
      .map(([key, value]) => [key.toUpperCase(), value.trim()] as const)
      .filter(([key, value]) => key !== "" && value !== ""),
  );
}

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

function unwrap<T>(payload: ApiEnvelope<T> | undefined, what: string): T {
  if (!payload || payload.success === false || payload.data === undefined) {
    throw new Error(payload?.message ?? `The ${what} request failed.`);
  }
  return payload.data;
}

/** `GET /super/chart-of-accounts` — categories with their accounts nested. */
export async function fetchChart({ includeDeleted = false, country = null }: { includeDeleted?: boolean; country?: string | null } = {}): Promise<ChartCategory[]> {
  const response = await api.get<ApiEnvelope<ApiRecord[]>>(apiRoutes.superAdmin.chartOfAccounts, {
    params: { ...(includeDeleted ? { include_deleted: true } : {}), ...(country ? { country } : {}) },
  });
  return unwrap(response.data, "chart of accounts").map(mapCategory);
}

/** The countries an account can be scoped to — every registry entry, not just live ones. */
export async function fetchChartCountries(): Promise<ChartCountry[]> {
  const response = await api.get<ApiEnvelope<ApiRecord[]>>(`${apiRoutes.superAdmin.chartOfAccounts}/countries`);
  return unwrap(response.data, "countries").map((row) => ({
    iso2: str(row.country_iso2).toUpperCase(),
    name: str(row.name),
  }));
}

const accountBody = (input: AccountInput) => ({
  name: input.name.trim(),
  code: input.code.trim(),
  account_category_id: input.categoryId,
  country_iso2: input.countryIso2,
  tax_role: input.taxRole,
  cat_type: input.catType,
  labels: cleanLabels(input.labels),
});

export async function createAccountApi(input: AccountInput): Promise<ChartAccount> {
  const response = await api.post<ApiEnvelope<ApiRecord>>(apiRoutes.superAdmin.chartAccounts, accountBody(input));
  return mapAccount(unwrap(response.data, "account"));
}

export async function updateAccountApi(id: number, input: AccountInput): Promise<ChartAccount> {
  const response = await api.patch<ApiEnvelope<ApiRecord>>(apiRoutes.superAdmin.chartAccount(id), accountBody(input));
  return mapAccount(unwrap(response.data, "account"));
}

/** Soft — the account stops being offered; its postings stand. */
export async function retireAccountApi(id: number): Promise<{ postingsKept: number }> {
  const response = await api.delete<ApiEnvelope<{ postings_kept?: number }>>(apiRoutes.superAdmin.chartAccount(id));
  return { postingsKept: num(unwrap(response.data, "retire").postings_kept) };
}

export async function restoreAccountApi(id: number): Promise<void> {
  await api.post(apiRoutes.superAdmin.chartAccountRestore(id));
}

const categoryBody = (input: CategoryInput) => ({
  name: input.name.trim(),
  country_iso2: input.countryIso2,
  cat_type: input.catType,
  labels: cleanLabels(input.labels),
});

export async function createCategoryApi(input: CategoryInput): Promise<ChartCategory> {
  const response = await api.post<ApiEnvelope<ApiRecord>>(apiRoutes.superAdmin.chartCategories, categoryBody(input));
  return mapCategory(unwrap(response.data, "category"));
}

export async function updateCategoryApi(id: number, input: CategoryInput): Promise<ChartCategory> {
  const response = await api.patch<ApiEnvelope<ApiRecord>>(apiRoutes.superAdmin.chartCategory(id), categoryBody(input));
  return mapCategory(unwrap(response.data, "category"));
}

export async function retireCategoryApi(id: number): Promise<void> {
  await api.delete(apiRoutes.superAdmin.chartCategory(id));
}

export async function restoreCategoryApi(id: number): Promise<void> {
  await api.post(apiRoutes.superAdmin.chartCategoryRestore(id));
}
