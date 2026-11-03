/**
 * Creating, editing, moving and deleting a task — sole-webapp's AddTask,
 * event-details-dialog, use-update-event and use-delete-event behaviour,
 * end to end from form values to the fields the API receives.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

import {
  buildMovePayload,
  buildTaskPayload,
  connectedCalendarName,
  detailIdFor,
  eventSaveId,
  eventTitleText,
  formatSearchGroupHeading,
  formatSearchTimeLabel,
  getDefaultTaskValues,
  groupSearchResults,
  isFinalizedEvent,
  isGoogleEvent,
  isRecurringEvent,
  isRecurringParentTask,
  linkedName,
  mapEventDocuments,
  movedEvent,
  normalizeEvent,
  normalizeEvents,
  normalizeSavedTask,
  normalizeSearchResults,
  taskRequestFields,
  toDateTimeLocalValue,
  validateTask,
  type CalendarContact,
  type TaskFormValues,
} from "@/lib/calendar";

afterEach(() => {
  vi.useRealTimers();
});

const CLIENT: CalendarContact = {
  value: "38110",
  label: "Gaurav Lakhera",
  email: "g@example.com",
  client_id: 44994,
  contact_id: 38110,
};

/** A valid create form, starting from a clicked slot at 9:45 on 15 Oct. */
function createForm(overrides: Partial<TaskFormValues> = {}): TaskFormValues {
  return {
    ...getDefaultTaskValues({ initialDateTime: new Date(2026, 9, 15, 9, 45) }),
    task_name: "new cale",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

describe("create — defaults", () => {
  it("starts at the clicked slot and runs an hour", () => {
    const values = createForm();
    expect(values.start_time).toBe("2026-10-15T09:45");
    expect(values.end_time).toBe("2026-10-15T10:45");
  });

  it("starts now when opened from the Add task button", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 16, 14, 5));
    const values = getDefaultTaskValues();
    expect(values.start_time).toBe("2026-10-16T14:05");
    expect(values.end_time).toBe("2026-10-16T15:05");
  });

  it("opens as a personal, medium-priority, non-billable task with repeat off", () => {
    expect(createForm()).toMatchObject({
      label: "personal",
      priority: "medium",
      is_billable: false,
      repeat: false,
      recurrence_freq: "WEEKLY",
      recurrence_interval: "1",
      recurrence_end_type: "count",
      recurrence_count: "4",
      client: null,
      project_id: "",
      job_id: "",
      stage_id: "",
    });
  });
});

describe("create — validation (ProjectCalendarTaskSchema)", () => {
  it("accepts a minimal task", () => {
    expect(validateTask(createForm(), { creating: true })).toEqual({});
  });

  it.each([
    ["", "Task name must be at least 2 characters."],
    ["a", "Task name must be at least 2 characters."],
    ["x".repeat(41), "Task name must be at most 40 characters."],
  ])("checks the task name length (%j)", (name, message) => {
    expect(validateTask(createForm({ task_name: name }), { creating: true }).task_name).toBe(message);
  });

  it("requires both dates", () => {
    const errors = validateTask(createForm({ start_time: "", end_time: "" }), { creating: true });
    expect(errors.start_time).toBe("Start date & time is required.");
    expect(errors.end_time).toBe("End date & time is required.");
  });

  it("requires the end after the start, flagging both", () => {
    const errors = validateTask(
      createForm({ start_time: "2026-10-15T10:00", end_time: "2026-10-15T10:00" }),
      { creating: true },
    );
    expect(errors.start_time).toBe("Start date & time must be earlier than end date & time.");
    expect(errors.end_time).toBe("End date & time must be later than start date & time.");
  });

  it("won't let completion come before the start", () => {
    const errors = validateTask(createForm({ completed_at: "2026-10-15T09:00" }), { creating: true });
    expect(errors.completed_at).toBe("Completed date & time cannot be earlier than start date & time.");
  });

  it("makes a billable task need a client and an amount", () => {
    const errors = validateTask(createForm({ is_billable: true }), { creating: true });
    expect(errors.client).toBe("Client is required");
    expect(errors.fixed_amount).toBe("Amount is required for billable tasks.");
    expect(
      validateTask(createForm({ is_billable: true, client: CLIENT, fixed_amount: "150" }), {
        creating: true,
      }),
    ).toEqual({});
  });

  it("doesn't ask an occurrence (task_id null) for a client", () => {
    const errors = validateTask(
      createForm({ task_id: null, is_billable: true, fixed_amount: "10" }),
      { creating: false },
    );
    expect(errors.client).toBeUndefined();
  });

  it("needs a job once a project is picked", () => {
    expect(
      validateTask(createForm({ client: CLIENT, project_id: "11" }), { creating: true }).job_id,
    ).toBe("Job/Milestone is required when a project is selected.");
  });

  it("needs an end date for a repeat that ends on a date, within 30 days", () => {
    const repeat = { repeat: true, recurrence_end_type: "until" as const };
    expect(
      validateTask(createForm({ ...repeat, recurrence_until: "" }), { creating: true }).recurrence_until,
    ).toBe("Please select an end date for the recurring event");
    expect(
      validateTask(createForm({ ...repeat, recurrence_until: "2026-11-20T09:45" }), { creating: true })
        .recurrence_until,
    ).toBe("Recurring events cannot exceed 30 days from the start date");
    expect(
      validateTask(createForm({ ...repeat, recurrence_until: "2026-11-10T09:45" }), { creating: true }),
    ).toEqual({});
  });

  it("ignores repeat settings on an edit", () => {
    const values = createForm({ repeat: true, recurrence_end_type: "until", recurrence_until: "" });
    expect(validateTask(values, { creating: false })).toEqual({});
  });
});

