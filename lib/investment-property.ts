import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { toIsoDate } from "@/lib/invoices";

export const PROPERTY_TYPES = [
  { value: "house", label: "House" },
  { value: "unit", label: "Apartment / Unit" },
  { value: "townhouse", label: "Townhouse" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
  { value: "other", label: "Other" },
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"];

export const OWNERSHIP_ENTITIES = [
  {
    value: "individual",
    label: "Individual",
    hint: "Owned personally and assessed under individual tax rules.",
  },
  {
    value: "company",
    label: "Company",
    hint: "Held by a company and assessed using company tax settings.",
  },
] as const;
export type OwnershipEntity = (typeof OWNERSHIP_ENTITIES)[number]["value"];

export const TAX_TREATMENTS = [
  {
    value: "investment",
    label: "Investment",
    hint: "Standard investment-property CGT estimate flow.",
  },
  {
    value: "ppor",
    label: "PPOR",
    hint: "Marks the property as a principal place of residence.",
  },
  {
    value: "mixed_use",
    label: "Mixed use",
    hint: "Both private and investment treatment across time.",
  },
] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number]["value"];

export type PropertyStatus = "active" | "disposed";
export type PropertyStatusFilter = "all" | PropertyStatus;

export function propertyTypeLabel(value: string | null | undefined): string {
  return PROPERTY_TYPES.find((type) => type.value === value)?.label ?? "—";
}

export function ownershipLabel(value: string | null | undefined): string {
  return OWNERSHIP_ENTITIES.find((entity) => entity.value === value)?.label ?? "—";
}

export function taxTreatmentLabel(value: string | null | undefined): string {
  return TAX_TREATMENTS.find((treatment) => treatment.value === value)?.label ?? "—";
}

export type PropertyListItem = {
  id: string;
  name: string;
  address: string;
  purchaseDate: string;
  purchasePrice: number;
  currentValue: number;
  hasCurrentValue: boolean;
  loanBalance: number;
  equity: number;
  status: PropertyStatus;
};

export type Property = PropertyListItem & {
  type: PropertyType;
  ownershipEntity: OwnershipEntity;
  taxTreatment: TaxTreatment;
  stampDuty: number;
  legalCosts: number;
  buyerAgentCosts: number;
  notes: string;
  valueUpdatedAt: string | null;
  disposalDate: string | null;
  disposalSalePrice: number | null;
  disposalSellingCosts: number | null;
};

export type PropertyListMeta = { all: number; active: number; disposed: number };

export type PropertyPage = {
  properties: PropertyListItem[];
  total: number;
  meta: PropertyListMeta;
};

type ApiProperty = {
  id: number | string;
  property_name?: string | null;
  property_type?: string | null;
  ownership_entity?: string | null;
  property_tax_treatment?: string | null;
  address?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | string | null;
  stamp_duty?: number | string | null;
  legal_costs?: number | string | null;
  buyer_agent_costs?: number | string | null;
  current_value?: number | string | null;
  effective_loan_amount?: number | string | null;
  equity?: number | string | null;
  notes?: string | null;
  status?: string | null;
  property_value_updated_at?: string | null;
  disposal_date?: string | null;
  disposal_sale_price?: number | string | null;
  disposal_selling_costs?: number | string | null;
};

export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return toNumber(value);
}

export function toBool(value: unknown): boolean {
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return Boolean(value);
}

function toStatus(value: unknown): PropertyStatus {
  return value === "disposed" ? "disposed" : "active";
}

function isPropertyType(value: unknown): value is PropertyType {
  return PROPERTY_TYPES.some((type) => type.value === value);
}

function isOwnershipEntity(value: unknown): value is OwnershipEntity {
  return OWNERSHIP_ENTITIES.some((entity) => entity.value === value);
}

function isTaxTreatment(value: unknown): value is TaxTreatment {
  return TAX_TREATMENTS.some((treatment) => treatment.value === value);
}

