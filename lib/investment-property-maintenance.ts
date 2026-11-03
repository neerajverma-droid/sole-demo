import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  MAX_MONEY,
  isValidIsoDate,
  parseMoney,
  toNullableNumber,
  unwrap,
  unwrapPage,
  toNumber,
  type Envelope,
} from "@/lib/investment-property";

export const MAINTENANCE_STATUSES = [
  { value: "logged", label: "Logged" },
  { value: "quote_requested", label: "Quote requested" },
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "invoiced", label: "Invoiced" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]["value"];
export type MaintenanceStatusFilter = "all" | MaintenanceStatus;

export function maintenanceStatusLabel(value: string): string {
  return MAINTENANCE_STATUSES.find((status) => status.value === value)?.label ?? value;
}

export type MaintenanceTone = "default" | "secondary" | "success" | "warning" | "danger";

export function maintenanceStatusTone(status: MaintenanceStatus): MaintenanceTone {
  switch (status) {
    case "completed":
    case "paid":
      return "success";
    case "approved":
    case "invoiced":
      return "default";
    case "quote_requested":
      return "warning";
    case "cancelled":
      return "danger";
    default:
      return "secondary";
  }
}

export type MaintenanceItem = {
  id: string;
  title: string;
  issueDate: string;
  status: MaintenanceStatus;
  estimatedCost: number | null;
  actualCost: number | null;
  clientId: string | null;
  clientName: string;
  linkedExpenseId: string | null;
  notes: string;
};

type ApiMaintenance = {
  id: number | string;
  title?: string | null;
  issue_date?: string | null;
  status?: string | null;
  estimated_cost?: number | string | null;
  actual_cost?: number | string | null;
  client_id?: number | string | null;
  linked_expense_id?: number | string | null;
  notes?: string | null;
  client?: { name?: string | null; business_name?: string | null } | null;
};

export function mapMaintenance(raw: ApiMaintenance): MaintenanceItem {
  const status = MAINTENANCE_STATUSES.find((item) => item.value === raw.status)?.value ?? "logged";
  return {
    id: String(raw.id),
    title: raw.title ?? "",
    issueDate: raw.issue_date ?? "",
    status,
    estimatedCost: toNullableNumber(raw.estimated_cost),
    actualCost: toNullableNumber(raw.actual_cost),
    clientId: raw.client_id != null ? String(raw.client_id) : null,
    clientName: raw.client?.business_name?.trim() || raw.client?.name?.trim() || "",
    linkedExpenseId: raw.linked_expense_id != null ? String(raw.linked_expense_id) : null,
    notes: raw.notes ?? "",
  };
}

export type MaintenanceListParams = { page: number; limit: number; status?: MaintenanceStatusFilter };

export type MaintenancePage = {
  rows: MaintenanceItem[];
  total: number;
  totalEstimated: number;
  totalActual: number;
};

export async function fetchPropertyMaintenance(
  propertyId: string,
  params: MaintenanceListParams,
): Promise<MaintenancePage> {
  const query: Record<string, string | number> = { page: params.page, limit: params.limit };
  if (params.status && params.status !== "all") query.status = params.status;

  const response = await api.get<
    Envelope<ApiMaintenance[], { total_estimated_cost?: number | string; total_actual_cost?: number | string }>
  >(`${apiRoutes.investment.maintenance}${encodeURIComponent(propertyId)}`, { params: query });
  const page = unwrapPage(response, "Couldn't load maintenance.");
  return {
    rows: page.rows.map(mapMaintenance),
    total: page.total,
    totalEstimated: toNumber(page.summary?.total_estimated_cost),
    totalActual: toNumber(page.summary?.total_actual_cost),
  };
}

export async function fetchMaintenanceItem(
  propertyId: string,
  maintenanceId: string,
): Promise<MaintenanceItem> {
  const response = await api.get<Envelope<ApiMaintenance>>(
    `${apiRoutes.investment.maintenance}${encodeURIComponent(propertyId)}/${encodeURIComponent(maintenanceId)}`,
  );
  return mapMaintenance(unwrap(response, "Couldn't load this maintenance item."));
}

