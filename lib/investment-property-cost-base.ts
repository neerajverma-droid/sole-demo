import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  MAX_MONEY,
  isValidIsoDate,
  parseMoney,
  toNumber,
  unwrap,
  unwrapPage,
  type Envelope,
} from "@/lib/investment-property";
import { toIsoDate } from "@/lib/invoices";

export type CostBaseAdjustment = {
  id: string;
  date: string;
  amount: number;
  description: string;
};

type ApiAdjustment = {
  id: number | string;
  date?: string | null;
  amount?: number | string | null;
  description?: string | null;
};

export function mapAdjustment(raw: ApiAdjustment): CostBaseAdjustment {
  return {
    id: String(raw.id),
    date: raw.date ?? "",
    amount: toNumber(raw.amount),
    description: raw.description ?? "",
  };
}

export type CostBaseStats = {
  totalAdjustments: number;
  capitalImprovements: number;
  sellingCosts: number;
  costBaseTotal: number;
};

type ApiStats = {
  total_adjustments?: number | string;
  capital_improvements_total?: number | string;
  selling_costs_total?: number | string;
  cost_base_total?: number | string;
};

export async function fetchCostBaseStats(propertyId: string): Promise<CostBaseStats> {
  const response = await api.get<Envelope<ApiStats>>(
    `${apiRoutes.investment.costBaseStats}${encodeURIComponent(propertyId)}`,
  );
  const data = unwrap(response, "Couldn't load the cost base.");
  return {
    totalAdjustments: toNumber(data.total_adjustments),
    capitalImprovements: toNumber(data.capital_improvements_total),
    sellingCosts: toNumber(data.selling_costs_total),
    costBaseTotal: toNumber(data.cost_base_total),
  };
}

export type AdjustmentsPage = { rows: CostBaseAdjustment[]; total: number };

export async function fetchCostBaseAdjustments(
  propertyId: string,
  page: number,
  limit: number,
): Promise<AdjustmentsPage> {
  const response = await api.get<Envelope<ApiAdjustment[]>>(
    `${apiRoutes.investment.costBase}${encodeURIComponent(propertyId)}`,
    { params: { page, limit } },
  );
  const result = unwrapPage(response, "Couldn't load capital improvements.");
  return { rows: result.rows.map(mapAdjustment), total: result.total };
}

export type AdjustmentDraft = { date: string; amount: string; description: string };

export function emptyAdjustmentDraft(): AdjustmentDraft {
  return { date: "", amount: "", description: "" };
}

export function draftFromAdjustment(adjustment: CostBaseAdjustment): AdjustmentDraft {
  return {
    date: adjustment.date,
    amount: String(adjustment.amount),
    description: adjustment.description,
  };
}

export type AdjustmentIssue = { key: keyof AdjustmentDraft; message: string };

export function adjustmentIssues(
  draft: AdjustmentDraft,
  purchaseDate: string,
  today: Date = new Date(),
): AdjustmentIssue[] {
  const issues: AdjustmentIssue[] = [];
  if (!draft.date) issues.push({ key: "date", message: "Date is required." });
  else if (!isValidIsoDate(draft.date)) issues.push({ key: "date", message: "Enter a valid date." });
  else if (draft.date > toIsoDate(today)) {
    issues.push({ key: "date", message: "Date can't be in the future." });
  } else if (purchaseDate && draft.date < purchaseDate) {
    issues.push({ key: "date", message: "Date can't be before the purchase date." });
  }

  const amount = parseMoney(draft.amount);
  if (amount === null) issues.push({ key: "amount", message: "Amount is required." });
  else if (Number.isNaN(amount) || amount <= 0) {
    issues.push({ key: "amount", message: "Amount must be greater than zero." });
  } else if (amount > MAX_MONEY) issues.push({ key: "amount", message: "Amount is too large." });

  if (!draft.description.trim()) issues.push({ key: "description", message: "Description is required." });
  else if (draft.description.trim().length > 500) {
    issues.push({ key: "description", message: "Description must be 500 characters or fewer." });
  }
  return issues;
}

export function adjustmentWriteBody(draft: AdjustmentDraft) {
  return {
    date: draft.date,
    amount: parseMoney(draft.amount) ?? 0,
    type: "capital_improvement",
    description: draft.description.trim(),
  };
}

export async function createAdjustmentApi(propertyId: string, draft: AdjustmentDraft): Promise<void> {
  const response = await api.post<Envelope<ApiAdjustment>>(
    `${apiRoutes.investment.costBase}${encodeURIComponent(propertyId)}`,
    adjustmentWriteBody(draft),
  );
  unwrap(response, "Couldn't add the capital improvement.");
}

export async function updateAdjustmentApi(
  propertyId: string,
  adjustmentId: string,
  draft: AdjustmentDraft,
): Promise<void> {
  const response = await api.put<Envelope<ApiAdjustment>>(
    `${apiRoutes.investment.costBase}${encodeURIComponent(propertyId)}/${encodeURIComponent(adjustmentId)}`,
    adjustmentWriteBody(draft),
  );
  unwrap(response, "Couldn't save the capital improvement.");
}

export async function deleteAdjustmentApi(propertyId: string, adjustmentId: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.investment.costBase}${encodeURIComponent(propertyId)}/${encodeURIComponent(adjustmentId)}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete the capital improvement.");
  }
}
