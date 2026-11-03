/**
 * Time Tracker — the timer, the task-grouped log, the weekly timesheet and the
 * summaries over them.
 *
 * Backed by the same sole-ocr routes sole-webapp's `components/TimeTracking/`
 * called: `/tasks/time-logs` for the list (time logs grouped by their task),
 * `/time-tracking/*` for the timer, entry edits, deletes, invoicing, the weekly
 * grid and both stats endpoints, `/tasks/time-tracking/manual-entry` for a
 * hand-entered log and `/tasks/:id` for the task a group of logs belongs to.
 *
 * Every write goes through `buildEncryptedRequestBody` — sole-webapp sent the
 * timer, manual-entry and weekly calls as plain JSON. The controllers read both
 * shapes, but encryption changes two things a plain body didn't:
 *
 *  - `null` / `undefined` arrive as `""`, which a BIGINT column rejects, so
 *    absent ids are dropped with `compactPayload` rather than sent empty.
 *  - Top-level booleans arrive as `"true"` / `"false"`. `is_billable` goes as
 *    1 / 0, which survives the trip as a number either way.
 *
 * The weekly `logs` array is nested, so its values are left as they are.
 */
import {
  addDays,
  differenceInSeconds,
  format,
  getDay,
  getISOWeek,
  getISOWeekYear,
  isValid,
  parseISO,
  startOfWeek,
} from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { newLineItem, type InvoiceLineItem, type InvoiceSeed } from "@/lib/invoices";
import type { PageInfo } from "@/lib/products";
import { compactPayload, num, optionalId, str, toFlag } from "@/lib/projects";

export const TIME_TRACKER_ROOT = "/time-tracker";

type Raw = Record<string, unknown>;
type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  pagination?: Raw;
  warnings?: unknown[];
};

function assertOk(body: ApiEnvelope<unknown> | undefined, fallback: string) {
  if (body?.success === false) throw new Error(body.message || fallback);
}

/* ------------------------------------------------------------------ *
 * The log: tasks and their time entries
 * ------------------------------------------------------------------ */

export type TimeLog = {
  id: string;
  logDate: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  durationMinutes: number;
  amount: number;
  status: string;
  isInvoiced: boolean;
  invoiceId: string | null;
  invoiceNo: string;
};

export type TimeTask = {
  taskId: string;
  name: string;
  chargeType: string;
  rate: number;
  isBillable: boolean;
  projectId: string | null;
  projectName: string;
  jobId: string | null;
  jobName: string;
  clientId: string | null;
  contactId: string | null;
  clientName: string;
  totalMinutes: number;
  totalAmount: number;
  /** Newest first, as the server sorts them. */
  entries: TimeLog[];
};

function mapTimeLog(raw: Raw): TimeLog {
  return {
    id: str(raw.id),
    logDate: str(raw.log_date),
    startTime: str(raw.start_time),
    endTime: str(raw.end_time),
    createdAt: str(raw.created_at),
    durationMinutes: num(raw.duration_minutes),
    amount: num(raw.amount),
    status: str(raw.status).toLowerCase(),
    isInvoiced: toFlag(raw.is_invoiced) || optionalId(raw.invoice_id) !== null,
    invoiceId: optionalId(raw.invoice_id),
    invoiceNo: str(raw.invoice_no),
  };
}

export function mapTimeTask(raw: Raw): TimeTask {
  const entries = Array.isArray(raw.time_entries) ? (raw.time_entries as Raw[]) : [];
  return {
    taskId: str(raw.task_id),
    name: str(raw.task_name),
    chargeType: str(raw.charge_type) || "hourly",
    rate: num(raw.rate),
    isBillable: toFlag(raw.is_billable),
    projectId: optionalId(raw.project_id),
    projectName: str(raw.project_name),
    jobId: optionalId(raw.job_id),
    // The server writes "N/A" for a log with no job.
    jobName: str(raw.job_name) === "N/A" ? "" : str(raw.job_name),
    clientId: optionalId(raw.client_id),
    contactId: optionalId(raw.contact_id),
    clientName: str(raw.client_name) || str(raw.contact_name),
    totalMinutes: num(raw.total_duration_minutes),
    totalAmount: num(raw.total_amount),
    entries: entries.map(mapTimeLog),
  };
}

/** The expenses list's default; the rows-per-page control offers 10–100. */
export const TIME_PAGE_SIZE = 25;

export type TimeTaskPage = PageInfo & { rows: TimeTask[] };

