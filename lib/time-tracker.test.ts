import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the module's own axios import resolves to it.
const {
  EMPTY_SELECTION,
  buildTimeInvoice,
  createManualLogApi,
  emptyManualLog,
  fetchTimeTasksPage,
  fetchTimesheetPdf,
  formatDuration,
  hoursBetween,
  logDraft,
  logPayload,
  manualLogErrors,
  mapTimeStats,
  mapTimeTask,
  parseHoursInput,
  rowsFromWeeklyLogs,
  saveWeeklyLogsApi,
  selectionError,
  startTimerApi,
  taskDraft,
  taskPayload,
  weekOf,
  weekParams,
  weeklyErrors,
  weeklyLogsPayload,
  weeklyProblems,
} = await import("@/lib/time-tracker");

type Body = { data: string };
const decrypted = (body: unknown) => decryptPayload<Record<string, unknown>>((body as Body).data);

const rawTask = {
  task_id: 7,
  task_name: "Design review",
  charge_type: "hourly",
  rate: "120.00",
  is_billable: true,
  project_id: 3,
  project_name: "Website",
  job_id: 4,
  job_name: "Build",
  client_id: 11,
  contact_id: 21,
  client_name: "Acme",
  contact_name: "Jo",
  total_duration_minutes: 90,
  total_amount: "180.00",
  time_entries: [
    {
      id: 101,
      start_time: "2026-10-20T09:00:00",
      end_time: "2026-10-20T10:00:00",
      duration_minutes: 60,
      status: "stopped",
      is_invoiced: false,
      amount: "120.00",
      log_date: "2026-10-20",
    },
    {
      id: 102,
      start_time: "2026-10-19T09:00:00",
      end_time: "2026-10-19T09:30:00",
      duration_minutes: 30,
      status: "stopped",
      is_invoiced: true,
      invoice_id: 55,
      invoice_no: "INV-55",
      amount: "60.00",
      log_date: "2026-10-19",
    },
  ],
};

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe("mapTimeTask", () => {
  it("reads the grouped /tasks/time-logs shape", () => {
    const task = mapTimeTask(rawTask);
    expect(task).toMatchObject({
      taskId: "7",
      name: "Design review",
      rate: 120,
      isBillable: true,
      projectName: "Website",
      jobName: "Build",
      clientId: "11",
      contactId: "21",
      clientName: "Acme",
      totalMinutes: 90,
      totalAmount: 180,
    });
    expect(task.entries.map((log) => [log.id, log.isInvoiced, log.invoiceNo])).toEqual([
      ["101", false, ""],
      ["102", true, "INV-55"],
    ]);
  });

  it("drops the server's N/A job and falls back to the contact's name", () => {
    const task = mapTimeTask({ ...rawTask, job_name: "N/A", client_name: "" });
    expect(task.jobName).toBe("");
    expect(task.clientName).toBe("Jo");
  });
});

describe("fetchTimeTasksPage", () => {
  it("asks for one page of tasks and builds the page info", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [rawTask],
        pagination: { totalRecords: 41, totalPages: 3, currentPage: 3 },
      },
    });
    const page = await fetchTimeTasksPage(3, 20);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.timeTracking.listByTask, {
      params: { page: 3, limit: 20 },
    });
    expect(page).toMatchObject({ total: 41, pageCount: 3, page: 3, from: 41, to: 41 });
  });
});

describe("timer", () => {
  it("starts with an encrypted body, billable as a number and no empty ids", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 9 } } });
    await startTimerApi("Writing copy", {
      ...EMPTY_SELECTION,
      client: { clientId: "11", contactId: null, name: "Acme", email: "" },
      isBillable: false,
      hourlyRate: "80",
    });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.start);
    expect(decrypted(body)).toEqual({ task_name: "Writing copy", client_id: "11", is_billable: 0 });
  });

  it("sends project, job and rate only when chosen", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await startTimerApi("", {
      client: { clientId: "11", contactId: "21", name: "Acme", email: "" },
      assignProject: true,
      projectId: "3",
      jobId: "4",
      isBillable: true,
      hourlyRate: "95.5",
    });
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({
      client_id: "11",
      contact_id: "21",
      project_id: "3",
      project_job_id: "4",
      is_billable: 1,
      hourly_rate: 95.5,
    });
  });

  it("needs a client and a positive rate when billable before saving", () => {
    expect(selectionError(EMPTY_SELECTION)).toMatch(/client/i);
    const client = { clientId: "1", contactId: null, name: "A", email: "" };
    expect(selectionError({ ...EMPTY_SELECTION, client, hourlyRate: "0" })).toMatch(/rate/i);
    expect(selectionError({ ...EMPTY_SELECTION, client, isBillable: false })).toBeNull();
  });
});