export function mapPropertyListItem(raw: ApiProperty): PropertyListItem {
  const currentValue = toNumber(raw.current_value);
  const loanBalance = toNumber(raw.effective_loan_amount);
  return {
    id: String(raw.id),
    name: raw.property_name ?? "",
    address: raw.address ?? "",
    purchaseDate: raw.purchase_date ?? "",
    purchasePrice: toNumber(raw.purchase_price),
    currentValue,
    hasCurrentValue: raw.current_value != null && raw.current_value !== "",
    loanBalance,
    equity: raw.equity != null ? toNumber(raw.equity) : currentValue - loanBalance,
    status: toStatus(raw.status),
  };
}

export function mapProperty(raw: ApiProperty): Property {
  return {
    ...mapPropertyListItem(raw),
    type: isPropertyType(raw.property_type) ? raw.property_type : "other",
    ownershipEntity: isOwnershipEntity(raw.ownership_entity)
      ? raw.ownership_entity
      : "individual",
    taxTreatment: isTaxTreatment(raw.property_tax_treatment)
      ? raw.property_tax_treatment
      : "investment",
    stampDuty: toNumber(raw.stamp_duty),
    legalCosts: toNumber(raw.legal_costs),
    buyerAgentCosts: toNumber(raw.buyer_agent_costs),
    notes: raw.notes ?? "",
    valueUpdatedAt: raw.property_value_updated_at ?? null,
    disposalDate: raw.disposal_date ?? null,
    disposalSalePrice: toNullableNumber(raw.disposal_sale_price),
    disposalSellingCosts: toNullableNumber(raw.disposal_selling_costs),
  };
}

export function propertyCostBase(property: Property): number {
  return (
    property.purchasePrice +
    property.stampDuty +
    property.legalCosts +
    property.buyerAgentCosts
  );
}

export function formatPropertyDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return year && month && day ? `${day}-${month}-${year}` : "—";
}

export type PropertyDraft = {
  name: string;
  type: PropertyType | "";
  ownershipEntity: OwnershipEntity;
  taxTreatment: TaxTreatment;
  address: string;
  purchaseDate: string;
  purchasePrice: string;
  stampDuty: string;
  legalCosts: string;
  buyerAgentCosts: string;
  currentValue: string;
  notes: string;
};

export function emptyPropertyDraft(): PropertyDraft {
  return {
    name: "",
    type: "",
    ownershipEntity: "individual",
    taxTreatment: "investment",
    address: "",
    purchaseDate: "",
    purchasePrice: "",
    stampDuty: "",
    legalCosts: "",
    buyerAgentCosts: "",
    currentValue: "",
    notes: "",
  };
}

function moneyText(value: number, keepZero = false): string {
  if (!value && !keepZero) return "";
  return String(value);
}

export function draftFromProperty(property: Property): PropertyDraft {
  return {
    name: property.name,
    type: property.type,
    ownershipEntity: property.ownershipEntity,
    taxTreatment: property.taxTreatment,
    address: property.address,
    purchaseDate: property.purchaseDate,
    purchasePrice: moneyText(property.purchasePrice),
    stampDuty: moneyText(property.stampDuty),
    legalCosts: moneyText(property.legalCosts),
    buyerAgentCosts: moneyText(property.buyerAgentCosts),
    currentValue: property.hasCurrentValue ? moneyText(property.currentValue, true) : "",
    notes: property.notes,
  };
}

export type PropertyIssue = { key: keyof PropertyDraft; message: string };

export const MAX_MONEY = 9_999_999_999_999.99;

