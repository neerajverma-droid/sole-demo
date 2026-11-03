/**
 * Calendar — API layer.
 *
 * Every request here is sole-webapp's own, read from `components/Calendar`
 * (BigCalendar, AddTask, event-details-dialog, use-delete-event,
 * use-update-event) and `components/Common/SearchableClientSelect.js`: same
 * endpoints, same query params, same fields.
 *
 * Every body is encrypted the way the expense and contact writes are —
 * `buildEncryptedRequestBody`: the fields as one AES `data` string, any files
 * raw alongside as `files[]` (JSON when there are none). The calendar
 * controller decrypts with `handlePayload`, which still accepts a plain body
 * from the old app.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import type {
  CalendarContact,
  CalendarFilters,
  CalendarView,
  ClientProject,
  LinkedCalendar,
  PlannerStage,
  ProjectJob,
  RawCalendarEvent,
} from "@/lib/calendar";
import { getCalendarRange } from "@/lib/calendar";

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

/**
 * `billable` only goes up when the filter is on — sending `billable=false`
 * changes what the backend returns, so it's left off rather than defaulted.
 */
function filterParams(filters: CalendarFilters) {
  return {
    calendar_ids:
      filters.calendar_ids.length > 0 ? filters.calendar_ids.join(",") : undefined,
    billable: filters.billable ? true : undefined,
  };
}

export async function fetchCalendarEvents(
  date: Date,
  view: CalendarView,
  filters: CalendarFilters,
  search: string,
): Promise<RawCalendarEvent[]> {
  const { start_at, end_at } = getCalendarRange(date, view);
  const res = await api.get<ApiEnvelope<RawCalendarEvent[]>>(
    apiRoutes.calendar.getAllReminders,
    {
      params: {
        start_at,
        end_at,
        search: search || undefined,
        ...filterParams(filters),
      },
    },
  );
  return res.data?.data || [];
}

export async function searchCalendarEvents(
  date: Date,
  view: CalendarView,
  filters: CalendarFilters,
  query: string,
  signal?: AbortSignal,
): Promise<RawCalendarEvent[]> {
  const { start_at, end_at } = getCalendarRange(date, view);
  const res = await api.get<ApiEnvelope<RawCalendarEvent[]>>(
    apiRoutes.calendar.getReminderBySearch,
    {
      params: { start_at, end_at, search: query, ...filterParams(filters) },
      signal,
    },
  );
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

/** `null` when the event no longer exists — the dialog says "No records found". */
export async function fetchCalendarEventDetail(
  id: string | number,
): Promise<RawCalendarEvent | null> {
  const res = await api.get<ApiEnvelope<RawCalendarEvent>>(
    `${apiRoutes.calendar.getEventDetail}/${id}`,
  );
  return res.data?.data || null;
}

export async function deleteCalendarEvent(id: string | number): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>(
    `${apiRoutes.calendar.deleteReminder}/${id}`,
  );
  if (!(res.data?.success || res.status === 200 || res.status === 204)) {
    throw new Error(res.data?.message || "Failed to delete event");
  }
}

export async function createCalendarTask(
  fields: Record<string, unknown>,
  files: File[] = [],
): Promise<RawCalendarEvent> {
  const res = await api.post<ApiEnvelope<RawCalendarEvent>>(
    apiRoutes.calendar.addEvent,
    buildEncryptedRequestBody(fields, files),
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "Failed to create task");
  }
  return (res.data?.data || res.data) as RawCalendarEvent;
}

/** No files on an edit: those upload to `/documents` as they're picked. */
export async function updateCalendarTask(
  id: string | number,
  fields: Record<string, unknown>,
): Promise<RawCalendarEvent> {
  const res = await api.put<ApiEnvelope<RawCalendarEvent>>(
    `${apiRoutes.calendar.editEvent}/${id}`,
    buildEncryptedRequestBody(fields),
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "Failed to update task");
  }
  return (res.data?.data || res.data) as RawCalendarEvent;
}

/* ------------------------------------------------------------------ *
 * Connected calendars
 * ------------------------------------------------------------------ */

export async function fetchLinkedCalendars(): Promise<LinkedCalendar[]> {
  const res = await api.get<ApiEnvelope<LinkedCalendar[]>>(
    apiRoutes.calendar.getCalendarsList,
  );
  return res.data?.data || [];
}

/** Starts Google's OAuth handshake; the backend hands back where to send the browser. */
export async function requestGoogleCalendarAuthUrl(): Promise<string> {
  const res = await api.post<{
    authUrl?: string;
    url?: string;
    data?: { authUrl?: string; url?: string };
  }>(apiRoutes.calendar.addCal, buildEncryptedRequestBody({ type: "google" }));
  const url =
    res.data?.data?.authUrl ||
    res.data?.data?.url ||
    res.data?.authUrl ||
    res.data?.url ||
    "";
  if (!url) throw new Error("Missing Google Calendar auth URL.");
  return url;
}

export async function setDefaultCalendar(id: string | number): Promise<void> {
  await api.put(`${apiRoutes.calendar.setDefaultCalendar}/${id}`);
}

export async function deleteLinkedCalendar(id: string | number): Promise<void> {
  await api.delete(`${apiRoutes.calendar.deleteCalendar}/${id}`);
}

/* ------------------------------------------------------------------ *
 * The task form's lookups
 * ------------------------------------------------------------------ */

/** Every stage but the last — the last is where a task lands once invoiced. */
export async function fetchSelectableStages(): Promise<PlannerStage[]> {
  const res = await api.get<ApiEnvelope<PlannerStage[]>>(
    apiRoutes.plannerStage.getAllStages,
  );
  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  const orders = rows.map((stage) => Number(stage?.order ?? -1));
  const maxOrder = orders.length > 0 ? Math.max(...orders) : null;
  return rows.filter((stage) => Number(stage?.order ?? -1) !== maxOrder);
}

type ApiContactRow = {
  contact_id?: string | number | null;
  client_id?: string | number | null;
  name?: string;
  email?: string;
};

/**
 * The people a task can be linked to — `/contact/list` rather than the
 * Contacts screen's `/client` list, because a task records both the
 * `client_id` and the `contact_id`, and only this list carries the pair.
 */
export async function fetchCalendarContacts(): Promise<CalendarContact[]> {
  const res = await api.get<ApiEnvelope<ApiContactRow[]>>(
    `${apiRoutes.companyContact.list}?page=1&limit=1000&type=1`,
  );
  if (!res.data?.success) return [];
  return (res.data.data || []).map((row) => ({
    value: String(row.contact_id ?? ""),
    label: row.name || "",
    email: row.email || "",
    client_id: row.client_id ?? null,
    contact_id: row.contact_id || null,
  }));
}

export async function fetchClientProjects(
  clientId: string | number,
): Promise<ClientProject[]> {
  const res = await api.get<
    ApiEnvelope<ClientProject[] | { projects?: ClientProject[] }>
  >(`${apiRoutes.projects.byClientId}/${clientId}`, { params: { limit: 100 } });
  if (!res.data?.success) return [];
  const data = res.data.data;
  if (Array.isArray(data)) return data;
  return data?.projects || [];
}

export async function fetchProjectJobs(projectId: string | number): Promise<ProjectJob[]> {
  const res = await api.get<ApiEnvelope<ProjectJob[]>>(
    `${apiRoutes.projects.jobsListByProject}/${projectId}`,
  );
  return res.data?.success ? res.data.data || [] : [];
}
