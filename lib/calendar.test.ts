import { describe, expect, it } from "vitest";

import {
  buildMovePayload,
  buildTaskPayload,
  calculateMonthEventPositions,
  getCalendarCells,
  getCalendarRange,
  getDefaultTaskValues,
  isFinalizedEvent,
  movedEvent,
  normalizeEvent,
  taskRequestFields,
  validateTask,
  type TaskFormValues,
} from "@/lib/calendar";

function values(overrides: Partial<TaskFormValues> = {}): TaskFormValues {
  return {
    ...getDefaultTaskValues({ initialDateTime: new Date(2026, 9, 12, 9, 0) }),
    task_name: "Site visit",
    ...overrides,
  };
}

describe("getCalendarRange", () => {
  it("asks for Sunday-to-Saturday on the week view", () => {
    // Wed 14 Oct 2026
    const { start_at, end_at } = getCalendarRange(new Date(2026, 9, 14, 12), "week");
    expect(new Date(start_at).getDay()).toBe(0);
    expect(new Date(start_at).getDate()).toBe(11);
    expect(new Date(end_at).getDate()).toBe(17);
  });

  it("asks for the whole month and the whole year", () => {
    const month = getCalendarRange(new Date(2026, 1, 10), "month");
    expect(new Date(month.start_at).getDate()).toBe(1);
    expect(new Date(month.end_at).getDate()).toBe(28);
    const year = getCalendarRange(new Date(2026, 5, 1), "year");
    expect(new Date(year.start_at).getMonth()).toBe(0);
    expect(new Date(year.end_at).getMonth()).toBe(11);
  });
});

describe("normalizeEvent", () => {
  it("keys an event by its task id and fills an hour-long end", () => {
    const event = normalizeEvent(
      { id: 9, task_id: 42, task_name: "Quote", start_at: "2026-10-12T09:00:00.000Z" },
      0,
      "Google Calendar",
    );
    expect(event?.id).toBe("42");
    expect(event?.task_id).toBe(42);
    expect(event?.title).toBe("Quote");
    expect(new Date(event!.endDate).getTime() - new Date(event!.startDate).getTime()).toBe(3_600_000);
  });

  it("keeps an occurrence's synthetic id and drops its task id", () => {
    const event = normalizeEvent(
      { id: "42_occ_1", task_id: 42, parent_event_id: 42, startDate: "2026-10-12T09:00:00Z" },
      0,
      "",
    );
    expect(event?.id).toBe("42_occ_1");
    expect(event?.task_id).toBeNull();
    expect(event?.is_occurrence).toBe(true);
  });

  it("skips a row with no usable date", () => {
    expect(normalizeEvent({ id: 1, title: "No date" }, 0, "")).toBeNull();
  });
});

describe("isFinalizedEvent", () => {
  it("locks done and finalised stages", () => {
    expect(isFinalizedEvent({ stage_name: "Done" })).toBe(true);
    expect(isFinalizedEvent({ stage: { name: "Finalized" } })).toBe(true);
    expect(isFinalizedEvent({ stage_name: "In progress" })).toBe(false);
  });
});

describe("validateTask", () => {
  it("passes a minimal personal task", () => {
    expect(validateTask(values(), { creating: true })).toEqual({});
  });

  it("enforces the old schema's rules", () => {
    const errors = validateTask(
      values({
        task_name: "x",
        is_billable: true,
        fixed_amount: "",
        project_id: "3",
        job_id: "",
      }),
      { creating: true },
    );
    expect(errors.task_name).toBe("Task name must be at least 2 characters.");
    expect(errors.client).toBe("Client is required");
    expect(errors.fixed_amount).toBe("Amount is required for billable tasks.");
    expect(errors.job_id).toBe("Job/Milestone is required when a project is selected.");
  });

  it("rejects an end before the start, on both fields", () => {
    const errors = validateTask(
      values({ start_time: "2026-10-12T10:00", end_time: "2026-10-12T09:00" }),
      { creating: true },
    );
    expect(errors.start_time).toMatch(/earlier than end/);
    expect(errors.end_time).toMatch(/later than start/);
  });

  it("caps a recurring series at 30 days", () => {
    const errors = validateTask(
      values({
        repeat: true,
        recurrence_end_type: "until",
        start_time: "2026-10-01T09:00",
        end_time: "2026-10-01T10:00",
        recurrence_until: "2026-11-15T09:00",
      }),
      { creating: true },
    );
    expect(errors.recurrence_until).toBe(
      "Recurring events cannot exceed 30 days from the start date",
    );
  });
});