describe("manual log", () => {
  it("counts start/end across midnight and caps a single entry at 24 hours", () => {
    expect(hoursBetween("22:30", "01:00")).toBe(2.5);
    const draft = { ...emptyManualLog(new Date(2026, 9, 22)), description: "x", useDuration: true, hours: "25" };
    expect(manualLogErrors(draft).time).toMatch(/24/);
  });

  it("posts ManualLogs.js's payload, encrypted, with the local date and booleans as booleans", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await createManualLogApi({
      ...emptyManualLog(new Date(2026, 9, 22)),
      description: " Site visit ",
      useDuration: true,
      hours: "1",
      minutes: "30",
      client: { clientId: "11", contactId: "21", name: "Acme", email: "" },
      isBillable: true,
      hourlyRate: "100",
    });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.manualEntry);
    expect(decrypted(body)).toEqual({
      project_assign: "false",
      task_name: "Site visit",
      task_description: "Site visit",
      charge_type: "hourly",
      // On the wire the encryption carries booleans as strings; the
      // manual-entry controller turns them back into true/false.
      is_billable: "true",
      rate: 100,
      client_id: 11,
      contact_id: 21,
      log_date: "2026-10-22",
      hours_logged: 1.5,
      description: "Site visit",
    });
  });
});

describe("task edit", () => {
  it("always sends the rate so the task service can't clear it", () => {
    const task = mapTimeTask(rawTask);
    const payload = taskPayload({ ...taskDraft(task), isBillable: false }, task.rate);
    expect(payload).toMatchObject({ is_billable: 0, hourly_rate: 120 });
  });

  it("never sends an empty project to clear one", () => {
    const task = mapTimeTask(rawTask);
    const payload = taskPayload({ ...taskDraft(task), assignProject: false }, task.rate);
    expect(payload).not.toHaveProperty("project_id");
    expect(payload).not.toHaveProperty("project_job_id");
  });
});

describe("session edit", () => {
  it("prefills start/end from the log and only sends clock times in that mode", () => {
    const log = mapTimeTask(rawTask).entries[0];
    const draft = logDraft(log);
    expect(draft).toMatchObject({ useDuration: false, startTime: "09:00", endTime: "10:00", date: "2026-10-20" });
    expect(logPayload(draft)).toEqual({ log_date: "2026-10-20", start_time: "09:00", end_time: "10:00", hours_logged: 1 });
    expect(logPayload({ ...draft, useDuration: true, hours: "2", minutes: "15" })).toEqual({
      log_date: "2026-10-20",
      hours_logged: 2.25,
    });
  });
});

describe("buildTimeInvoice", () => {
  it("bills the selected, uninvoiced sessions at the task's rate", () => {
    const task = mapTimeTask(rawTask);
    const result = buildTimeInvoice([task], new Set(["101", "102"]));
    if ("error" in result) throw new Error(result.error);
    expect(result.logIds).toEqual(["101"]);
    expect(result.seed).toMatchObject({ clientId: "11", clientName: "Acme", projectId: "3" });
    expect(result.seed.items).toHaveLength(1);
    expect(result.seed.items[0]).toMatchObject({ description: "Design review", quantity: "1", price: "120", qtyType: "hours" });
  });

  it("carries every selected session for the timesheet, and fetches it as a PDF file", async () => {
    const task = mapTimeTask(rawTask);
    const result = buildTimeInvoice([task], new Set(["101"]));
    if ("error" in result) throw new Error(result.error);
    expect(result.projectName).toBe("Website");
    expect(result.timesheet).toEqual([
      expect.objectContaining({ log_date: "2026-10-20", duration_minutes: 60, rate: 120, task_name: "Design review", is_billable: true }),
    ]);

    apiMock.get.mockResolvedValue({ data: { success: true, data: { brand_color: "#112233" } } });
    apiMock.post.mockResolvedValue({ data: new Blob(["%PDF"], { type: "application/pdf" }) });
    const file = await fetchTimesheetPdf(result);
    const [url, body, config] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.generatePdf);
    expect(config).toEqual({ responseType: "blob" });
    expect(decrypted(body)).toMatchObject({ projectName: "Website", clientName: "Acme", brandColor: "#112233" });
    expect(file?.name).toMatch(/^Timesheet_Website_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(file?.type).toBe("application/pdf");

    apiMock.post.mockRejectedValue(new Error("puppeteer down"));
    expect(await fetchTimesheetPdf(result)).toBeNull();
  });

  it("refuses when only non-billable time is selected", () => {
    const task = mapTimeTask({ ...rawTask, is_billable: false });
    expect(buildTimeInvoice([task], new Set(["101"]))).toHaveProperty("error");
  });
});

describe("parseHoursInput", () => {
  it.each([
    ["", 0],
    ["8", 8],
    ["7.5", 7.5],
    [".25", 0.25],
    ["7:30", 7.5],
    ["0:45", 0.75],
  ])("reads %j as %d hours", (input, expected) => {
    expect(parseHoursInput(input)).toBe(expected);
  });

  it.each(["abc", "7:75", "1.2.3", "-2"])("rejects %j", (input) => {
    expect(parseHoursInput(input)).toBeNaN();
  });
});

