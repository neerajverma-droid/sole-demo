/**
 * The project detail's Job / Milestone tab — jobs, the tasks under them, the
 * time logged against those tasks and the invoice built from a selection.
 * Requests are checked against `apiRoutes.projects.*`, and every write body
 * is decrypted so the exact fields sole-ocr receives are asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";
import type { Project } from "@/lib/projects";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

// `fetchNpsSurveys` talks to the reputation service through bare axios, with
// the stored token and business id — the rest of axios stays real.
const axiosGet = vi.fn();
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, get: axiosGet } };
});
const getAccessToken = vi.fn();
vi.mock("@/lib/api/session", () => ({ getAccessToken }));
const getBusinessId = vi.fn();
vi.mock("@/lib/api/business-id", () => ({ getBusinessId }));

// Imported after the mocks so the module under test picks them up.
const {
  fetchProjectJobs,
  emptyJobDraft,
  jobDraftFromJob,
  jobIssues,
  jobPayload,
  createJobApi,
  updateJobApi,
  deleteJobApi,
  TASK_PRIORITIES,
  priorityLabel,
  chargeTypeLabel,
  fetchProjectTasks,
  emptyTaskDraft,
  taskDraftFromTask,
  taskIssues,
  taskPayload,
  createTaskApi,
  updateTaskApi,
  deleteTaskApi,
  fetchNpsSurveys,
  isEntryInvoiceable,
  fetchJobTimeEntries,
  formatMinutes,
  formatEntryTimeRange,
  formatAgo,
  entryAmount,
  timeEntryDraft,
  timeEntryPayload,
  updateTimeEntryApi,
  deleteTimeEntryApi,
  markEntriesInvoicedApi,
  fixedTaskSelectionId,
  buildJobInvoice,
} = await import("@/lib/project-jobs");

type ProjectTask = import("@/lib/project-jobs").ProjectTask;
type TimeEntry = import("@/lib/project-jobs").TimeEntry;
type TaskDraft = import("@/lib/project-jobs").TaskDraft;
type TimeEntryDraft = import("@/lib/project-jobs").TimeEntryDraft;

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const PROJECT: Project = {
  id: "77",
  name: "Kitchen fit-out",
  code: "KIT-01",
  color: "#000000",
  status: "inprogress",
  description: "",
  clientId: "12",
  contactId: "34",
  clientName: "Harbour Homes",
  clientEmail: "accounts@harbour.example",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  isBudget: true,
  isFixed: false,
  budgetType: "total",
  budget: 5000,
  weeklyBudget: 0,
  monthlyBudget: 0,
  usedBudget: 0,
  remainingBudget: 5000,
  raw: {} as Project["raw"],
};

function task(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: "t1",
    jobId: "j1",
    name: "Install cabinets",
    chargeType: "hourly",
    isBillable: true,
    priority: "medium",
    status: "active",
    rate: 80,
    fixedAmount: 0,
    amount: 0,
    totalMinutes: 0,
    notes: "",
    stageId: null,
    npsEnabled: false,
    npsSurveyId: null,
    estimatedHours: "",
    kmDistance: "",
    clientId: null,
    contactId: null,
    ...overrides,
  };
}

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: "e1",
    taskId: "t1",
    logDate: "2026-03-04",
    startTime: "",
    endTime: "",
    durationMinutes: 60,
    hoursLogged: 1,
    amount: 0,
    rate: 0,
    status: "stopped",
    isInvoiced: false,
    notes: "",
    clientId: null,
    contactId: null,
    billedName: "",
    raw: {},
    ...overrides,
  };
}

function taskDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return { ...emptyTaskDraft("j1"), name: "Install cabinets", rate: "80", ...overrides };
}

/** Decrypts a `{ data }` envelope, or the `data` field of a FormData. */
function decryptBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string") throw new Error("FormData had no 'data' field");
    return decryptPayload(data);
  }
  const data = (body as { data?: unknown })?.data;
  if (typeof data !== "string") throw new Error("Body was not an encrypted {data} envelope");
  return decryptPayload(data);
}

/** A page of `n` raw rows, ids starting at `from`. */
function rows(n: number, from = 1, extra: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: from + i, ...extra }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------------ *
 * Jobs
 * ------------------------------------------------------------------ */

describe("fetching a project's jobs", () => {
  it("GETs the jobs route for the project and maps every field", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 9,
            job_name: " Stage 1 ",
            job_code: "ST-1",
            job_description: "Demolition",
            is_budget: 1,
            budget: "1500.50",
            used_budget: 200,
          },
        ],
      },
    });

    const jobs = await fetchProjectJobs("77");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.jobs, {
      params: { project_id: "77", page: 1, limit: 100 },
    });
    expect(jobs).toEqual([
      {
        id: "9",
        name: "Stage 1",
        code: "ST-1",
        description: "Demolition",
        isBudget: true,
        budget: 1500.5,
        usedBudget: 200,
      },
    ]);
  });

  it("falls back to empty strings, false and zero for missing or odd values", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ id: 3, is_budget: "false", budget: "N/A", used_budget: null }] },
    });

    const [job] = await fetchProjectJobs("77");

    expect(job).toEqual({
      id: "3",
      name: "",
      code: "",
      description: "",
      isBudget: false,
      budget: 0,
      usedBudget: 0,
    });
  });

  it("keeps paging while full pages come back and the server reports more", async () => {
    apiMock.get
      .mockResolvedValueOnce({ data: { success: true, data: rows(100, 1), pagination: { totalPages: 3 } } })
      .mockResolvedValueOnce({ data: { success: true, data: rows(100, 101), pagination: { totalPages: 3 } } })
      .mockResolvedValueOnce({ data: { success: true, data: rows(5, 201), pagination: { totalPages: 3 } } });

    const jobs = await fetchProjectJobs("77");

    expect(jobs).toHaveLength(205);
    expect(apiMock.get).toHaveBeenCalledTimes(3);
    expect(apiMock.get.mock.calls[2][1]).toEqual({ params: { project_id: "77", page: 3, limit: 100 } });
  });

  it("stops after one full page when the server sends no pagination", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: rows(100) } });

    expect(await fetchProjectJobs("77")).toHaveLength(100);
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it("returns nothing when the data isn't a list", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: null } });
    expect(await fetchProjectJobs("77")).toEqual([]);
  });

  it("throws the server's message on success: false", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Project not found" } });
    await expect(fetchProjectJobs("77")).rejects.toThrow("Project not found");
  });

  it("throws a default message when the server gives none", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    await expect(fetchProjectJobs("77")).rejects.toThrow("Couldn't load this project's jobs.");
  });
});

