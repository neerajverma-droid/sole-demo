/**
 * A project's jobs (milestones), the tasks under them and the time logged
 * against those tasks — the project detail's Job / Milestone tab.
 *
 * Backed by sole-ocr's `/project-job`, `/tasks` and `/time-tracking` routes,
 * the ones sole-webapp's `components/Projects/job-milestone/` called.
 *
 * Every write is encrypted. sole-webapp sent these as plain JSON; each
 * controller reads `req.body.data` through `decryptPayload` / `parsePayload`
 * first, so both shapes land the same way. What encryption changes:
 *
 * - `null` / `undefined` become `""`. Every id here is a BIGINT (`client_id`,
 *   `contact_id`, `project_job_id`, `stage_id`, `nps_survey_id`), which `""`
 *   would break, so `compactPayload` drops absent ones. The create endpoints
 *   then answer "…required" exactly as they did for sole-webapp's `null`.
 * - Booleans become "true" / "false". `is_budget`, `is_billable` and
 *   `nps_enabled` are Sequelize BOOLEAN columns written straight through, and
 *   the BOOLEAN sanitiser reads the strings back as booleans. The bulk
 *   invoiced update compares against "true" / "false" itself.
 */
import axios from "axios";
import { format, isValid, parseISO } from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { getBusinessId } from "@/lib/api/business-id";
import { getAccessToken } from "@/lib/api/session";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { newLineItem, type InvoiceLineItem, type InvoiceSeed } from "@/lib/invoices";
import { compactPayload, num, optionalId, str, toFlag, type Project } from "@/lib/projects";

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  pagination?: { totalRecords?: number; totalPages?: number };
};

type Raw = Record<string, unknown>;

/** The list endpoints cap `limit` at 100. */
const PAGE_LIMIT = 100;

/**
 * Every page of a paginated list. sole-webapp asked for one page (ten jobs,
 * ten tasks) and silently dropped the rest; a project with more work than
 * that would lose rows here too.
 */
async function fetchAllPages(url: string, params: Record<string, unknown>): Promise<Raw[]> {
  const rows: Raw[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await api.get<ApiEnvelope<Raw[]>>(url, {
      params: { ...params, page, limit: PAGE_LIMIT },
    });
    if (response.data?.success === false) {
      throw new Error(response.data.message || "Couldn't load this project's jobs.");
    }
    const batch = Array.isArray(response.data?.data) ? response.data.data : [];
    rows.push(...batch);
    const totalPages = num(response.data?.pagination?.totalPages, 1);
    if (batch.length < PAGE_LIMIT || page >= totalPages) break;
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Jobs
 * ------------------------------------------------------------------ */

export type ProjectJob = {
  id: string;
  name: string;
  code: string;
  description: string;
  isBudget: boolean;
  budget: number;
  usedBudget: number;
};

function mapJob(raw: Raw): ProjectJob {
  return {
    id: str(raw.id),
    name: str(raw.job_name),
    code: str(raw.job_code),
    description: str(raw.job_description),
    isBudget: toFlag(raw.is_budget),
    budget: num(raw.budget),
    usedBudget: num(raw.used_budget),
  };
}

/** `loadJobs` from ProjectDetail.js — newest first, as the server orders them. */
export async function fetchProjectJobs(projectId: string): Promise<ProjectJob[]> {
  const rows = await fetchAllPages(apiRoutes.projects.jobs, { project_id: projectId });
  return rows.map(mapJob);
}

export type JobDraft = {
  name: string;
  code: string;
  description: string;
  budgetEnabled: boolean;
  budget: string;
};

export function emptyJobDraft(): JobDraft {
  return { name: "", code: "", description: "", budgetEnabled: false, budget: "" };
}

export function jobDraftFromJob(job: ProjectJob): JobDraft {
  return {
    name: job.name,
    code: job.code,
    description: job.description,
    budgetEnabled: job.isBudget,
    budget: job.budget ? String(job.budget) : "",
  };
}

export type JobIssue = { key: keyof JobDraft; message: string };

/** JobSchema.js, plus the project-budget check `onSubmit` made by hand. */
export function jobIssues(draft: JobDraft, projectBudget: number): JobIssue[] {
  const issues: JobIssue[] = [];
  if (draft.name.trim().length < 3) {
    issues.push({ key: "name", message: "Job name must be at least 3 characters" });
  }
  if (!draft.code.trim()) {
    issues.push({ key: "code", message: "Job code is required" });
  } else if (!/^[A-Za-z0-9-]+$/.test(draft.code.trim())) {
    issues.push({ key: "code", message: "Only letters, numbers and dashes allowed" });
  }
  if (draft.description.length > 500) {
    issues.push({ key: "description", message: "Description must be 500 characters or fewer" });
  }
  if (draft.budget && !(num(draft.budget, -1) >= 0)) {
    issues.push({ key: "budget", message: "Budget must be a positive number" });
  } else if (draft.budgetEnabled && projectBudget > 0 && num(draft.budget) > projectBudget) {
    issues.push({ key: "budget", message: "Job budget cannot be greater than project budget" });
  }
  return issues;
}

/**
 * NewJobModal.js's payload, for both create and update. The update endpoint
 * only takes the name, description and budget fields — the rest is ignored
 * there, so the job code can't change once a job exists.
 */
export function jobPayload(draft: JobDraft, project: Project): Record<string, unknown> {
  return compactPayload({
    project_id: project.id,
    client_id: project.clientId,
    contact_id: project.contactId,
    job_name: draft.name.trim(),
    job_code: draft.code.trim(),
    job_description: draft.description,
    is_budget: draft.budgetEnabled,
    budget: draft.budgetEnabled && draft.budget ? Number(draft.budget) : 0,
  });
}

export async function createJobApi(payload: Record<string, unknown>): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.projects.jobs,
    buildEncryptedRequestBody(payload),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Operation failed");
  }
}

