import { describe, expect, it } from "vitest";

import { addonById } from "@/lib/addons";
import { EVENTS, REQUIRED_PROPS } from "@/lib/analytics-events";
import { addonRows, isActivePath } from "@/lib/nav";
import { mapActiveTimer } from "@/lib/project-timer";
import {
  EMPTY_SELECTION,
  TIME_TRACKER_ROOT,
  buildTimeInvoice,
  emptyManualLog,
  emptyWeeklyRow,
  formatAgo,
  formatHoursMinutes,
  formatLogTimeRange,
  isLogInvoiceable,
  logDraft,
  manualLogErrors,
  mapTimeStats,
  mapTimeTask,
  rowsFromWeeklyLogs,
  selectionError,
  taskBillingKey,
  taskDraft,
  taskDraftErrors,
  taskPayload,
  weeklyErrors,
  weeklyLogsPayload,
} from "@/lib/time-tracker";

/*
 * The rules the Time Tracker screens lean on, beyond what lib/time-tracker.test.ts
 * already pins: who can be invoiced together, what each form refuses, how the
 * weekly grid treats running and project-less rows, and how the add-on lands
 * in the rail.
 */

const task = (overrides: Record<string, unknown> = {}) =>
  mapTimeTask({
    task_id: 7,
    task_name: "Design",
    charge_type: "hourly",
    rate: 100,
    is_billable: true,
    client_id: 11,
    contact_id: 21,
    client_name: "Acme",
    time_entries: [
      { id: 1, duration_minutes: 60, amount: "100", status: "stopped", log_date: "2026-10-20", start_time: "2026-10-20T09:00:00", end_time: "2026-10-20T10:00:00" },
      { id: 2, duration_minutes: 30, amount: "0", status: "running", log_date: "2026-10-21", start_time: "2026-10-21T09:00:00" },
    ],
    ...overrides,
  });

describe("sessions and who they're billed to", () => {
  it("never offers a running or invoiced session for invoicing", () => {
    const [stopped, running] = task().entries;
    expect(isLogInvoiceable(stopped)).toBe(true);
    expect(isLogInvoiceable(running)).toBe(false);
    expect(isLogInvoiceable({ ...stopped, isInvoiced: true })).toBe(false);
  });

  it("groups by contact first, falling back to the client", () => {
    expect(taskBillingKey(task())).toBe("21");
    expect(taskBillingKey(task({ contact_id: null }))).toBe("11");
    expect(taskBillingKey(task({ contact_id: null, client_id: null }))).toBe("");
  });

  it("shows a running session as ongoing, and a manual one with no clock time as nothing", () => {
    const [stopped, running] = task().entries;
    expect(formatLogTimeRange(stopped)).toBe("9:00 AM → 10:00 AM");
    expect(formatLogTimeRange(running)).toBe("9:00 AM → ongoing");
    expect(formatLogTimeRange({ ...stopped, startTime: "" })).toBe("");
  });

  it("says how long ago, in the largest sensible unit", () => {
    const now = new Date("2026-10-23T12:00:00").getTime();
    expect(formatAgo("2026-10-23T11:59:30", now)).toBe("30s ago");
    expect(formatAgo("2026-10-23T11:00:00", now)).toBe("1 hour ago");
    expect(formatAgo("2026-10-20T12:00:00", now)).toBe("3 days ago");
    expect(formatAgo("", now)).toBe("");
  });

  it("reads hours as hours and minutes", () => {
    expect(formatHoursMinutes(21.2833)).toBe("21h 17m");
    expect(formatHoursMinutes(Number.NaN)).toBe("0h 0m");
  });
});

describe("invoicing several tasks", () => {
  it("adds one line per billable task and still marks the non-billable sessions", () => {
    const billable = task();
    const nonBillable = task({ task_id: 8, task_name: "Admin", is_billable: false, time_entries: [{ id: 3, duration_minutes: 45, status: "stopped" }] });
    const result = buildTimeInvoice([billable, nonBillable], new Set(["1", "2", "3"]));
    if ("error" in result) throw new Error(result.error);
    // The running session (2) is left out even though it was ticked.
    expect(result.logIds).toEqual(["1", "3"]);
    expect(result.seed.items.map((item) => item.description)).toEqual(["Design"]);
    expect(result.timesheet).toHaveLength(2);
    expect(result.amount).toBe(100);
  });

  it("bills a fixed-price task as one item at its amount", () => {
    const fixed = task({ charge_type: "fixed", time_entries: [{ id: 5, duration_minutes: 120, amount: "23", status: "stopped" }] });
    const result = buildTimeInvoice([fixed], new Set(["5"]));
    if ("error" in result) throw new Error(result.error);
    expect(result.seed.items[0]).toMatchObject({ quantity: "1", price: "23", qtyType: "items" });
  });

  it("works the amount out from the rate when the server sent none", () => {
    const result = buildTimeInvoice([task({ time_entries: [{ id: 9, duration_minutes: 90, amount: "0", status: "stopped" }] })], new Set(["9"]));
    if ("error" in result) throw new Error(result.error);
    expect(result.amount).toBe(150);
  });

  it("refuses an empty selection", () => {
    expect(buildTimeInvoice([task()], new Set())).toHaveProperty("error");
  });
});