/** `/tasks/time-logs` pages by task, so a page is N tasks with all their logs. */
export async function fetchTimeTasksPage(page: number, pageSize = TIME_PAGE_SIZE): Promise<TimeTaskPage> {
  const response = await api.get<ApiEnvelope<Raw[]>>(apiRoutes.projects.timeTracking.listByTask, {
    params: { page, limit: pageSize },
  });
  assertOk(response.data, "Couldn't load time entries.");
  const rows = (Array.isArray(response.data?.data) ? response.data.data : []).map(mapTimeTask);
  const pagination = response.data?.pagination ?? {};
  const total = num(pagination.totalRecords, rows.length);
  const pageCount = Math.max(1, num(pagination.totalPages, 1));
  const current = num(pagination.currentPage, page);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  return { rows, total, pageCount, page: current, from, to: total === 0 ? 0 : from + rows.length - 1 };
}

export function isRunningLog(log: TimeLog): boolean {
  return log.status === "running";
}

/** Selectable for an invoice: not on one already, and not still running. */
export function isLogInvoiceable(log: TimeLog): boolean {
  return !log.isInvoiced && !isRunningLog(log);
}

/** Whose time this is, for the one-client-per-invoice rule. */
export function taskBillingKey(task: TimeTask): string {
  return task.contactId || task.clientId || "";
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

function parseStamp(value: string): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

/** `formatDuration` from Listing.js — "1h 5m", "12m 30s", "0s". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0s";
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 && hours === 0) parts.push(`${secs}s`);
  return parts.join(" ") || "0s";
}

/** Hours as "7h 30m", for the summaries. */
export function formatHoursMinutes(hours: number): string {
  const minutes = Math.round((Number.isFinite(hours) ? hours : 0) * 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatLogDate(value: string): string {
  const date = parseStamp(value);
  return date ? format(date, "dd MMM yyyy") : "—";
}

/** "9:00 AM → 11:30 AM", "9:00 AM → ongoing", or "" when there's no clock time. */
export function formatLogTimeRange(log: TimeLog): string {
  const start = parseStamp(log.startTime);
  if (!start) return "";
  const end = parseStamp(log.endTime);
  return `${format(start, "h:mm a")} → ${end ? format(end, "h:mm a") : "ongoing"}`;
}

/** `timeAgo` from Listing.js. */
export function formatAgo(value: string, now = Date.now()): string {
  const date = parseStamp(value);
  if (!date) return "";
  const seconds = Math.max(0, differenceInSeconds(now, date));
  if (seconds < 60) return seconds <= 0 ? "just now" : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Durations typed by hand
 * ------------------------------------------------------------------ */

/** Hours between two HH:mm times, wrapping past midnight. */
export function hoursBetween(start: string, end: string): number {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((n) => !Number.isFinite(n))) return 0;
  let diff = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

/**
 * A typed amount of time as hours — the weekly grid's `parseTimeInput`:
 * decimal hours ("7.5") or HH:MM ("7:30"). NaN for anything else, so the
 * field can say so rather than silently counting it as zero.
 */
export function parseHoursInput(input: string): number {
  const value = input.trim();
  if (!value) return 0;
  if (value.includes(":")) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);
    if (!match) return Number.NaN;
    const minutes = Number(match[2]);
    if (minutes >= 60) return Number.NaN;
    return Number(match[1]) + minutes / 60;
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(value)) return Number.NaN;
  return Number(value);
}

/* ------------------------------------------------------------------ *
 * The running timer
 * ------------------------------------------------------------------ */

export type TimerClient = {
  clientId: string;
  contactId: string | null;
  name: string;
  email: string;
};

/** What the timer bar's "Select Client & Project" panel holds. */
export type TimerSelection = {
  client: TimerClient | null;
  assignProject: boolean;
  projectId: string;
  jobId: string;
  isBillable: boolean;
  hourlyRate: string;
};

export const EMPTY_SELECTION: TimerSelection = {
  client: null,
  assignProject: false,
  projectId: "",
  jobId: "",
  isBillable: true,
  hourlyRate: "",
};

/** The fields `/start` and `PUT /active` share, from the panel's state. */
function timerFields(description: string, selection: TimerSelection): Record<string, unknown> {
  return compactPayload({
    task_name: description.trim() || undefined,
    client_id: selection.client?.clientId,
    contact_id: selection.client?.contactId,
    project_id: selection.assignProject ? selection.projectId || undefined : undefined,
    project_job_id: selection.assignProject ? selection.jobId || undefined : undefined,
    is_billable: selection.isBillable ? 1 : 0,
    hourly_rate:
      selection.isBillable && selection.hourlyRate ? Number(selection.hourlyRate) : undefined,
  });
}

/** `handleStartTimer` — the server makes (or reuses) a task from these. */
export async function startTimerApi(description: string, selection: TimerSelection): Promise<Raw> {
  const response = await api.post<ApiEnvelope<Raw>>(
    apiRoutes.projects.timeTracking.start,
    buildEncryptedRequestBody(timerFields(description, selection)),
  );
  assertOk(response.data, "Failed to start timer");
  return response.data?.data ?? {};
}

/** `handleUpdateTimer` — writes the description and details onto the running timer. */
export async function updateActiveTimerApi(description: string, selection: TimerSelection): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    apiRoutes.projects.timeTracking.active,
    buildEncryptedRequestBody(timerFields(description, selection)),
  );
  assertOk(response.data, "Failed to update timer");
}

