import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the lib's own axios import resolves to it.
const {
  LEAVE_FORM_DEFAULTS,
  calcLeaveDuration,
  declineLeavePayload,
  isFullDayTimes,
  leaveActionBlocker,
  leaveDateFromApi,
  leaveDateWithOffset,
  leaveDurationLabel,
  leaveFormFromRequest,
  leaveListParams,
  leaveCreatePayload,
  leaveUpdatePayload,
  leaveRequestSchema,
  leaveRowDuration,
  leaveStatusVariant,
  leaveTypeLabel,
  workingDaysBetween,
  mapLeaveRequest,
  mapLeaveEmployee,
  fetchLeaveRequests,
  fetchLeaveCounts,
  fetchLeaveRequest,
  fetchLeaveEmployees,
  createLeaveRequest,
  updateLeaveRequest,
  approveLeaveRequest,
  declineLeaveRequest,
  cancelLeaveRequest,
  deleteLeaveRequest,
} = await import("@/lib/payroll-leave");

import type { LeaveRequest, LeaveRequestFormValues } from "@/lib/payroll-leave";

/** Decrypts the `{ data }` envelope a write sent. */
function sentFields(body: unknown): Record<string, unknown> {
  const envelope = body as { data?: string };
  if (typeof envelope?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(envelope.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

const fullDay = { startTime: "09:00", endTime: "17:00", fullDay: true };

const request = (overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: "lr_1",
  employeeId: "emp_1",
  employeeName: "Olivia Bennett",
  leaveType: "ANNUAL_LEAVE",
  startDate: "2026-10-12T00:00:00.000+11:00",
  endDate: "2026-10-16T00:00:00.000+11:00",
  startTime: "00:00",
  endTime: "23:59",
  daysOff: 5,
  estimatedHours: 40,
  comments: "Holiday",
  agreedToTerms: true,
  status: "PENDING",
  reviewNote: null,
  ...overrides,
});

const values = (
  overrides: Partial<LeaveRequestFormValues> = {},
): LeaveRequestFormValues => ({
  ...LEAVE_FORM_DEFAULTS,
  employeeId: "emp_1",
  startDate: "2026-10-12",
  endDate: "2026-10-16",
  ...overrides,
});

const errorsOf = (input: LeaveRequestFormValues) => {
  const result = leaveRequestSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
      );
};

describe("workingDaysBetween", () => {
  it("counts Monday to Friday, both ends included", () => {
    // Mon 12 Oct – Fri 16 Oct 2026.
    expect(workingDaysBetween("2026-10-12", "2026-10-16")).toBe(5);
  });

  it("skips the weekend in a span that crosses one", () => {
    // Thu 15 Oct – Tue 20 Oct: Thu, Fri, Mon, Tue.
    expect(workingDaysBetween("2026-10-15", "2026-10-20")).toBe(4);
  });

  it("is zero for a weekend on its own", () => {
    expect(workingDaysBetween("2026-10-17", "2026-10-18")).toBe(0);
  });

  it("is zero when the end is before the start, or a date is missing", () => {
    expect(workingDaysBetween("2026-10-16", "2026-10-12")).toBe(0);
    expect(workingDaysBetween("", "2026-10-12")).toBe(0);
  });

  it("crosses a month and a daylight-saving change without losing a day", () => {
    // AEDT starts Sun 4 Oct 2026. Mon 28 Sep – Fri 9 Oct = 10 weekdays.
    expect(workingDaysBetween("2026-09-28", "2026-10-09")).toBe(10);
  });
});

describe("calcLeaveDuration", () => {
  it("is eight hours a weekday for full days", () => {
    expect(
      calcLeaveDuration({ startDate: "2026-10-15", endDate: "2026-10-20", ...fullDay }),
    ).toEqual({ days: 4, hours: 32 });
  });

  it("uses the time difference for a single partial day", () => {
    expect(
      calcLeaveDuration({
        startDate: "2026-10-14",
        endDate: "2026-10-14",
        startTime: "13:00",
        endTime: "17:30",
        fullDay: false,
      }),
    ).toEqual({ days: 1, hours: 4.5 });
  });

  it("keeps eight hours a day for a partial request spanning several days", () => {
    expect(
      calcLeaveDuration({
        startDate: "2026-10-14",
        endDate: "2026-10-15",
        startTime: "13:00",
        endTime: "11:00",
        fullDay: false,
      }),
    ).toEqual({ days: 2, hours: 16 });
  });

  it("never goes negative when a single day's times are backwards", () => {
    expect(
      calcLeaveDuration({
        startDate: "2026-10-14",
        endDate: "2026-10-14",
        startTime: "17:00",
        endTime: "09:00",
        fullDay: false,
      }),
    ).toEqual({ days: 1, hours: 0 });
  });

  it("is nothing when the end is before the start", () => {
    expect(
      calcLeaveDuration({ startDate: "2026-10-20", endDate: "2026-10-15", ...fullDay }),
    ).toEqual({ days: 0, hours: 0 });
  });

  it("is nothing for a partial day that falls on a weekend", () => {
    expect(
      calcLeaveDuration({
        startDate: "2026-10-17",
        endDate: "2026-10-17",
        startTime: "09:00",
        endTime: "12:00",
        fullDay: false,
      }),
    ).toEqual({ days: 0, hours: 0 });
  });
});

describe("leaveDurationLabel", () => {
  it("pluralises the days and trims the hours", () => {
    expect(leaveDurationLabel({ days: 1, hours: 4.5 })).toBe("1 day (4.5h)");
    expect(leaveDurationLabel({ days: 3, hours: 24 })).toBe("3 days (24h)");
  });
});

describe("leaveRowDuration", () => {
  it("prefers the backend's own figures for part of a day", () => {
    expect(
      leaveRowDuration(
        request({ startTime: "13:00", endTime: "17:00", daysOff: 1, estimatedHours: 4 }),
      ),
    ).toEqual({ days: 1, hours: 4 });
  });

  it("counts eight hours a day for a full day, not the backend's 23.98", () => {
    expect(
      leaveRowDuration(request({ daysOff: 1, estimatedHours: 23.98 })),
    ).toEqual({ days: 1, hours: 8 });
    expect(leaveRowDuration(request({ daysOff: 4, estimatedHours: 32 }))).toEqual({
      days: 4,
      hours: 32,
    });
  });

  it("works the figures out from the dates when the backend sent none", () => {
    expect(
      leaveRowDuration(
        request({
          startDate: "2026-08-11T00:00:00.000+10:00",
          endDate: "2026-08-11T00:00:00.000+10:00",
          startTime: "09:00",
          endTime: "12:30",
          daysOff: null,
          estimatedHours: null,
        }),
      ),
    ).toEqual({ days: 1, hours: 3.5 });
  });
});

describe("dates on the wire", () => {
  it("leaves a plain date alone, takes an offset date as written, and reads UTC in local time", () => {
    expect(leaveDateFromApi("2026-10-12")).toBe("2026-10-12");
    // Whatever timezone this runs in, the writer meant the 12th.
    expect(leaveDateFromApi("2026-10-12T00:00:00.000+11:00")).toBe("2026-10-12");
    expect(leaveDateFromApi("2026-10-12T00:00:00-04:00")).toBe("2026-10-12");
    const local = new Date(2026, 9, 12, 0, 0, 0);
    expect(leaveDateFromApi(local.toISOString())).toBe("2026-10-12");
    expect(leaveDateFromApi("")).toBe("");
    expect(leaveDateFromApi("not a date")).toBe("");
  });

  it("writes local midnight with its offset, and round-trips", () => {
    const written = leaveDateWithOffset("2026-10-12");
    expect(written).toMatch(/^2026-10-12T00:00:00\.000[+-]\d{2}:\d{2}$/);
    expect(leaveDateFromApi(written)).toBe("2026-10-12");
    expect(leaveDateWithOffset("")).toBe("");
  });

  it("reads 00:00–23:59, nothing, or 9 to 5 as a full day", () => {
    expect(isFullDayTimes("00:00", "23:59")).toBe(true);
    expect(isFullDayTimes(null, null)).toBe(true);
    expect(isFullDayTimes("09:00", "17:00")).toBe(true);
    expect(isFullDayTimes("13:00", "17:00")).toBe(false);
  });
});

describe("leaveRequestSchema", () => {
  it("accepts a complete full-day request", () => {
    expect(errorsOf(values())).toEqual({});
  });

  it("requires the employee, type and both dates", () => {
    expect(
      errorsOf(values({ employeeId: "", leaveType: "", startDate: "", endDate: "" })),
    ).toEqual({
      employeeId: "Choose an employee.",
      leaveType: "Choose a leave type.",
      startDate: "Start date is required.",
      endDate: "End date is required.",
    });
  });

  it("rejects an end date before the start, but allows the same day", () => {
    expect(errorsOf(values({ endDate: "2026-10-11" }))).toEqual({
      endDate: "End date must be on or after the start date.",
    });
    expect(errorsOf(values({ endDate: "2026-10-12" }))).toEqual({});
  });

  it("checks a single partial day's times run forwards", () => {
    const partial = { fullDay: false, startDate: "2026-10-14", endDate: "2026-10-14" };
    expect(errorsOf(values({ ...partial, startTime: "13:00", endTime: "13:00" }))).toEqual({
      endTime: "End time must be after the start time.",
    });
    expect(errorsOf(values({ ...partial, startTime: "13:00", endTime: "17:00" }))).toEqual({});
  });

  it("lets a multi-day partial request end earlier in the day than it started", () => {
    expect(
      errorsOf(values({ fullDay: false, startTime: "13:00", endTime: "11:00" })),
    ).toEqual({});
  });

  it("ignores the times entirely for a full day", () => {
    expect(errorsOf(values({ startTime: "", endTime: "" }))).toEqual({});
  });

  it("doesn't require the policy box to be ticked, as sole-webapp didn't", () => {
    expect(errorsOf(values({ agreedToTerms: false }))).toEqual({});
  });
});

describe("leaveCreatePayload", () => {
  it("sends a full day as 00:00–23:59 with offset dates", () => {
    const payload = leaveCreatePayload(values({ comments: "  Holiday  " }));
    expect(payload).toMatchObject({
      employeeId: "emp_1",
      leaveType: "ANNUAL_LEAVE",
      startTime: "00:00",
      endTime: "23:59",
      comments: "Holiday",
      agreedToTerms: true,
      status: "PENDING",
    });
    expect(payload.startDate.startsWith("2026-10-12T00:00:00.000")).toBe(true);
    expect(payload.endDate.startsWith("2026-10-16T00:00:00.000")).toBe(true);
  });

  it("sends a partial day's own times", () => {
    const payload = leaveCreatePayload(
      values({ fullDay: false, startTime: "13:00", endTime: "16:30" }),
    );
    expect(payload.startTime).toBe("13:00");
    expect(payload.endTime).toBe("16:30");
  });

  it("leaves out an unticked policy box and empty comments", () => {
    const payload = leaveCreatePayload(values({ agreedToTerms: false, comments: "  " }));
    expect(payload).not.toHaveProperty("agreedToTerms");
    expect(payload).not.toHaveProperty("comments");
  });

  it("never sends the drawer's days and hours estimate", () => {
    const payload = leaveCreatePayload(values()) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("daysOff");
    expect(payload).not.toHaveProperty("estimatedHours");
    expect(payload).not.toHaveProperty("fullDay");
  });
});

describe("leaveUpdatePayload", () => {
  it("sends no status and no employee, so an edit isn't read as a transition", () => {
    const payload = leaveUpdatePayload(values({ status: "PENDING" })) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("employeeId");
  });

  it("sends cleared comments and an unticked box so they can be changed", () => {
    expect(leaveUpdatePayload(values({ comments: "", agreedToTerms: false }))).toMatchObject({
      comments: "",
      agreedToTerms: false,
    });
  });
});

describe("leaveFormFromRequest", () => {
  it("prefills an edit, resetting a full day's times to 9 to 5", () => {
    expect(leaveFormFromRequest(request())).toEqual({
      employeeId: "emp_1",
      leaveType: "ANNUAL_LEAVE",
      startDate: "2026-10-12",
      endDate: "2026-10-16",
      fullDay: true,
      startTime: "09:00",
      endTime: "17:00",
      comments: "Holiday",
      agreedToTerms: true,
      status: "PENDING",
    });
  });

  it("keeps a partial day's times", () => {
    const form = leaveFormFromRequest(request({ startTime: "13:00", endTime: "17:00" }));
    expect(form).toMatchObject({ fullDay: false, startTime: "13:00", endTime: "17:00" });
  });
});

describe("leaveListParams", () => {
  it("leaves out filters set to all, and a blank search", () => {
    expect(
      leaveListParams({ page: 2, limit: 10, status: "all", leaveType: "all", search: "  " }),
    ).toEqual({ page: 2, limit: 10 });
  });

  it("passes the rest through, search trimmed", () => {
    expect(
      leaveListParams({
        page: 1,
        limit: 25,
        status: "PENDING",
        leaveType: "PERSONAL_LEAVE",
        search: " olivia ",
      }),
    ).toEqual({
      page: 1,
      limit: 25,
      status: "PENDING",
      leaveType: "PERSONAL_LEAVE",
      search: "olivia",
    });
  });
});

describe("leaveActionBlocker", () => {
  it("allows everything on a pending request", () => {
    for (const action of ["edit", "approve", "decline", "cancel", "delete"] as const) {
      expect(leaveActionBlocker(action, "PENDING")).toBeNull();
    }
  });

  it("only lets approved leave be edited or cancelled", () => {
    expect(leaveActionBlocker("edit", "APPROVED")).toBeNull();
    expect(leaveActionBlocker("cancel", "APPROVED")).toBeNull();
    expect(leaveActionBlocker("approve", "APPROVED")).toBe(
      "This request is already approved.",
    );
    expect(leaveActionBlocker("delete", "APPROVED")).toBe(
      "Approved leave can't be deleted. Cancel it instead.",
    );
  });

  it("leaves only delete on declined and cancelled requests", () => {
    for (const status of ["DECLINED", "CANCELLED"] as const) {
      expect(leaveActionBlocker("edit", status)).not.toBeNull();
      expect(leaveActionBlocker("approve", status)).not.toBeNull();
      expect(leaveActionBlocker("decline", status)).not.toBeNull();
      expect(leaveActionBlocker("cancel", status)).not.toBeNull();
      expect(leaveActionBlocker("delete", status)).toBeNull();
    }
  });
});

describe("labels", () => {
  it("names current and legacy leave types", () => {
    expect(leaveTypeLabel("LONG_SERVICE_LEAVE")).toBe("Long service leave");
    expect(leaveTypeLabel("SICK")).toBe("Sick leave");
    expect(leaveTypeLabel("PARENTAL_LEAVE")).toBe("Parental leave");
    expect(leaveTypeLabel(null)).toBe("—");
  });

  it("maps status to a badge tone", () => {
    expect(leaveStatusVariant("PENDING")).toBe("warning");
    expect(leaveStatusVariant("APPROVED")).toBe("success");
    expect(leaveStatusVariant("DECLINED")).toBe("danger");
    expect(leaveStatusVariant("CANCELLED")).toBe("secondary");
  });

  it("trims the decline reason", () => {
    expect(declineLeavePayload("  Clashes with close  ")).toEqual({
      reviewNote: "Clashes with close",
    });
    expect(declineLeavePayload("")).toEqual({ reviewNote: "" });
  });
});

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

/** A row as sole-ocr's `formatRequest` sends it, with the awkward bits. */
const rawRequest = {
  id: 41,
  tenantId: 3,
  businessId: 7,
  employeeId: 12,
  employee: { id: 12, name: "Olivia Bennett", email: "olivia@example.com", eusername: "obennett" },
  leaveType: "PERSONAL_LEAVE",
  status: "DECLINED",
  startDate: "2026-10-13T13:00:00.000Z",
  startTime: "13:00",
  endDate: "2026-10-13T13:00:00.000Z",
  endTime: "17:00",
  daysOff: "1.00",
  estimatedHours: "4.00",
  comments: null,
  reviewNote: "Clashes with close",
  agreedToTerms: true,
};

describe("mapLeaveRequest", () => {
  it("maps a real row, numbers from strings and nulls to blanks", () => {
    expect(mapLeaveRequest(rawRequest)).toEqual({
      id: "41",
      employeeId: "12",
      employeeName: "Olivia Bennett",
      leaveType: "PERSONAL_LEAVE",
      startDate: "2026-10-13T13:00:00.000Z",
      endDate: "2026-10-13T13:00:00.000Z",
      startTime: "13:00",
      endTime: "17:00",
      daysOff: 1,
      estimatedHours: 4,
      comments: "",
      agreedToTerms: true,
      status: "DECLINED",
      reviewNote: "Clashes with close",
    });
  });

  it("falls back through the name fields, and to pending for an unknown status", () => {
    const mapped = mapLeaveRequest({ id: 1, employeeId: 9, employee: null, status: "weird" });
    expect(mapped.employeeName).toBe("Employee #9");
    expect(mapped.status).toBe("PENDING");
    expect(mapped.daysOff).toBeNull();
    expect(mapLeaveRequest({ id: 1, employee: { id: 4, name: " ", eusername: "jobrien" } }).employeeName).toBe(
      "jobrien",
    );
  });
});

describe("fetchLeaveRequests", () => {
  it("sends the screen's params and reads data and pagination", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [rawRequest],
        pagination: { total: 23, page: 2, limit: 10, totalPages: 3 },
      },
    });
    const page = await fetchLeaveRequests({ page: 2, limit: 10, status: "DECLINED", search: "liv" });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.leaveRequests, {
      params: { page: 2, limit: 10, status: "DECLINED", search: "liv" },
    });
    expect(page.total).toBe(23);
    expect(page.totalPages).toBe(3);
    expect(page.requests[0].id).toBe("41");
  });

  it("also accepts the list under data.data and pagination under meta", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { data: [rawRequest] }, meta: { total: "1", totalPages: "1" } },
    });
    const page = await fetchLeaveRequests({ page: 1, limit: 10 });
    expect(page).toMatchObject({ total: 1, totalPages: 1 });
    expect(page.requests).toHaveLength(1);
  });

  it("throws the server's message when it says no", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Nope" } });
    await expect(fetchLeaveRequests({ page: 1, limit: 10 })).rejects.toThrow("Nope");
  });

  it("lets an HTTP failure through for apiErrorMessage to read", async () => {
    const error = Object.assign(new Error("Request failed"), {
      response: { data: { success: false, message: "business_id is required." } },
    });
    apiMock.get.mockRejectedValueOnce(error);
    await expect(fetchLeaveRequests({ page: 1, limit: 10 })).rejects.toBe(error);
  });
});