describe("create — payload (the user's own task from this session)", () => {
  // The exact task that was reported failing against the old backend.
  const values = createForm({
    task_name: "new cale",
    task_details: "test",
    start_time: "2026-10-15T09:15",
    end_time: "2026-10-16T01:00",
    completed_at: "2026-10-17T00:00",
    stage_id: "35241",
    client: CLIENT,
    repeat: true,
    recurrence_byday: ["SA", "FR"],
  });

  it("builds AddTask.js's fields and coercions", () => {
    const payload = buildTaskPayload(values, { creating: true });
    expect(payload).toMatchObject({
      task_name: "new cale",
      task_details: "test",
      label: "personal",
      stage_id: 35241,
      is_billable: false,
      client_id: 44994,
      contact_id: 38110,
      priority: "medium",
      project_id: null,
      job_id: null,
      amount: null,
      notes: "",
      recurrence: { freq: "WEEKLY", byday: ["SA", "FR"], count: 4 },
    });
    expect(payload.start_date).toBe(new Date(2026, 9, 15, 9, 15).toISOString());
    expect(payload.completed_at).toBe(new Date(2026, 9, 17, 0, 0).toISOString());
    // Interval 1 is the default and isn't sent: left `undefined`, as AddTask.js
    // did, which JSON drops on the way out.
    expect(JSON.parse(JSON.stringify(payload.recurrence))).not.toHaveProperty("interval");
  });

  it("drops empty values before sending, as the old FormData did", () => {
    const fields = taskRequestFields(buildTaskPayload(values, { creating: true }));
    expect(Object.keys(fields).sort()).toEqual(
      [
        "client_id",
        "completed_at",
        "contact_id",
        "end_date",
        "is_billable",
        "label",
        "priority",
        "recurrence",
        "stage_id",
        "start_date",
        "task_details",
        "task_name",
      ].sort(),
    );
  });

  it.each([
    ["DAILY", { recurrence_interval: "3" }, { freq: "DAILY", interval: 3, count: 4 }],
    ["MONTHLY", { recurrence_end_type: "until", recurrence_until: "2026-11-01T09:00" }, { freq: "MONTHLY", until: "2026-11-01T09:00" }],
    ["WEEKLY", { recurrence_byday: [] }, { freq: "WEEKLY", count: 4 }],
  ] as const)("shapes a %s recurrence", (freq, extra, expected) => {
    const payload = buildTaskPayload(
      createForm({ repeat: true, recurrence_freq: freq, ...extra } as Partial<TaskFormValues>),
      { creating: true },
    );
    expect(payload.recurrence).toEqual(expected);
  });

  it("shows the saved task on the calendar straight away", () => {
    const payload = buildTaskPayload(values, { creating: true });
    const saved = normalizeSavedTask({ id: 501, task_id: 77 }, payload, {
      id: "u1",
      name: "Me",
      picturePath: null,
    });
    expect(saved).toMatchObject({ id: "77", task_id: 77, title: "new cale", client_id: 44994 });
    expect(saved.startDate).toBe(payload.start_date);
  });
});

/* ------------------------------------------------------------------ *
 * Edit
 * ------------------------------------------------------------------ */