export function parseMoney(text: string): number | null {
  const cleaned = text.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

function moneyIssue(
  key: keyof PropertyDraft,
  text: string,
  label: string,
): PropertyIssue | null {
  const value = parseMoney(text);
  if (value === null) return null;
  if (Number.isNaN(value)) {
    return { key, message: `${label} must be a dollar amount, up to 2 decimals.` };
  }
  if (value > MAX_MONEY) return { key, message: `${label} is too large.` };
  return null;
}

export function propertyIssues(
  draft: PropertyDraft,
  today: Date = new Date(),
): PropertyIssue[] {
  const issues: PropertyIssue[] = [];

  if (!draft.name.trim()) {
    issues.push({ key: "name", message: "Property name is required." });
  } else if (draft.name.trim().length > 255) {
    issues.push({ key: "name", message: "Property name must be 255 characters or fewer." });
  }

  if (!draft.type) issues.push({ key: "type", message: "Select a property type." });

  if (draft.address.length > 500) {
    issues.push({ key: "address", message: "Address must be 500 characters or fewer." });
  }

  if (!draft.purchaseDate) {
    issues.push({ key: "purchaseDate", message: "Purchase date is required." });
  } else if (draft.purchaseDate > toIsoDate(today)) {
    issues.push({ key: "purchaseDate", message: "Purchase date can't be in the future." });
  }

  const price = parseMoney(draft.purchasePrice);
  if (price === null) {
    issues.push({ key: "purchasePrice", message: "Purchase price is required." });
  } else if (Number.isNaN(price) || price <= 0) {
    issues.push({
      key: "purchasePrice",
      message: "Purchase price must be greater than zero.",
    });
  } else if (price > MAX_MONEY) {
    issues.push({ key: "purchasePrice", message: "Purchase price is too large." });
  }

  const optional: [keyof PropertyDraft, string, string][] = [
    ["stampDuty", draft.stampDuty, "Stamp duty"],
    ["legalCosts", draft.legalCosts, "Legal costs"],
    ["buyerAgentCosts", draft.buyerAgentCosts, "Acquisition costs"],
    ["currentValue", draft.currentValue, "Current value"],
  ];
  for (const [key, text, label] of optional) {
    const issue = moneyIssue(key, text, label);
    if (issue) issues.push(issue);
  }

  return issues;
}

export function propertyWriteBody(draft: PropertyDraft) {
  return {
    property_name: draft.name.trim(),
    property_type: draft.type,
    ownership_entity: draft.ownershipEntity,
    property_tax_treatment: draft.taxTreatment,
    address: draft.address.trim() || null,
    purchase_date: draft.purchaseDate,
    purchase_price: parseMoney(draft.purchasePrice) ?? 0,
    stamp_duty: parseMoney(draft.stampDuty) ?? 0,
    legal_costs: parseMoney(draft.legalCosts) ?? 0,
    buyer_agent_costs: parseMoney(draft.buyerAgentCosts) ?? 0,
    current_value: parseMoney(draft.currentValue),
    notes: draft.notes.trim() || null,
  };
}

export type DisposeDraft = {
  salePrice: string;
  sellingCosts: string;
  disposalDate: string;
};

export function emptyDisposeDraft(today: Date = new Date()): DisposeDraft {
  return { salePrice: "", sellingCosts: "", disposalDate: toIsoDate(today) };
}

export type DisposeIssue = { key: keyof DisposeDraft; message: string };

export function disposeIssues(
  draft: DisposeDraft,
  purchaseDate: string,
): DisposeIssue[] {
  const issues: DisposeIssue[] = [];

  const sale = parseMoney(draft.salePrice);
  if (sale === null) {
    issues.push({ key: "salePrice", message: "Sale price is required." });
  } else if (Number.isNaN(sale) || sale <= 0) {
    issues.push({ key: "salePrice", message: "Sale price must be greater than zero." });
  } else if (sale > MAX_MONEY) {
    issues.push({ key: "salePrice", message: "Sale price is too large." });
  }

  const costs = parseMoney(draft.sellingCosts);
  if (costs !== null && (Number.isNaN(costs) || costs > MAX_MONEY)) {
    issues.push({
      key: "sellingCosts",
      message: "Selling costs must be a dollar amount, up to 2 decimals.",
    });
  }

  if (!draft.disposalDate) {
    issues.push({ key: "disposalDate", message: "Sale date is required." });
  } else if (purchaseDate && draft.disposalDate < purchaseDate) {
    issues.push({
      key: "disposalDate",
      message: "Sale date can't be before the purchase date.",
    });
  }

  return issues;
}

export type DisposeResult = {
  salePrice: number;
  sellingCosts: number;
  disposalDate: string;
  totalCostBase: number;
  capitalGain: number;
  isGain: boolean;
};

export type Envelope<T, S = Record<string, unknown>> = {
  success?: boolean;
  message?: string;
  data?: T;
  pagination?: { total?: number };
  meta?: { all?: number; active?: number; disposed?: number };
  summary?: S;
};

export function unwrap<T, S = Record<string, unknown>>(
  response: { data?: Envelope<T, S> },
  fallback: string,
): T {
  const body = response.data;
  if (!body || body.success === false || body.data === undefined) {
    throw new Error(body?.message || fallback);
  }
  return body.data;
}

export type PropertyListParams = {
  page: number;
  limit: number;
  name?: string;
  status?: PropertyStatusFilter;
};

export async function fetchPropertiesPage(
  params: PropertyListParams,
): Promise<PropertyPage> {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  if (params.name?.trim()) query.name = params.name.trim();
  if (params.status && params.status !== "all") query.status = params.status;

  const response = await api.get<Envelope<ApiProperty[]>>(apiRoutes.investment.list, {
    params: query,
  });
  const rows = unwrap(response, "Couldn't load properties.");
  const meta = response.data?.meta;
  return {
    properties: rows.map(mapPropertyListItem),
    total: response.data?.pagination?.total ?? rows.length,
    meta: {
      all: toNumber(meta?.all),
      active: toNumber(meta?.active),
      disposed: toNumber(meta?.disposed),
    },
  };
}

export async function fetchProperty(id: string): Promise<Property> {
  const response = await api.get<Envelope<ApiProperty>>(
    `${apiRoutes.investment.info}${encodeURIComponent(id)}`,
  );
  return mapProperty(unwrap(response, "Couldn't load this property."));
}

export async function createPropertyApi(draft: PropertyDraft): Promise<{ id: string }> {
  const response = await api.post<Envelope<ApiProperty>>(
    apiRoutes.investment.create,
    propertyWriteBody(draft),
  );
  const created = unwrap(response, "Couldn't create the property.");
  return { id: String(created.id) };
}

export async function updatePropertyApi(
  id: string,
  draft: PropertyDraft,
): Promise<void> {
  const response = await api.put<Envelope<ApiProperty>>(
    `${apiRoutes.investment.update}${encodeURIComponent(id)}`,
    propertyWriteBody(draft),
  );
  unwrap(response, "Couldn't save the property.");
}

export async function deletePropertyApi(id: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.investment.delete}${encodeURIComponent(id)}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete the property.");
  }
}