describe("fetchLeaveCounts and fetchLeaveRequest", () => {
  it("reads the counts as numbers", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { all: "5", pending: 2, approved: 1, declined: 1, cancelled: null } },
    });
    await expect(fetchLeaveCounts()).resolves.toEqual({
      all: 5,
      pending: 2,
      approved: 1,
      declined: 1,
      cancelled: 0,
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.leaveCounts);
  });

  it("fetches and maps one request", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: rawRequest } });
    const one = await fetchLeaveRequest("41");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.leaveRequest("41"));
    expect(one.employeeName).toBe("Olivia Bennett");
  });

  it("throws the server's message for a request that isn't there", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Leave request not found." } });
    await expect(fetchLeaveRequest("99")).rejects.toThrow("Leave request not found.");
  });
});

describe("fetchLeaveEmployees", () => {
  it("asks for the first hundred and names each one", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { id: 12, given_name: "Olivia", surname: "Bennett" },
          { id: 13, given_name: null, surname: null, personal_details: { first_name: "Liam", last_name: "Nguyen" } },
          { id: 14, eusername: "jobrien" },
        ],
      },
    });
    await expect(fetchLeaveEmployees()).resolves.toEqual([
      { id: "12", name: "Olivia Bennett" },
      { id: "13", name: "Liam Nguyen" },
      { id: "14", name: "jobrien" },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.employees, {
      params: { limit: 100 },
    });
    expect(mapLeaveEmployee({ id: 15 }).name).toBe("Employee #15");
  });
});

