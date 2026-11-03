/**
 * Projects / milestones — projects with a budget, the jobs (milestones) under
 * them, and the per-business settings that number both.
 *
 * Backed by sole-ocr's `/project` routes, the same ones sole-webapp's
 * `components/Projects/` calls: the paginated list with its status counts,
 * project CRUD, the status patch and the settings record.
 *
 * Every write goes through `buildEncryptedRequestBody`. sole-webapp sent
 * project creates and updates as plain JSON and only encrypted the settings
 * save; the controllers (`project.js`, `projectSettings.js`) already read
 * `req.body.data` through `decryptPayload`, so both shapes land the same way.
 *
 * Two things encryption changes. `encryptPayload` writes booleans as "true" /
 * "false" — the project service compares flags against both `true` and
 * `'true'`, and Sequelize's BOOLEAN sanitiser turns the strings back into
 * booleans, so that's safe. It also writes `null` as `""`, which a BIGINT
 * (`client_id`, `contact_id`) would reject, so `compactPayload` drops absent
 * ids before encrypting. Budget amounts are sent as `""` on purpose: the
 * service reads `""` as 0, the same as the `null` sole-webapp sent.
 */
import { differenceInCalendarDays, format, isValid, parse, parseISO } from "date-fns";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

export type ProjectStatus = "draft" | "inprogress" | "closed";
export type ProjectStatusFilter = "all" | ProjectStatus;
export type ProjectBudgetType = "total" | "weekly" | "monthly";

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "inprogress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

export const PROJECT_STATUS_TABS: { value: ProjectStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...PROJECT_STATUSES,
];

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUSES.find((option) => option.value === status)?.label ?? "Draft";
}

export function toProjectStatus(value: unknown): ProjectStatus {
  return value === "inprogress" || value === "closed" ? value : "draft";
}

export const PROJECT_BUDGET_TYPES: { value: ProjectBudgetType; label: string }[] = [
  { value: "total", label: "Overall" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/* ------------------------------------------------------------------ *
 * Small parsers
 * ------------------------------------------------------------------ */

export function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export function optionalId(value: unknown): string | null {
  const text = str(value);
  return text && text !== "0" && text !== "null" && text !== "undefined" ? text : null;
}

/** `toBoolean` from NewProjectModal.js — 1, "1", "true" and true all count. */
export function toFlag(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0" || normalized === "") return false;
  }
  return Boolean(value);
}

/** Drops keys an encrypted body can't leave unset (see the file header). */
export function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null),
  );
}

/** Initials for the avatar tile — `getInitials` from Projectcard.js. */
export function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/**
 * The list endpoint formats dates as DD-MM-YYYY; the detail endpoint returns
 * the DATEONLY column as YYYY-MM-DD (or an ISO timestamp). Both read here.
 */
export function parseProjectDate(value: unknown): Date | null {
  const text = str(value);
  if (!text) return null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) {
    const parsed = parse(text, "dd-MM-yyyy", new Date());
    return isValid(parsed) ? parsed : null;
  }
  const parsed = parseISO(text);
  return isValid(parsed) ? parsed : null;
}

/** Shown as the list shows it: 03-08-2026. */
export function formatProjectDate(value: unknown): string {
  const parsed = value instanceof Date ? value : parseProjectDate(value);
  return parsed ? format(parsed, "dd-MM-yyyy") : "—";
}

/** The `yyyy-MM-dd` the date pickers and the API both take. */
export function toIsoDay(value: unknown): string {
  const parsed = value instanceof Date ? value : parseProjectDate(value);
  return parsed ? format(parsed, "yyyy-MM-dd") : "";
}

/* ------------------------------------------------------------------ *
 * List
 * ------------------------------------------------------------------ */

type ApiPerson = { id?: unknown; name?: string; email?: string; business_name?: string } | null;