export async function updateJobApi(id: string, payload: Record<string, unknown>): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.jobs}/${id}`,
    buildEncryptedRequestBody(payload),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Operation failed");
  }
}

export async function deleteJobApi(id: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.deleteJob.replace(/\/$/, "")}/${id}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Failed to delete job");
  }
}

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

export type TaskChargeType = "hourly" | "fixed" | "per_km";
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "active" | "inactive" | "completed";

export const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function priorityLabel(priority: string): string {
  return TASK_PRIORITIES.find((option) => option.value === priority)?.label ?? (priority || "—");
}

export function chargeTypeLabel(chargeType: TaskChargeType): string {
  return chargeType === "per_km" ? "Per KM" : chargeType === "hourly" ? "Hourly" : "Fixed";
}

export type ProjectTask = {
  id: string;
  jobId: string | null;
  name: string;
  chargeType: TaskChargeType;
  isBillable: boolean;
  priority: string;
  status: TaskStatus;
  /** The task's own hourly rate — `rate` for hourly, `km_rate` for per km. */
  rate: number;
  fixedAmount: number;
  /** What the server has billed so far: tracked hours × rate, or the fixed amount. */
  amount: number;
  totalMinutes: number;
  notes: string;
  stageId: string | null;
  npsEnabled: boolean;
  npsSurveyId: string | null;
  estimatedHours: string;
  kmDistance: string;
  clientId: string | null;
  contactId: string | null;
};

function toChargeType(value: unknown): TaskChargeType {
  return value === "fixed" || value === "per_km" ? value : "hourly";
}

function toTaskStatus(value: unknown): TaskStatus {
  return value === "inactive" || value === "completed" ? value : "active";
}

function mapTask(raw: Raw): ProjectTask {
  const chargeType = toChargeType(raw.charge_type);
  return {
    id: str(raw.id),
    jobId: optionalId(raw.project_job_id),
    name: str(raw.task_name),
    chargeType,
    isBillable: toFlag(raw.is_billable),
    priority: str(raw.priority),
    status: toTaskStatus(raw.status),
    // The list sends `rate` as "N/A" on fixed tasks — `num` reads that as 0.
    rate: num(chargeType === "per_km" ? raw.km_rate : raw.rate),
    fixedAmount: num(raw.fixed_amount),
    amount: num(raw.amount),
    totalMinutes: num(raw.totalDurationMinutes),
    notes: str(raw.notes),
    stageId: optionalId(raw.stage_id),
    npsEnabled: toFlag(raw.nps_enabled),
    npsSurveyId: optionalId(raw.nps_survey_id),
    estimatedHours: raw.estimated_hours == null ? "" : String(raw.estimated_hours),
    kmDistance: raw.km_distance == null ? "" : String(raw.km_distance),
    clientId: optionalId(raw.client_id),
    contactId: optionalId(raw.contact_id),
  };
}

/** `loadTasks` from ProjectDetail.js — every task on the project, across its jobs. */
export async function fetchProjectTasks(projectId: string): Promise<ProjectTask[]> {
  const rows = await fetchAllPages(apiRoutes.projects.tasks, { project_id: projectId });
  return rows.map(mapTask);
}

export type TaskDraft = {
  name: string;
  stageId: string;
  jobId: string;
  isBillable: boolean;
  npsEnabled: boolean;
  npsSurveyId: string;
  chargeType: TaskChargeType;
  /** Hourly (or per-km) rate. */
  rate: string;
  /** The fixed amount. */
  amount: string;
  estimatedHours: string;
  estimatedKm: string;
  priority: TaskPriority;
  notes: string;
};

export function emptyTaskDraft(jobId: string | null): TaskDraft {
  return {
    name: "",
    stageId: "",
    jobId: jobId ?? "",
    isBillable: true,
    npsEnabled: false,
    npsSurveyId: "",
    chargeType: "hourly",
    rate: "",
    amount: "",
    estimatedHours: "",
    estimatedKm: "",
    priority: "medium",
    notes: "",
  };
}

const amountText = (value: number) => (value ? String(value) : "");

/** The edit branch of NewTaskModal.js's reset. */
export function taskDraftFromTask(task: ProjectTask): TaskDraft {
  return {
    name: task.name,
    stageId: task.stageId ?? "",
    jobId: task.jobId ?? "",
    isBillable: task.isBillable,
    npsEnabled: task.npsEnabled,
    npsSurveyId: task.npsSurveyId ?? "",
    chargeType: task.chargeType,
    rate: task.chargeType === "fixed" ? "" : amountText(task.rate),
    amount: amountText(task.fixedAmount),
    estimatedHours: task.estimatedHours,
    estimatedKm: task.kmDistance,
    priority: (["low", "medium", "high"].includes(task.priority) ? task.priority : "medium") as TaskPriority,
    notes: task.notes,
  };
}

export type TaskIssue = { key: keyof TaskDraft; message: string };

/** TaskSchema.js, plus the project-budget check `onSubmit` made by hand. */
export function taskIssues(draft: TaskDraft, projectBudget: number): TaskIssue[] {
  const issues: TaskIssue[] = [];
  const name = draft.name;
  if (name.length < 3) {
    issues.push({ key: "name", message: "Task name must be at least 3 characters long" });
  } else if (name.length > 100) {
    issues.push({ key: "name", message: "Task name must not exceed 100 characters" });
  }
  if (draft.rate && !(num(draft.rate, -1) >= 0)) {
    issues.push({ key: "rate", message: "Rate must be a positive number" });
  }
  if (draft.amount && !(num(draft.amount, -1) >= 0)) {
    issues.push({ key: "amount", message: "Amount must be a positive number" });
  }
  if (draft.notes.length > 500) {
    issues.push({ key: "notes", message: "Notes must not exceed 500 characters" });
  }
  if (draft.isBillable) {
    if (draft.chargeType === "fixed" && !draft.amount) {
      issues.push({ key: "amount", message: "Amount is required" });
    }
    if (draft.chargeType === "hourly" && !draft.rate) {
      issues.push({ key: "rate", message: "Rate is required" });
    }
  }
  if (
    draft.chargeType === "fixed" &&
    projectBudget > 0 &&
    draft.amount &&
    num(draft.amount) > projectBudget &&
    !issues.some((issue) => issue.key === "amount")
  ) {
    issues.push({ key: "amount", message: "Task budget cannot be greater than project budget" });
  }
  return issues;
}

/**
 * NewTaskModal.js's `submitData`, field for field.
 *
 * One addition on edit: the update service writes `rate` from `hourly_rate`
 * (`task.update({ ...updateData, rate: updateData.hourly_rate })`), so the
 * `rate` sole-webapp sent was dropped and an edited rate never saved.
 * `hourly_rate` carries the same figure so the edit sticks.
 *
 * `stage_id` and `nps_survey_id` are dropped rather than sent empty when
 * unset — see the file header — so an edit can't clear them back to none.
 */
export function taskPayload(
  draft: TaskDraft,
  project: Project,
  editing: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    project_id: project.id,
    task_name: draft.name,
    charge_type: draft.chargeType,
    is_billable: draft.isBillable,
    priority: draft.priority,
    notes: draft.notes || "",
    client_id: project.clientId,
    contact_id: project.contactId,
    stage_id: draft.stageId ? Number(draft.stageId) : null,
    nps_enabled: draft.npsEnabled,
    nps_survey_id: draft.npsSurveyId ? Number(draft.npsSurveyId) : null,
  };
  if (draft.jobId) payload.project_job_id = draft.jobId;

  if (draft.chargeType === "hourly") {
    if (draft.estimatedHours) payload.estimated_hours = parseFloat(draft.estimatedHours);
    if (draft.rate) {
      payload.rate = parseFloat(draft.rate);
      if (editing) payload.hourly_rate = parseFloat(draft.rate);
    }
  }
  if (draft.chargeType === "fixed" && draft.amount) {
    payload.fixed_amount = parseFloat(draft.amount);
  }
  if (draft.chargeType === "per_km") {
    if (draft.estimatedKm) payload.km_distance = parseFloat(draft.estimatedKm);
    if (draft.rate) payload.km_rate = parseFloat(draft.rate);
  }
  return compactPayload(payload);
}

export async function createTaskApi(payload: Record<string, unknown>): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.projects.createTask,
    buildEncryptedRequestBody(payload),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Failed to create task");
  }
}

export async function updateTaskApi(id: string, payload: Record<string, unknown>): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.updateTask}/${id}`,
    buildEncryptedRequestBody(payload),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Failed to update task");
  }
}