describe("job drafts", () => {
  it("starts empty with the budget off", () => {
    expect(emptyJobDraft()).toEqual({
      name: "",
      code: "",
      description: "",
      budgetEnabled: false,
      budget: "",
    });
  });

  it("prefills from an existing job", () => {
    expect(
      jobDraftFromJob({
        id: "9",
        name: "Stage 1",
        code: "ST-1",
        description: "Demo",
        isBudget: true,
        budget: 1500,
        usedBudget: 0,
      }),
    ).toEqual({ name: "Stage 1", code: "ST-1", description: "Demo", budgetEnabled: true, budget: "1500" });
  });

  it("leaves the budget box empty for a zero budget", () => {
    const draft = jobDraftFromJob({
      id: "9",
      name: "A",
      code: "B",
      description: "",
      isBudget: false,
      budget: 0,
      usedBudget: 0,
    });
    expect(draft.budget).toBe("");
  });
});

describe("validating a job", () => {
  const valid = { name: "Stage 1", code: "ST-1", description: "", budgetEnabled: false, budget: "" };

  it("accepts a valid draft", () => {
    expect(jobIssues(valid, 0)).toEqual([]);
  });

  it("needs a name of at least three characters once trimmed", () => {
    expect(jobIssues({ ...valid, name: "  ab  " }, 0)).toEqual([
      { key: "name", message: "Job name must be at least 3 characters" },
    ]);
  });

  it("needs a code", () => {
    expect(jobIssues({ ...valid, code: "   " }, 0)).toEqual([
      { key: "code", message: "Job code is required" },
    ]);
  });

  it("only allows letters, numbers and dashes in the code", () => {
    expect(jobIssues({ ...valid, code: "ST 1!" }, 0)).toEqual([
      { key: "code", message: "Only letters, numbers and dashes allowed" },
    ]);
  });

  it("caps the description at 500 characters", () => {
    expect(jobIssues({ ...valid, description: "x".repeat(500) }, 0)).toEqual([]);
    expect(jobIssues({ ...valid, description: "x".repeat(501) }, 0)).toEqual([
      { key: "description", message: "Description must be 500 characters or fewer" },
    ]);
  });

  it("rejects a negative or non-numeric budget", () => {
    const message = { key: "budget", message: "Budget must be a positive number" };
    expect(jobIssues({ ...valid, budget: "-5" }, 0)).toEqual([message]);
    expect(jobIssues({ ...valid, budget: "abc" }, 0)).toEqual([message]);
  });

  it("rejects an enabled job budget above the project's budget", () => {
    expect(jobIssues({ ...valid, budgetEnabled: true, budget: "6000" }, 5000)).toEqual([
      { key: "budget", message: "Job budget cannot be greater than project budget" },
    ]);
    expect(jobIssues({ ...valid, budgetEnabled: true, budget: "5000" }, 5000)).toEqual([]);
  });

  it("skips the project-budget check when the project has no budget or the job budget is off", () => {
    expect(jobIssues({ ...valid, budgetEnabled: true, budget: "6000" }, 0)).toEqual([]);
    expect(jobIssues({ ...valid, budgetEnabled: false, budget: "6000" }, 5000)).toEqual([]);
  });

  it("reports every problem at once", () => {
    const keys = jobIssues({ name: "", code: "", description: "x".repeat(501), budgetEnabled: false, budget: "-1" }, 0).map(
      (issue) => issue.key,
    );
    expect(keys).toEqual(["name", "code", "description", "budget"]);
  });
});

describe("building a job payload", () => {
  it("sends the project's ids, the trimmed name and code, and the budget when enabled", () => {
    expect(
      jobPayload(
        { name: " Stage 1 ", code: " ST-1 ", description: " Demo ", budgetEnabled: true, budget: "1200.5" },
        PROJECT,
      ),
    ).toEqual({
      project_id: "77",
      client_id: "12",
      contact_id: "34",
      job_name: "Stage 1",
      job_code: "ST-1",
      job_description: " Demo ",
      is_budget: true,
      budget: 1200.5,
    });
  });

  it("sends a zero budget when the budget is off, whatever was typed", () => {
    const payload = jobPayload(
      { name: "Stage", code: "S", description: "", budgetEnabled: false, budget: "900" },
      PROJECT,
    );
    expect(payload.is_budget).toBe(false);
    expect(payload.budget).toBe(0);
  });

  it("drops a missing client or contact id rather than sending it empty", () => {
    const payload = jobPayload(emptyJobDraft(), { ...PROJECT, clientId: null, contactId: null });
    expect(payload).not.toHaveProperty("client_id");
    expect(payload).not.toHaveProperty("contact_id");
    expect(payload.project_id).toBe("77");
  });
});

