import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

/*
 * Every request the Time Tracker makes, against sole-ocr's contract: the
 * route and method, that writes travel encrypted, what comes back mapped, and
 * that a `success: false` answer surfaces the server's own message.
 */

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const trackMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...args: unknown[]) => trackMock(...args) }));

const tt = await import("@/lib/time-tracker");
const { EVENTS } = await import("@/lib/analytics-events");

function decryptBody(body: unknown): Record<string, unknown> {
  const envelope = body as { data?: unknown };
  if (typeof envelope?.data !== "string") throw new Error("Body was not an encrypted {data} envelope");
  return decryptPayload(envelope.data);
}

const CLIENT = { clientId: "11", contactId: "21", name: "Acme", email: "" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the entry list", () => {
  it("surfaces the server's message when the list can't load", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Business not found" } });
    await expect(tt.fetchTimeTasksPage(1)).rejects.toThrow("Business not found");
  });

  it("reads an empty account as an empty first page", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [], pagination: { totalRecords: 0, totalPages: 0 } } });
    expect(await tt.fetchTimeTasksPage(1)).toMatchObject({ rows: [], total: 0, pageCount: 1, from: 0, to: 0 });
  });

  it("asks for the default page size unless told otherwise", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    await tt.fetchTimeTasksPage(2);
    expect(apiMock.get.mock.calls[0][1]).toEqual({ params: { page: 2, limit: tt.TIME_PAGE_SIZE } });
    expect(tt.TIME_PAGE_SIZE).toBe(25);
  });
});

describe("the running timer", () => {
  it("writes details onto it with an encrypted PUT /time-tracking/active", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await tt.updateActiveTimerApi("Copywriting", { ...tt.EMPTY_SELECTION, client: CLIENT, hourlyRate: "90" });
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.active);
    expect(decryptBody(body)).toEqual({
      task_name: "Copywriting",
      client_id: "11",
      contact_id: "21",
      is_billable: 1,
      hourly_rate: 90,
    });
  });

  it("leaves the project out once assignment is off, so the server keeps what it has", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await tt.updateActiveTimerApi("x", { ...tt.EMPTY_SELECTION, client: CLIENT, projectId: "3", jobId: "4" });
    expect(decryptBody(apiMock.put.mock.calls[0][1])).not.toHaveProperty("project_id");
  });

  it("surfaces a failed start", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "A timer is already running" } });
    await expect(tt.startTimerApi("x", tt.EMPTY_SELECTION)).rejects.toThrow("A timer is already running");
  });

  it("shows the task's name, or its notes when there are some", () => {
    expect(tt.timerDescription({ taskDetail: { task_name: "Design" } })).toBe("Design");
    expect(tt.timerDescription({ notes: "Call notes", taskDetail: { task_name: "Design" } })).toBe("Call notes");
    expect(tt.timerDescription(undefined)).toBe("");
  });
});

describe("manual log", () => {
  it("counts a logged entry for analytics, in minutes", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await tt.createManualLogApi({
      ...tt.emptyManualLog(new Date(2026, 9, 22)),
      description: "x",
      startTime: "09:00",
      endTime: "10:30",
      client: CLIENT,
    });
    expect(trackMock).toHaveBeenCalledWith(EVENTS.TIME_ENTRY_LOGGED, { duration_minutes: 90, source: "manual" });
  });

  it("sends the project and job only when assigned", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await tt.createManualLogApi({
      ...tt.emptyManualLog(new Date(2026, 9, 22)),
      description: "x",
      client: CLIENT,
      assignProject: true,
      projectId: "3",
      jobId: "4",
    });
    expect(decryptBody(apiMock.post.mock.calls[0][1])).toMatchObject({
      project_assign: "true",
      project_id: 3,
      project_job_id: 4,
      start_time: "09:00",
      end_time: "10:00",
      hours_logged: 1,
    });
  });

  it("doesn't count an entry the server refused", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "hours_logged is required" } });
    await expect(
      tt.createManualLogApi({ ...tt.emptyManualLog(), description: "x", client: CLIENT }),
    ).rejects.toThrow("hours_logged is required");
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("counts a saved timer session the same way", () => {
    tt.trackTimerEntryLogged(150);
    expect(trackMock).toHaveBeenCalledWith(EVENTS.TIME_ENTRY_LOGGED, { duration_minutes: 3, source: "timer" });
  });
});