describe("buildTaskPayload / taskRequestFields", () => {
  const client = {
    value: "7",
    label: "Acme",
    email: "a@acme.test",
    client_id: 3,
    contact_id: 7,
  };

  it("sends the old AddTask payload", () => {
    const payload = buildTaskPayload(
      values({
        label: "business",
        client,
        project_id: "11",
        job_id: "12",
        stage_id: "2",
        is_billable: true,
        fixed_amount: "150",
        priority: "high",
      }),
      { creating: true },
    );
    expect(payload).toMatchObject({
      task_name: "Site visit",
      task_details: "",
      label: "business",
      project_id: 11,
      job_id: 12,
      stage_id: 2,
      is_billable: true,
      notes: "",
      client_id: 3,
      contact_id: 7,
      amount: 150,
      priority: "high",
      completed_at: null,
    });
    expect(payload.start_date).toBe(new Date(2026, 9, 12, 9, 0).toISOString());
    expect(payload).not.toHaveProperty("recurrence");
  });

  it("adds recurrence only on create, as an object inside the fields", () => {
    const repeating = values({
      repeat: true,
      recurrence_freq: "WEEKLY",
      recurrence_interval: "2",
      recurrence_byday: ["MO", "WE"],
      recurrence_count: "4",
    });
    expect(buildTaskPayload(repeating, { creating: false })).not.toHaveProperty("recurrence");

    const payload = buildTaskPayload(repeating, { creating: true });
    expect(payload.recurrence).toEqual({ freq: "WEEKLY", interval: 2, byday: ["MO", "WE"], count: 4 });

    const fields = taskRequestFields(payload);
    expect(fields.recurrence).toEqual(payload.recurrence);
    // Empty and null fields are left out entirely, as the old FormData did.
    expect(fields).not.toHaveProperty("task_details");
    expect(fields).not.toHaveProperty("project_id");
    expect(fields).not.toHaveProperty("completed_at");
    expect(fields.is_billable).toBe(false);
  });
});

describe("drag and drop", () => {
  const event = normalizeEvent(
    {
      id: 5,
      task_id: 5,
      task_name: "Call",
      startDate: new Date(2026, 9, 12, 9, 30).toISOString(),
      endDate: new Date(2026, 9, 12, 10, 15).toISOString(),
      client_id: "3",
      amount: "",
    },
    0,
    "",
  )!;

  it("keeps the duration and, on a day cell, the time of day", () => {
    const moved = movedEvent(event, { date: new Date(2026, 9, 15) });
    expect(new Date(moved.startDate)).toEqual(new Date(2026, 9, 15, 9, 30));
    expect(new Date(moved.endDate)).toEqual(new Date(2026, 9, 15, 10, 15));
  });

  it("takes the slot's time on the time grid", () => {
    const moved = movedEvent(event, { date: new Date(2026, 9, 13), hour: 14, minute: 45 });
    expect(new Date(moved.startDate)).toEqual(new Date(2026, 9, 13, 14, 45));
  });

  it("saves with use-update-event's narrower JSON payload", () => {
    expect(buildMovePayload(event)).toEqual({
      task_name: "Call",
      // Falls back to `description`, which the old mapping fills from the
      // task name when there's nothing else — faithfully reproduced.
      task_details: "Call",
      label: "personal",
      start_date: event.startDate,
      end_date: event.endDate,
      project_id: null,
      job_id: null,
      is_billable: false,
      client_id: 3,
      contact_id: null,
      // No amount on the event, so none is sent — the backend keeps its own.
    });
  });
});

describe("month grid", () => {
  it("pads to whole weeks", () => {
    const cells = getCalendarCells(new Date(2026, 9, 1));
    expect(cells.length % 7).toBe(0);
    expect(cells[0].date.getDay()).toBe(0);
  });

  it("gives a multi-day event the same slot on every day it covers", () => {
    const span = normalizeEvent(
      { id: 1, startDate: new Date(2026, 9, 5, 9).toISOString(), endDate: new Date(2026, 9, 7, 9).toISOString() },
      0,
      "",
    )!;
    const single = normalizeEvent(
      { id: 2, startDate: new Date(2026, 9, 6, 11).toISOString() },
      1,
      "",
    )!;
    const positions = calculateMonthEventPositions([span], [single], new Date(2026, 9, 1));
    expect(positions[span.id]).toBe(0);
    expect(positions[single.id]).toBe(1);
  });
});