/** The running timer's task name — what the "What are you working on?" box shows. */
export function timerDescription(raw: Raw | undefined): string {
  if (!raw) return "";
  const task = (raw.taskDetail ?? {}) as Raw;
  return str(raw.notes) || str(task.task_name);
}

/** Validation the save-and-stop dialog applies; the message, or null when fine. */
export function selectionError(selection: TimerSelection): string | null {
  if (!selection.client) return "Select a client before saving this entry.";
  if (selection.assignProject && (!selection.projectId || !selection.jobId)) {
    return "Choose a project and job, or turn off project assignment.";
  }
  if (selection.isBillable && !(Number(selection.hourlyRate) > 0)) {
    return "Hourly rate must be greater than 0 if billable is on.";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Manual log, entry edit, task edit, deletes
 * ------------------------------------------------------------------ */

export type ManualLogDraft = {
  description: string;
  useDuration: boolean;
  /** HH:mm */
  startTime: string;
  endTime: string;
  hours: string;
  minutes: string;
  /** yyyy-MM-dd */
  date: string;
  client: TimerClient | null;
  assignProject: boolean;
  projectId: string;
  jobId: string;
  isBillable: boolean;
  hourlyRate: string;
};

export function emptyManualLog(today = new Date()): ManualLogDraft {
  return {
    description: "",
    useDuration: false,
    startTime: "09:00",
    endTime: "10:00",
    hours: "",
    minutes: "",
    date: format(today, "yyyy-MM-dd"),
    client: null,
    assignProject: false,
    projectId: "",
    jobId: "",
    isBillable: true,
    hourlyRate: "",
  };
}

export function draftHours(draft: Pick<ManualLogDraft, "useDuration" | "startTime" | "endTime" | "hours" | "minutes">): number {
  if (!draft.useDuration) return hoursBetween(draft.startTime, draft.endTime);
  return (parseInt(draft.hours, 10) || 0) + (parseInt(draft.minutes, 10) || 0) / 60;
}

export type DraftErrors = Partial<Record<"description" | "time" | "date" | "client" | "project" | "job" | "rate", string>>;

export function manualLogErrors(draft: ManualLogDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.description.trim()) errors.description = "Add a description.";
  const hours = draftHours(draft);
  if (!(hours > 0)) errors.time = "Enter a duration greater than zero.";
  else if (hours > 24) errors.time = "A single entry can't be longer than 24 hours.";
  if (!draft.date) errors.date = "Pick a date.";
  if (!draft.client) errors.client = "Select a client.";
  if (draft.assignProject && !draft.projectId) errors.project = "Select a project.";
  if (draft.assignProject && !draft.jobId) errors.job = "Select a job.";
  if (draft.isBillable && draft.hourlyRate && !(Number(draft.hourlyRate) >= 0)) {
    errors.rate = "Enter a valid rate.";
  }
  return errors;
}

/**
 * ManualLogs.js's payload. The server takes `hours_logged`; the clock times
 * ride along. Booleans go as booleans, as sole-webapp sent them: encryption
 * carries them as "true"/"false" and the manual-entry controller restores them.
 */
export function manualLogPayload(draft: ManualLogDraft): Record<string, unknown> {
  const hours = draftHours(draft);
  return compactPayload({
    project_assign: draft.assignProject,
    project_id: draft.assignProject && draft.projectId ? Number(draft.projectId) : undefined,
    project_job_id: draft.assignProject && draft.jobId ? Number(draft.jobId) : undefined,
    task_name: draft.description.trim(),
    task_description: draft.description.trim(),
    charge_type: "hourly",
    is_billable: draft.isBillable,
    rate: draft.isBillable && draft.hourlyRate ? Number(draft.hourlyRate) : undefined,
    client_id: draft.client ? Number(draft.client.clientId) : undefined,
    contact_id: draft.client?.contactId ? Number(draft.client.contactId) : undefined,
    log_date: draft.date,
    start_time: draft.useDuration ? undefined : draft.startTime,
    end_time: draft.useDuration ? undefined : draft.endTime,
    hours_logged: Number(hours.toFixed(4)),
    description: draft.description.trim(),
  });
}

export async function createManualLogApi(draft: ManualLogDraft): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.projects.timeTracking.manualEntry,
    buildEncryptedRequestBody(manualLogPayload(draft)),
  );
  assertOk(response.data, "Failed to create manual log");
  track(EVENTS.TIME_ENTRY_LOGGED, {
    duration_minutes: Math.round(draftHours(draft) * 60),
    source: "manual",
  });
}