export async function deleteTaskApi(id: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.deleteTask.replace(/\/$/, "")}/${id}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Failed to delete task");
  }
}

/* ------------------------------------------------------------------ *
 * The task form's lookups
 * ------------------------------------------------------------------ */

export type NpsSurvey = { id: string; name: string };

/**
 * The surveys NPS can send — sole-webapp's `reputationApi.get("/surveys")`,
 * on the separate reputation service. Its base URL is configured per
 * deployment; without one there's no service to ask, and the picker offers
 * only the default survey, as sole-webapp did when the call failed.
 */
export async function fetchNpsSurveys(): Promise<NpsSurvey[]> {
  const baseURL = process.env.NEXT_PUBLIC_REPUTATION_API_URL;
  if (!baseURL) return [];
  const token = getAccessToken();
  const businessId = getBusinessId();
  const response = await axios.get<ApiEnvelope<Raw[]>>(`${baseURL.replace(/\/$/, "")}/surveys`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    params: {
      source_app: process.env.NEXT_PUBLIC_SOURCE_APP || "sole-ocr",
      ...(businessId ? { business_id: businessId } : {}),
    },
  });
  if (!response.data?.success) return [];
  return (response.data.data ?? [])
    .map((row) => ({ id: str(row.id), name: str(row.name) }))
    .filter((survey) => survey.id);
}