describe("weekly log", () => {
  it("asks for the ISO week of the Monday after the Sunday the grid starts on", () => {
    // Sunday 28 Dec 2025 — its Monday is in ISO week 1 of 2026.
    expect(weekParams(new Date(2025, 11, 28))).toEqual({ year: 2026, week: 1 });
    // A Sunday is the first day of its own week, not the end of the last one.
    expect(weekOf(new Date(2026, 9, 18)).getDate()).toBe(18);
    expect(weekOf(new Date(2026, 9, 22)).getDate()).toBe(18);
  });

  const logs = [
    {
      id: 1,
      log_date: "2026-10-19",
      hours_logged: "2.50",
      client_id: 11,
      contact_id: 21,
      task_id: 7,
      project_id: 3,
      project_job_id: 4,
      is_billable: true,
      client_details: { id: 11, name: "Acme" },
      task_details: { id: 7, task_name: "Design review" },
      project_details: { id: 3, project_name: "Website" },
      job_details: { id: 4, job_name: "Build" },
    },
    { id: 2, log_date: "2026-10-20", hours_logged: "1", client_id: 11, task_id: 7, project_id: 3, project_job_id: 4 },
    { id: 3, log_date: "2026-10-19", hours_logged: "1", client_id: 11, task_id: 7, project_id: 3, project_job_id: 4 },
  ];

  it("groups saved logs into rows by client/project/job/task, splitting same-day clashes", () => {
    const rows = rowsFromWeeklyLogs(logs);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ taskId: "7", projectId: "3", jobId: "4" });
    expect(rows[0].times.slice(1, 3)).toEqual(["2.5", "1"]);
    expect(rows[0].logIds.slice(1, 3)).toEqual(["1", "2"]);
    expect(rows[1].times[1]).toBe("1");
    expect(rows[2].client).toBeNull();
  });

  it("flags bad cells, over-24h days and incomplete rows", () => {
    const [row] = rowsFromWeeklyLogs([]);
    const errors = weeklyErrors([
      { ...row, key: "a", times: ["abc", "20", "", "", "", "", ""] },
      { ...row, key: "b", times: ["", "5", "", "", "", "", ""] },
    ]);
    expect(errors.cells["a:0"]).toBeDefined();
    expect(errors.days[1]).toBeDefined();
    expect(errors.rows.a).toMatch(/client/i);
  });

  it("says exactly what's wrong: the day, the row, what was typed and the limit", () => {
    const [row] = rowsFromWeeklyLogs([]);
    const rows = [
      { ...row, key: "a", times: ["", "", "", "20", "", "", ""] },
      { ...row, key: "b", times: ["", "", "", "6", "abc", "25", ""] },
    ];
    const sunday = new Date(2026, 9, 18);
    const errors = weeklyErrors(rows);
    expect(weeklyProblems(rows, errors, sunday)).toEqual([
      "Wednesday 21 Oct has 26h logged — a day can't go over 24 hours.",
      "Friday 23 Oct has 25h logged — a day can't go over 24 hours.",
      "Row 2, Thursday 22 Oct: “abc” isn't a time — use decimal hours (7.5) or HH:MM (7:30).",
      "Row 2, Friday 23 Oct: 25h is more than a day — the most one day can hold is 24 hours.",
      "Row 1: select a client to save its hours.",
      "Row 2: select a client to save its hours.",
    ]);
    // Missing pickers stay quiet until a save is tried.
    expect(weeklyProblems(rows, errors, sunday, false)).toHaveLength(4);
  });

  it("sends one log per filled day, keeping saved ids and skipping running rows", async () => {
    const rows = rowsFromWeeklyLogs(logs);
    rows[0].times[3] = "1:15";
    rows[1].isRunning = true;
    const payload = weeklyLogsPayload(rows, new Date(2026, 9, 18));
    expect(payload).toEqual([
      expect.objectContaining({ id: "1", log_date: "2026-10-19", hours: 2.5, is_billable: true, contact_id: "21" }),
      expect.objectContaining({ id: "2", log_date: "2026-10-20", hours: 1 }),
      expect.objectContaining({ log_date: "2026-10-21", hours: 1.25, task_id: "7", project_id: "3", project_job_id: "4" }),
    ]);
    expect(payload[2]).not.toHaveProperty("id");

    apiMock.put.mockResolvedValue({ data: { success: true, message: "Saved" } });
    await saveWeeklyLogsApi(rows, new Date(2026, 9, 18));
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.weekly);
    expect(decrypted(body)).toMatchObject({ year: 2026, week: 43, logs: payload });
  });
});

describe("mapTimeStats", () => {
  it("zero-fills every day of the period", () => {
    const stats = mapTimeStats({
      summary: { total_hours: 3, billable_hours: 2, non_billable_hours: 1 },
      period: { start_date: "2026-10-18", end_date: "2026-10-24" },
      daily_breakdown: [{ date: "2026-10-20", billable_hours: 2, non_billable_hours: 1 }],
    });
    expect(stats.days).toHaveLength(7);
    expect(stats.days[2]).toMatchObject({ date: "2026-10-20", billableHours: 2, nonBillableHours: 1 });
    expect(stats.days[0].billableHours).toBe(0);
  });
});

describe("formatDuration", () => {
  it("reads like Listing.js", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(0.5)).toBe("30s");
    expect(formatDuration(12.5)).toBe("12m 30s");
    expect(formatDuration(65)).toBe("1h 5m");
  });
});
