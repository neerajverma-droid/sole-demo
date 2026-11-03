/**
 * The calendar's API surface, request by request, against sole-webapp's own
 * `components/Calendar` calls: the same endpoints, query params and fields —
 * now inside the encrypted `{ data }` envelope the calendar controller
 * decrypts with `handlePayload`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";
import { EMPTY_FILTERS, getCalendarRange } from "@/lib/calendar";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  fetchCalendarEvents,
  searchCalendarEvents,
  fetchCalendarEventDetail,
  deleteCalendarEvent,
  createCalendarTask,
  updateCalendarTask,
  fetchLinkedCalendars,
  requestGoogleCalendarAuthUrl,
  setDefaultCalendar,
  deleteLinkedCalendar,
  fetchSelectableStages,
  fetchCalendarContacts,
  fetchClientProjects,
  fetchProjectJobs,
} = await import("@/lib/calendar-api");

beforeEach(() => {
  vi.resetAllMocks();
});

/** The fields inside an encrypted body, whether it went as JSON or FormData. */
function decryptedFields(body: unknown): Record<string, unknown> {
  const data = body instanceof FormData ? body.get("data") : (body as { data?: unknown })?.data;
  if (typeof data !== "string") throw new Error("Body was not a {data} envelope");
  return decryptPayload(data);
}

const OCT_14 = new Date(2026, 9, 14, 12, 0);

/* ------------------------------------------------------------------ *
 * Reading events — every view
 * ------------------------------------------------------------------ */

describe("fetchCalendarEvents", () => {
  it.each(["day", "week", "month", "year"] as const)(
    "asks %s view for its own range, with nothing extra when no filter is on",
    async (view) => {
      apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 1 }] } });

      const rows = await fetchCalendarEvents(OCT_14, view, EMPTY_FILTERS, "");

      expect(rows).toEqual([{ id: 1 }]);
      expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.calendar.getAllReminders, {
        params: {
          ...getCalendarRange(OCT_14, view),
          search: undefined,
          calendar_ids: undefined,
          // Never `billable=false` — that changes what the backend returns.
          billable: undefined,
        },
      });
    },
  );

  it("sends the search, the calendars joined by comma, and billable only when on", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchCalendarEvents(
      OCT_14,
      "month",
      { calendar_ids: ["3", "8"], billable: true },
      "site visit",
    );

    expect(apiMock.get.mock.calls[0][1].params).toMatchObject({
      search: "site visit",
      calendar_ids: "3,8",
      billable: true,
    });
  });

  it("reads an empty body as no events", async () => {
    apiMock.get.mockResolvedValue({ data: {} });
    expect(await fetchCalendarEvents(OCT_14, "day", EMPTY_FILTERS, "")).toEqual([]);
  });
});

describe("searchCalendarEvents", () => {
  it("searches the visible range with the active filters and passes the abort signal", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 2 }] } });
    const controller = new AbortController();

    const rows = await searchCalendarEvents(
      OCT_14,
      "week",
      { calendar_ids: ["5"], billable: false },
      "quote",
      controller.signal,
    );

    expect(rows).toEqual([{ id: 2 }]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.calendar.getReminderBySearch, {
      params: {
        ...getCalendarRange(OCT_14, "week"),
        search: "quote",
        calendar_ids: "5",
        billable: undefined,
      },
      signal: controller.signal,
    });
  });

  it("treats a non-array data field as no results", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { rows: [] } } });
    expect(await searchCalendarEvents(OCT_14, "day", EMPTY_FILTERS, "x")).toEqual([]);
  });
});