describe("job API calls", () => {
  it("creates a job with an encrypted POST to the jobs route", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await createJobApi({ job_name: "Stage", is_budget: true, budget: 0 });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.jobs);
    // Booleans travel as strings once encrypted.
    expect(decryptBody(body)).toEqual({ job_name: "Stage", is_budget: "true", budget: 0 });
  });

  it("updates a job with an encrypted PUT to the job's id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await updateJobApi("9", { job_name: "Renamed" });

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.projects.jobs}/9`);
    expect(decryptBody(body)).toEqual({ job_name: "Renamed" });
  });

  it("deletes a job at the delete route without a doubled slash", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteJobApi("9");

    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.projects.deleteJob}9`);
  });

  it("throws the server's message, or a default, on success: false", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Job code exists" } });
    await expect(createJobApi({})).rejects.toThrow("Job code exists");

    apiMock.put.mockResolvedValue({ data: { success: false } });
    await expect(updateJobApi("9", {})).rejects.toThrow("Operation failed");

    apiMock.delete.mockResolvedValue({ data: { success: false } });
    await expect(deleteJobApi("9")).rejects.toThrow("Failed to delete job");
  });

  it("treats a response without a success flag as success", async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    await expect(createJobApi({})).resolves.toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

describe("task labels", () => {
  it("offers low, medium and high priorities", () => {
    expect(TASK_PRIORITIES.map((option) => option.value)).toEqual(["low", "medium", "high"]);
  });

  it("labels known priorities, echoes unknown ones and dashes an empty one", () => {
    expect(priorityLabel("high")).toBe("High");
    expect(priorityLabel("urgent")).toBe("urgent");
    expect(priorityLabel("")).toBe("—");
  });

  it("labels each charge type", () => {
    expect(chargeTypeLabel("hourly")).toBe("Hourly");
    expect(chargeTypeLabel("fixed")).toBe("Fixed");
    expect(chargeTypeLabel("per_km")).toBe("Per KM");
  });
});

describe("fetching a project's tasks", () => {
  it("GETs the tasks route for the project and maps every field", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 21,
            project_job_id: 9,
            task_name: "Install cabinets",
            charge_type: "hourly",
            is_billable: "1",
            priority: "high",
            status: "completed",
            rate: "85.5",
            km_rate: 1.2,
            fixed_amount: null,
            amount: "171",
            totalDurationMinutes: 120,
            notes: "Upper and lower",
            stage_id: 4,
            nps_enabled: true,
            nps_survey_id: 6,
            estimated_hours: 2.5,
            km_distance: null,
            client_id: 12,
            contact_id: 34,
          },
        ],
      },
    });

    const tasks = await fetchProjectTasks("77");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.tasks, {
      params: { project_id: "77", page: 1, limit: 100 },
    });
    expect(tasks).toEqual([
      {
        id: "21",
        jobId: "9",
        name: "Install cabinets",
        chargeType: "hourly",
        isBillable: true,
        priority: "high",
        status: "completed",
        rate: 85.5,
        fixedAmount: 0,
        amount: 171,
        totalMinutes: 120,
        notes: "Upper and lower",
        stageId: "4",
        npsEnabled: true,
        npsSurveyId: "6",
        estimatedHours: "2.5",
        kmDistance: "",
        clientId: "12",
        contactId: "34",
      },
    ]);
  });

  it("reads a per-km task's rate from km_rate", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ id: 1, charge_type: "per_km", rate: 99, km_rate: "0.85", km_distance: 40 }] },
    });

    const [mapped] = await fetchProjectTasks("77");

    expect(mapped.chargeType).toBe("per_km");
    expect(mapped.rate).toBe(0.85);
    expect(mapped.kmDistance).toBe("40");
  });

  it("reads a fixed task's 'N/A' rate as zero", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ id: 1, charge_type: "fixed", rate: "N/A", fixed_amount: "500" }] },
    });

    const [mapped] = await fetchProjectTasks("77");

    expect(mapped.rate).toBe(0);
    expect(mapped.fixedAmount).toBe(500);
  });

  it("defaults unknown charge types to hourly, unknown statuses to active and zero/'null' ids to null", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            charge_type: "daily",
            status: "archived",
            project_job_id: 0,
            stage_id: "null",
            nps_survey_id: "",
            client_id: undefined,
          },
        ],
      },
    });

    const [mapped] = await fetchProjectTasks("77");

    expect(mapped).toMatchObject({
      chargeType: "hourly",
      status: "active",
      jobId: null,
      stageId: null,
      npsSurveyId: null,
      clientId: null,
      isBillable: false,
      npsEnabled: false,
      estimatedHours: "",
    });
  });

  it("throws on success: false", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(fetchProjectTasks("77")).rejects.toThrow("Nope");
  });
});

describe("task drafts", () => {
  it("starts billable, hourly and medium priority under the given job", () => {
    expect(emptyTaskDraft("j1")).toEqual({
      name: "",
      stageId: "",
      jobId: "j1",
      isBillable: true,
      npsEnabled: false,
      npsSurveyId: "",
      chargeType: "hourly",
      rate: "",
      amount: "",
      estimatedHours: "",
      estimatedKm: "",
      priority: "medium",
      notes: "",
    });
  });

  it("starts without a job when none is given", () => {
    expect(emptyTaskDraft(null).jobId).toBe("");
  });

  it("prefills from an existing hourly task", () => {
    expect(
      taskDraftFromTask(
        task({
          stageId: "4",
          npsEnabled: true,
          npsSurveyId: "6",
          priority: "high",
          estimatedHours: "3",
          kmDistance: "",
          notes: "N",
        }),
      ),
    ).toEqual({
      name: "Install cabinets",
      stageId: "4",
      jobId: "j1",
      isBillable: true,
      npsEnabled: true,
      npsSurveyId: "6",
      chargeType: "hourly",
      rate: "80",
      amount: "",
      estimatedHours: "3",
      estimatedKm: "",
      priority: "high",
      notes: "N",
    });
  });

  it("clears the rate on a fixed task and fills the amount", () => {
    const draft = taskDraftFromTask(task({ chargeType: "fixed", rate: 50, fixedAmount: 750 }));
    expect(draft.rate).toBe("");
    expect(draft.amount).toBe("750");
  });

  it("carries the km distance into the per-km draft", () => {
    const draft = taskDraftFromTask(task({ chargeType: "per_km", rate: 0.9, kmDistance: "40" }));
    expect(draft.rate).toBe("0.9");
    expect(draft.estimatedKm).toBe("40");
  });

  it("falls back to medium for an unknown priority and empty strings for null ids", () => {
    const draft = taskDraftFromTask(task({ priority: "urgent", jobId: null, rate: 0 }));
    expect(draft.priority).toBe("medium");
    expect(draft.jobId).toBe("");
    expect(draft.stageId).toBe("");
    expect(draft.npsSurveyId).toBe("");
    expect(draft.rate).toBe("");
  });
});