/** A timer session was saved — counted the same way as a manual log. */
export function trackTimerEntryLogged(seconds: number): void {
  track(EVENTS.TIME_ENTRY_LOGGED, { duration_minutes: Math.round(seconds / 60), source: "timer" });
}

/** The task a group of logs belongs to, opened for editing ("Edit log"). */
export type TaskDraft = Omit<ManualLogDraft, "useDuration" | "startTime" | "endTime" | "hours" | "minutes" | "date">;

export function taskDraft(task: TimeTask): TaskDraft {
  return {
    description: task.name,
    client: task.clientId
      ? { clientId: task.clientId, contactId: task.contactId, name: task.clientName, email: "" }
      : null,
    assignProject: !!task.projectId,
    projectId: task.projectId ?? "",
    jobId: task.jobId ?? "",
    isBillable: task.isBillable,
    hourlyRate: task.rate ? String(task.rate) : "",
  };
}

export function taskDraftErrors(draft: TaskDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.description.trim()) errors.description = "Add a description.";
  if (draft.assignProject && !draft.projectId) errors.project = "Select a project.";
  if (draft.assignProject && !draft.jobId) errors.job = "Select a job.";
  return errors;
}

/**
 * TaskEntryEdit.js's payload. `hourly_rate` always goes: the task service
 * writes `rate: hourly_rate` on every update, so leaving it out would clear
 * the task's rate. Projects are only ever set, never cleared — an encrypted
 * `null` arrives as `""`, which the BIGINT column rejects.
 */
export function taskPayload(draft: TaskDraft, currentRate: number): Record<string, unknown> {
  const rate = draft.isBillable && draft.hourlyRate !== "" ? Number(draft.hourlyRate) : currentRate;
  return compactPayload({
    task_name: draft.description.trim(),
    is_billable: draft.isBillable ? 1 : 0,
    hourly_rate: Number.isFinite(rate) ? rate : 0,
    client_id: draft.client ? Number(draft.client.clientId) : undefined,
    contact_id: draft.client?.contactId ? Number(draft.client.contactId) : undefined,
    project_id: draft.assignProject && draft.projectId ? Number(draft.projectId) : undefined,
    project_job_id: draft.assignProject && draft.jobId ? Number(draft.jobId) : undefined,
  });
}

export async function updateTaskApi(taskId: string, payload: Record<string, unknown>): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.updateTask}/${taskId}`,
    buildEncryptedRequestBody(payload),
  );
  assertOk(response.data, "Failed to update task");
}

/**
 * Deleting the task takes every log under it with it. Resolves to the
 * server's own message, which the toast shows — as sole-webapp's DeleteModal
 * did.
 */
export async function deleteTaskApi(taskId: string): Promise<string> {
  const response = await api.delete<ApiEnvelope<unknown>>(`${apiRoutes.projects.deleteTask}${taskId}`);
  assertOk(response.data, "Failed to delete task");
  return response.data?.message ?? "";
}

/** One logged session, opened for editing. */
export type LogDraft = {
  useDuration: boolean;
  startTime: string;
  endTime: string;
  hours: string;
  minutes: string;
  date: string;
};

function timeInput(value: string): string {
  const date = parseStamp(value);
  return date ? format(date, "HH:mm") : "";
}

export function logDraft(log: TimeLog): LogDraft {
  const totalMinutes = Math.round(log.durationMinutes);
  const startTime = timeInput(log.startTime);
  const endTime = timeInput(log.endTime);
  const date = parseStamp(log.logDate) ?? parseStamp(log.startTime) ?? new Date();
  return {
    useDuration: !(startTime && endTime),
    startTime: startTime || "09:00",
    endTime: endTime || "10:00",
    hours: String(Math.floor(totalMinutes / 60)),
    minutes: String(totalMinutes % 60),
    date: format(date, "yyyy-MM-dd"),
  };
}

export function logDraftErrors(draft: LogDraft): DraftErrors {
  const errors: DraftErrors = {};
  const hours = draftHours(draft);
  if (!(hours > 0)) errors.time = "Enter a duration greater than zero.";
  else if (hours > 24) errors.time = "A single entry can't be longer than 24 hours.";
  if (!draft.date) errors.date = "Pick a date.";
  return errors;
}

/**
 * TimeEntryEdit.js's payload for `PUT /time-tracking/:id`. Clock times only in
 * start/end mode: the server recomputes the duration from them whenever
 * they're present, which would override typed hours.
 */
export function logPayload(draft: LogDraft): Record<string, unknown> {
  return compactPayload({
    log_date: draft.date,
    start_time: draft.useDuration ? undefined : draft.startTime,
    end_time: draft.useDuration ? undefined : draft.endTime,
    hours_logged: Number(draftHours(draft).toFixed(4)),
  });
}

export async function updateLogApi(id: string, payload: Record<string, unknown>): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.timeTracking.stop}/${id}`,
    buildEncryptedRequestBody(payload),
  );
  assertOk(response.data, "Failed to update time entry");
}