export type ApiProject = Record<string, unknown> & {
  id?: string | number;
  project_name?: string;
  project_code?: string;
  project_status?: string;
  project_description?: string;
  color?: string;
  client_id?: string | number | null;
  contact_id?: string | number | null;
  clientDetail?: ApiPerson;
  contactDetail?: ApiPerson;
  start_date?: string | null;
  end_date?: string | null;
  is_budget?: boolean | number;
  is_fixed?: boolean | number;
  budget_type?: string;
  budget?: number | string;
  weekly_budget?: number | string;
  monthly_budget?: number | string;
  used_budget?: number | string;
  remaining_budget?: number | string;
  show_total_budget?: boolean | number;
  show_weekly_budget?: boolean | number;
  show_monthly_budget?: boolean | number;
  job_names?: string[];
  jobs_count?: number;
};

export type ProjectListItem = {
  id: string;
  name: string;
  code: string;
  color: string;
  status: ProjectStatus;
  description: string;
  /** The contact on the project, else the client — what the old row showed. */
  clientName: string;
  clientEmail: string;
  /** The project's budget, else its weekly or monthly budget, as the old row read it. */
  budget: number;
  usedBudget: number;
  startDate: string;
  endDate: string;
  jobNames: string[];
  jobsCount: number;
};

/** Spend against budget, 0–100 — `calculateProgress` from Projectcard.js. */
export function projectProgress(budget: number, used: number): number {
  if (budget <= 0) return 0;
  return Math.min(Math.round((used / budget) * 100), 100);
}

export function mapProjectListItem(raw: ApiProject): ProjectListItem {
  const person = raw.contactDetail?.name ? raw.contactDetail : raw.clientDetail;
  const budget = num(raw.budget) || num(raw.weekly_budget) || num(raw.monthly_budget);
  return {
    id: str(raw.id),
    name: str(raw.project_name),
    code: str(raw.project_code),
    color: str(raw.color),
    status: toProjectStatus(raw.project_status),
    description: str(raw.project_description),
    clientName: str(person?.name),
    clientEmail: str(person?.email),
    budget,
    usedBudget: num(raw.used_budget),
    startDate: str(raw.start_date),
    endDate: str(raw.end_date),
    jobNames: Array.isArray(raw.job_names) ? raw.job_names.map(str).filter(Boolean) : [],
    jobsCount: num(raw.jobs_count),
  };
}

export type ProjectStatusCounts = Record<ProjectStatusFilter, number>;

export type ProjectListFilters = {
  status: ProjectStatusFilter;
  search: string;
};

export type ProjectPage = {
  projects: ProjectListItem[];
  total: number;
  counts: ProjectStatusCounts;
};

/** The server caps `limit` at 100. */
export const PROJECT_PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_PROJECT_PAGE_SIZE = 25;