describe("validating a task", () => {
  it("accepts a valid hourly task", () => {
    expect(taskIssues(taskDraft(), 0)).toEqual([]);
  });

  it("needs a name between 3 and 100 characters", () => {
    expect(taskIssues(taskDraft({ name: "ab" }), 0)).toEqual([
      { key: "name", message: "Task name must be at least 3 characters long" },
    ]);
    expect(taskIssues(taskDraft({ name: "x".repeat(100) }), 0)).toEqual([]);
    expect(taskIssues(taskDraft({ name: "x".repeat(101) }), 0)).toEqual([
      { key: "name", message: "Task name must not exceed 100 characters" },
    ]);
  });

  it("does not trim the name, so three spaces pass the length check", () => {
    // Unlike jobIssues, which trims. Documented as current behaviour.
    expect(taskIssues(taskDraft({ name: "   " }), 0)).toEqual([]);
  });

  it("rejects a negative or non-numeric rate or amount", () => {
    expect(taskIssues(taskDraft({ rate: "-1" }), 0)).toEqual([
      { key: "rate", message: "Rate must be a positive number" },
    ]);
    expect(taskIssues(taskDraft({ chargeType: "fixed", rate: "", amount: "abc" }), 0)).toEqual([
      { key: "amount", message: "Amount must be a positive number" },
    ]);
  });

  it("caps notes at 500 characters", () => {
    expect(taskIssues(taskDraft({ notes: "x".repeat(501) }), 0)).toEqual([
      { key: "notes", message: "Notes must not exceed 500 characters" },
    ]);
  });

  it("needs a rate on a billable hourly task and an amount on a billable fixed task", () => {
    expect(taskIssues(taskDraft({ rate: "" }), 0)).toEqual([{ key: "rate", message: "Rate is required" }]);
    expect(taskIssues(taskDraft({ chargeType: "fixed", rate: "", amount: "" }), 0)).toEqual([
      { key: "amount", message: "Amount is required" },
    ]);
  });

  it("needs neither when the task isn't billable", () => {
    expect(taskIssues(taskDraft({ isBillable: false, rate: "" }), 0)).toEqual([]);
    expect(taskIssues(taskDraft({ isBillable: false, chargeType: "fixed", rate: "" }), 0)).toEqual([]);
  });

  it("does not require a rate on a billable per-km task", () => {
    expect(taskIssues(taskDraft({ chargeType: "per_km", rate: "" }), 0)).toEqual([]);
  });

  it("rejects a fixed amount above the project's budget", () => {
    expect(taskIssues(taskDraft({ chargeType: "fixed", amount: "6000" }), 5000)).toEqual([
      { key: "amount", message: "Task budget cannot be greater than project budget" },
    ]);
    expect(taskIssues(taskDraft({ chargeType: "fixed", amount: "6000" }), 0)).toEqual([]);
  });

  it("reports only one amount issue when the amount is already invalid", () => {
    const issues = taskIssues(taskDraft({ chargeType: "fixed", amount: "-6000" }), 5000);
    expect(issues).toEqual([{ key: "amount", message: "Amount must be a positive number" }]);
  });
});

describe("building a task payload", () => {
  it("sends the hourly fields, the project's ids and numeric stage / survey ids", () => {
    const payload = taskPayload(
      taskDraft({
        stageId: "4",
        npsEnabled: true,
        npsSurveyId: "6",
        estimatedHours: "2.5",
        rate: "85.5",
        priority: "high",
        notes: "N",
      }),
      PROJECT,
      false,
    );

    expect(payload).toEqual({
      project_id: "77",
      task_name: "Install cabinets",
      charge_type: "hourly",
      is_billable: true,
      priority: "high",
      notes: "N",
      client_id: "12",
      contact_id: "34",
      stage_id: 4,
      nps_enabled: true,
      nps_survey_id: 6,
      project_job_id: "j1",
      estimated_hours: 2.5,
      rate: 85.5,
    });
  });

  it("also sends hourly_rate when editing, so the server saves the new rate", () => {
    const payload = taskPayload(taskDraft({ rate: "90" }), PROJECT, true);
    expect(payload.rate).toBe(90);
    expect(payload.hourly_rate).toBe(90);
  });

  it("sends only the fixed amount on a fixed task", () => {
    const payload = taskPayload(
      taskDraft({ chargeType: "fixed", rate: "80", amount: "750", estimatedHours: "3" }),
      PROJECT,
      true,
    );
    expect(payload.fixed_amount).toBe(750);
    expect(payload).not.toHaveProperty("rate");
    expect(payload).not.toHaveProperty("hourly_rate");
    expect(payload).not.toHaveProperty("estimated_hours");
  });

  it("sends km distance and km rate on a per-km task", () => {
    const payload = taskPayload(
      taskDraft({ chargeType: "per_km", rate: "0.85", estimatedKm: "40" }),
      PROJECT,
      true,
    );
    expect(payload.km_distance).toBe(40);
    expect(payload.km_rate).toBe(0.85);
    expect(payload).not.toHaveProperty("rate");
    expect(payload).not.toHaveProperty("hourly_rate");
  });

  it("drops unset stage, survey, job and client ids instead of sending them empty", () => {
    const payload = taskPayload(
      taskDraft({ jobId: "", rate: "" }),
      { ...PROJECT, clientId: null, contactId: null },
      false,
    );
    for (const key of ["stage_id", "nps_survey_id", "project_job_id", "client_id", "contact_id", "rate"]) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload.notes).toBe("");
  });
});

