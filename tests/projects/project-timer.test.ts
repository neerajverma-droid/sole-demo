import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const {
  fetchActiveTimer,
  formatTimerClock,
  mapActiveTimer,
  startTaskTimerApi,
  stopTimerApi,
  timerHasClient,
  updateAndStopTimerApi,
} = await import("@/lib/project-timer");

function decryptBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: unknown };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(asData.data);
}

/** `GET /time-tracking/active`'s row for a timer running on a project task. */
const RUNNING = {
  id: 501,
  task_id: 9,
  client_id: 12,
  contact_id: 34,
  clientDetail: { id: 12, name: "Williams Health" },
  taskDetail: { id: 9, task_name: "new task", project_id: 77, project_job_id: 3 },
  is_billable: 1,
  hourly_rate: "10.00",
  current_duration_minutes: 2.5,
  is_paused: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mapActiveTimer", () => {
  it("maps the running timer", () => {
    expect(mapActiveTimer(RUNNING)).toMatchObject({
      id: "501",
      taskId: "9",
      clientId: "12",
      contactId: "34",
      clientName: "Williams Health",
      projectId: "77",
      jobId: "3",
      isBillable: true,
      hourlyRate: "10.00",
      elapsedSeconds: 150,
      isPaused: false,
    });
  });

  it("falls back to duration_seconds when minutes aren't sent", () => {
    const rest: Record<string, unknown> = { ...RUNNING, duration_seconds: 42.9 };
    delete rest.current_duration_minutes;
    expect(mapActiveTimer(rest)?.elapsedSeconds).toBe(42);
  });

  it("is null for no timer", () => {
    expect(mapActiveTimer(null)).toBeNull();
    expect(mapActiveTimer({})).toBeNull();
  });

  it("defaults billable to on and reads no client as null", () => {
    const timer = mapActiveTimer({ id: 1, client_id: null, contact_id: 0 });
    expect(timer?.isBillable).toBe(true);
    expect(timer?.clientId).toBeNull();
    expect(timer?.contactId).toBeNull();
  });
});

describe("timerHasClient", () => {
  it("needs a client or a contact before the timer can stop", () => {
    expect(timerHasClient(mapActiveTimer(RUNNING)!)).toBe(true);
    expect(timerHasClient(mapActiveTimer({ id: 1, contact_id: 34 })!)).toBe(true);
    expect(timerHasClient(mapActiveTimer({ id: 1 })!)).toBe(false);
  });
});

describe("fetchActiveTimer", () => {
  it("reads the running timer", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: RUNNING } });
    expect((await fetchActiveTimer())?.id).toBe("501");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.timeTracking.active);
  });

  it("is null when nothing runs", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: null } });
    expect(await fetchActiveTimer()).toBeNull();
  });
});

describe("startTaskTimerApi", () => {
  it("posts the task encrypted and returns the new timer", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 600 } } });
    const timer = await startTaskTimerApi({ projectId: "77", taskId: "9", taskName: "new task" });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.start);
    expect(decryptBody(body)).toEqual({
      project_id: "77",
      task_id: "9",
      description: "Working on new task",
    });
    // The start response doesn't echo the task, so the one started on fills in.
    expect(timer).toMatchObject({ id: "600", taskId: "9" });
  });

  it("throws the server's message, e.g. a timer already running", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "You already have a running timer. Please stop it first." },
    });
    await expect(startTaskTimerApi({ projectId: "1", taskId: "2", taskName: "x" })).rejects.toThrow(
      "already have a running timer",
    );
  });
});

describe("stopTimerApi", () => {
  it("puts /time-tracking/:id/stop with the client and contact", async () => {
    apiMock.put.mockResolvedValue({
      data: { success: true, data: { task_total_duration_minutes: 12, task_amount: 2.5 } },
    });
    const stopped = await stopTimerApi(mapActiveTimer(RUNNING)!);

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.projects.timeTracking.list}/501/stop`);
    expect(decryptBody(body)).toEqual({ client_id: "12", contact_id: "34" });
    expect(stopped).toEqual({ taskTotalMinutes: 12, taskAmount: 2.5 });
  });

  it("leaves absent ids out rather than sending empty strings", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true, data: {} } });
    const stopped = await stopTimerApi(mapActiveTimer({ id: 7 })!);
    expect(decryptBody(apiMock.put.mock.calls[0][1])).toEqual({});
    expect(stopped).toEqual({ taskTotalMinutes: null, taskAmount: null });
  });

  it("throws on success:false", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false, message: "Invalid timer state" } });
    await expect(stopTimerApi(mapActiveTimer(RUNNING)!)).rejects.toThrow("Invalid timer state");
  });
});

describe("updateAndStopTimerApi", () => {
  const timer = mapActiveTimer({ id: 501, task_id: 9 })!;

  it("writes the picked details onto the timer, then stops it with the new client", async () => {
    apiMock.put
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: { success: true, data: {} } });

    await updateAndStopTimerApi(timer, {
      clientId: "12",
      contactId: "34",
      projectId: "77",
      jobId: "3",
      taskId: "9",
      isBillable: true,
      hourlyRate: "45",
    });

    const [updateUrl, updateBody] = apiMock.put.mock.calls[0];
    expect(updateUrl).toBe(apiRoutes.projects.timeTracking.active);
    expect(decryptBody(updateBody)).toEqual({
      client_id: "12",
      contact_id: "34",
      project_id: "77",
      project_job_id: "3",
      task_id: "9",
      // 1/0, not a boolean: encrypted, false would arrive as the truthy "false".
      is_billable: 1,
      hourly_rate: "45",
    });

    const [stopUrl, stopBody] = apiMock.put.mock.calls[1];
    expect(stopUrl).toBe(`${apiRoutes.projects.timeTracking.list}/501/stop`);
    expect(decryptBody(stopBody)).toEqual({ client_id: "12", contact_id: "34" });
  });

  it("sends non-billable as 0 with no rate, and leaves out a project it wasn't given", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true, data: {} } });
    await updateAndStopTimerApi(timer, {
      clientId: "12",
      contactId: null,
      projectId: null,
      jobId: null,
      taskId: null,
      isBillable: false,
      hourlyRate: "45",
    });
    expect(decryptBody(apiMock.put.mock.calls[0][1])).toEqual({ client_id: "12", is_billable: 0 });
  });

  it("doesn't stop the timer when the update fails", async () => {
    apiMock.put.mockResolvedValueOnce({ data: { success: false, message: "No active timer" } });
    await expect(
      updateAndStopTimerApi(timer, {
        clientId: "12",
        contactId: null,
        projectId: null,
        jobId: null,
        taskId: null,
        isBillable: true,
        hourlyRate: "10",
      }),
    ).rejects.toThrow("No active timer");
    expect(apiMock.put).toHaveBeenCalledTimes(1);
  });
});

describe("formatTimerClock", () => {
  it("pads hours, minutes and seconds", () => {
    expect(formatTimerClock(0)).toBe("00:00:00");
    expect(formatTimerClock(7)).toBe("00:00:07");
    expect(formatTimerClock(3725)).toBe("01:02:05");
  });

  it("never goes negative or fractional", () => {
    expect(formatTimerClock(-5)).toBe("00:00:00");
    expect(formatTimerClock(59.9)).toBe("00:00:59");
  });
});