type ApiDisposeResult = {
  sale_price?: number | string;
  selling_costs?: number | string;
  disposal_date?: string | null;
  total_cost_base?: number | string;
  capital_gain?: number | string;
  is_gain?: boolean;
};

export async function disposePropertyApi(
  id: string,
  draft: DisposeDraft,
): Promise<DisposeResult> {
  const response = await api.post<Envelope<ApiDisposeResult>>(
    `${apiRoutes.investment.dispose}${encodeURIComponent(id)}`,
    {
      sale_price: parseMoney(draft.salePrice) ?? 0,
      selling_costs: parseMoney(draft.sellingCosts) ?? 0,
      disposal_date: draft.disposalDate,
    },
  );
  const result = unwrap(response, "Couldn't record the sale.");
  const capitalGain = toNumber(result.capital_gain);
  return {
    salePrice: toNumber(result.sale_price),
    sellingCosts: toNumber(result.selling_costs),
    disposalDate: result.disposal_date ?? draft.disposalDate,
    totalCostBase: toNumber(result.total_cost_base),
    capitalGain,
    isGain: result.is_gain ?? capitalGain >= 0,
  };
}

export type PropertySummary = {
  costBase: number;
  capitalImprovements: number;
  ytdRentalIncome: number;
  ytdExpenses: number;
  ytdNetReturn: number;
};