describe("task API calls", () => {
  it("creates a task with an encrypted POST to the create route", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await createTaskApi({ task_name: "Install", is_billable: false, nps_enabled: true, rate: 80 });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.createTask);
    expect(decryptBody(body)).toEqual({
      task_name: "Install",
      is_billable: "false",
      nps_enabled: "true",
      rate: 80,
    });
  });

  it("updates a task with an encrypted PUT to the task's id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await updateTaskApi("21", { hourly_rate: 90 });

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.projects.updateTask}/21`);
    expect(decryptBody(body)).toEqual({ hourly_rate: 90 });
  });

  it("deletes a task at the delete route without a doubled slash", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteTaskApi("21");

    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.projects.deleteTask}21`);
  });

  it("throws the server's message, or a default, on success: false", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(createTaskApi({})).rejects.toThrow("Failed to create task");

    apiMock.put.mockResolvedValue({ data: { success: false, message: "Locked" } });
    await expect(updateTaskApi("21", {})).rejects.toThrow("Locked");

    apiMock.delete.mockResolvedValue({ data: { success: false } });
    await expect(deleteTaskApi("21")).rejects.toThrow("Failed to delete task");
  });
});

describe("fetching NPS surveys", () => {
  it("returns nothing without a reputation service configured, and makes no request", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPUTATION_API_URL", "");

    expect(await fetchNpsSurveys()).toEqual([]);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("GETs /surveys with the bearer token and business id, keeping only rows with an id", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPUTATION_API_URL", "https://rep.example/api/");
    vi.stubEnv("NEXT_PUBLIC_SOURCE_APP", "");
    getAccessToken.mockReturnValue("tok");
    getBusinessId.mockReturnValue("55");
    axiosGet.mockResolvedValue({
      data: { success: true, data: [{ id: 1, name: "Default" }, { id: null, name: "Broken" }] },
    });

    const surveys = await fetchNpsSurveys();

    expect(axiosGet).toHaveBeenCalledWith("https://rep.example/api/surveys", {
      headers: { Authorization: "Bearer tok" },
      params: { source_app: "sole-ocr", business_id: "55" },
    });
    expect(surveys).toEqual([{ id: "1", name: "Default" }]);
  });

  it("sends no auth header or business id when neither is stored, and the configured source app", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPUTATION_API_URL", "https://rep.example");
    vi.stubEnv("NEXT_PUBLIC_SOURCE_APP", "sole-web");
    getAccessToken.mockReturnValue(null);
    getBusinessId.mockReturnValue(null);
    axiosGet.mockResolvedValue({ data: { success: true } });

    expect(await fetchNpsSurveys()).toEqual([]);
    expect(axiosGet).toHaveBeenCalledWith("https://rep.example/surveys", {
      headers: undefined,
      params: { source_app: "sole-web" },
    });
  });

  it("returns nothing when the service doesn't report success", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPUTATION_API_URL", "https://rep.example");
    axiosGet.mockResolvedValue({ data: { success: false, data: [{ id: 1, name: "X" }] } });

    expect(await fetchNpsSurveys()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Time entries
 * ------------------------------------------------------------------ */

describe("fetching a job's time entries", () => {
  it("GETs the time-tracking list for the project and job and maps every field", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 301,
            task_id: 21,
            log_date: "2026-03-04",
            start_time: "2026-03-04T09:00:00",
            end_time: "2026-03-04T11:30:00",
            duration_minutes: "150",
            hours_logged: 2.5,
            amount: "212.5",
            rate: 85,
            status: "stopped",
            is_invoiced: 0,
            invoice_id: null,
            notes: "Fitted uppers",
            client_id: 12,
            contact_id: 34,
            contact_name: "Jo Smith",
            client_name: "Harbour Homes",
          },
        ],
      },
    });

    const entries = await fetchJobTimeEntries("77", "9");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.timeTracking.list, {
      params: { project_id: "77", project_job_id: "9", limit: 100 },
    });
    expect(entries).toEqual([
      {
        id: "301",
        taskId: "21",
        logDate: "2026-03-04",
        startTime: "2026-03-04T09:00:00",
        endTime: "2026-03-04T11:30:00",
        durationMinutes: 150,
        hoursLogged: 2.5,
        amount: 212.5,
        rate: 85,
        status: "stopped",
        isInvoiced: false,
        notes: "Fitted uppers",
        clientId: "12",
        contactId: "34",
        billedName: "Jo Smith",
        raw: expect.objectContaining({ id: 301 }),
      },
    ]);
  });

  it("falls back to the nested task, client and contact details", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            description: "From description",
            taskDetail: { id: 21 },
            clientDetail: { id: 12, business_name: "Harbour Pty Ltd" },
            contactDetail: { id: 34 },
          },
        ],
      },
    });

    const [mapped] = await fetchJobTimeEntries("77", "9");

    expect(mapped).toMatchObject({
      taskId: "21",
      clientId: "12",
      contactId: "34",
      notes: "From description",
      billedName: "Harbour Pty Ltd",
    });
  });

  it("prefers the contact's name, then the client's, for who the entry is billed to", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 1, client_name: "Client Co" },
          { id: 2, contactDetail: { name: "Contact Person" }, clientDetail: { name: "Client Detail" } },
        ],
      },
    });

    const [first, second] = await fetchJobTimeEntries("77", "9");

    expect(first.billedName).toBe("Client Co");
    expect(second.billedName).toBe("Contact Person");
  });

  it("counts an entry with an invoice id as invoiced even without the flag", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ id: 1, invoice_id: 88 }, { id: 2, is_invoiced: "true" }, { id: 3, invoice_id: 0 }] },
    });

    const entries = await fetchJobTimeEntries("77", "9");

    expect(entries.map((e) => e.isInvoiced)).toEqual([true, true, false]);
  });

  it("returns nothing when the data isn't a list, without throwing on success: false", async () => {
    // Unlike the job and task lists, this one swallows a failure.
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Boom" } });
    expect(await fetchJobTimeEntries("77", "9")).toEqual([]);
  });
});

