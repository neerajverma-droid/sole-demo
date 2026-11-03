/**
 * Payroll leave — the types, options, duration maths and payload shapes behind
 * the Leave screen and its request drawer.
 *
 * A port of sole-webapp's `LeaveList.js` and `CreateLeaveRequestDrawer.js`.
 * The backend's leave routes already speak camelCase (`employeeId`,
 * `leaveType`, `startDate`), unlike employees and pay runs, so these types are
 * the wire shape as well as the UI's.
 *
 * The rules the drawer and the row menu enforce are pure functions, so they
 * can be tested without rendering either; the API calls sit at the bottom.
 */

import { z } from "zod";

import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { parseIsoDate, toIsoDate } from "@/lib/invoices";
import { PAYROLL_EMPTY, titleCase } from "@/lib/payroll";
import api from "@/utils/axiosInstance";

/* ------------------------------------------------------------------ *
 * Status and type
 * ------------------------------------------------------------------ */

export type LeaveStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

export function leaveStatusLabel(status: string): string {
  return LEAVE_STATUS_LABEL[status as LeaveStatus] ?? titleCase(status);
}

export function leaveStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "APPROVED":
      return "success";
    case "PENDING":
      return "warning";
    case "DECLINED":
      return "danger";
    default:
      return "secondary";
  }
}

export type LeaveType =
  | "ANNUAL_LEAVE"
  | "PERSONAL_LEAVE"
  | "LONG_SERVICE_LEAVE"
  | "UNPAID_LEAVE"
  | "COMPASSIONATE_LEAVE";

/** The five a request can be raised as, in sole-webapp's order. */
export const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "ANNUAL_LEAVE", label: "Annual leave" },
  { value: "PERSONAL_LEAVE", label: "Personal leave" },
  { value: "LONG_SERVICE_LEAVE", label: "Long service leave" },
  { value: "UNPAID_LEAVE", label: "Unpaid leave" },
  { value: "COMPASSIONATE_LEAVE", label: "Compassionate leave" },
];

/**
 * Older requests were saved with the short codes sole-webapp's list still knows
 * how to name (`ANNUAL`, `SICK`, `BEREAVEMENT`…), so those keep their labels
 * here even though nobody can pick them any more.
 */
const LEGACY_LEAVE_LABEL: Record<string, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick leave",
  PERSONAL: "Personal leave",
  UNPAID: "Unpaid leave",
  BEREAVEMENT: "Bereavement leave",
  OTHER: "Other",
};