describe("the forms", () => {
  it("needs a description, a duration, a date and a client for a manual log", () => {
    const errors = manualLogErrors({ ...emptyManualLog(), startTime: "09:00", endTime: "09:00", date: "" });
    expect(Object.keys(errors).sort()).toEqual(["client", "date", "description", "time"]);
  });

  it("needs a project and job once assignment is switched on", () => {
    const draft = { ...emptyManualLog(), description: "x", client: { clientId: "1", contactId: null, name: "A", email: "" }, assignProject: true };
    expect(manualLogErrors(draft)).toMatchObject({ project: "Select a project.", job: "Select a job." });
  });

  it("round-trips a task into the edit form and back", () => {
    const draft = taskDraft(task({ project_id: 3, job_id: 4 }));
    expect(draft).toMatchObject({ description: "Design", assignProject: true, projectId: "3", jobId: "4", hourlyRate: "100" });
    expect(taskDraftErrors(draft)).toEqual({});
    expect(taskPayload(draft, 100)).toMatchObject({ task_name: "Design", project_id: 3, project_job_id: 4, client_id: 11, contact_id: 21 });
  });

  it("opens a manual session (no clock times) in duration mode", () => {
    const draft = logDraft({ ...task().entries[0], startTime: "", endTime: "", durationMinutes: 135 });
    expect(draft).toMatchObject({ useDuration: true, hours: "2", minutes: "15" });
  });

  it("asks for a project and job before stopping only when assignment is on", () => {
    const client = { clientId: "1", contactId: null, name: "A", email: "" };
    expect(selectionError({ ...EMPTY_SELECTION, client, hourlyRate: "50", assignProject: true })).toMatch(/project/i);
    expect(selectionError({ ...EMPTY_SELECTION, client, hourlyRate: "50" })).toBeNull();
  });
});

describe("the weekly grid", () => {
  it("asks for a project and job only when the task offers them", () => {
    const client = { clientId: "11", contactId: null, name: "Acme", email: "" };
    const base = { ...emptyWeeklyRow(), key: "r", client, taskId: "7", times: ["2", "", "", "", "", "", ""] };
    expect(weeklyErrors([base]).rows).toEqual({});
    expect(weeklyErrors([{ ...base, projectOptions: [{ id: "3", label: "Website" }] }]).rows.r).toBe("Select a project");
    expect(
      weeklyErrors([{ ...base, projectId: "3", projectOptions: [{ id: "3", label: "W" }], jobOptions: [{ id: "4", label: "J" }] }]).rows.r,
    ).toBe("Select a job");
  });

  it("never validates or sends a row with a running timer", () => {
    const running = { ...emptyWeeklyRow(), key: "r", isRunning: true, times: ["2", "", "", "", "", "", ""] };
    expect(weeklyErrors([running]).rows).toEqual({});
    expect(weeklyLogsPayload([running], new Date(2026, 9, 18))).toEqual([]);
  });

  it("marks a running timer's row read-only when loading the week", () => {
    const [row] = rowsFromWeeklyLogs([{ id: 1, log_date: "2026-10-19", entry_type: "timer", status: "running", task_id: 7 }]);
    expect(row.isRunning).toBe(true);
  });

  it("skips logs with no usable date", () => {
    expect(rowsFromWeeklyLogs([{ id: 1, log_date: null }, { id: 2, log_date: "not a date" }])).toHaveLength(1);
  });
});

describe("the summary chart", () => {
  it("falls back to the days the server sent when it gives no period", () => {
    const stats = mapTimeStats({ daily_breakdown: [{ date: "2026-10-21", billable_hours: 1 }, { date: "2026-10-19" }] });
    expect(stats.days.map((day) => day.date)).toEqual(["2026-10-19", "2026-10-21"]);
  });
});

describe("the running timer the top bar shares", () => {
  it("reads the rate from the timer's task when the log carries none", () => {
    expect(mapActiveTimer({ id: 1, taskDetail: { rate: "80.00" } })?.hourlyRate).toBe("80");
    expect(mapActiveTimer({ id: 1, hourly_rate: "95", taskDetail: { rate: "80" } })?.hourlyRate).toBe("95");
    expect(mapActiveTimer({ id: 1, taskDetail: {} })?.hourlyRate).toBe("");
  });
});

describe("the Time Tracker add-on", () => {
  it("goes to /time-tracker once added", () => {
    expect(addonById("time-tracker")?.href).toBe(TIME_TRACKER_ROOT);
    const rows = addonRows(["time-tracker"]);
    expect(rows.map((row) => row.href)).toContain("/time-tracker");
  });

  it("stays lit on the weekly log", () => {
    expect(isActivePath("/time-tracker/weekly", "/time-tracker")).toBe(true);
  });

  it("declares the analytics event it fires, with its properties", () => {
    expect(EVENTS.TIME_ENTRY_LOGGED).toBe("time_entry_logged");
    expect(REQUIRED_PROPS[EVENTS.TIME_ENTRY_LOGGED]).toEqual(["duration_minutes", "source"]);
  });
});
