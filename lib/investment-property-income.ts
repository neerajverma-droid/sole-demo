import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  MAX_MONEY,
  isValidIsoDate,
  parseMoney,
  toBool,
  toNumber,
  unwrap,
  unwrapPage,
  type Envelope,
} from "@/lib/investment-property";

export const INCOME_SOURCES = [
  { value: "manual", label: "Manual entry" },
  { value: "rental_schedule", label: "Rental schedule" },
] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number]["value"];

export type IncomeSourceFilter = "all" | IncomeSource;
export type IncomeMatchFilter = "all" | "matched" | "unmatched";

export type PropertyIncome = {
  id: string;
  date: string;
  amount: number;
  notes: string;
  source: IncomeSource;
  scheduleId: string | null;
  scheduleRent: number | null;
  scheduleFrequency: string;
  reconciled: boolean;
  remaining: number;
  possibleMatches: number;
};

type ApiIncome = {
  id: number | string;
  date?: string | null;
  amount?: number | string | null;
  notes?: string | null;
  income_source?: string | null;
  rental_schedule_id?: number | string | null;
  is_reconciled?: number | boolean | string | null;
  remainingAmount?: number | string | null;
  possible_match?: number | string | null;
  rentalSchedule?: {
    rent_frequency?: string | null;
    rent_amount?: number | string | null;
  } | null;
};

export function mapIncome(raw: ApiIncome): PropertyIncome {
  const source: IncomeSource = raw.income_source === "rental_schedule" ? "rental_schedule" : "manual";
  const schedule = raw.rentalSchedule;
  return {
    id: String(raw.id),
    date: raw.date ?? "",
    amount: toNumber(raw.amount),
    notes: raw.notes ?? "",
    source,
    scheduleId: raw.rental_schedule_id != null ? String(raw.rental_schedule_id) : null,
    scheduleRent: source === "rental_schedule" && schedule ? toNumber(schedule.rent_amount) : null,
    scheduleFrequency: source === "rental_schedule" && schedule ? (schedule.rent_frequency ?? "") : "",
    reconciled: toBool(raw.is_reconciled),
    remaining: toNumber(raw.remainingAmount),
    possibleMatches: toNumber(raw.possible_match),
  };
}

export type IncomeListParams = {
  page: number;
  limit: number;
  source?: IncomeSourceFilter;
  match?: IncomeMatchFilter;
};

export type IncomePage = { rows: PropertyIncome[]; total: number; totalAmount: number };

export async function fetchPropertyIncome(
  propertyId: string,
  params: IncomeListParams,
): Promise<IncomePage> {
  const query: Record<string, string | number> = { page: params.page, limit: params.limit };
  if (params.source && params.source !== "all") query.income_source = params.source;
  if (params.match && params.match !== "all") query.is_reconciled = params.match === "matched" ? 1 : 0;

  const response = await api.get<Envelope<ApiIncome[], { total_amount?: number | string }>>(
    `${apiRoutes.investment.income}${encodeURIComponent(propertyId)}`,
    { params: query },
  );
  const page = unwrapPage(response, "Couldn't load income.");
  return {
    rows: page.rows.map(mapIncome),
    total: page.total,
    totalAmount: toNumber(page.summary?.total_amount),
  };
}

export type IncomeDraft = {
  date: string;
  amount: string;
  source: IncomeSource;
  scheduleId: string;
  notes: string;
};

export function emptyIncomeDraft(): IncomeDraft {
  return { date: "", amount: "", source: "manual", scheduleId: "", notes: "" };
}

export function draftFromIncome(income: PropertyIncome): IncomeDraft {
  return {
    date: income.date,
    amount: String(income.amount),
    source: income.source,
    scheduleId: income.scheduleId ?? "",
    notes: income.notes,
  };
}

export type IncomeIssue = { key: keyof IncomeDraft; message: string };

export function incomeIssues(draft: IncomeDraft): IncomeIssue[] {
  const issues: IncomeIssue[] = [];
  if (!draft.date) issues.push({ key: "date", message: "Date is required." });
  else if (!isValidIsoDate(draft.date)) issues.push({ key: "date", message: "Enter a valid date." });

  const amount = parseMoney(draft.amount);
  if (amount === null) issues.push({ key: "amount", message: "Amount is required." });
  else if (Number.isNaN(amount) || amount <= 0) {
    issues.push({ key: "amount", message: "Amount must be greater than zero." });
  } else if (amount > MAX_MONEY) issues.push({ key: "amount", message: "Amount is too large." });

  if (draft.source === "rental_schedule" && !draft.scheduleId) {
    issues.push({ key: "scheduleId", message: "Choose the rental schedule this rent belongs to." });
  }
  return issues;
}

export function incomeWriteBody(draft: IncomeDraft) {
  const fromSchedule = draft.source === "rental_schedule";
  return {
    date: draft.date,
    amount: parseMoney(draft.amount) ?? 0,
    income_source: draft.source,
    rental_schedule_id: fromSchedule ? Number(draft.scheduleId) : null,
    notes: draft.notes.trim() || null,
  };
}

export async function createIncomeApi(propertyId: string, draft: IncomeDraft): Promise<void> {
  const response = await api.post<Envelope<ApiIncome>>(
    `${apiRoutes.investment.income}${encodeURIComponent(propertyId)}`,
    incomeWriteBody(draft),
  );
  unwrap(response, "Couldn't add the income.");
}

export async function updateIncomeApi(
  propertyId: string,
  incomeId: string,
  draft: IncomeDraft,
): Promise<void> {
  const response = await api.put<Envelope<ApiIncome>>(
    `${apiRoutes.investment.income}${encodeURIComponent(propertyId)}/${encodeURIComponent(incomeId)}`,
    incomeWriteBody(draft),
  );
  unwrap(response, "Couldn't save the income.");
}

export async function deleteIncomeApi(propertyId: string, incomeId: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.investment.income}${encodeURIComponent(propertyId)}/${encodeURIComponent(incomeId)}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete the income.");
  }
}