export function leaveTypeLabel(type: string | null | undefined): string {
  if (!type) return PAYROLL_EMPTY;
  return (
    LEAVE_TYPES.find((option) => option.value === type)?.label ??
    LEGACY_LEAVE_LABEL[type] ??
    titleCase(type)
  );
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

/** `GET /leave-requests/{id}` and each row of the list. */
export type LeaveRequest = {
  id: string;
  employeeId: string;
  /** Already resolved from whichever of the employee's name fields exist. */
  employeeName: string;
  leaveType: LeaveType | string;
  /** ISO, usually with the offset the drawer saved it with. */
  startDate: string;
  endDate: string;
  /** "HH:mm". "00:00"–"23:59" (or nothing) means a full day. */
  startTime: string | null;
  endTime: string | null;
  /** Worked out by the backend; older rows can be missing either. */
  daysOff: number | null;
  estimatedHours: number | null;
  comments: string;
  agreedToTerms: boolean;
  status: LeaveStatus;
  /** Why it was declined, when it was. */
  reviewNote: string | null;
};

/** `GET /leave-requests/counts`. */
export type LeaveCounts = {
  all: number;
  pending: number;
  approved: number;
  declined: number;
  cancelled: number;
};

export const NO_LEAVE_COUNTS: LeaveCounts = {
  all: 0,
  pending: 0,
  approved: 0,
  declined: 0,
  cancelled: 0,
};

export type LeaveStatusFilter = "all" | LeaveStatus;

/** The status tabs, each tied to the count that labels it. */
export const LEAVE_STATUS_TABS: {
  value: LeaveStatusFilter;
  label: string;
  count: keyof LeaveCounts;
}[] = [
  { value: "all", label: "All", count: "all" },
  { value: "PENDING", label: "Pending", count: "pending" },
  { value: "APPROVED", label: "Approved", count: "approved" },
  { value: "DECLINED", label: "Declined", count: "declined" },
  { value: "CANCELLED", label: "Cancelled", count: "cancelled" },
];

export type LeaveTypeFilter = "all" | LeaveType;

/** `GET /leave-requests` — exactly the params sole-webapp sends. */
export type LeaveListParams = {
  page: number;
  limit: number;
  status?: LeaveStatus;
  leaveType?: LeaveType;
  search?: string;
};

/**
 * The list request for the screen's filters, leaving out anything set to "all"
 * or blank so the server isn't asked to filter on it — the same rule
 * sole-webapp's fetch applied.
 */
export function leaveListParams({
  page,
  limit,
  status,
  leaveType,
  search,
}: {
  page: number;
  limit: number;
  status: LeaveStatusFilter;
  leaveType: LeaveTypeFilter;
  search: string;
}): LeaveListParams {
  const params: LeaveListParams = { page, limit };
  if (status !== "all") params.status = status;
  if (leaveType !== "all") params.leaveType = leaveType;
  const query = search.trim();
  if (query) params.search = query;
  return params;
}

export type LeaveRequestsPage = {
  requests: LeaveRequest[];
  total: number;
  totalPages: number;
};

/** Who a request can be raised for — `GET /employees?limit=100`, cut down. */
export type LeaveEmployeeOption = { id: string; name: string };

/* ------------------------------------------------------------------ *
 * Duration
 * ------------------------------------------------------------------ */

/** A working day, for leave purposes. Matches sole-webapp's estimate. */
export const LEAVE_HOURS_PER_DAY = 8;

export const FULL_DAY_START = "00:00";
export const FULL_DAY_END = "23:59";
export const PARTIAL_DAY_START = "09:00";
export const PARTIAL_DAY_END = "17:00";

/** Monday to Friday between two ISO dates, both ends included. */
export function workingDaysBetween(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end || end < start) return 0;

  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** "09:30" → 570. Anything unreadable is null rather than midnight. */
function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export type LeaveDuration = { days: number; hours: number };

/**
 * Working days and hours a request takes, as the drawer shows it live.
 *
 * Weekends don't count; public holidays aren't known here, so they do — the
 * same estimate sole-webapp gives, and the backend's own figure is what the
 * list shows once saved. A single partial day is the gap between its times;
 * anything else is eight hours a day, whatever the times say, because a
 * multi-day request's times only mark when the first day starts and the last
 * one ends.
 */
export function calcLeaveDuration({
  startDate,
  endDate,
  startTime,
  endTime,
  fullDay,
}: {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  fullDay: boolean;
}): LeaveDuration {
  const days = workingDaysBetween(startDate, endDate);

  let hours = days * LEAVE_HOURS_PER_DAY;
  if (days === 1 && !fullDay) {
    const start = minutesOf(startTime || PARTIAL_DAY_START) ?? 0;
    const end = minutesOf(endTime || PARTIAL_DAY_END) ?? 0;
    hours = Math.max(0, (end - start) / 60);
  }

  return { days, hours: Math.round(hours * 100) / 100 };
}

/** "3 days (24h)", "1 day (4.5h)". */
export function leaveDurationLabel({ days, hours }: LeaveDuration): string {
  const figure = hours.toLocaleString("en-AU", { maximumFractionDigits: 2 });
  return `${days} ${days === 1 ? "day" : "days"} (${figure}h)`;
}

/**
 * What a row's Duration column says.
 *
 * The backend's own day count when it has one. A full day's hours are days ×
 * 8 rather than the backend's figure, because the backend times a single day
 * from 00:00 to 23:59 and stores 23.98 hours for it. A row with no figures at
 * all is worked out from its dates and times, rather than sole-webapp's flat
 * "1 days (8h)", which was wrong for anything longer than a day.
 */
export function leaveRowDuration(request: LeaveRequest): LeaveDuration {
  const fullDay = isFullDayTimes(request.startTime, request.endTime);
  const days = request.daysOff ?? 0;
  const hours = request.estimatedHours ?? 0;

  if (days > 0 || hours > 0) {
    return { days, hours: fullDay ? days * LEAVE_HOURS_PER_DAY : hours };
  }
  return calcLeaveDuration({
    startDate: leaveDateFromApi(request.startDate),
    endDate: leaveDateFromApi(request.endDate),
    startTime: request.startTime ?? FULL_DAY_START,
    endTime: request.endTime ?? FULL_DAY_END,
    fullDay,
  });
}

/* ------------------------------------------------------------------ *
 * Dates on the wire
 * ------------------------------------------------------------------ */

/**
 * The calendar date a stored value means, as `YYYY-MM-DD`.
 *
 * A value written with its own offset (`…T00:00:00.000+11:00`, as the drawer
 * saves) already says which day was meant, wherever it's read from, so its
 * date is taken as written. One the server has normalised to UTC is read in
 * local time instead: local midnight in Australia is the previous day in UTC.
 */
export function leaveDateFromApi(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+[+-]\d{2}:?\d{2}$/.test(value)) {
    return value.slice(0, 10);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : toIsoDate(date);
}

/**
 * Local midnight on a date, with its offset — `2026-10-12T00:00:00.000+11:00`.
 * The format sole-webapp's drawer saved dates in, so a request saved here and
 * one saved there are the same string.
 */
export function leaveDateWithOffset(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return "";
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${iso}T00:00:00.000${sign}${hours}:${minutes}`;
}

/** 00:00–23:59, nothing at all, or the 9-to-5 default all read as a full day. */
export function isFullDayTimes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): boolean {
  if (!startTime) return true;
  return (
    (startTime === FULL_DAY_START && endTime === FULL_DAY_END) ||
    (startTime === PARTIAL_DAY_START && endTime === PARTIAL_DAY_END)
  );
}

/* ------------------------------------------------------------------ *
 * The request form
 * ------------------------------------------------------------------ */

const TIME_PATTERN = /^\d{2}:\d{2}$/;

export const leaveRequestSchema = z
  .object({
    employeeId: z.string(),
    leaveType: z.string(),
    /** `YYYY-MM-DD` from the date picker. */
    startDate: z.string(),
    endDate: z.string(),
    fullDay: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    comments: z.string(),
    agreedToTerms: z.boolean(),
    /** Carried through an edit untouched; a new request is always pending. */
    status: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.employeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employeeId"],
        message: "Choose an employee.",
      });
    }
    if (!values.leaveType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["leaveType"],
        message: "Choose a leave type.",
      });
    }
    if (!values.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "Start date is required.",
      });
    }
    if (!values.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date is required.",
      });
    } else if (values.startDate && values.endDate < values.startDate) {
      // ISO dates compare correctly as strings.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after the start date.",
      });
    }

    if (values.fullDay) return;
    if (!TIME_PATTERN.test(values.startTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: "Enter a start time.",
      });
    }
    if (!TIME_PATTERN.test(values.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "Enter an end time.",
      });
    } else if (
      // Only within one day: across several, the times are the first day's
      // start and the last day's end, so 13:00 to 09:00 is a real request.
      values.startDate &&
      values.startDate === values.endDate &&
      TIME_PATTERN.test(values.startTime) &&
      values.endTime <= values.startTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "End time must be after the start time.",
      });
    }
  });

export type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

export const LEAVE_FORM_DEFAULTS: LeaveRequestFormValues = {
  employeeId: "",
  leaveType: "ANNUAL_LEAVE",
  startDate: "",
  endDate: "",
  fullDay: true,
  startTime: PARTIAL_DAY_START,
  endTime: PARTIAL_DAY_END,
  comments: "",
  agreedToTerms: true,
  status: "PENDING",
};

/** A saved request, as the drawer's edit form. */
export function leaveFormFromRequest(
  request: LeaveRequest,
): LeaveRequestFormValues {
  const fullDay = isFullDayTimes(request.startTime, request.endTime);
  return {
    employeeId: request.employeeId,
    leaveType: request.leaveType || "ANNUAL_LEAVE",
    startDate: leaveDateFromApi(request.startDate),
    endDate: leaveDateFromApi(request.endDate),
    fullDay,
    // A full day's 00:00–23:59 would make a poor starting point if someone
    // then switches it to a partial day, so those reset to 9 to 5.
    startTime: fullDay
      ? PARTIAL_DAY_START
      : request.startTime || PARTIAL_DAY_START,
    endTime: fullDay ? PARTIAL_DAY_END : request.endTime || PARTIAL_DAY_END,
    comments: request.comments ?? "",
    agreedToTerms: request.agreedToTerms ?? true,
    status: request.status || "PENDING",
  };
}

/** The dates and times both bodies carry, as sole-webapp's drawer sent them. */
function leaveSpan(values: LeaveRequestFormValues) {
  return {
    startDate: leaveDateWithOffset(values.startDate),
    startTime: values.fullDay ? FULL_DAY_START : values.startTime || PARTIAL_DAY_START,
    endDate: leaveDateWithOffset(values.endDate),
    endTime: values.fullDay ? FULL_DAY_END : values.endTime || PARTIAL_DAY_END,
  };
}

/** `POST /leave-requests`, before encryption. */
export type LeaveCreatePayload = ReturnType<typeof leaveSpan> & {
  employeeId: string;
  leaveType: string;
  comments?: string;
  agreedToTerms?: true;
  status: "PENDING";
};

/**
 * The new-request body. Days and hours are left out — they're the drawer's
 * estimate, and the backend works out its own.
 *
 * `agreedToTerms` is sent only when ticked. Encryption turns a top-level
 * boolean into the string "false", and the create service stores
 * `Boolean(data.agreedToTerms)`, which is true for any non-empty string — so
 * an unticked box sent as false would be saved as ticked. Left out, it's
 * `Boolean(undefined)`: false, as meant. Empty comments are left out too.
 */
export function leaveCreatePayload(values: LeaveRequestFormValues): LeaveCreatePayload {
  const comments = values.comments.trim();
  return {
    employeeId: values.employeeId,
    leaveType: values.leaveType,
    ...leaveSpan(values),
    ...(comments ? { comments } : {}),
    ...(values.agreedToTerms ? { agreedToTerms: true as const } : {}),
    status: "PENDING",
  };
}

/** `PATCH /leave-requests/{id}` for an edit, before encryption. */
export type LeaveUpdatePayload = ReturnType<typeof leaveSpan> & {
  leaveType: string;
  comments: string;
  agreedToTerms: boolean;
};

/**
 * The edit body. No status: the update service treats any status as a
 * transition, and PENDING → PENDING is refused, so sole-webapp's habit of
 * sending the current status back made every edit of a pending request fail.
 * No employee either — a request stays with whoever it was raised for.
 *
 * Comments go as-is so they can be cleared, and `agreedToTerms` as a boolean:
 * on update it's written straight to the column, and Sequelize reads the
 * encrypted "true"/"false" back as a boolean.
 */
export function leaveUpdatePayload(values: LeaveRequestFormValues): LeaveUpdatePayload {
  return {
    leaveType: values.leaveType,
    ...leaveSpan(values),
    comments: values.comments.trim(),
    agreedToTerms: values.agreedToTerms,
  };
}

/** `PATCH /leave-requests/decline/{id}`. The reason is optional. */
export function declineLeavePayload(reason: string): { reviewNote: string } {
  return { reviewNote: reason.trim() };
}

/* ------------------------------------------------------------------ *
 * Row actions
 * ------------------------------------------------------------------ */

export type LeaveAction = "edit" | "approve" | "decline" | "cancel" | "delete";

/**
 * Why an action doesn't apply to a request in this status, or null when it
 * does. The row menu disables rather than hides, so every "no" needs a reason.
 *
 * Deleting approved leave is refused where sole-webapp allowed it: approved
 * leave may already be in a pay run, and cancelling it keeps that history.
 */
export function leaveActionBlocker(
  action: LeaveAction,
  status: LeaveStatus,
): string | null {
  switch (action) {
    case "edit":
      if (status === "CANCELLED") return "Cancelled leave can't be edited.";
      if (status === "DECLINED") return "Declined leave can't be edited.";
      return null;
    case "approve":
    case "decline":
      if (status === "PENDING") return null;
      return `This request is already ${LEAVE_STATUS_LABEL[status].toLowerCase()}.`;
    case "cancel":
      if (status === "PENDING" || status === "APPROVED") return null;
      return `This request is already ${LEAVE_STATUS_LABEL[status].toLowerCase()}.`;
    case "delete":
      return status === "APPROVED"
        ? "Approved leave can't be deleted. Cancel it instead."
        : null;
  }
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  pagination?: ApiPagination;
  meta?: ApiPagination;
};

type ApiPagination = Partial<{
  total: number | string;
  totalPages: number | string;
  total_pages: number | string;
}>;

/** One request as `formatRequest` in sole-ocr's leave service sends it. */
export type ApiLeaveRequest = Partial<{
  id: number | string;
  employeeId: number | string;
  employee: Partial<{
    id: number | string;
    name: string | null;
    eusername: string | null;
  }> | null;
  /** Older shapes sole-webapp also read the name from. */
  employeeName: string | null;
  leaveType: string | null;
  status: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  daysOff: number | string | null;
  estimatedHours: number | string | null;
  comments: string | null;
  reviewNote: string | null;
  agreedToTerms: boolean | string | null;
}>;

const LEAVE_STATUSES: LeaveStatus[] = ["PENDING", "APPROVED", "DECLINED", "CANCELLED"];

const str = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const num = (value: unknown): number => numOrNull(value) ?? 0;

/** Success, or the server's own reason as the error. */
function unwrap<T>(body: ApiEnvelope<T> | undefined, fallback: string): T {
  if (!body?.success || body.data === undefined) {
    throw new Error(body?.message || fallback);
  }
  return body.data;
}

export function mapLeaveRequest(raw: ApiLeaveRequest): LeaveRequest {
  const status = str(raw.status).toUpperCase() as LeaveStatus;
  const employeeId = str(raw.employeeId ?? raw.employee?.id);
  return {
    id: str(raw.id),
    employeeId,
    employeeName:
      str(raw.employee?.name).trim() ||
      str(raw.employeeName).trim() ||
      str(raw.employee?.eusername) ||
      `Employee #${employeeId}`,
    leaveType: str(raw.leaveType),
    startDate: str(raw.startDate),
    endDate: str(raw.endDate),
    startTime: raw.startTime || null,
    endTime: raw.endTime || null,
    daysOff: numOrNull(raw.daysOff),
    estimatedHours: numOrNull(raw.estimatedHours),
    comments: str(raw.comments),
    agreedToTerms: raw.agreedToTerms === true || raw.agreedToTerms === "true",
    status: LEAVE_STATUSES.includes(status) ? status : "PENDING",
    reviewNote: raw.reviewNote || null,
  };
}