describe("edit", () => {
  const detail = {
    id: 501,
    task_id: 77,
    task_name: "Site visit",
    task_description: "Measure up",
    start_date: "2026-10-15T01:00:00.000Z",
    end_date: "2026-10-15T02:00:00.000Z",
    completed_at: "2026-10-15T03:00:00.000Z",
    label: "business",
    priority: "high",
    is_billable: true,
    amount: 150,
    notes: "Bring ladder",
    stage: { id: 35241, name: "In progress" },
    project: { id: 11, name: "Fit-out" },
    job: { id: 5, name: "Stage 1" },
    client: { id: 44994, name: "Acme" },
    contact: { id: 38110, name: "Gaurav", email: "g@example.com" },
  };

  it("pre-fills the form from the event's details", () => {
    const values = getDefaultTaskValues({ taskData: detail });
    expect(values).toMatchObject({
      task_id: 77,
      task_name: "Site visit",
      task_details: "Measure up",
      label: "business",
      priority: "high",
      is_billable: true,
      fixed_amount: "150",
      notes: "Bring ladder",
      stage_id: "35241",
      project_id: "11",
      job_id: "5",
      start_time: toDateTimeLocalValue(detail.start_date),
      end_time: toDateTimeLocalValue(detail.end_date),
      completed_at: toDateTimeLocalValue(detail.completed_at),
    });
    expect(values.client).toEqual({
      value: "38110",
      label: "Gaurav",
      email: "g@example.com",
      client_id: 44994,
      contact_id: 38110,
    });
  });

  it("never sends recurrence on an edit, even with repeat on", () => {
    const values = { ...getDefaultTaskValues({ taskData: detail }), repeat: true };
    expect(buildTaskPayload(values, { creating: false })).not.toHaveProperty("recurrence");
  });

  it("flags a recurring series so the form says edits touch the parent only", () => {
    expect(isRecurringParentTask({ recurrence: ["RRULE:FREQ=WEEKLY"] })).toBe(true);
    expect(isRecurringParentTask({ recurrence: ["RRULE:FREQ=WEEKLY"], parent_event_id: 9 })).toBe(false);
    expect(isRecurringParentTask({})).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Drag and drop
 * ------------------------------------------------------------------ */

describe("drag and drop", () => {
  const event = normalizeEvent(
    {
      id: 501,
      task_id: 77,
      task_name: "Call",
      task_details: "Follow up",
      label: "business",
      startDate: new Date(2026, 9, 14, 9, 30).toISOString(),
      endDate: new Date(2026, 9, 14, 10, 15).toISOString(),
      project_id: 11,
      job_id: 5,
      is_billable: true,
      client_id: 44994,
      contact_id: 38110,
      amount: 150,
    },
    0,
    "",
  )!;

  it("saves under the task id, as use-update-event did", () => {
    expect(eventSaveId(event)).toBe("77");
  });

  it("moves to a time slot (week and day) keeping the 45-minute length", () => {
    const moved = movedEvent(event, { date: new Date(2026, 9, 16), hour: 13, minute: 15 });
    expect(new Date(moved.startDate)).toEqual(new Date(2026, 9, 16, 13, 15));
    expect(new Date(moved.endDate)).toEqual(new Date(2026, 9, 16, 14, 0));
  });

  it("moves to a day (month) keeping the time of day", () => {
    const moved = movedEvent(event, { date: new Date(2026, 9, 20) });
    expect(new Date(moved.startDate)).toEqual(new Date(2026, 9, 20, 9, 30));
  });

  it("sends the move with use-update-event's fields only", () => {
    const moved = movedEvent(event, { date: new Date(2026, 9, 20) });
    expect(buildMovePayload(moved)).toEqual({
      task_name: "Call",
      task_details: "Follow up",
      label: "business",
      start_date: moved.startDate,
      end_date: moved.endDate,
      project_id: 11,
      job_id: 5,
      is_billable: true,
      client_id: 44994,
      contact_id: 38110,
      amount: 150,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Details and delete
 * ------------------------------------------------------------------ */

describe("drag and drop — billable without an amount", () => {
  // The reported event: an hourly timer entry, billable, no fixed amount.
  const timerEntry = normalizeEvent(
    {
      id: 4117,
      task_id: 4117,
      task_name: "Timer Entry",
      label: "personal",
      startDate: "2026-07-22T05:47:06.000Z",
      endDate: "2026-07-22T05:50:00.000Z",
      is_billable: true,
      client_id: 44066,
      contact_id: 37160,
      amount: "",
    },
    0,
    "",
  )!;

  it("leaves amount out rather than sending an empty one the backend refuses", () => {
    const payload = buildMovePayload(movedEvent(timerEntry, { date: new Date(2026, 6, 23) }));
    expect(payload).not.toHaveProperty("amount");
    expect(payload).toMatchObject({ is_billable: true, client_id: 44066, contact_id: 37160 });
  });

  it("uses fixed_amount when that's where the row keeps it", () => {
    const payload = buildMovePayload({ ...timerEntry, amount: null, fixed_amount: "120" });
    expect(payload.amount).toBe(120);
  });
});

describe("details and delete", () => {
  it("opens the calendar event's own id first, as the details dialog did", () => {
    expect(detailIdFor({ calendar_event_id: 9, event_id: 8, id: 7, task_id: 6 })).toBe(9);
    expect(detailIdFor({ event_id: 8, id: 7, task_id: 6 })).toBe(8);
    expect(detailIdFor({ id: 7, task_id: 6 })).toBe(7);
    expect(detailIdFor({ task_id: 6 })).toBe(6);
  });

  it.each([
    [{ stage_name: "Done" }, true],
    [{ stage: { name: "Finalized" } }, true],
    [{ status: { name: "final review" } }, true],
    [{ status_name: "Backlog" }, false],
    [{}, false],
  ])("locks edit and delete on done or final stages (%j)", (event, locked) => {
    expect(isFinalizedEvent(event)).toBe(locked);
  });

  it("lists attachments that have a URL, from whichever field they arrive in", () => {
    expect(
      mapEventDocuments({
        data: [
          { document_id: 3, file_name: "receipt.pdf", file_url: "https://f.test/r.pdf" },
          { id: 4, name: "no-url" },
        ],
      }),
    ).toEqual([{ documentId: "3", name: "receipt.pdf", url: "https://f.test/r.pdf" }]);
  });

  it("names a linked record whether it comes as an object or a string", () => {
    expect(linkedName({ project_name: "Fit-out" }, "name", "title", "project_name")).toBe("Fit-out");
    expect(linkedName("Fit-out", "name")).toBe("Fit-out");
    expect(linkedName(null, "name")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Events from the API, and search
 * ------------------------------------------------------------------ */

describe("events from the API", () => {
  it("takes whichever date field arrives and falls back to an hour long", () => {
    const [fromDue] = normalizeEvents([{ id: 1, due_date: "2026-10-15T01:00:00.000Z" }], "Me");
    expect(fromDue.startDate).toBe("2026-10-15T01:00:00.000Z");
    expect(fromDue.endDate).toBe("2026-10-15T02:00:00.000Z");
  });

  it("marks Google, billable and recurring events for their icons", () => {
    const event = normalizeEvent(
      { id: 1, title: "$ Consult", email: "me@gmail.test", is_billable: true, recurrence: ["RRULE:FREQ=DAILY"], startDate: "2026-10-15T01:00:00Z" },
      0,
      "Me",
    )!;
    expect(isGoogleEvent(event)).toBe(true);
    expect(isRecurringEvent(event)).toBe(true);
    // Billable Google events arrive with a "$ " prefix the badge replaces.
    expect(eventTitleText(event)).toBe("Consult");
  });

  it("names the calendar after the default one", () => {
    expect(connectedCalendarName([])).toBe("My Work Calendar");
    expect(
      connectedCalendarName([
        { id: 1, provider: "outlook" },
        { id: 2, provider: "google", is_default: true },
      ]),
    ).toBe("Google Calendar");
  });
});

describe("search", () => {
  it("sorts results by start, groups them by day and caps at 100", () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      task_name: `Task ${i}`,
      startDate: new Date(2026, 9, 15 + (i % 2), 9 + (i % 5)).toISOString(),
    }));
    const results = normalizeSearchResults(rows, "Me");
    expect(results).toHaveLength(100);
    const groups = groupSearchResults(results);
    expect(groups.map((group) => group.date.getDate())).toEqual([15, 16]);
    expect(results[0].startDate <= results[99].startDate).toBe(true);
  });

  it("labels days and times as the old dropdown did", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 8));
    expect(formatSearchGroupHeading(new Date(2026, 9, 15))).toBe("Today");
    expect(formatSearchGroupHeading(new Date(2026, 9, 16))).toBe("Tomorrow");
    expect(formatSearchGroupHeading(new Date(2026, 9, 20))).toBe("Tuesday, 20 Oct 2026");

    const allDay = normalizeEvent(
      { id: 1, startDate: new Date(2026, 9, 20, 0, 0).toISOString(), endDate: new Date(2026, 9, 20, 23, 59).toISOString() },
      0,
      "",
    )!;
    expect(formatSearchTimeLabel(allDay)).toBe("All day");
  });
});