describe("which entries can be invoiced", () => {
  it("allows a stopped, uninvoiced entry", () => {
    expect(isEntryInvoiceable(entry())).toBe(true);
  });

  it("refuses one already invoiced or still running", () => {
    expect(isEntryInvoiceable(entry({ isInvoiced: true }))).toBe(false);
    expect(isEntryInvoiceable(entry({ status: "running" }))).toBe(false);
  });
});

describe("formatting time", () => {
  it("formats minutes as HH:MM:SS, including fractional minutes", () => {
    expect(formatMinutes(0)).toBe("00:00:00");
    expect(formatMinutes(1.5)).toBe("00:01:30");
    expect(formatMinutes(125)).toBe("02:05:00");
    expect(formatMinutes(60 * 100)).toBe("100:00:00");
  });

  it("shows zero for negative, NaN or infinite minutes", () => {
    expect(formatMinutes(-5)).toBe("00:00:00");
    expect(formatMinutes(Number.NaN)).toBe("00:00:00");
    expect(formatMinutes(Number.POSITIVE_INFINITY)).toBe("00:00:00");
  });

  it("formats an entry's start and end as a 12-hour range", () => {
    expect(
      formatEntryTimeRange(entry({ startTime: "2026-03-04T09:00:00", endTime: "2026-03-04T23:30:00" })),
    ).toBe("9:00 AM → 11:30 PM");
  });

  it("shows -- unless both ends are valid timestamps", () => {
    expect(formatEntryTimeRange(entry({ startTime: "2026-03-04T09:00:00", endTime: "" }))).toBe("--");
    expect(formatEntryTimeRange(entry({ startTime: "garbage", endTime: "2026-03-04T09:00:00" }))).toBe("--");
  });

  describe("how long ago", () => {
    const now = Date.parse("2026-03-04T12:00:00Z");

    it("says just now under a minute, and for future times", () => {
      expect(formatAgo("2026-03-04T11:59:30Z", now)).toBe("just now");
      expect(formatAgo("2026-03-04T13:00:00Z", now)).toBe("just now");
    });

    it("counts minutes, then hours, then days", () => {
      expect(formatAgo("2026-03-04T11:15:00Z", now)).toBe("45 minutes ago");
      expect(formatAgo("2026-03-04T09:00:00Z", now)).toBe("3 hours ago");
      expect(formatAgo("2026-03-01T12:00:00Z", now)).toBe("3 days ago");
    });

    it("doesn't singularise one unit", () => {
      // Matches sole-webapp's formatAgo; "1 minutes ago" is current behaviour.
      expect(formatAgo("2026-03-04T11:59:00Z", now)).toBe("1 minutes ago");
      expect(formatAgo("2026-03-04T11:00:00Z", now)).toBe("1 hours ago");
    });

    it("shows -- for an empty or invalid timestamp", () => {
      expect(formatAgo("", now)).toBe("--");
      expect(formatAgo("not a date", now)).toBe("--");
    });
  });
});

describe("an entry's amount", () => {
  it("uses the server's amount when there is one", () => {
    expect(entryAmount(entry({ amount: 120, durationMinutes: 600, rate: 99 }), task())).toBe(120);
  });

  it("otherwise prices the hours at the entry's rate, then the task's", () => {
    expect(entryAmount(entry({ durationMinutes: 90, rate: 100 }), task({ rate: 80 }))).toBe(150);
    expect(entryAmount(entry({ durationMinutes: 90, rate: 0 }), task({ rate: 80 }))).toBe(120);
    expect(entryAmount(entry({ durationMinutes: 90 }), task({ rate: 0 }))).toBe(0);
  });
});

describe("prefilling the time-entry form", () => {
  it("splits logged hours into hours and minutes and switches to start/end when both are set", () => {
    expect(
      timeEntryDraft(
        entry({
          hoursLogged: 2.5,
          startTime: "2026-03-04T09:00:00",
          endTime: "2026-03-04T11:30:00",
          notes: "Fitted uppers",
        }),
        task(),
      ),
    ).toEqual({
      description: "Fitted uppers",
      useStartEnd: true,
      startTime: "09:00",
      endTime: "11:30",
      hours: "2",
      minutes: "30",
      date: "2026-03-04",
    });
  });

  it("uses typed hours, the task name and today's date when the entry has none of its own", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 22, 10, 0, 0));
    try {
      const draft = timeEntryDraft(entry({ hoursLogged: 0.75, logDate: "", notes: "" }), task());
      expect(draft).toEqual({
        description: "Install cabinets",
        useStartEnd: false,
        startTime: "",
        endTime: "",
        hours: "0",
        minutes: "45",
        date: "2026-10-22",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries a fraction just under the hour into the hours, never prefilling 60 minutes", () => {
    const draft = timeEntryDraft(entry({ hoursLogged: 1.999 }), task());
    expect(draft).toMatchObject({ hours: "2", minutes: "0" });
  });
});