/* ------------------------------------------------------------------ *
 * Time entries
 * ------------------------------------------------------------------ */

export type TimeEntry = {
  id: string;
  taskId: string | null;
  /** yyyy-MM-dd, or an ISO timestamp when the log has no date of its own. */
  logDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  hoursLogged: number;
  amount: number;
  rate: number;
  status: string;
  isInvoiced: boolean;
  notes: string;
  clientId: string | null;
  contactId: string | null;
  /** Who the entry is billed to, for the invoice it lands on. */
  billedName: string;
  raw: Raw;
};

function mapTimeEntry(raw: Raw): TimeEntry {
  const task = (raw.taskDetail ?? {}) as Raw;
  const client = (raw.clientDetail ?? {}) as Raw;
  const contact = (raw.contactDetail ?? {}) as Raw;
  return {
    id: str(raw.id),
    taskId: optionalId(raw.task_id ?? task.id),
    logDate: str(raw.log_date),
    startTime: str(raw.start_time),
    endTime: str(raw.end_time),
    durationMinutes: num(raw.duration_minutes),
    hoursLogged: num(raw.hours_logged),
    amount: num(raw.amount),
    rate: num(raw.rate),
    status: str(raw.status),
    isInvoiced: toFlag(raw.is_invoiced) || optionalId(raw.invoice_id) !== null,
    notes: str(raw.notes ?? raw.description),
    clientId: optionalId(raw.client_id ?? client.id),
    contactId: optionalId(raw.contact_id ?? contact.id),
    billedName: str(
      raw.contact_name || raw.client_name || contact.name || client.name || client.business_name,
    ),
    raw,
  };
}