type ApiPropertySummary = {
  costBase?: number | string;
  capitalImprovements?: number | string;
  ytdRentalIncome?: number | string;
  ytdExpenses?: number | string;
  ytdNetReturn?: number | string;
};

export async function fetchPropertySummary(
  id: string,
  year: number,
): Promise<PropertySummary> {
  const response = await api.get<Envelope<ApiPropertySummary>>(
    `${apiRoutes.investment.summary}${encodeURIComponent(id)}`,
    { params: { year } },
  );
  const data = unwrap(response, "Couldn't load the property summary.");
  return {
    costBase: toNumber(data.costBase),
    capitalImprovements: toNumber(data.capitalImprovements),
    ytdRentalIncome: toNumber(data.ytdRentalIncome),
    ytdExpenses: toNumber(data.ytdExpenses),
    ytdNetReturn: toNumber(data.ytdNetReturn),
  };
}

const AU_FINANCIAL_YEAR_START_MONTH_INDEX = 6;
const VALUE_STALE_AFTER_DAYS = 365;

export function currentFinancialYearStart(today: Date = new Date()): number {
  return today.getMonth() >= AU_FINANCIAL_YEAR_START_MONTH_INDEX ? today.getFullYear() : today.getFullYear() - 1;
}

export function financialYearStartOf(iso: string): number | null {
  if (!isValidIsoDate(iso)) return null;
  const [year, month] = iso.split("-").map(Number);
  return month - 1 >= AU_FINANCIAL_YEAR_START_MONTH_INDEX ? year : year - 1;
}

export function isValueStale(
  property: { hasCurrentValue: boolean; valueUpdatedAt: string | null },
  today: Date = new Date(),
): boolean {
  if (!property.hasCurrentValue || !property.valueUpdatedAt) return true;
  const updated = new Date(property.valueUpdatedAt);
  if (Number.isNaN(updated.getTime())) return true;
  return today.getTime() - updated.getTime() >= VALUE_STALE_AFTER_DAYS * 86_400_000;
}

export function propertyYearOptions(
  purchaseDate: string,
  disposalDate: string | null,
  today: Date = new Date(),
): number[] {
  const last = disposalDate && isValidIsoDate(disposalDate.slice(0, 10)) ? Number(disposalDate.slice(0, 4)) : today.getFullYear();
  const first = isValidIsoDate(purchaseDate) ? Number(purchaseDate.slice(0, 4)) : last;
  const end = Math.min(last, today.getFullYear());
  return Array.from({ length: Math.max(1, end - Math.min(first, end) + 1) }, (_, index) => end - index);
}

export function financialYearLabel(start: number): string {
  return `FY ${start}–${String(start + 1).slice(2)}`;
}

export type FinancialYearOption = { value: string; label: string };

export function financialYearOptions(
  earliestPurchaseDate: string | null,
  today: Date = new Date(),
): FinancialYearOption[] {
  const current = currentFinancialYearStart(today);
  const earliest = earliestPurchaseDate ? financialYearStartOf(earliestPurchaseDate) : null;
  const first = earliest === null ? current : Math.min(earliest, current);
  return [
    ...Array.from({ length: current - first + 1 }, (_, index) => {
      const start = current - index;
      return { value: String(start), label: financialYearLabel(start) };
    }),
    { value: "all", label: "All time" },
  ];
}

export type PortfolioFilters = {
  financialYearStart: number | null;
  status: PropertyStatusFilter;
  name?: string;
};