describe("building a time-entry payload", () => {
  const baseDraft: TimeEntryDraft = {
    description: "Fitted uppers",
    useStartEnd: false,
    startTime: "",
    endTime: "",
    hours: "1",
    minutes: "30",
    date: "2026-03-04",
  };

  it("sends typed hours plus the project, job and task, without start or end times", () => {
    expect(timeEntryPayload(baseDraft, task({ id: "21", jobId: "9" }), "77")).toEqual({
      payload: {
        log_date: "2026-03-04",
        hours_logged: 1.5,
        notes: "Fitted uppers",
        task_name: "Fitted uppers",
        project_id: "77",
        project_job_id: "9",
        task_id: "21",
      },
    });
  });

  it("works out the hours from start and end, and sends both times", () => {
    const result = timeEntryPayload(
      { ...baseDraft, useStartEnd: true, startTime: "09:15", endTime: "11:45" },
      task(),
      "77",
    );
    expect(result).toEqual({
      payload: expect.objectContaining({ start_time: "09:15", end_time: "11:45", hours_logged: 2.5 }),
    });
  });

  it("wraps past midnight", () => {
    const result = timeEntryPayload(
      { ...baseDraft, useStartEnd: true, startTime: "22:00", endTime: "01:00" },
      task(),
      "77",
    );
    expect("payload" in result && result.payload.hours_logged).toBe(3);
  });

  it("asks for both times in start/end mode", () => {
    expect(timeEntryPayload({ ...baseDraft, useStartEnd: true, startTime: "09:00" }, task(), "77")).toEqual({
      error: "Please enter both start and end times",
    });
  });

  it("refuses a zero duration", () => {
    const invalid = { error: "Please enter a valid duration" };
    expect(timeEntryPayload({ ...baseDraft, hours: "", minutes: "" }, task(), "77")).toEqual(invalid);
    expect(timeEntryPayload({ ...baseDraft, hours: "abc", minutes: "0" }, task(), "77")).toEqual(invalid);
    expect(
      timeEntryPayload({ ...baseDraft, useStartEnd: true, startTime: "09:00", endTime: "09:00" }, task(), "77"),
    ).toEqual(invalid);
  });

  it("drops the job id when the task has none, and defaults the date to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 22, 10, 0, 0));
    try {
      const result = timeEntryPayload({ ...baseDraft, date: "" }, task({ jobId: null }), "77");
      if (!("payload" in result)) throw new Error("expected a payload");
      expect(result.payload).not.toHaveProperty("project_job_id");
      expect(result.payload.log_date).toBe("2026-10-22");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("time-entry API calls", () => {
  it("updates an entry with an encrypted PUT to the time-tracking route", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await updateTimeEntryApi("301", { hours_logged: 1.5, notes: "N" });

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.projects.timeTracking.stop}/301`);
    expect(decryptBody(body)).toEqual({ hours_logged: 1.5, notes: "N" });
  });

  it("deletes an entry at the time-tracking delete route", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteTimeEntryApi("301");

    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.projects.timeTracking.delete}/301`);
  });

  it("throws the server's message, or a default, on success: false", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false } });
    await expect(updateTimeEntryApi("301", {})).rejects.toThrow("Failed to update time entry");

    apiMock.delete.mockResolvedValue({ data: { success: false, message: "Invoiced" } });
    await expect(deleteTimeEntryApi("301")).rejects.toThrow("Invoiced");
  });

  it("marks entries invoiced with numeric ids and is_invoiced as the string 'true'", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await markEntriesInvoicedApi(["301", "302"], { id: "88", number: "INV-0042" });

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.timeTracking.bulkUpdate);
    // The bulk endpoint compares is_invoiced against "true" / "false".
    expect(decryptBody(body)).toEqual({
      id: [301, 302],
      is_invoiced: "true",
      invoice_id: "88",
      bill_type: "billed",
      invoice_no: "INV-0042",
    });
  });

  it("treats a bulk update without an explicit success as a failure", async () => {
    apiMock.put.mockResolvedValue({ data: {} });
    await expect(markEntriesInvoicedApi(["1"], { id: "1", number: "1" })).rejects.toThrow(
      "Failed to update time entries",
    );

    apiMock.put.mockResolvedValue({ data: { success: false, message: "Bad ids" } });
    await expect(markEntriesInvoicedApi(["1"], { id: "1", number: "1" })).rejects.toThrow("Bad ids");
  });
});

/* ------------------------------------------------------------------ *
 * Invoicing a job's selection
 * ------------------------------------------------------------------ */

describe("fixed-task selection ids", () => {
  it("gives a billable fixed task a synthetic id", () => {
    expect(fixedTaskSelectionId(task({ id: "21", chargeType: "fixed" }))).toBe("task-21");
  });

  it("gives none to non-billable fixed tasks or other charge types", () => {
    expect(fixedTaskSelectionId(task({ chargeType: "fixed", isBillable: false }))).toBeNull();
    expect(fixedTaskSelectionId(task({ chargeType: "hourly" }))).toBeNull();
    expect(fixedTaskSelectionId(task({ chargeType: "per_km" }))).toBeNull();
  });
});