/** Selectable for an invoice: not yet invoiced, and not still running. */
export function isEntryInvoiceable(entry: TimeEntry): boolean {
  return !entry.isInvoiced && entry.status !== "running";
}

/**
 * A job's time logs — `loadJobTimeEntries` from Jobaccordionitem.js, which
 * asked for the first hundred and grouped them by task.
 */
export async function fetchJobTimeEntries(projectId: string, jobId: string): Promise<TimeEntry[]> {
  const response = await api.get<ApiEnvelope<Raw[]>>(apiRoutes.projects.timeTracking.list, {
    params: { project_id: projectId, project_job_id: jobId, limit: 100 },
  });
  const rows = Array.isArray(response.data?.data) ? response.data.data : [];
  return rows.map(mapTimeEntry);
}

/** Minutes as HH:MM:SS — `formatTime` from Jobmilestonetab.js. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "00:00:00";
  const total = Math.round(minutes * 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function parseStamp(value: string): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

/** "9:00 AM → 11:30 AM", or "--" without both ends. */
export function formatEntryTimeRange(entry: TimeEntry): string {
  const start = parseStamp(entry.startTime);
  const end = parseStamp(entry.endTime);
  if (!start || !end) return "--";
  return `${format(start, "h:mm a")} → ${format(end, "h:mm a")}`;
}

/** `formatAgo` from TaskRow.js. */
export function formatAgo(value: string, now = Date.now()): string {
  const date = parseStamp(value);
  if (!date) return "--";
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** The entry's amount, or its hours at the rate when the server sent none. */
export function entryAmount(entry: TimeEntry, task: ProjectTask): number {
  return entry.amount || (entry.durationMinutes / 60) * (entry.rate || task.rate || 0);
}

export type TimeEntryDraft = {
  description: string;
  useStartEnd: boolean;
  /** HH:mm */
  startTime: string;
  endTime: string;
  hours: string;
  minutes: string;
  /** yyyy-MM-dd */
  date: string;
};

function timeInput(value: string): string {
  const date = parseStamp(value);
  return date ? format(date, "HH:mm") : "";
}

/** TimeEntryEdit.js's prefill for an entry opened from a task row. */
export function timeEntryDraft(entry: TimeEntry, task: ProjectTask): TimeEntryDraft {
  // Rounded to whole minutes before splitting, so 1.999h reads 2h 0m rather
  // than 1h 60m.
  const totalMinutes = Math.round(entry.hoursLogged * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const startTime = timeInput(entry.startTime);
  const endTime = timeInput(entry.endTime);
  const logDate = parseStamp(entry.logDate);
  return {
    description: entry.notes || task.name,
    useStartEnd: !!(startTime && endTime),
    startTime,
    endTime,
    hours: String(hours),
    minutes: String(minutes),
    date: format(logDate ?? new Date(), "yyyy-MM-dd"),
  };
}

/** Hours between two HH:mm times, wrapping past midnight. */
function hoursBetween(start: string, end: string): number {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let diff = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

/**
 * TimeEntryEdit.js's checks and payload, or the message it toasted. The
 * project, job and task travel with it as they did from the task row.
 *
 * `notes` / `task_name` are sent as sole-webapp sent them, though the update
 * route doesn't take either — the description isn't saved there.
 */
export function timeEntryPayload(
  draft: TimeEntryDraft,
  task: ProjectTask,
  projectId: string,
): { payload: Record<string, unknown> } | { error: string } {
  let totalHours: number;
  if (draft.useStartEnd) {
    if (!draft.startTime || !draft.endTime) {
      return { error: "Please enter both start and end times" };
    }
    totalHours = hoursBetween(draft.startTime, draft.endTime);
  } else {
    totalHours = (parseInt(draft.hours, 10) || 0) + (parseInt(draft.minutes, 10) || 0) / 60;
  }
  if (totalHours <= 0) return { error: "Please enter a valid duration" };

  return {
    payload: compactPayload({
      log_date: draft.date || format(new Date(), "yyyy-MM-dd"),
      // Only in start/end mode: the server recomputes the duration from these
      // whenever they're present, which would override typed hours.
      start_time: draft.useStartEnd ? draft.startTime : undefined,
      end_time: draft.useStartEnd ? draft.endTime : undefined,
      hours_logged: totalHours,
      notes: draft.description,
      task_name: draft.description,
      project_id: projectId,
      project_job_id: task.jobId,
      task_id: task.id,
    }),
  };
}

export async function updateTimeEntryApi(id: string, payload: Record<string, unknown>): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.timeTracking.stop}/${id}`,
    buildEncryptedRequestBody(payload),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Failed to update time entry");
  }
}

export async function deleteTimeEntryApi(id: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    `${apiRoutes.projects.timeTracking.delete}/${id}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Failed to delete time entry");
  }
}