describe("editing and deleting", () => {
  it("updates the task with PUT /tasks/:id, encrypted", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await tt.updateTaskApi("7", { task_name: "Renamed", is_billable: 0, hourly_rate: 120 });
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.projects.updateTask}/7`);
    expect(decryptBody(body)).toEqual({ task_name: "Renamed", is_billable: 0, hourly_rate: 120 });
  });

  it("updates one session with PUT /time-tracking/:id, encrypted", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await tt.updateLogApi("101", { log_date: "2026-10-20", hours_logged: 2 });
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.projects.timeTracking.stop}/101`);
    expect(decryptBody(body)).toEqual({ log_date: "2026-10-20", hours_logged: 2 });
  });

  it("deletes a session and hands back the server's message for the toast", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true, message: "Time Log Deleted Successfully" } });
    await expect(tt.deleteLogApi("8692")).resolves.toBe("Time Log Deleted Successfully");
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.projects.timeTracking.delete}/8692`);
  });

  it("deletes a whole task through /tasks/:id", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true, message: "Task deleted successfully" } });
    await expect(tt.deleteTaskApi("7")).resolves.toBe("Task deleted successfully");
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.projects.deleteTask}7`);
  });

  it("surfaces the server's reason when a delete fails", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: false, message: "Unknown column 'Event.task_id'" } });
    await expect(tt.deleteLogApi("1")).rejects.toThrow("Unknown column 'Event.task_id'");
  });
});

describe("invoicing", () => {
  it("marks every invoiced log billed with one encrypted bulk PUT", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await tt.markLogsInvoicedApi(["101", "102"], { id: "55", number: "INV-55" });
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.bulkUpdate);
    expect(decryptBody(body)).toEqual({
      id: [101, 102],
      is_invoiced: "true",
      invoice_id: "55",
      bill_type: "billed",
      invoice_no: "INV-55",
    });
  });

  it("treats anything but success: true as a failed link", async () => {
    apiMock.put.mockResolvedValue({ data: {} });
    await expect(tt.markLogsInvoicedApi(["1"], { id: "1", number: "INV-1" })).rejects.toThrow();
  });
});

describe("summaries", () => {
  it("asks for the chart by period and maps the totals", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          summary: { total_hours: 3, billable_hours: 2, non_billable_hours: 1, total_amount: 240, billable_amount: 240 },
          period: { start_date: "2026-10-11", end_date: "2026-10-17" },
          daily_breakdown: [],
        },
      },
    });
    const stats = await tt.fetchTimeStats("last_week");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.timeTracking.statsTime, {
      params: { date_range: "last_week" },
    });
    expect(stats).toMatchObject({ totalHours: 3, billableHours: 2, totalAmount: 240, nonBillableAmount: 0 });
    expect(stats.days.map((day) => day.date)).toEqual([
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
    ]);
  });

  it("asks for the breakdown by period and grouping", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { breakdown: [{ id: "no_client", name: "No Client", total_hours: 1, billable_hours: 0 }] },
      },
    });
    const rows = await tt.fetchTimeBreakdown("week", "project");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.timeTracking.statsClientProject, {
      params: { date_range: "week", group_by: "project" },
    });
    expect(rows).toEqual([{ id: "no_client", name: "No Client", totalHours: 1, billableHours: 0 }]);
  });

  it("names an unnamed group rather than showing a blank row", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { breakdown: [{ id: 3, total_hours: 2 }] } } });
    expect((await tt.fetchTimeBreakdown("week", "client"))[0].name).toBe("Unnamed");
  });
});

describe("weekly log lookups", () => {
  it("loads a week by its ISO year and week number", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { logs: [] } } });
    const rows = await tt.fetchWeeklyRows(new Date(2026, 9, 18));
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.timeTracking.weekly, {
      params: { year: 2026, week: 43 },
    });
    // Always a blank row to type into.
    expect(rows).toHaveLength(1);
  });

  it("surfaces the server's message when the week can't load", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "tenant_id is not defined" } });
    await expect(tt.fetchWeeklyRows(new Date(2026, 9, 18))).rejects.toThrow("tenant_id is not defined");
  });

  it("lists a client's tasks", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 7, task_name: "Design" }, { id: 8 }] } });
    expect(await tt.fetchClientTasks("11")).toEqual([
      { id: "7", label: "Design" },
      { id: "8", label: "Untitled task" },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.projects.tasksByClientId}/11`);
  });

  it("lists the projects and jobs a client's task can sit under", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { projects: [{ id: 3, project_name: "Website" }], jobs: [{ id: 4, job_name: "Build" }] } },
    });
    expect(await tt.fetchTaskProjectsAndJobs("11", "7")).toEqual({
      projects: [{ id: "3", label: "Website" }],
      jobs: [{ id: "4", label: "Build" }],
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.getByClientTask, {
      params: { client_id: "11", task_id: "7" },
    });
  });

  it("offers nothing, rather than failing, when those lookups come back unsuccessful", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await tt.fetchClientTasks("11")).toEqual([]);
    expect(await tt.fetchTaskProjectsAndJobs("11", "7")).toEqual({ projects: [], jobs: [] });
  });

  it("reports how many entries the server skipped when saving", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true, message: "Saved", warnings: [{}, {}] } });
    expect(await tt.saveWeeklyLogsApi([], new Date(2026, 9, 18))).toEqual({ message: "Saved", skipped: 2 });
  });

  it("surfaces a refused save", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false, message: "Some Updates Failed" } });
    await expect(tt.saveWeeklyLogsApi([], new Date(2026, 9, 18))).rejects.toThrow("Some Updates Failed");
  });
});