describe("building an invoice from a job's selection", () => {
  it("refuses an empty selection", () => {
    expect(buildJobInvoice({ selected: new Set(), tasks: [task()], entries: [entry()], project: PROJECT })).toEqual({
      error: "No entries selected",
    });
  });

  it("bills one hours line per billable task at the first entry's rate", () => {
    const result = buildJobInvoice({
      selected: new Set(["e1", "e2"]),
      tasks: [task({ id: "t1", rate: 80 })],
      entries: [
        entry({ id: "e1", durationMinutes: 90, rate: 100, clientId: "50", billedName: "Jo Smith" }),
        entry({ id: "e2", durationMinutes: 20, rate: 0 }),
        entry({ id: "e3", durationMinutes: 600 }), // not selected
      ],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.entryIds).toEqual(["e1", "e2"]);
    expect(result.seed).toMatchObject({
      description: "",
      clientId: "50",
      clientName: "Jo Smith",
      projectId: "77",
    });
    expect(result.seed.items).toHaveLength(1);
    expect(result.seed.items[0]).toMatchObject({
      description: "Install cabinets",
      quantity: "1.8333",
      price: "100",
      gst: false,
      qtyType: "hours",
    });
  });

  it("falls back to the task's rate and a default description", () => {
    const result = buildJobInvoice({
      selected: new Set(["e1"]),
      tasks: [task({ name: "", rate: 72.456 })],
      entries: [entry({ durationMinutes: 60, rate: 0 })],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.seed.items[0]).toMatchObject({
      description: "Time Tracking Entry",
      quantity: "1",
      price: "72.46",
    });
  });

  it("gives each billable task its own line, in task order", () => {
    const result = buildJobInvoice({
      selected: new Set(["a", "b"]),
      tasks: [task({ id: "t1", name: "One" }), task({ id: "t2", name: "Two" })],
      entries: [entry({ id: "b", taskId: "t2" }), entry({ id: "a", taskId: "t1" })],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.seed.items.map((item) => item.description)).toEqual(["One", "Two"]);
    expect(result.entryIds).toEqual(["a", "b"]);
  });

  it("bills a fixed task with selected entries as one item at the entries' total", () => {
    const result = buildJobInvoice({
      selected: new Set(["e1", "e2"]),
      tasks: [task({ chargeType: "fixed", rate: 0, fixedAmount: 900, name: "Design" })],
      entries: [entry({ id: "e1", amount: 300 }), entry({ id: "e2", amount: 200 })],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.seed.items).toEqual([
      expect.objectContaining({ description: "Design", quantity: "1", price: "500", qtyType: "items" }),
    ]);
  });

  it("adds a line for a selected billable fixed task at its billed amount, else its fixed amount", () => {
    const result = buildJobInvoice({
      selected: new Set(["task-f1", "task-f2"]),
      tasks: [
        task({ id: "f1", chargeType: "fixed", name: "Design", amount: 650.456, fixedAmount: 900 }),
        task({ id: "f2", chargeType: "fixed", name: "", amount: 0, fixedAmount: 400 }),
      ],
      entries: [],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.entryIds).toEqual([]);
    expect(result.seed.items).toEqual([
      expect.objectContaining({ description: "Design", quantity: "1", price: "650.46", qtyType: "items", gst: false }),
      expect.objectContaining({ description: "Fixed Task", quantity: "1", price: "400" }),
    ]);
  });

  it("doesn't bill a fixed task twice when its entries are also selected", () => {
    const result = buildJobInvoice({
      selected: new Set(["task-t1", "e1"]),
      tasks: [task({ chargeType: "fixed", fixedAmount: 900 })],
      entries: [entry({ amount: 300 })],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.seed.items).toHaveLength(1);
    expect(result.seed.items[0].price).toBe("300");
  });

  it("bills a fixed task to its own client when no entries are selected", () => {
    const result = buildJobInvoice({
      selected: new Set(["task-f1"]),
      tasks: [task({ id: "f1", chargeType: "fixed", fixedAmount: 900, clientId: "61" })],
      entries: [],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.seed.clientId).toBe("61");
    expect(result.seed.clientName).toBe("Harbour Homes");
  });

  it("falls back to the project's client when neither entries nor the fixed task name one", () => {
    const result = buildJobInvoice({
      selected: new Set(["e1"]),
      tasks: [task()],
      entries: [entry({ clientId: null, billedName: "" })],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.seed.clientId).toBe("12");
    expect(result.seed.clientName).toBe("Harbour Homes");
  });

  it("carries non-billable entries along to be marked invoiced without adding a line", () => {
    const result = buildJobInvoice({
      selected: new Set(["e1", "e2"]),
      tasks: [task({ id: "t1" }), task({ id: "t2", isBillable: false, name: "Internal" })],
      entries: [entry({ id: "e1", taskId: "t1" }), entry({ id: "e2", taskId: "t2" })],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.seed.items.map((item) => item.description)).toEqual(["Install cabinets"]);
    expect(result.entryIds).toEqual(["e1", "e2"]);
  });

  it("refuses a selection of only non-billable entries or zero-value fixed tasks", () => {
    const error = {
      error: "No billable entries selected. Non-billable entries are included in the timesheet only.",
    };
    expect(
      buildJobInvoice({
        selected: new Set(["e1"]),
        tasks: [task({ isBillable: false })],
        entries: [entry()],
        project: PROJECT,
      }),
    ).toEqual(error);
    expect(
      buildJobInvoice({
        selected: new Set(["task-f1"]),
        tasks: [task({ id: "f1", chargeType: "fixed", amount: 0, fixedAmount: 0 })],
        entries: [],
        project: PROJECT,
      }),
    ).toEqual(error);
  });

  it("ignores selected entries whose task isn't in the list", () => {
    expect(
      buildJobInvoice({
        selected: new Set(["e1"]),
        tasks: [task({ id: "other" })],
        entries: [entry({ taskId: "t1" })],
        project: PROJECT,
      }),
    ).toHaveProperty("error");
  });

  it("bills a fixed task's selected entries at zero when they carry no amount (current behaviour)", () => {
    // A fixed task's rate maps to 0, so entries without a server amount add
    // nothing and the line goes out at $0 instead of the fixed amount — and
    // the fixed-task line is skipped because the task already has entries.
    const result = buildJobInvoice({
      selected: new Set(["e1", "task-t1"]),
      tasks: [task({ chargeType: "fixed", rate: 0, fixedAmount: 900 })],
      entries: [entry({ amount: 0, rate: 0, durationMinutes: 120 })],
      project: PROJECT,
    });

    if (!("seed" in result)) throw new Error(result.error);
    expect(result.seed.items).toEqual([expect.objectContaining({ quantity: "1", price: "0" })]);
  });
});