describe("writes", () => {
  const ok = { data: { success: true, data: rawRequest } };

  it("creates with an encrypted body the service reads correctly", async () => {
    apiMock.post.mockResolvedValueOnce(ok);
    await createLeaveRequest(values({ agreedToTerms: false }));
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.leaveRequests);
    const fields = sentFields(body);
    expect(fields).toMatchObject({
      employeeId: "emp_1",
      leaveType: "ANNUAL_LEAVE",
      startTime: "00:00",
      endTime: "23:59",
      status: "PENDING",
    });
    // Unticked travels as absent — "false" would be stored as true.
    expect(fields).not.toHaveProperty("agreedToTerms");
    expect(String(fields.startDate)).toMatch(/^2026-10-12T00:00:00\.000[+-]\d{2}:\d{2}$/);
  });

  it("updates without a status", async () => {
    apiMock.patch.mockResolvedValueOnce(ok);
    await updateLeaveRequest("41", values({ comments: "Moved" }));
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.leaveRequest("41"));
    const fields = sentFields(body);
    expect(fields).not.toHaveProperty("status");
    expect(fields).toMatchObject({ comments: "Moved", agreedToTerms: "true" });
  });

  it("approves with status APPROVED", async () => {
    apiMock.patch.mockResolvedValueOnce(ok);
    await approveLeaveRequest("41");
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.leaveRequest("41"));
    expect(sentFields(body)).toEqual({ status: "APPROVED" });
  });

  it("declines with the trimmed reason", async () => {
    apiMock.patch.mockResolvedValueOnce(ok);
    await declineLeaveRequest("41", "  Clashes with close ");
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.leaveDecline("41"));
    expect(sentFields(body)).toEqual({ reviewNote: "Clashes with close" });
  });

  it("cancels with an empty body", async () => {
    apiMock.patch.mockResolvedValueOnce(ok);
    await cancelLeaveRequest("41");
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.leaveCancel("41"));
    expect(sentFields(body)).toEqual({});
  });

  it("deletes, and throws the server's refusal", async () => {
    apiMock.delete.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await deleteLeaveRequest("41");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.payroll.leaveRequest("41"));

    apiMock.delete.mockResolvedValueOnce({
      data: { success: false, message: "Approved leave requests cannot be deleted. Cancel first." },
    });
    await expect(deleteLeaveRequest("42")).rejects.toThrow(
      "Approved leave requests cannot be deleted. Cancel first.",
    );
  });

  it("throws the server's reason when a write is refused", async () => {
    apiMock.patch.mockResolvedValueOnce({
      data: { success: false, message: "Cannot transition leave request from APPROVED to APPROVED." },
    });
    await expect(approveLeaveRequest("41")).rejects.toThrow(
      "Cannot transition leave request from APPROVED to APPROVED.",
    );
  });
});