/** The list is `data` — or `data.data`, which sole-webapp also accepted. */
function listFrom(body: ApiEnvelope<unknown> | undefined): ApiLeaveRequest[] {
  const data = body?.data;
  if (Array.isArray(data)) return data as ApiLeaveRequest[];
  const nested = (data as { data?: unknown } | undefined)?.data;
  return Array.isArray(nested) ? (nested as ApiLeaveRequest[]) : [];
}

/** `GET /leave-requests`. */
export async function fetchLeaveRequests(
  params: LeaveListParams,
): Promise<LeaveRequestsPage> {
  const response = await api.get<ApiEnvelope<unknown>>(apiRoutes.payroll.leaveRequests, {
    params,
  });
  const body = response.data;
  if (!body?.success) {
    throw new Error(body?.message || "Failed to load leave requests.");
  }
  const requests = listFrom(body).map(mapLeaveRequest);
  // Pagination arrives under `pagination` or, from older builds, `meta`.
  const pagination = body.pagination ?? body.meta ?? {};
  const total = numOrNull(pagination.total) ?? requests.length;
  const totalPages =
    numOrNull(pagination.totalPages ?? pagination.total_pages) ??
    Math.ceil(total / Math.max(1, params.limit));
  return { requests, total, totalPages: Math.max(1, totalPages) };
}