describe("fetchCalendarEventDetail", () => {
  it("reads GET /calendar/:id", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { id: 7, task_name: "Call" } } });
    expect(await fetchCalendarEventDetail(7)).toEqual({ id: 7, task_name: "Call" });
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.calendar.getEventDetail}/7`);
  });

  it("returns null for a gone event, which the dialog shows as 'No records found'", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: null } });
    expect(await fetchCalendarEventDetail("42_occ_1")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Create, edit, move, delete
 * ------------------------------------------------------------------ */

const TASK_FIELDS = {
  task_name: "Site visit",
  task_details: "Measure up",
  label: "business",
  start_date: "2026-10-15T03:45:00.000Z",
  end_date: "2026-10-15T05:00:00.000Z",
  stage_id: 35241,
  is_billable: true,
  client_id: 44994,
  contact_id: 38110,
  amount: 150,
  priority: "high",
};

describe("createCalendarTask", () => {
  it("posts the fields encrypted, as JSON when there are no files", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 91, task_id: 12 } } });

    const saved = await createCalendarTask(TASK_FIELDS);

    expect(saved).toEqual({ id: 91, task_id: 12 });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.calendar.addEvent);
    expect(body).not.toBeInstanceOf(FormData);
    // The encryption carries booleans as strings; the controller's
    // normalizeBoolean reads "true"/"false" the same as FormData's did.
    expect(decryptedFields(body)).toEqual({ ...TASK_FIELDS, is_billable: "true" });
  });

  it("sends attachments raw as files[] beside the encrypted data", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    const receipt = new File(["a"], "receipt.pdf", { type: "application/pdf" });
    const photo = new File(["b"], "site.jpg", { type: "image/jpeg" });

    await createCalendarTask(TASK_FIELDS, [receipt, photo]);

    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.getAll("files[]").map((file) => (file as File).name)).toEqual([
      "receipt.pdf",
      "site.jpg",
    ]);
    expect(decryptedFields(body).task_name).toBe("Site visit");
    // No field travels in the clear.
    expect(body.has("task_name")).toBe(false);
  });

  it("carries a recurrence object inside the encrypted fields", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    const recurrence = { freq: "WEEKLY", byday: ["SA", "FR"], count: 4 };

    await createCalendarTask({ ...TASK_FIELDS, recurrence });

    expect(decryptedFields(apiMock.post.mock.calls[0][1]).recurrence).toEqual(recurrence);
  });

  it("surfaces the server's message when success is false", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Task name is required." } });
    await expect(createCalendarTask(TASK_FIELDS)).rejects.toThrow("Task name is required.");
  });

  it("falls back to a plain message when the server gives none", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(createCalendarTask(TASK_FIELDS)).rejects.toThrow("Failed to create task");
  });
});

describe("updateCalendarTask (edit and drag-and-drop)", () => {
  it("puts the encrypted fields to /calendar/:id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true, data: { id: 91 } } });

    await updateCalendarTask(91, { task_name: "Renamed", priority: "low" });

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.calendar.editEvent}/91`);
    expect(decryptedFields(body)).toEqual({ task_name: "Renamed", priority: "low" });
  });

  it("sends a move's nulls as empty strings, which the controller reads as cleared", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true, data: {} } });

    await updateCalendarTask("12", {
      task_name: "Call",
      start_date: "2026-10-16T01:00:00.000Z",
      end_date: "2026-10-16T02:00:00.000Z",
      project_id: null,
      amount: null,
      is_billable: false,
    });

    expect(decryptedFields(apiMock.put.mock.calls[0][1])).toMatchObject({
      project_id: "",
      amount: "",
      is_billable: "false",
    });
  });

  it("throws on a refused save", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false, message: "Event is invalid." } });
    await expect(updateCalendarTask(1, {})).rejects.toThrow("Event is invalid.");
  });
});