function portfolioParams(filters: PortfolioFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (filters.financialYearStart !== null) {
    params.financial_year_start = filters.financialYearStart;
  }
  if (filters.status !== "all") params.status = filters.status;
  if (filters.name?.trim()) params.name = filters.name.trim();
  return params;
}

export type PortfolioSummary = {
  totalProperties: number;
  activeProperties: number;
  disposedProperties: number;
  totalValue: number;
  totalLoan: number;
  totalEquity: number;
  rentReceived: number;
  propertyExpenses: number;
  netRentalResult: number;
  loanRepayments: number;
  estimatedCashFlow: number;
  totalCostBase: number;
};

type ApiPortfolioSummary = {
  total_properties?: number;
  active_properties?: number;
  disposed_properties?: number;
  total_current_value?: number | string;
  total_loan_amount?: number | string;
  total_equity?: number | string;
  ytd_rental_income_received?: number | string;
  ytd_property_expenses?: number | string;
  ytd_net_rental_result?: number | string;
  ytd_loan_repayments?: number | string;
  estimated_cash_flow_ytd?: number | string;
  total_cost_base?: number | string;
};

export async function fetchPortfolioSummary(
  filters: PortfolioFilters,
): Promise<PortfolioSummary> {
  const response = await api.get<Envelope<ApiPortfolioSummary>>(
    apiRoutes.investment.portfolioSummary,
    { params: portfolioParams(filters) },
  );
  const data = unwrap(response, "Couldn't load the portfolio summary.");
  return {
    totalProperties: toNumber(data.total_properties),
    activeProperties: toNumber(data.active_properties),
    disposedProperties: toNumber(data.disposed_properties),
    totalValue: toNumber(data.total_current_value),
    totalLoan: toNumber(data.total_loan_amount),
    totalEquity: toNumber(data.total_equity),
    rentReceived: toNumber(data.ytd_rental_income_received),
    propertyExpenses: toNumber(data.ytd_property_expenses),
    netRentalResult: toNumber(data.ytd_net_rental_result),
    loanRepayments: toNumber(data.ytd_loan_repayments),
    estimatedCashFlow: toNumber(data.estimated_cash_flow_ytd),
    totalCostBase: toNumber(data.total_cost_base),
  };
}

export type ExpenseBreakdownKey =
  | "property_expenses"
  | "capital_improvements"
  | "selling_costs";

export type ExpenseBreakdown = {
  total: number;
  propertiesInScope: number;
  segments: { key: ExpenseBreakdownKey; label: string; amount: number }[];
};

type ApiExpenseBreakdown = {
  totals?: { total?: number | string };
  breakdown?: { key?: string; label?: string; amount?: number | string }[];
  properties_in_scope?: number;
};

const BREAKDOWN_KEYS: ExpenseBreakdownKey[] = [
  "property_expenses",
  "capital_improvements",
  "selling_costs",
];

export async function fetchExpenseBreakdown(
  filters: PortfolioFilters,
): Promise<ExpenseBreakdown> {
  const response = await api.get<Envelope<ApiExpenseBreakdown>>(
    apiRoutes.investment.portfolioExpenseBreakdown,
    { params: portfolioParams(filters) },
  );
  const data = unwrap(response, "Couldn't load the expense breakdown.");
  const segments = (data.breakdown ?? [])
    .filter((row): row is { key: ExpenseBreakdownKey; label?: string; amount?: number | string } =>
      BREAKDOWN_KEYS.includes(row.key as ExpenseBreakdownKey),
    )
    .map((row) => ({
      key: row.key,
      label: row.label ?? row.key,
      amount: toNumber(row.amount),
    }));
  return {
    total: toNumber(data.totals?.total),
    propertiesInScope: toNumber(data.properties_in_scope),
    segments,
  };
}

export type IncomeExpense = {
  rentalIncome: number;
  propertyExpenses: number;
  netResult: number;
};