/** `GET /leave-requests/counts`. */
export async function fetchLeaveCounts(): Promise<LeaveCounts> {
  const response = await api.get<ApiEnvelope<Partial<Record<keyof LeaveCounts, unknown>>>>(
    apiRoutes.payroll.leaveCounts,
  );
  const raw = unwrap(response.data, "Failed to load leave counts.");
  return {
    all: num(raw.all),
    pending: num(raw.pending),
    approved: num(raw.approved),
    declined: num(raw.declined),
    cancelled: num(raw.cancelled),
  };
}

/** `GET /leave-requests/{id}`. */
export async function fetchLeaveRequest(id: string): Promise<LeaveRequest> {
  const response = await api.get<ApiEnvelope<ApiLeaveRequest>>(
    apiRoutes.payroll.leaveRequest(id),
  );
  return mapLeaveRequest(unwrap(response.data, "Failed to load leave request."));
}

type ApiEmployeeOption = Partial<{
  id: number | string;
  given_name: string | null;
  surname: string | null;
  eusername: string | null;
  personal_details: Partial<{ first_name: string | null; last_name: string | null }> | null;
}>;

/** A picker entry, named the way sole-webapp's drawer named it. */
export function mapLeaveEmployee(raw: ApiEmployeeOption): LeaveEmployeeOption {
  const id = str(raw.id);
  const name = [
    raw.given_name || raw.personal_details?.first_name,
    raw.surname || raw.personal_details?.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  return { id, name: name || str(raw.eusername) || `Employee #${id}` };
}

/** `GET /employees?limit=100` — the server's maximum page, as sole-webapp asked. */
export async function fetchLeaveEmployees(): Promise<LeaveEmployeeOption[]> {
  const response = await api.get<ApiEnvelope<ApiEmployeeOption[]>>(apiRoutes.payroll.employees, {
    params: { limit: 100 },
  });
  const raw = unwrap(response.data, "Failed to load employees.");
  return (Array.isArray(raw) ? raw : []).map(mapLeaveEmployee);
}

/** `POST /leave-requests`. */
export async function createLeaveRequest(
  values: LeaveRequestFormValues,
): Promise<LeaveRequest> {
  const response = await api.post<ApiEnvelope<ApiLeaveRequest>>(
    apiRoutes.payroll.leaveRequests,
    buildEncryptedRequestBody(leaveCreatePayload(values)),
  );
  return mapLeaveRequest(unwrap(response.data, "Failed to save leave request."));
}

/** `PATCH /leave-requests/{id}` with the edited fields. */
export async function updateLeaveRequest(
  id: string,
  values: LeaveRequestFormValues,
): Promise<LeaveRequest> {
  const response = await api.patch<ApiEnvelope<ApiLeaveRequest>>(
    apiRoutes.payroll.leaveRequest(id),
    buildEncryptedRequestBody(leaveUpdatePayload(values)),
  );
  return mapLeaveRequest(unwrap(response.data, "Failed to save leave request."));
}

/** `PATCH /leave-requests/{id}` with `{ status: "APPROVED" }`. */
export async function approveLeaveRequest(id: string): Promise<LeaveRequest> {
  const response = await api.patch<ApiEnvelope<ApiLeaveRequest>>(
    apiRoutes.payroll.leaveRequest(id),
    buildEncryptedRequestBody({ status: "APPROVED" }),
  );
  return mapLeaveRequest(unwrap(response.data, "Failed to approve leave request."));
}

/** `PATCH /leave-requests/decline/{id}` with `{ reviewNote }`. */
export async function declineLeaveRequest(id: string, reason: string): Promise<LeaveRequest> {
  const response = await api.patch<ApiEnvelope<ApiLeaveRequest>>(
    apiRoutes.payroll.leaveDecline(id),
    buildEncryptedRequestBody(declineLeavePayload(reason)),
  );
  return mapLeaveRequest(unwrap(response.data, "Failed to decline leave request."));
}

/** `PATCH /leave-requests/cancel/{id}` — no fields, as sole-webapp sent `{}`. */
export async function cancelLeaveRequest(id: string): Promise<LeaveRequest> {
  const response = await api.patch<ApiEnvelope<ApiLeaveRequest>>(
    apiRoutes.payroll.leaveCancel(id),
    buildEncryptedRequestBody({}),
  );
  return mapLeaveRequest(unwrap(response.data, "Failed to cancel leave request."));
}

/** `DELETE /leave-requests/{id}`. Approved leave is refused by the server too. */
export async function deleteLeaveRequest(id: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(apiRoutes.payroll.leaveRequest(id));
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete leave request.");
  }
}