/** Resolves to the server's message ("Time Log Deleted Successfully"). */
export async function deleteLogApi(id: string): Promise<string> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.timeTracking.delete}/${id}`,
  );
  assertOk(response.data, "Failed to delete time entry");
  return response.data?.message ?? "";
}

/* ------------------------------------------------------------------ *
 * Invoicing
 * ------------------------------------------------------------------ */

const trim = (value: number, digits: number) => String(Number(value.toFixed(digits)));

export type TimeInvoice = {
  seed: InvoiceSeed;
  /** Every selected log — non-billable ones are marked invoiced but add no line. */
  logIds: string[];
  hours: number;
  amount: number;
  /** Every selected session as `/time-tracking/generate-pdf` reads it — billable and not. */
  timesheet: Raw[];
  projectName: string;
};

/**
 * `buildTimeEntryInvoiceData` from TimeEntryInvoiceFlow.js: one line per
 * billable task among the selected logs — its hours at the task's rate, or
 * its fixed amount — billed to the first task's client.
 */
export function buildTimeInvoice(tasks: TimeTask[], selected: ReadonlySet<string>): TimeInvoice | { error: string } {
  const items: InvoiceLineItem[] = [];
  const logIds: string[] = [];
  const timesheet: Raw[] = [];
  let hours = 0;
  let amount = 0;
  let first: TimeTask | null = null;

  tasks.forEach((task) => {
    const logs = task.entries.filter((log) => selected.has(log.id) && isLogInvoiceable(log));
    if (logs.length === 0) return;
    logIds.push(...logs.map((log) => log.id));
    timesheet.push(
      ...logs.map((log) => ({
        log_date: log.logDate,
        start_time: log.startTime || null,
        end_time: log.endTime || null,
        duration_minutes: log.durationMinutes,
        rate: task.rate,
        amount: log.amount,
        task_name: task.name,
        is_billable: task.isBillable,
      })),
    );
    if (!task.isBillable) return;
    first ??= task;
    const minutes = logs.reduce((sum, log) => sum + log.durationMinutes, 0);
    const total = logs.reduce((sum, log) => sum + (log.amount || (log.durationMinutes / 60) * task.rate), 0);
    const fixed = task.chargeType === "fixed";
    hours += minutes / 60;
    amount += total;
    items.push({
      ...newLineItem(),
      description: task.name || "Time Tracking Entry",
      quantity: fixed ? "1" : trim(minutes / 60, 4),
      price: trim(fixed ? total : task.rate, 2),
      gst: false,
      qtyType: fixed ? "items" : "hours",
    });
  });

  if (logIds.length === 0) return { error: "Select at least one time entry that isn't invoiced yet." };
  if (!first || items.length === 0) {
    return { error: "These entries are non-billable. Mark the task billable to invoice it." };
  }
  const billed = first as TimeTask;
  return {
    seed: {
      description: billed.projectName ? `Time tracked — ${billed.projectName}` : "Time tracked",
      items,
      clientId: billed.clientId,
      clientName: billed.clientName,
      projectId: billed.projectId,
    },
    logIds,
    hours,
    amount,
    timesheet,
    projectName: billed.projectName,
  };
}

/**
 * The timesheet PDF sole-webapp attached to every invoice raised from time
 * (AddInvoiceNew.js): rendered server-side, in the business's brand colour.
 * Null when it can't be made — the invoice goes ahead without it.
 */
export async function fetchTimesheetPdf(invoice: TimeInvoice): Promise<File | null> {
  if (invoice.timesheet.length === 0) return null;
  try {
    const branding = await api
      .get<ApiEnvelope<{ brand_color?: string | null }>>(apiRoutes.settings.getBranding)
      .catch(() => null);
    const brandColor = branding?.data?.data?.brand_color || "#4d4dff";
    const projectName = invoice.projectName;
    const response = await api.post<Blob>(
      apiRoutes.projects.timeTracking.generatePdf,
      buildEncryptedRequestBody({
        entries: invoice.timesheet,
        projectName,
        taskName: "",
        clientName: invoice.seed.clientName,
        brandColor,
      }),
      { responseType: "blob" },
    );
    const name = `Timesheet_${(projectName || "Report").replace(/[^\w-]+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
    return new File([response.data], name, { type: "application/pdf" });
  } catch {
    return null;
  }
}