describe("deleteCalendarEvent", () => {
  it("deletes /calendar/:id with no body", async () => {
    apiMock.delete.mockResolvedValue({ status: 200, data: { success: true } });
    await deleteCalendarEvent(91);
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.calendar.deleteReminder}/91`);
  });

  it("accepts a bare 204, as the old hook did", async () => {
    apiMock.delete.mockResolvedValue({ status: 204, data: "" });
    await expect(deleteCalendarEvent(91)).resolves.toBeUndefined();
  });

  it("throws when the backend refuses", async () => {
    apiMock.delete.mockResolvedValue({ status: 202, data: { success: false, message: "Nope" } });
    await expect(deleteCalendarEvent(91)).rejects.toThrow("Nope");
  });
});

/* ------------------------------------------------------------------ *
 * Connected calendars
 * ------------------------------------------------------------------ */

describe("connected calendars", () => {
  it("lists linked calendars", async () => {
    const rows = [{ id: 1, provider: "google", email: "me@example.com", is_default: true }];
    apiMock.get.mockResolvedValue({ data: { success: true, data: rows } });
    expect(await fetchLinkedCalendars()).toEqual(rows);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.calendar.getCalendarsList);
  });

  it("asks for Google's auth URL with an encrypted {type: google}", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { authUrl: "https://accounts.google.test/o" } } });

    expect(await requestGoogleCalendarAuthUrl()).toBe("https://accounts.google.test/o");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.calendar.addCal);
    expect(decryptedFields(body)).toEqual({ type: "google" });
  });

  it.each([
    [{ data: { url: "https://a.test" } }, "https://a.test"],
    [{ authUrl: "https://b.test" }, "https://b.test"],
    [{ url: "https://c.test" }, "https://c.test"],
  ])("reads the auth URL from any of the shapes the old screen accepted", async (data, expected) => {
    apiMock.post.mockResolvedValue({ data });
    expect(await requestGoogleCalendarAuthUrl()).toBe(expected);
  });

  it("fails clearly when no URL comes back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(requestGoogleCalendarAuthUrl()).rejects.toThrow(
      "Missing Google Calendar auth URL.",
    );
  });

  it("sets the default and removes a calendar by id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await setDefaultCalendar(4);
    await deleteLinkedCalendar(4);

    expect(apiMock.put).toHaveBeenCalledWith(`${apiRoutes.calendar.setDefaultCalendar}/4`);
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.calendar.deleteCalendar}/4`);
  });
});

/* ------------------------------------------------------------------ *
 * Form lookups
 * ------------------------------------------------------------------ */

describe("task form lookups", () => {
  it("offers every stage but the last (highest order)", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 1, name: "Backlog", order: 0 },
          { id: 2, name: "In progress", order: 1 },
          { id: 3, name: "Invoiced", order: 2 },
        ],
      },
    });

    const stages = await fetchSelectableStages();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.plannerStage.getAllStages);
    expect(stages.map((stage) => stage.name)).toEqual(["Backlog", "In progress"]);
  });

  it("returns no stages for an empty or odd body", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: null } });
    expect(await fetchSelectableStages()).toEqual([]);
  });

  it("reads clients from /contact/list with both ids, as SearchableClientSelect did", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ contact_id: 38110, client_id: 44994, name: "Gaurav", email: "g@example.com" }],
      },
    });

    const contacts = await fetchCalendarContacts();

    expect(apiMock.get).toHaveBeenCalledWith(
      `${apiRoutes.companyContact.list}?page=1&limit=1000&type=1`,
    );
    expect(contacts).toEqual([
      { value: "38110", label: "Gaurav", email: "g@example.com", client_id: 44994, contact_id: 38110 },
    ]);
  });

  it("returns no contacts when the list call fails", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchCalendarContacts()).toEqual([]);
  });

  it("reads a client's projects from either response shape", async () => {
    const projects = [{ id: 11, project_name: "Fit-out" }];

    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: projects } });
    expect(await fetchClientProjects(44994)).toEqual(projects);
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.projects.byClientId}/44994`, {
      params: { limit: 100 },
    });

    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: { projects } } });
    expect(await fetchClientProjects(44994)).toEqual(projects);

    apiMock.get.mockResolvedValueOnce({ data: { success: false } });
    expect(await fetchClientProjects(44994)).toEqual([]);
  });

  it("reads a project's jobs", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: [{ id: 5, job_name: "Stage 1" }] } });
    expect(await fetchProjectJobs("11")).toEqual([{ id: 5, job_name: "Stage 1" }]);
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.projects.jobsListByProject}/11`);

    apiMock.get.mockResolvedValueOnce({ data: { success: false } });
    expect(await fetchProjectJobs("11")).toEqual([]);
  });
});
