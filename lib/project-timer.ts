/**
 * The running timer — one per user, started against a task.
 *
 * Backed by sole-ocr's `/time-tracking` start / stop / active routes, the ones
 * sole-webapp's Projects screens drove through `timeTrackingSlice`. Writes are
 * encrypted like every other module's; `timeTracking.js` reads the body
 * through `parsePayload`, which accepts the encrypted shape.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { compactPayload, num, optionalId } from "@/lib/projects";

export type ActiveTimer = {
  id: string;
  taskId: string | null;
  clientId: string | null;
  contactId: string | null;
  /** The timer's client, for prefilling the details picker. */
  clientName: string;
  projectId: string | null;
  jobId: string | null;
  isBillable: boolean;
  hourlyRate: string;
  /** Seconds already on the clock when the server answered. */
  elapsedSeconds: number;
  isPaused: boolean;
  raw: Record<string, unknown>;
};

/** `getInitialSeconds` from ActiveTimerControls.js. */
export function mapActiveTimer(raw: Record<string, unknown> | null | undefined): ActiveTimer | null {
  if (!raw || raw.id == null) return null;
  const clientDetail = (raw.clientDetail ?? {}) as Record<string, unknown>;
  const taskDetail = (raw.taskDetail ?? {}) as Record<string, unknown>;
  const elapsedSeconds =
    raw.current_duration_minutes !== undefined
      ? Math.floor(num(raw.current_duration_minutes) * 60)
      : Math.floor(num(raw.duration_seconds));
  return {
    id: String(raw.id),
    taskId: optionalId(raw.task_id),
    clientId: optionalId(raw.client_id ?? clientDetail.client_id),
    contactId: optionalId(raw.contact_id ?? clientDetail.contact_id),
    clientName: typeof clientDetail.name === "string" ? clientDetail.name : "",
    projectId: optionalId(raw.project_id ?? taskDetail.project_id),
    jobId: optionalId(raw.project_job_id ?? taskDetail.project_job_id),
    isBillable: raw.is_billable === undefined ? true : raw.is_billable === true || raw.is_billable === 1,
    // `/active` carries the rate on the timer's task, not on the log itself.
    hourlyRate:
      raw.hourly_rate != null
        ? String(raw.hourly_rate)
        : num(taskDetail.rate) > 0
          ? String(num(taskDetail.rate))
          : "",
    elapsedSeconds,
    isPaused: raw.is_paused === true || raw.is_paused === 1,
    raw,
  };
}

export async function fetchActiveTimer(): Promise<ActiveTimer | null> {
  const response = await api.get<{ success?: boolean; data?: Record<string, unknown> | null }>(
    apiRoutes.projects.timeTracking.active,
  );
  return response.data?.success ? mapActiveTimer(response.data.data) : null;
}

/** Starts the clock on a project task — `handleStartStopTask`'s start branch. */
export async function startTaskTimerApi(input: {
  projectId: string;
  taskId: string;
  taskName: string;
}): Promise<ActiveTimer | null> {
  const response = await api.post<{ success?: boolean; message?: string; data?: Record<string, unknown> }>(
    apiRoutes.projects.timeTracking.start,
    buildEncryptedRequestBody({
      project_id: input.projectId,
      task_id: input.taskId,
      description: `Working on ${input.taskName}`,
    }),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't start the timer.");
  }
  const timer = mapActiveTimer(response.data?.data);
  return timer ? { ...timer, taskId: timer.taskId ?? input.taskId } : null;
}

export type StoppedTimer = {
  /** The task's total tracked minutes after this stop, when the server says. */
  taskTotalMinutes: number | null;
  taskAmount: number | null;
};

export async function stopTimerApi(timer: ActiveTimer): Promise<StoppedTimer> {
  const response = await api.put<{ success?: boolean; message?: string; data?: Record<string, unknown> }>(
    `${apiRoutes.projects.timeTracking.list}/${timer.id}/stop`,
    buildEncryptedRequestBody(
      compactPayload({ client_id: timer.clientId, contact_id: timer.contactId }),
    ),
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Failed to stop timer");
  }
  const data = response.data?.data ?? {};
  const minutes = data.task_total_duration_minutes ?? data.taskTotalDurationMinutes;
  const amount = data.task_amount ?? data.amount;
  return {
    taskTotalMinutes: minutes === undefined ? null : num(minutes),
    taskAmount: amount === undefined ? null : num(amount),
  };
}

/**
 * Stopping needs a client: the old top bar refused with "Please fill contact
 * details before stopping timer" and opened the details picker instead.
 */
export function timerHasClient(timer: ActiveTimer): boolean {
  return !!(timer.clientId || timer.contactId);
}

export type TimerDetails = {
  clientId: string;
  contactId: string | null;
  projectId: string | null;
  jobId: string | null;
  taskId: string | null;
  isBillable: boolean;
  /** Sent only when billable, as before. */
  hourlyRate: string;
};

/**
 * `handleUpdateTimerAndStop` from the old TopBar: write the picked client
 * (and project, job, billable, rate) onto the running timer with
 * `PUT /time-tracking/active`, then stop it.
 *
 * `is_billable` goes as 1/0 rather than a boolean — encrypted, `false` would
 * arrive as the string "false", which the controller's `Boolean(...)` reads
 * as true. The job and task ids go along as the old app sent them, though
 * the update route only reads the project.
 */
export async function updateAndStopTimerApi(
  timer: ActiveTimer,
  details: TimerDetails,
): Promise<StoppedTimer> {
  const update = await api.put<{ success?: boolean; message?: string }>(
    apiRoutes.projects.timeTracking.active,
    buildEncryptedRequestBody(
      compactPayload({
        client_id: details.clientId,
        contact_id: details.contactId,
        project_id: details.projectId || undefined,
        project_job_id: details.jobId || undefined,
        task_id: details.taskId || undefined,
        is_billable: details.isBillable ? 1 : 0,
        hourly_rate: details.isBillable && details.hourlyRate ? details.hourlyRate : undefined,
      }),
    ),
  );
  if (update.data?.success === false) {
    throw new Error(update.data.message || "Couldn't update the timer.");
  }
  return stopTimerApi({ ...timer, clientId: details.clientId, contactId: details.contactId });
}

export function formatTimerClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(safe / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
