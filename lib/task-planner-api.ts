/**
 * Task planner — API layer.
 *
 * sole-webapp's `services/planner.services.js` plus the planner's own inline
 * calls (KanbanBoard, PlannerListView, KanbanInvoiceFlow, Planner/index):
 * same endpoints, same params, same fields. Bodies are encrypted with
 * `buildEncryptedRequestBody`, as the calendar's are; each controller reads
 * them through `handlePayload`, which still takes the old app's plain bodies.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  finalStageOf,
  nextCursorFromPayload,
  rowsFromPayload,
  totalFromPayload,
  type PlannerClient,
  type RawPlannerStage,
  type RawPlannerTask,
  type TaskTimeEntry,
} from "@/lib/task-planner";

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

function payloadOf(response: { data?: unknown }): unknown {
  const body = response?.data as { data?: unknown } | undefined;
  return body?.data ?? body ?? {};
}

/** The board: every stage with its first page of cards. */
export async function fetchPlannerBoard(
  params: Record<string, unknown>,
): Promise<RawPlannerStage[]> {
  const response = await api.get(apiRoutes.planner.getAllEvents, { params });
  return rowsFromPayload<RawPlannerStage>(payloadOf(response));
}

/** One column's next page, from the cursor its last page ended on. */
export async function fetchPlannerStagePage(
  stageId: string,
  params: Record<string, unknown>,
): Promise<{ cards: RawPlannerTask[]; nextCursor: string | null }> {
  const response = await api.get(`${apiRoutes.planner.getPaginatedEvents}/${stageId}`, {
    params,
  });
  const payload = payloadOf(response);
  return {
    cards: rowsFromPayload<RawPlannerTask>(payload),
    nextCursor: nextCursorFromPayload(payload),
  };
}

/** The list view's page of tasks. */
export async function fetchPlannerList(
  params: Record<string, unknown>,
): Promise<{ rows: RawPlannerTask[]; total: number }> {
  const response = await api.get(apiRoutes.planner.getAllListTasks, { params });
  const payload = payloadOf(response);
  return { rows: rowsFromPayload<RawPlannerTask>(payload), total: totalFromPayload(payload) };
}

/** A card moved to another stage — the calendar event's own update. */
export async function updatePlannerTaskStage(
  eventId: string,
  stageId: string | number,
): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    `${apiRoutes.planner.editEvents}/${eventId}`,
    buildEncryptedRequestBody({ stage_id: Number(stageId) }),
  );
  if (response.data?.success === false) {
    throw new Error(response.data?.message || "Failed to update stage");
  }
}

/** Moves the selected events to the final stage, drafting invoices for billable ones. */
export async function bulkMovePlannerTasks(eventIds: string[]): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.planner.bulkMoveTasks,
    buildEncryptedRequestBody({ event_ids: eventIds }),
  );
  if (response.data?.success === false) {
    throw new Error(response.data?.message || "Bulk move failed");
  }
}

/** "Draft": the backend drafts the invoice and moves the event to Done. */
export async function draftPlannerTaskInvoice(eventId: string): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    `${apiRoutes.planner.draftEventsInvoice}/${eventId}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data?.message || "Failed to draft invoice");
  }
}

/** Every stage, as `/stage` returns them, for the final stage's id. */
export async function fetchFinalStageId(): Promise<string | null> {
  const response = await api.get<ApiEnvelope<{ id?: string | number; order?: number }[]>>(
    apiRoutes.plannerStage.getAllStages,
  );
  const rows = Array.isArray(response.data?.data) ? response.data.data : [];
  const finalStage = finalStageOf(rows);
  return finalStage?.id !== undefined && finalStage?.id !== null ? String(finalStage.id) : null;
}

/** The clients the filter offers — `/contact/list`, both kinds, as Planner/index read it. */
export async function fetchPlannerClients(): Promise<PlannerClient[]> {
  const response = await api.get(apiRoutes.companyContact.list, {
    params: { page: 1, limit: 1000 },
  });
  const body = response?.data as {
    data?: unknown;
  };
  const data = body?.data as
    | Record<string, unknown>[]
    | { clients?: Record<string, unknown>[]; clients_details?: Record<string, unknown>[] }
    | undefined;
  const rows = Array.isArray(data) ? data : data?.clients || data?.clients_details || [];
  return rows.map((row) => {
    const id = String(row.contact_id || row.id || "");
    const client = row.client as { business_name?: string } | undefined;
    return { contact_id: id, id, name: String(row.name || client?.business_name || "Unknown") };
  });
}

/** Time logs grouped by task, for a task's uninvoiced entries. */
export async function fetchTimeLogsByTask(): Promise<Record<string, unknown>[]> {
  const response = await api.get<ApiEnvelope<Record<string, unknown>[]>>(
    apiRoutes.projects.timeTracking.listByTask,
  );
  return response.data?.data || [];
}

/** Marks the invoiced entries as billed on the new invoice. */
export async function markTimeEntriesInvoiced(
  entries: TaskTimeEntry[],
  invoice: { id: string; number: string },
): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    apiRoutes.projects.timeTracking.bulkUpdate,
    buildEncryptedRequestBody({
      id: entries.map((entry) => entry.id),
      is_invoiced: true,
      invoice_id: invoice.id,
      bill_type: "billed",
      invoice_no: invoice.number,
    }),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update time entries");
  }
}