export async function fetchProjectsPage(
  filters: ProjectListFilters,
  page: number,
  pageSize: number,
): Promise<ProjectPage> {
  const response = await api.get<{
    success?: boolean;
    message?: string;
    data?: ApiProject[];
    pagination?: { totalRecords?: number; total?: number; totalCount?: number };
    meta?: Partial<Record<ProjectStatusFilter, number>>;
  }>(apiRoutes.projects.getAllProject, {
    params: {
      page,
      limit: pageSize,
      ...(filters.status !== "all" ? { status: filters.status } : {}),
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    },
  });
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't load projects.");
  }
  const rows = Array.isArray(response.data?.data) ? response.data.data : [];
  const pagination = response.data?.pagination;
  const meta = response.data?.meta ?? {};
  return {
    projects: rows.map(mapProjectListItem),
    total: num(pagination?.totalRecords ?? pagination?.total ?? pagination?.totalCount, rows.length),
    counts: {
      all: num(meta.all),
      draft: num(meta.draft),
      inprogress: num(meta.inprogress),
      closed: num(meta.closed),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

export type Project = {
  id: string;
  name: string;
  code: string;
  color: string;
  status: ProjectStatus;
  description: string;
  clientId: string | null;
  contactId: string | null;
  clientName: string;
  clientEmail: string;
  /** yyyy-MM-dd */
  startDate: string;
  endDate: string;
  isBudget: boolean;
  isFixed: boolean;
  budgetType: ProjectBudgetType;
  budget: number;
  weeklyBudget: number;
  monthlyBudget: number;
  usedBudget: number;
  remainingBudget: number;
  raw: ApiProject;
};

function toBudgetType(value: unknown): ProjectBudgetType {
  return value === "weekly" || value === "monthly" ? value : "total";
}

export function mapProject(raw: ApiProject): Project {
  const client = raw.clientDetail?.name ? raw.clientDetail : raw.contactDetail;
  return {
    id: str(raw.id),
    name: str(raw.project_name),
    code: str(raw.project_code),
    color: str(raw.color),
    status: toProjectStatus(raw.project_status),
    description: str(raw.project_description),
    clientId: optionalId(raw.client_id),
    contactId: optionalId(raw.contact_id),
    clientName: str(client?.name),
    clientEmail: str(client?.email),
    startDate: toIsoDay(raw.start_date),
    endDate: toIsoDay(raw.end_date),
    isBudget: toFlag(raw.is_budget),
    isFixed: toFlag(raw.is_fixed),
    budgetType: toBudgetType(raw.budget_type),
    budget: num(raw.budget),
    weeklyBudget: num(raw.weekly_budget),
    monthlyBudget: num(raw.monthly_budget),
    usedBudget: num(raw.used_budget),
    remainingBudget: num(raw.remaining_budget),
    raw,
  };
}

export async function fetchProject(id: string): Promise<Project> {
  const response = await api.get<{ success?: boolean; message?: string; data?: ApiProject }>(
    `${apiRoutes.projects.info}${id}`,
  );
  if (!response.data?.data || response.data.success === false) {
    throw new Error(response.data?.message || "Project not found.");
  }
  return mapProject(response.data.data);
}

/* ------------------------------------------------------------------ *
 * Create / edit
 * ------------------------------------------------------------------ */

export type ProjectClient = {
  clientId: string;
  contactId: string | null;
  name: string;
  email: string;
};

export type ProjectDraft = {
  client: ProjectClient | null;
  name: string;
  code: string;
  status: ProjectStatus;
  /** yyyy-MM-dd */
  startDate: string;
  endDate: string;
  description: string;
  /** Task based (true) or fixed (false) — `isTaskBased` in the old modal. */
  taskBased: boolean;
  budgetEnabled: boolean;
  budgetType: ProjectBudgetType;
  totalBudget: string;
  weeklyBudget: string;
  monthlyBudget: string;
};

const positiveText = (value: number) => (value > 0 ? String(value) : "");

/** Today to the end of the current Australian financial year (30 June). */
export function emptyProjectDraft(now = new Date()): ProjectDraft {
  const fyEnd = new Date(now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear(), 5, 30);
  return {
    client: null,
    name: "",
    code: "",
    status: "draft",
    startDate: format(now, "yyyy-MM-dd"),
    endDate: format(fyEnd, "yyyy-MM-dd"),
    description: "",
    taskBased: true,
    budgetEnabled: true,
    budgetType: "total",
    totalBudget: "",
    weeklyBudget: "",
    monthlyBudget: "",
  };
}

/**
 * A new project's budget section, pre-filled from the settings record — the
 * `resetToCreateDefaults` step of NewProjectModal.js. Only one budget type is
 * ever on; the first flagged one wins, as the radio there showed it.
 */
export function applySettingsToDraft(draft: ProjectDraft, settings: ProjectSettings): ProjectDraft {
  const budgetType: ProjectBudgetType = settings.showTotalBudget
    ? "total"
    : settings.showWeeklyBudget
      ? "weekly"
      : settings.showMonthlyBudget
        ? "monthly"
        : "total";
  return {
    ...draft,
    budgetEnabled: settings.defaultBudgetEnabled,
    budgetType,
    totalBudget: positiveText(num(settings.defaultTotalBudget)),
    weeklyBudget: positiveText(num(settings.defaultWeeklyBudget)),
    monthlyBudget: positiveText(num(settings.defaultMonthlyBudget)),
  };
}

export function projectDraftFromProject(project: Project): ProjectDraft {
  return {
    client: project.clientId
      ? {
          clientId: project.clientId,
          contactId: project.contactId,
          name: project.clientName,
          email: project.clientEmail,
        }
      : null,
    name: project.name,
    code: project.code,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    description: project.description,
    taskBased: !project.isFixed,
    budgetEnabled: project.isBudget,
    budgetType: project.budgetType,
    totalBudget: positiveText(project.budget),
    weeklyBudget: positiveText(project.weeklyBudget),
    monthlyBudget: positiveText(project.monthlyBudget),
  };
}

/**
 * The overall budget a weekly or monthly one adds up to over the project's
 * dates — `calculateTotalFromPeriod` from NewProjectModal.js, rounded to cents.
 * Null when there's nothing to multiply.
 */
export function totalFromPeriod(draft: ProjectDraft): string | null {
  if (draft.budgetType === "total") return null;
  const amount = num(draft.budgetType === "weekly" ? draft.weeklyBudget : draft.monthlyBudget);
  const start = parseProjectDate(draft.startDate);
  const end = parseProjectDate(draft.endDate);
  if (!amount || amount <= 0 || !start || !end || end <= start) return null;
  if (draft.budgetType === "weekly") {
    const weeks = Math.ceil(differenceInCalendarDays(end, start) / 7);
    return (amount * weeks).toFixed(2);
  }
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    (end.getDate() >= start.getDate() ? 1 : 0);
  return (amount * Math.max(months, 1)).toFixed(2);
}

export type ProjectIssue = { key: keyof ProjectDraft; message: string };

/** ProjectSchema.js, plus the budget checks `onSubmit` made by hand. */
export function projectIssues(draft: ProjectDraft): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  if (!draft.client) issues.push({ key: "client", message: "Client is required" });
  if (draft.name.trim().length < 3) {
    issues.push({ key: "name", message: "Project name must be at least 3 characters" });
  }
  if (!draft.code.trim()) {
    issues.push({ key: "code", message: "Project code is required" });
  } else if (!/^[A-Za-z0-9-]+$/.test(draft.code.trim())) {
    issues.push({ key: "code", message: "Only letters, numbers and dashes allowed" });
  }
  if (!draft.startDate) issues.push({ key: "startDate", message: "Start date is required" });
  if (!draft.endDate) {
    issues.push({ key: "endDate", message: "End date is required" });
  } else if (draft.startDate && draft.endDate < draft.startDate) {
    issues.push({ key: "endDate", message: "End date cannot be before start date" });
  }
  if (draft.description.length > 500) {
    issues.push({ key: "description", message: "Description must be 500 characters or fewer" });
  }
  if (draft.budgetEnabled) {
    if (draft.budgetType === "total" && !(num(draft.totalBudget) > 0)) {
      issues.push({ key: "totalBudget", message: "Overall budget is required and must be greater than 0" });
    }
    if (draft.budgetType === "weekly" && !(num(draft.weeklyBudget) > 0)) {
      issues.push({ key: "weeklyBudget", message: "Weekly budget is required and must be greater than 0" });
    }
    if (draft.budgetType === "monthly" && !(num(draft.monthlyBudget) > 0)) {
      issues.push({ key: "monthlyBudget", message: "Monthly budget is required and must be greater than 0" });
    }
  }
  return issues;
}

/** The fields create and update share, under the names both endpoints read. */
function budgetFields(draft: ProjectDraft) {
  const on = draft.budgetEnabled;
  const calculated = totalFromPeriod(draft);
  const overall =
    on && draft.budgetType === "total" ? draft.totalBudget : on && calculated ? calculated : "0";
  return {
    is_budget: on,
    show_total_budget: draft.budgetType === "total",
    show_weekly_budget: draft.budgetType === "weekly",
    show_monthly_budget: draft.budgetType === "monthly",
    overall,
    // "" rather than null: encrypted, null becomes "" anyway, and the service
    // reads "" as 0 — the same as the null sole-webapp sent.
    weekly_budget: on && draft.budgetType === "weekly" ? draft.weeklyBudget : "",
    monthly_budget: on && draft.budgetType === "monthly" ? draft.monthlyBudget : "",
    is_task_based: draft.taskBased,
    is_fixed: !draft.taskBased,
    budget_type: draft.budgetType,
  };
}

/** `POST /project` — the create branch of NewProjectModal.js's `onSubmit`. */
export function createProjectPayload(draft: ProjectDraft): Record<string, unknown> {
  const { overall, ...budget } = budgetFields(draft);
  return compactPayload({
    name: draft.name.trim(),
    client_id: draft.client?.clientId,
    contact_id: draft.client?.contactId,
    project_code: draft.code.trim(),
    start_date: draft.startDate || undefined,
    end_date: draft.endDate || undefined,
    ...budget,
    budget: overall,
    description: draft.description,
    project_status: draft.status,
  });
}

/** `PUT /project/:id` — the edit branch, which names its fields differently. */
export function updateProjectPayload(draft: ProjectDraft): Record<string, unknown> {
  const { overall, ...budget } = budgetFields(draft);
  return compactPayload({
    project_name: draft.name.trim(),
    project_status: draft.status,
    start_date: draft.startDate || undefined,
    end_date: draft.endDate || undefined,
    ...budget,
    total_budget: overall,
    client_id: draft.client?.clientId,
    contact_id: draft.client?.contactId,
    project_description: draft.description,
  });
}

type WriteResponse = { success?: boolean; message?: string; data?: ApiProject };

export async function createProjectApi(payload: Record<string, unknown>): Promise<{ id: string }> {
  const response = await api.post<WriteResponse>(
    apiRoutes.projects.create,
    buildEncryptedRequestBody(payload),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't create this project.");
  }
  return { id: str(response.data?.data?.id) };
}

export async function updateProjectApi(id: string, payload: Record<string, unknown>): Promise<void> {
  const response = await api.put<WriteResponse>(
    `${apiRoutes.projects.update}/${id}`,
    buildEncryptedRequestBody(payload),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't update this project.");
  }
}

export async function deleteProjectApi(id: string): Promise<void> {
  const response = await api.delete<{ success?: boolean; message?: string }>(
    `${apiRoutes.projects.delete}/${id}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Failed to delete project");
  }
}

/**
 * The next project code. Note the server advances its counter on every call,
 * as it did for sole-webapp, which asked each time the new-project form opened.
 */
export async function fetchNextProjectCode(): Promise<string> {
  const response = await api.get<{ data?: { code?: string } }>(apiRoutes.projects.nextProjectCode);
  return str(response.data?.data?.code);
}

/** The next job code — advances the server's counter, like the project one. */
export async function fetchNextJobCode(): Promise<string> {
  const response = await api.get<{ data?: { code?: string } }>(apiRoutes.projects.nextJobCode);
  return str(response.data?.data?.code);
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export type ProjectSettings = {
  defaultHourlyRate: string;
  defaultKmRate: string;
  projectPrefix: string;
  projectNextNumber: string;
  jobPrefix: string;
  jobNextNumber: string;
  defaultBudgetEnabled: boolean;
  showTotalBudget: boolean;
  showWeeklyBudget: boolean;
  showMonthlyBudget: boolean;
  defaultTotalBudget: string;
  defaultWeeklyBudget: string;
  defaultMonthlyBudget: string;
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  defaultHourlyRate: "",
  defaultKmRate: "",
  projectPrefix: "PRO",
  projectNextNumber: "1",
  jobPrefix: "JOB",
  jobNextNumber: "1",
  defaultBudgetEnabled: true,
  showTotalBudget: false,
  showWeeklyBudget: false,
  showMonthlyBudget: false,
  defaultTotalBudget: "",
  defaultWeeklyBudget: "",
  defaultMonthlyBudget: "",
};

const amountText = (value: unknown) => (value == null || value === "" ? "" : String(value));

/** `fetchSettings` from Setting.js — absent flags fall back to "has a value". */
export function mapProjectSettings(raw: Record<string, unknown> | null | undefined): ProjectSettings {
  if (!raw) return DEFAULT_PROJECT_SETTINGS;
  return {
    defaultHourlyRate: amountText(raw.default_hourly_rate),
    defaultKmRate: amountText(raw.default_km_rate),
    projectPrefix: str(raw.project_prefix) || "PRO",
    projectNextNumber: str(raw.project_next_number) || "1",
    jobPrefix: str(raw.job_prefix) || "JOB",
    jobNextNumber: str(raw.job_next_number) || "1",
    defaultBudgetEnabled: toFlag(raw.default_budget_enabled, true),
    showTotalBudget: toFlag(raw.show_total_budget, num(raw.default_total_budget) > 0),
    showWeeklyBudget: toFlag(raw.show_weekly_budget, num(raw.default_weekly_budget) > 0),
    showMonthlyBudget: toFlag(raw.show_monthly_budget, num(raw.default_monthly_budget) > 0),
    defaultTotalBudget: amountText(raw.default_total_budget),
    defaultWeeklyBudget: amountText(raw.default_weekly_budget),
    defaultMonthlyBudget: amountText(raw.default_monthly_budget),
  };
}

export async function fetchProjectSettings(): Promise<ProjectSettings> {
  const response = await api.get<{ success?: boolean; data?: Record<string, unknown> }>(
    apiRoutes.projects.settings,
  );
  return mapProjectSettings(response.data?.success ? response.data.data : null);
}

export type ProjectSettingsIssue = { key: keyof ProjectSettings; message: string };

/** The per-field `rules` Setting.js gave each Controller. */
export function projectSettingsIssues(settings: ProjectSettings): ProjectSettingsIssue[] {
  const issues: ProjectSettingsIssue[] = [];
  if (settings.defaultHourlyRate && !(num(settings.defaultHourlyRate, -1) >= 0)) {
    issues.push({ key: "defaultHourlyRate", message: "Must be a positive number" });
  }
  const prefix = (key: "projectPrefix" | "jobPrefix") => {
    if (!settings[key].trim()) issues.push({ key, message: "Prefix is required" });
    else if (!/^[A-Za-z]{1,10}$/.test(settings[key])) {
      issues.push({ key, message: "Letters only, max 10 characters" });
    }
  };
  const next = (key: "projectNextNumber" | "jobNextNumber") => {
    const value = Number(settings[key]);
    if (!settings[key].trim()) issues.push({ key, message: "Number is required" });
    else if (!(value >= 1 && Number.isInteger(value))) {
      issues.push({ key, message: "Must be a positive whole number" });
    }
  };
  prefix("projectPrefix");
  next("projectNextNumber");
  prefix("jobPrefix");
  next("jobNextNumber");
  return issues;
}

/** `onSubmit` from Setting.js, field for field. */
export function projectSettingsPayload(settings: ProjectSettings): Record<string, unknown> {
  const on = settings.defaultBudgetEnabled;
  return {
    default_hourly_rate: settings.defaultHourlyRate ? Number(settings.defaultHourlyRate) : null,
    default_km_rate: settings.defaultKmRate ? Number(settings.defaultKmRate) : null,
    project_prefix: settings.projectPrefix,
    project_next_number: Number(settings.projectNextNumber) || 1,
    job_prefix: settings.jobPrefix,
    job_next_number: Number(settings.jobNextNumber) || 1,
    default_budget_enabled: on,
    show_total_budget: settings.showTotalBudget,
    show_weekly_budget: settings.showWeeklyBudget,
    show_monthly_budget: settings.showMonthlyBudget,
    default_total_budget:
      on && settings.showTotalBudget ? Number(settings.defaultTotalBudget) || null : null,
    default_weekly_budget:
      on && settings.showWeeklyBudget ? Number(settings.defaultWeeklyBudget) || null : null,
    default_monthly_budget:
      on && settings.showMonthlyBudget ? Number(settings.defaultMonthlyBudget) || null : null,
  };
}

export async function saveProjectSettingsApi(settings: ProjectSettings): Promise<ProjectSettings> {
  const response = await api.post<{
    success?: boolean;
    message?: string;
    data?: Record<string, unknown>;
  }>(apiRoutes.projects.settings, buildEncryptedRequestBody(projectSettingsPayload(settings)));
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save project settings.");
  }
  return response.data?.data ? mapProjectSettings(response.data.data) : settings;
}
