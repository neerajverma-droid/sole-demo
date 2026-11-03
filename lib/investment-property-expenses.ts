import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { fetchAllPages, toBool, toNumber, unwrap, unwrapPage, type Envelope } from "@/lib/investment-property";

export type PropertyExpense = {
  id: string;
  date: string;
  name: string;
  category: string;
  amount: number;
  matched: boolean;
  hasReceipt: boolean;
};

type ApiExpense = {
  id?: number | string;
  expense_id?: number | string;
  name?: string | null;
  date?: string | null;
  price?: number | string | null;
  is_reconciled?: number | boolean | string | null;
  image?: string | null;
  account_subcategory?: { name?: string | null } | null;
};

export function mapExpense(raw: ApiExpense): PropertyExpense {
  return {
    id: String(raw.expense_id ?? raw.id ?? ""),
    date: raw.date ?? "",
    name: raw.name?.trim() || "Untitled expense",
    category: raw.account_subcategory?.name?.trim() || "",
    amount: toNumber(raw.price),
    matched: toBool(raw.is_reconciled),
    hasReceipt: Boolean(raw.image),
  };
}

export type ExpensesPage = { rows: PropertyExpense[]; total: number; totalAmount: number };

export async function fetchPropertyExpenses(
  propertyId: string,
  page: number,
  limit: number,
): Promise<ExpensesPage> {
  const response = await api.get<Envelope<ApiExpense[], { total_amount?: number | string }>>(
    `${apiRoutes.investment.expenses}${encodeURIComponent(propertyId)}`,
    { params: { page, limit } },
  );
  const result = unwrapPage(response, "Couldn't load expenses.");
  return {
    rows: result.rows.map(mapExpense),
    total: result.total,
    totalAmount: toNumber(result.summary?.total_amount),
  };
}

export async function fetchAssignableExpenses(
  page: number,
  limit: number,
  search: string,
): Promise<ExpensesPage> {
  const params: Record<string, string | number> = { page, limit };
  if (search.trim()) params.search = search.trim();
  const response = await api.get<Envelope<ApiExpense[], { total_amount?: number | string }>>(
    apiRoutes.investment.assignableExpenses,
    { params },
  );
  const result = unwrapPage(response, "Couldn't load assignable expenses.");
  return {
    rows: result.rows.map(mapExpense),
    total: result.total,
    totalAmount: toNumber(result.summary?.total_amount),
  };
}

export async function assignExpensesApi(
  propertyId: string,
  expenseIds: string[],
): Promise<number> {
  const response = await api.post<Envelope<{ assigned?: number }>>(
    `${apiRoutes.investment.assignExpenses}${encodeURIComponent(propertyId)}`,
    { expense_ids: expenseIds.map((id) => Number(id)) },
  );
  const data = unwrap(response, "Couldn't assign the expenses.");
  return toNumber(data.assigned);
}

export async function fetchAllPropertyExpenses(propertyId: string): Promise<PropertyExpense[]> {
  return fetchAllPages(async (page, limit) => {
    const result = await fetchPropertyExpenses(propertyId, page, limit);
    return { rows: result.rows, total: result.total };
  });
}