type ApiIncomeExpense = {
  totals?: {
    rental_income?: number | string;
    property_expenses?: number | string;
    net_result?: number | string;
  };
};

export async function fetchIncomeExpense(
  filters: PortfolioFilters,
): Promise<IncomeExpense> {
  const response = await api.get<Envelope<ApiIncomeExpense>>(
    apiRoutes.investment.portfolioIncomeExpense,
    { params: portfolioParams(filters) },
  );
  const data = unwrap(response, "Couldn't load income and expenses.");
  return {
    rentalIncome: toNumber(data.totals?.rental_income),
    propertyExpenses: toNumber(data.totals?.property_expenses),
    netResult: toNumber(data.totals?.net_result),
  };
}

export type RentCollection = {
  received: number;
  outstanding: number;
  overdue: number;
  upcoming: number;
  scheduled: number;
  collectionRate: number;
};

type ApiRentCollection = {
  totals?: {
    received_rent?: number | string;
    outstanding_rent?: number | string;
    overdue_rent?: number | string;
    upcoming_rent?: number | string;
    total_scheduled_rent?: number | string;
    collection_rate?: number | string;
  };
};

export async function fetchRentCollection(
  filters: PortfolioFilters,
): Promise<RentCollection> {
  const response = await api.get<Envelope<ApiRentCollection>>(
    apiRoutes.investment.portfolioRentCollection,
    { params: portfolioParams(filters) },
  );
  const data = unwrap(response, "Couldn't load rent collection.");
  return {
    received: toNumber(data.totals?.received_rent),
    outstanding: toNumber(data.totals?.outstanding_rent),
    overdue: toNumber(data.totals?.overdue_rent),
    upcoming: toNumber(data.totals?.upcoming_rent),
    scheduled: toNumber(data.totals?.total_scheduled_rent),
    collectionRate: Math.min(100, Math.max(0, toNumber(data.totals?.collection_rate))),
  };
}

export type KeyActionKey =
  | "property_value_review_due"
  | "interest_only_ending_soon"
  | "maintenance_awaiting_action"
  | "expenses_missing_attachment"
  | "recent_disposals";

export type KeyAction = {
  key: KeyActionKey;
  label: string;
  description: string;
  count: number;
};

export type KeyActions = { propertiesInScope: number; actions: KeyAction[] };

type ApiKeyActions = {
  properties_in_scope?: number;
  actions?: {
    key?: string;
    label?: string;
    description?: string;
    count?: number | string;
  }[];
};

const KEY_ACTION_KEYS: KeyActionKey[] = [
  "property_value_review_due",
  "interest_only_ending_soon",
  "maintenance_awaiting_action",
  "expenses_missing_attachment",
  "recent_disposals",
];

export async function fetchKeyActions(filters: PortfolioFilters): Promise<KeyActions> {
  const response = await api.get<Envelope<ApiKeyActions>>(
    apiRoutes.investment.portfolioKeyActions,
    { params: portfolioParams(filters) },
  );
  const data = unwrap(response, "Couldn't load key actions.");
  return {
    propertiesInScope: toNumber(data.properties_in_scope),
    actions: (data.actions ?? [])
      .filter((row): row is { key: KeyActionKey; label?: string; description?: string; count?: number | string } =>
        KEY_ACTION_KEYS.includes(row.key as KeyActionKey),
      )
      .map((row) => ({
        key: row.key,
        label: row.label ?? row.key,
        description: row.description ?? "",
        count: toNumber(row.count),
      })),
  };
}

export type CapitalSnapshot = {
  propertiesInScope: number;
  totalCostBase: number;
  capitalImprovements: number;
  sellingCosts: number;
  saleProceeds: number;
  disposedProperties: number;
};

type ApiCapitalSnapshot = {
  properties_in_scope?: number;
  metrics?: {
    total_cost_base?: number | string;
    capital_improvements?: number | string;
    selling_costs?: number | string;
    disposal_sale_proceeds?: number | string;
    disposed_properties?: number | string;
  };
};