/** `handleInvoiceCreated` — the entries now sit on that invoice. */
export async function markEntriesInvoicedApi(
  entryIds: string[],
  invoice: { id: string; number: string },
): Promise<void> {
  const response = await api.put<ApiEnvelope<unknown>>(
    apiRoutes.projects.timeTracking.bulkUpdate,
    buildEncryptedRequestBody({
      id: entryIds.map(Number),
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
 * Invoicing a job's selection
 * ------------------------------------------------------------------ */

/** A billable fixed task has no entries to pick; it's selected under this id. */
export function fixedTaskSelectionId(task: ProjectTask): string | null {
  return task.chargeType === "fixed" && task.isBillable ? `task-${task.id}` : null;
}

const trim = (value: number, digits: number) => String(Number(value.toFixed(digits)));

function invoiceLine(
  description: string,
  quantity: string,
  price: string,
  qtyType: "hours" | "items",
): InvoiceLineItem {
  return { ...newLineItem(), description, quantity, price, gst: false, qtyType };
}

export type JobInvoice = {
  seed: InvoiceSeed;
  /** The entries to mark invoiced once the invoice saves. */
  entryIds: string[];
};

/**
 * `handleCreateInvoiceFromSelected` from Jobaccordionitem.js: one line per
 * billable task among the selected entries (hours at the rate, or the fixed
 * amount), plus one per selected fixed task, billed to the first entry's
 * client. Non-billable entries ride along to be marked invoiced but add no
 * line. Returns the message sole-webapp toasted when there's nothing to bill.
 */
export function buildJobInvoice({
  selected,
  tasks,
  entries,
  project,
}: {
  selected: Set<string>;
  tasks: ProjectTask[];
  entries: TimeEntry[];
  project: Project;
}): JobInvoice | { error: string } {
  if (selected.size === 0) return { error: "No entries selected" };

  const byTask = new Map<string, { task: ProjectTask; entries: TimeEntry[] }>();
  tasks.forEach((task) => {
    entries
      .filter((entry) => entry.taskId === task.id && selected.has(entry.id))
      .forEach((entry) => {
        const group = byTask.get(task.id) ?? { task, entries: [] };
        group.entries.push(entry);
        byTask.set(task.id, group);
      });
  });

  const items: InvoiceLineItem[] = [];
  const entryIds: string[] = [];
  const sourceEntries: TimeEntry[] = [];

  byTask.forEach(({ task, entries: taskEntries }) => {
    entryIds.push(...taskEntries.map((entry) => entry.id));
    sourceEntries.push(...taskEntries);
    if (!task.isBillable) return;

    const rate = taskEntries[0]?.rate || task.rate || 0;
    const totalMinutes = taskEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
    const totalAmount = taskEntries.reduce((sum, entry) => {
      if (entry.amount > 0) return sum + entry.amount;
      return sum + (entry.durationMinutes / 60) * rate;
    }, 0);
    const fixed = task.chargeType === "fixed";
    items.push(
      invoiceLine(
        task.name || "Time Tracking Entry",
        fixed ? "1" : trim(totalMinutes / 60, 4),
        trim(fixed ? totalAmount : rate, 2),
        fixed ? "items" : "hours",
      ),
    );
  });

  let fixedClientId: string | null = null;
  tasks.forEach((task) => {
    const syntheticId = fixedTaskSelectionId(task);
    if (!syntheticId || !selected.has(syntheticId) || byTask.has(task.id)) return;
    fixedClientId = task.clientId;
    const amount = task.amount || task.fixedAmount;
    if (amount <= 0) return;
    items.push(invoiceLine(task.name || "Fixed Task", "1", trim(amount, 2), "items"));
  });

  if (items.length === 0) {
    return {
      error:
        "No billable entries selected. Non-billable entries are included in the timesheet only.",
    };
  }

  const first = sourceEntries[0];
  const clientId = first?.clientId ?? fixedClientId ?? project.clientId;
  const clientName = first?.billedName || project.clientName;
  return {
    seed: { description: "", items, clientId, clientName, projectId: project.id },
    entryIds,
  };
}