/** `handleInvoiceCreated` — the logs now sit on that invoice. */
export async function markLogsInvoicedApi(logIds: string[], invoice: { id: string; number: string }): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    apiRoutes.projects.timeTracking.bulkUpdate,
    buildEncryptedRequestBody({
      id: logIds.map(Number),
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

/* ------------------------------------------------------------------ *
 * Summaries
 * ------------------------------------------------------------------ */

export type StatsRange = "week" | "last_week" | "month" | "last_month";

export const STATS_RANGES: { value: StatsRange; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

export type DayStat = {
  date: string;
  billableHours: number;
  nonBillableHours: number;
  billableAmount: number;
  nonBillableAmount: number;
};

export type TimeStats = {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  totalAmount: number;
  billableAmount: number;
  nonBillableAmount: number;
  /** Every day of the period, zero-filled, so the chart's x axis is the whole range. */
  days: DayStat[];
};

export async function fetchTimeStats(range: StatsRange): Promise<TimeStats> {
  const response = await api.get<ApiEnvelope<Raw>>(apiRoutes.projects.timeTracking.statsTime, {
    params: { date_range: range },
  });
  assertOk(response.data, "Couldn't load tracked time.");
  return mapTimeStats(response.data?.data ?? {});
}

export function mapTimeStats(data: Raw): TimeStats {
  const summary = (data.summary ?? {}) as Raw;
  const period = (data.period ?? {}) as Raw;
  const daily = Array.isArray(data.daily_breakdown) ? (data.daily_breakdown as Raw[]) : [];
  const byDate = new Map(daily.map((day) => [str(day.date), day]));

  const start = parseStamp(str(period.start_date));
  const end = parseStamp(str(period.end_date));
  const dates: string[] = [];
  if (start && end && end >= start) {
    for (let day = start; day <= end && dates.length < 62; day = addDays(day, 1)) {
      dates.push(format(day, "yyyy-MM-dd"));
    }
  } else {
    dates.push(...daily.map((day) => str(day.date)).filter(Boolean).sort());
  }

  return {
    totalHours: num(summary.total_hours),
    billableHours: num(summary.billable_hours),
    nonBillableHours: num(summary.non_billable_hours),
    totalAmount: num(summary.total_amount),
    billableAmount: num(summary.billable_amount),
    nonBillableAmount: num(summary.non_billable_amount),
    days: dates.map((date) => {
      const row = byDate.get(date) ?? {};
      return {
        date,
        billableHours: num(row.billable_hours),
        nonBillableHours: num(row.non_billable_hours),
        billableAmount: num(row.billable_amount),
        nonBillableAmount: num(row.non_billable_amount),
      };
    }),
  };
}

export type BreakdownGroup = "client" | "project";

export type BreakdownRow = {
  id: string;
  name: string;
  totalHours: number;
  billableHours: number;
};

export async function fetchTimeBreakdown(range: StatsRange, groupBy: BreakdownGroup): Promise<BreakdownRow[]> {
  const response = await api.get<ApiEnvelope<Raw>>(apiRoutes.projects.timeTracking.statsClientProject, {
    params: { date_range: range, group_by: groupBy },
  });
  assertOk(response.data, "Couldn't load the breakdown.");
  const rows = (response.data?.data?.breakdown ?? []) as Raw[];
  return rows.map((row) => ({
    id: str(row.id),
    name: str(row.name) || "Unnamed",
    totalHours: num(row.total_hours),
    billableHours: num(row.billable_hours),
  }));
}

/* ------------------------------------------------------------------ *
 * Weekly log
 * ------------------------------------------------------------------ */

/**
 * The server's week runs Sunday to Saturday: it takes the ISO week (Monday
 * based) and steps back to the Sunday before it. So the ISO week to ask for
 * is the one the Monday of a Sunday-start week falls in.
 */
export function weekOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 0 });
}

export function weekParams(sunday: Date): { year: number; week: number } {
  const monday = addDays(sunday, 1);
  return { year: getISOWeekYear(monday), week: getISOWeek(monday) };
}

export function weekDays(sunday: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(sunday, index));
}

export type Option = { id: string; label: string };

export type WeeklyRow = {
  /** Stable React key. */
  key: string;
  client: TimerClient | null;
  taskId: string;
  projectId: string;
  jobId: string;
  /** Seeded from the saved logs, replaced once the pickers load their lists. */
  taskOptions: Option[];
  projectOptions: Option[];
  jobOptions: Option[];
  /** As typed, one per day, Sunday first. */
  times: string[];
  isBillable: boolean;
  /** The saved log behind each day, so saving updates rather than duplicates it. */
  logIds: (string | null)[];
  contactIds: (string | null)[];
  isRunning: boolean;
};

let rowSeq = 0;
export function emptyWeeklyRow(): WeeklyRow {
  rowSeq += 1;
  return {
    key: `row-${rowSeq}`,
    client: null,
    taskId: "",
    projectId: "",
    jobId: "",
    taskOptions: [],
    projectOptions: [],
    jobOptions: [],
    times: Array(7).fill(""),
    isBillable: true,
    logIds: Array(7).fill(null),
    contactIds: Array(7).fill(null),
    isRunning: false,
  };
}