export async function fetchCapitalSnapshot(
  filters: PortfolioFilters,
): Promise<CapitalSnapshot> {
  const response = await api.get<Envelope<ApiCapitalSnapshot>>(
    apiRoutes.investment.portfolioCapitalSnapshot,
    { params: portfolioParams(filters) },
  );
  const data = unwrap(response, "Couldn't load the capital snapshot.");
  return {
    propertiesInScope: toNumber(data.properties_in_scope),
    totalCostBase: toNumber(data.metrics?.total_cost_base),
    capitalImprovements: toNumber(data.metrics?.capital_improvements),
    sellingCosts: toNumber(data.metrics?.selling_costs),
    saleProceeds: toNumber(data.metrics?.disposal_sale_proceeds),
    disposedProperties: toNumber(data.metrics?.disposed_properties),
  };
}

export type ComparisonRow = {
  id: string;
  name: string;
  purchaseDate: string;
  status: PropertyStatus;
  currentValue: number;
  loanBalance: number;
  equity: number;
  rentalIncome: number;
  propertyExpenses: number;
  netRentalResult: number;
  costBase: number;
};

export type PropertyComparison = {
  propertiesInScope: number;
  rows: ComparisonRow[];
};

type ApiComparison = {
  properties_in_scope?: number;
  rows?: {
    property_id: number | string;
    property_name?: string | null;
    purchase_date?: string | null;
    status?: string | null;
    current_value?: number | string;
    loan_balance?: number | string;
    equity?: number | string;
    rental_income?: number | string;
    property_expenses?: number | string;
    net_rental_result?: number | string;
    cost_base?: number | string;
  }[];
};

export async function fetchPropertyComparison(
  filters: PortfolioFilters,
): Promise<PropertyComparison> {
  const response = await api.get<Envelope<ApiComparison>>(
    apiRoutes.investment.portfolioPropertyComparison,
    { params: portfolioParams(filters) },
  );
  const data = unwrap(response, "Couldn't load the property comparison.");
  return {
    propertiesInScope: toNumber(data.properties_in_scope),
    rows: (data.rows ?? []).map((row) => ({
      id: String(row.property_id),
      name: row.property_name ?? "",
      purchaseDate: row.purchase_date ?? "",
      status: toStatus(row.status),
      currentValue: toNumber(row.current_value),
      loanBalance: toNumber(row.loan_balance),
      equity: toNumber(row.equity),
      rentalIncome: toNumber(row.rental_income),
      propertyExpenses: toNumber(row.property_expenses),
      netRentalResult: toNumber(row.net_rental_result),
      costBase: toNumber(row.cost_base),
    })),
  };
}

export function collectionRateLabel(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

export function parseFinancialYearOption(value: string): number | null {
  if (value === "all") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function pageInfoFor(page: number, pageSize: number, total: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  return {
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
  };
}

export type PagedResult<T, S = undefined> = { rows: T[]; total: number; summary: S };

export function unwrapPage<T, S = Record<string, unknown>>(
  response: { data?: Envelope<T[], S> },
  fallback: string,
): { rows: T[]; total: number; summary: S | undefined } {
  const rows = unwrap<T[], S>(response, fallback);
  return {
    rows,
    total: response.data?.pagination?.total ?? rows.length,
    summary: response.data?.summary,
  };
}

export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{ rows: T[]; total: number }>,
  limit = 100,
  maxPages = 50,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage(page, limit);
    all.push(...result.rows);
    if (result.rows.length === 0 || all.length >= result.total) break;
  }
  return all;
}

export function earliestPurchaseDate(rows: { purchaseDate: string }[]): string | null {
  const dates = rows.map((row) => row.purchaseDate).filter((date) => isValidIsoDate(date)).sort();
  return dates[0] ?? null;
}