export type MaintenanceDraft = {
  title: string;
  issueDate: string;
  status: MaintenanceStatus;
  clientId: string | null;
  clientName: string;
  estimatedCost: string;
  actualCost: string;
  notes: string;
};

export function emptyMaintenanceDraft(): MaintenanceDraft {
  return {
    title: "",
    issueDate: "",
    status: "logged",
    clientId: null,
    clientName: "",
    estimatedCost: "",
    actualCost: "",
    notes: "",
  };
}

export function draftFromMaintenance(item: MaintenanceItem): MaintenanceDraft {
  return {
    title: item.title,
    issueDate: item.issueDate,
    status: item.status,
    clientId: item.clientId,
    clientName: item.clientName,
    estimatedCost: item.estimatedCost === null ? "" : String(item.estimatedCost),
    actualCost: item.actualCost === null ? "" : String(item.actualCost),
    notes: item.notes,
  };
}

export type MaintenanceIssue = { key: keyof MaintenanceDraft; message: string };

export function maintenanceIssues(draft: MaintenanceDraft): MaintenanceIssue[] {
  const issues: MaintenanceIssue[] = [];
  if (!draft.title.trim()) issues.push({ key: "title", message: "Title is required." });
  else if (draft.title.trim().length > 255) {
    issues.push({ key: "title", message: "Title must be 255 characters or fewer." });
  }

  if (!draft.issueDate) issues.push({ key: "issueDate", message: "Issue date is required." });
  else if (!isValidIsoDate(draft.issueDate)) {
    issues.push({ key: "issueDate", message: "Enter a valid date." });
  }

  const costs: [keyof MaintenanceDraft, string, string][] = [
    ["estimatedCost", draft.estimatedCost, "Estimated cost"],
    ["actualCost", draft.actualCost, "Actual cost"],
  ];
  for (const [key, text, label] of costs) {
    const value = parseMoney(text);
    if (value !== null && (Number.isNaN(value) || value > MAX_MONEY)) {
      issues.push({ key, message: `${label} must be a dollar amount, up to 2 decimals.` });
    }
  }
  return issues;
}

export function maintenanceWriteBody(draft: MaintenanceDraft) {
  return {
    title: draft.title.trim(),
    issue_date: draft.issueDate,
    status: draft.status,
    client_id: draft.clientId ? Number(draft.clientId) : null,
    estimated_cost: parseMoney(draft.estimatedCost),
    actual_cost: parseMoney(draft.actualCost),
    notes: draft.notes.trim() || null,
  };
}

export async function createMaintenanceApi(propertyId: string, draft: MaintenanceDraft): Promise<void> {
  const response = await api.post<Envelope<ApiMaintenance>>(
    `${apiRoutes.investment.maintenance}${encodeURIComponent(propertyId)}`,
    maintenanceWriteBody(draft),
  );
  unwrap(response, "Couldn't create the maintenance item.");
}

export async function updateMaintenanceApi(
  propertyId: string,
  maintenanceId: string,
  draft: MaintenanceDraft,
): Promise<void> {
  const response = await api.put<Envelope<ApiMaintenance>>(
    `${apiRoutes.investment.maintenance}${encodeURIComponent(propertyId)}/${encodeURIComponent(maintenanceId)}`,
    maintenanceWriteBody(draft),
  );
  unwrap(response, "Couldn't save the maintenance item.");
}

export async function linkMaintenanceExpenseApi(
  propertyId: string,
  maintenanceId: string,
  expenseId: string,
): Promise<void> {
  const current = await fetchMaintenanceItem(propertyId, maintenanceId);
  const response = await api.put<Envelope<ApiMaintenance>>(
    `${apiRoutes.investment.maintenance}${encodeURIComponent(propertyId)}/${encodeURIComponent(maintenanceId)}`,
    { ...maintenanceWriteBody(draftFromMaintenance(current)), linked_expense_id: Number(expenseId) },
  );
  unwrap(response, "Couldn't link the expense.");
}

export async function deleteMaintenanceApi(propertyId: string, maintenanceId: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.investment.maintenance}${encodeURIComponent(propertyId)}/${encodeURIComponent(maintenanceId)}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete the maintenance item.");
  }
}