/**
 * `populateRowsFromLogs` from WeeklyLogDrawer.js: one row per client, project,
 * job and task, with a second row when the same combination has two logs on
 * one day. Always ends with a blank row to type into.
 */
export function rowsFromWeeklyLogs(logs: Raw[]): WeeklyRow[] {
  const rows: WeeklyRow[] = [];
  const baseKeys = new Map<WeeklyRow, string>();
  logs.forEach((log) => {
    const date = parseStamp(str(log.log_date));
    if (!date) return;
    const day = getDay(date);
    const clientDetails = (log.client_details ?? {}) as Raw;
    const clientId = optionalId(log.client_id) ?? optionalId(clientDetails.id);
    const baseKey = [clientId, log.project_id, log.project_job_id, log.task_id].map((part) => str(part) || "null").join("-");

    let row = rows.find((candidate) => baseKeys.get(candidate) === baseKey && candidate.logIds[day] === null);
    if (!row) {
      const task = (log.task_details ?? log.taskDetail ?? null) as Raw | null;
      const project = (log.project_details ?? null) as Raw | null;
      const job = (log.job_details ?? null) as Raw | null;
      row = {
        ...emptyWeeklyRow(),
        client: clientId
          ? {
              clientId,
              contactId: optionalId(log.contact_id),
              name: str(clientDetails.name) || str(clientDetails.business_name),
              email: "",
            }
          : null,
        taskId: str(log.task_id),
        projectId: str(log.project_id),
        jobId: str(log.project_job_id),
        taskOptions: task?.id ? [{ id: str(task.id), label: str(task.task_name) }] : [],
        projectOptions: project?.id ? [{ id: str(project.id), label: str(project.project_name) }] : [],
        jobOptions: job?.id ? [{ id: str(job.id), label: str(job.job_name) }] : [],
        isBillable: log.is_billable === undefined ? true : toFlag(log.is_billable),
        isRunning: str(log.entry_type) === "timer" && str(log.status) === "running",
      };
      rows.push(row);
      baseKeys.set(row, baseKey);
    }
    row.times[day] = log.hours_logged == null ? "" : trim(num(log.hours_logged), 2);
    row.logIds[day] = str(log.id) || null;
    row.contactIds[day] = optionalId(log.contact_id);
  });
  return [...rows, emptyWeeklyRow()];
}

export async function fetchWeeklyRows(sunday: Date): Promise<WeeklyRow[]> {
  const response = await api.get<ApiEnvelope<{ logs?: Raw[] }>>(apiRoutes.projects.timeTracking.weekly, {
    params: weekParams(sunday),
  });
  assertOk(response.data, "Couldn't load this week's time.");
  return rowsFromWeeklyLogs(response.data?.data?.logs ?? []);
}

export const DAY_LIMIT_HOURS = 24;

export type WeeklyErrors = {
  /** Per row, per day: the cell's problem. */
  cells: Record<string, string>;
  /** Per day index: the column's total is over the limit. */
  days: Record<number, string>;
  /** Per row key: what the row is missing. */
  rows: Record<string, string>;
};

export function rowHasTime(row: WeeklyRow): boolean {
  return row.times.some((time) => time.trim() !== "");
}

export function weeklyErrors(rows: WeeklyRow[]): WeeklyErrors {
  const errors: WeeklyErrors = { cells: {}, days: {}, rows: {} };
  rows.forEach((row) => {
    row.times.forEach((time, day) => {
      const hours = parseHoursInput(time);
      if (Number.isNaN(hours)) errors.cells[`${row.key}:${day}`] = "Use 7.5 or 7:30";
      else if (hours > DAY_LIMIT_HOURS) errors.cells[`${row.key}:${day}`] = `Max ${DAY_LIMIT_HOURS}h`;
    });
    if (row.isRunning || !rowHasTime(row)) return;
    if (!row.client) errors.rows[row.key] = "Select a client";
    else if (!row.taskId) errors.rows[row.key] = "Select a task";
    else if (row.projectOptions.length > 0 && !row.projectId) errors.rows[row.key] = "Select a project";
    else if (row.jobOptions.length > 0 && !row.jobId) errors.rows[row.key] = "Select a job";
  });
  for (let day = 0; day < 7; day += 1) {
    const total = rows.reduce((sum, row) => sum + (parseHoursInput(row.times[day]) || 0), 0);
    if (total > DAY_LIMIT_HOURS) errors.days[day] = `${trim(total, 2)}h of ${DAY_LIMIT_HOURS}h`;
  }
  return errors;
}

/**
 * Every problem with the grid as a sentence a person can act on — the day
 * and row it's in, what was entered and what's allowed — in the order worth
 * fixing them: days over the limit, then cells that aren't times, then rows
 * missing a client, task, project or job (`includeRows`: only once a save
 * has been tried, so a half-filled row doesn't nag while it's being typed).
 */
export function weeklyProblems(
  rows: WeeklyRow[],
  errors: WeeklyErrors,
  sunday: Date,
  includeRows = true,
): string[] {
  const days = weekDays(sunday);
  const dayName = (day: number) => format(days[day], "EEEE d MMM");
  const problems: string[] = [];

  for (let day = 0; day < 7; day += 1) {
    if (!errors.days[day]) continue;
    const total = rows.reduce((sum, row) => sum + (parseHoursInput(row.times[day]) || 0), 0);
    problems.push(
      `${dayName(day)} has ${trim(total, 2)}h logged — a day can't go over ${DAY_LIMIT_HOURS} hours.`,
    );
  }

  rows.forEach((row, index) => {
    row.times.forEach((time, day) => {
      if (!errors.cells[`${row.key}:${day}`]) return;
      const hours = parseHoursInput(time);
      problems.push(
        Number.isNaN(hours)
          ? `Row ${index + 1}, ${dayName(day)}: “${time.trim()}” isn't a time — use decimal hours (7.5) or HH:MM (7:30).`
          : `Row ${index + 1}, ${dayName(day)}: ${trim(hours, 2)}h is more than a day — the most one day can hold is ${DAY_LIMIT_HOURS} hours.`,
      );
    });
  });

  if (includeRows) {
    rows.forEach((row, index) => {
      const missing = errors.rows[row.key];
      if (missing) problems.push(`Row ${index + 1}: ${missing.toLowerCase()} to save its hours.`);
    });
  }
  return problems;
}

export function hasWeeklyErrors(errors: WeeklyErrors): boolean {
  return (
    Object.keys(errors.cells).length + Object.keys(errors.days).length + Object.keys(errors.rows).length > 0
  );
}

/** `handleSave`'s `logs` — one per filled day; running rows are never sent. */
export function weeklyLogsPayload(rows: WeeklyRow[], sunday: Date): Raw[] {
  const days = weekDays(sunday);
  const logs: Raw[] = [];
  rows.forEach((row) => {
    if (row.isRunning) return;
    row.times.forEach((time, day) => {
      if (!time.trim()) return;
      const contactId = row.contactIds[day] ?? row.client?.contactId ?? null;
      logs.push(
        compactPayload({
          id: row.logIds[day] ?? undefined,
          log_date: format(days[day], "yyyy-MM-dd"),
          hours: Number(parseHoursInput(time).toFixed(4)),
          is_billable: row.isBillable,
          description: "",
          client_id: row.client?.clientId,
          contact_id: contactId ?? undefined,
          task_id: row.taskId || undefined,
          project_id: row.projectId || undefined,
          project_job_id: row.jobId || undefined,
        }),
      );
    });
  });
  return logs;
}

export type WeeklySaveResult = { message: string; skipped: number };

export async function saveWeeklyLogsApi(rows: WeeklyRow[], sunday: Date): Promise<WeeklySaveResult> {
  const response = await api.put<ApiEnvelope<unknown>>(
    apiRoutes.projects.timeTracking.weekly,
    buildEncryptedRequestBody({ ...weekParams(sunday), logs: weeklyLogsPayload(rows, sunday) }),
  );
  assertOk(response.data, "Failed to save time entries");
  return {
    message: response.data?.message || "Time entries saved",
    skipped: Array.isArray(response.data?.warnings) ? response.data.warnings.length : 0,
  };
}

/** Tasks already logged against a client — the weekly grid's Task list. */
export async function fetchClientTasks(clientId: string): Promise<Option[]> {
  const response = await api.get<ApiEnvelope<Raw[]>>(`${apiRoutes.projects.tasksByClientId}/${clientId}`);
  const rows = response.data?.success && Array.isArray(response.data.data) ? response.data.data : [];
  return rows.map((task) => ({ id: str(task.id), label: str(task.task_name) || "Untitled task" }));
}

/** The projects and jobs a client's task can sit under. */
export async function fetchTaskProjectsAndJobs(
  clientId: string,
  taskId: string,
): Promise<{ projects: Option[]; jobs: Option[] }> {
  const response = await api.get<ApiEnvelope<{ projects?: Raw[]; jobs?: Raw[] }>>(apiRoutes.projects.getByClientTask, {
    params: { client_id: clientId, task_id: taskId },
  });
  const data = response.data?.success ? response.data.data : undefined;
  return {
    projects: (data?.projects ?? []).map((project) => ({ id: str(project.id), label: str(project.project_name) })),
    jobs: (data?.jobs ?? []).map((job) => ({ id: str(job.id), label: str(job.job_name) })),
  };
}
