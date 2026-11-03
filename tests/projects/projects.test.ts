import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/projects.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  DEFAULT_PROJECT_SETTINGS,
  applySettingsToDraft,
  compactPayload,
  createProjectApi,
  createProjectPayload,
  deleteProjectApi,
  emptyProjectDraft,
  fetchNextJobCode,
  fetchNextProjectCode,
  fetchProject,
  fetchProjectSettings,
  fetchProjectsPage,
  formatProjectDate,
  mapProject,
  mapProjectListItem,
  mapProjectSettings,
  optionalId,
  parseProjectDate,
  projectDraftFromProject,
  projectInitials,
  projectIssues,
  projectProgress,
  projectSettingsIssues,
  projectSettingsPayload,
  projectStatusLabel,
  saveProjectSettingsApi,
  toFlag,
  toIsoDay,
  toProjectStatus,
  totalFromPeriod,
  updateProjectApi,
  updateProjectPayload,
} = await import("@/lib/projects");

type Draft = ReturnType<typeof emptyProjectDraft>;

/** What an encrypted `{ data }` body decrypts to — what the backend reads. */
function decryptBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: unknown };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(asData.data);
}

/** A complete, valid draft — fields overridden per test. */
function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    ...emptyProjectDraft(new Date(2026, 9, 13)),
    client: { clientId: "12", contactId: "34", name: "Williams Health", email: "a@b.co" },
    name: "Website rebuild",
    code: "PRO-7",
    totalBudget: "1000",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Vocabulary and parsers
 * ------------------------------------------------------------------ */

describe("project status vocabulary", () => {
  it("labels each status the way the old list did", () => {
    expect(projectStatusLabel("draft")).toBe("Draft");
    expect(projectStatusLabel("inprogress")).toBe("In Progress");
    expect(projectStatusLabel("closed")).toBe("Closed");
  });

  it("reads anything unknown as a draft", () => {
    expect(toProjectStatus("cancelled")).toBe("draft");
    expect(toProjectStatus(undefined)).toBe("draft");
    expect(projectStatusLabel("whatever")).toBe("Draft");
  });
});

describe("small parsers", () => {
  it("treats 0, empty and the strings null/undefined as no id", () => {
    expect(optionalId(0)).toBeNull();
    expect(optionalId("")).toBeNull();
    expect(optionalId("null")).toBeNull();
    expect(optionalId("undefined")).toBeNull();
    expect(optionalId(42)).toBe("42");
  });

  it("reads 1, '1', 'true' and true as on, and the rest as off", () => {
    expect([1, "1", "true", true, " TRUE "].map((value) => toFlag(value))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect([0, "0", "false", "", false].map((value) => toFlag(value))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("falls back only when the flag is absent", () => {
    expect(toFlag(undefined, true)).toBe(true);
    expect(toFlag(null, true)).toBe(true);
    expect(toFlag(0, true)).toBe(false);
  });

  it("drops null and undefined keys before a payload is encrypted, but keeps empty strings and zero", () => {
    expect(compactPayload({ a: null, b: undefined, c: "", d: 0, e: false })).toEqual({
      c: "",
      d: 0,
      e: false,
    });
  });

  it("takes two initials from the first two words, or two letters from one word", () => {
    expect(projectInitials("demo project")).toBe("DP");
    expect(projectInitials("Sole")).toBe("SO");
    expect(projectInitials("   ")).toBe("?");
  });
});

describe("project dates", () => {
  it("reads the list's DD-MM-YYYY and the detail's YYYY-MM-DD alike", () => {
    expect(toIsoDay("03-08-2026")).toBe("2026-08-03");
    expect(toIsoDay("2026-08-03")).toBe("2026-08-03");
    expect(toIsoDay("2026-08-03T00:00:00.000Z")).toMatch(/^2026-08-0[23]$/);
  });

  it("formats as DD-MM-YYYY, the way the list shows it", () => {
    expect(formatProjectDate("2026-06-29")).toBe("29-06-2026");
    expect(formatProjectDate("29-06-2026")).toBe("29-06-2026");
  });

  it("shows a dash and returns nothing for a missing or invalid date", () => {
    expect(formatProjectDate(null)).toBe("—");
    expect(formatProjectDate("not a date")).toBe("—");
    expect(parseProjectDate("")).toBeNull();
    expect(toIsoDay(undefined)).toBe("");
  });
});

/* ------------------------------------------------------------------ *
 * List
 * ------------------------------------------------------------------ */

describe("projectProgress", () => {
  it("is the share of the budget used, capped at 100", () => {
    expect(projectProgress(1000, 250)).toBe(25);
    expect(projectProgress(100, 250)).toBe(100);
  });

  it("is 0 with no budget", () => {
    expect(projectProgress(0, 50)).toBe(0);
  });
});

describe("mapProjectListItem", () => {
  const row = {
    id: 5,
    project_name: "demo project",
    project_code: "PR-5",
    project_status: "inprogress",
    project_description: "First phase",
    clientDetail: { name: "Client Co", email: "client@co.com" },
    contactDetail: { name: "new client", email: "ne@yopmail.com" },
    budget: "1000.00",
    used_budget: "71",
    start_date: "03-08-2026",
    end_date: "29-06-2027",
    job_names: ["testing job", "install"],
    jobs_count: 3,
  };

  it("maps the list row the table renders", () => {
    expect(mapProjectListItem(row)).toMatchObject({
      id: "5",
      name: "demo project",
      code: "PR-5",
      status: "inprogress",
      description: "First phase",
      budget: 1000,
      usedBudget: 71,
      startDate: "03-08-2026",
      endDate: "29-06-2027",
      jobNames: ["testing job", "install"],
      jobsCount: 3,
    });
  });

  it("shows the contact on the project first, as the old row did", () => {
    expect(mapProjectListItem(row)).toMatchObject({
      clientName: "new client",
      clientEmail: "ne@yopmail.com",
    });
  });

  it("falls back to the client when there's no contact", () => {
    expect(mapProjectListItem({ ...row, contactDetail: null })).toMatchObject({
      clientName: "Client Co",
      clientEmail: "client@co.com",
    });
  });

  it("uses the weekly, then the monthly budget when there's no overall one", () => {
    expect(mapProjectListItem({ ...row, budget: 0, weekly_budget: 200 }).budget).toBe(200);
    expect(mapProjectListItem({ ...row, budget: 0, monthly_budget: "500" }).budget).toBe(500);
  });
});

describe("fetchProjectsPage", () => {
  it("asks for the page, size, status and trimmed search", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [], pagination: {}, meta: {} } });
    await fetchProjectsPage({ status: "draft", search: "  demo " }, 2, 25);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.getAllProject, {
      params: { page: 2, limit: 25, status: "draft", search: "demo" },
    });
  });

  it("leaves status and search out for the All tab with no search", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    await fetchProjectsPage({ status: "all", search: "  " }, 1, 25);
    expect(apiMock.get.mock.calls[0][1]).toEqual({ params: { page: 1, limit: 25 } });
  });

  it("returns the rows, the total and the per-tab counts", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 1, project_name: "A" }, { id: 2, project_name: "B" }],
        pagination: { totalRecords: 42 },
        meta: { all: 42, draft: 10, inprogress: 30, closed: 2 },
      },
    });
    const page = await fetchProjectsPage({ status: "all", search: "" }, 1, 25);
    expect(page.projects.map((project) => project.name)).toEqual(["A", "B"]);
    expect(page.total).toBe(42);
    expect(page.counts).toEqual({ all: 42, draft: 10, inprogress: 30, closed: 2 });
  });

  it("counts the rows when the server sends no total, and zeroes missing counts", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 1 }] } });
    const page = await fetchProjectsPage({ status: "all", search: "" }, 1, 25);
    expect(page.total).toBe(1);
    expect(page.counts).toEqual({ all: 0, draft: 0, inprogress: 0, closed: 0 });
  });

  it("throws the server's message on success:false", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Invalid limit" } });
    await expect(fetchProjectsPage({ status: "all", search: "" }, 1, 500)).rejects.toThrow(
      "Invalid limit",
    );
  });
});

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

const DETAIL = {
  id: 77,
  project_name: "sole app",
  project_code: "PRO-1",
  project_status: "draft",
  project_description: "Notes",
  client_id: 12,
  contact_id: 34,
  clientDetail: { name: "abc", email: "abc@yopmail.com" },
  start_date: "2026-06-12",
  end_date: "2026-06-29",
  is_budget: 1,
  is_fixed: 0,
  budget_type: "weekly",
  budget: 2000,
  weekly_budget: "250",
  monthly_budget: 0,
  used_budget: 0.09,
  remaining_budget: 1999.91,
};

describe("mapProject", () => {
  it("maps the detail the header and edit form read", () => {
    expect(mapProject(DETAIL)).toMatchObject({
      id: "77",
      name: "sole app",
      code: "PRO-1",
      status: "draft",
      clientId: "12",
      contactId: "34",
      clientName: "abc",
      clientEmail: "abc@yopmail.com",
      startDate: "2026-06-12",
      endDate: "2026-06-29",
      isBudget: true,
      isFixed: false,
      budgetType: "weekly",
      budget: 2000,
      weeklyBudget: 250,
      usedBudget: 0.09,
      remainingBudget: 1999.91,
    });
  });

  it("reads an unknown budget type as overall and no client as null", () => {
    const project = mapProject({ ...DETAIL, budget_type: "daily", client_id: null, contact_id: 0 });
    expect(project.budgetType).toBe("total");
    expect(project.clientId).toBeNull();
    expect(project.contactId).toBeNull();
  });
});

describe("fetchProject", () => {
  it("loads one project by id", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: DETAIL } });
    const project = await fetchProject("77");
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.projects.info}77`);
    expect(project.name).toBe("sole app");
  });

  it("throws when the project isn't there", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Project not found" } });
    await expect(fetchProject("9")).rejects.toThrow("Project not found");
  });
});

/* ------------------------------------------------------------------ *
 * Drafts and validation
 * ------------------------------------------------------------------ */

describe("emptyProjectDraft", () => {
  it("starts today and ends on 30 June of the current financial year", () => {
    expect(emptyProjectDraft(new Date(2026, 9, 13))).toMatchObject({
      startDate: "2026-10-13",
      endDate: "2027-06-30",
      status: "draft",
      taskBased: true,
      budgetEnabled: true,
      budgetType: "total",
    });
  });

  it("ends this June when the financial year hasn't rolled over yet", () => {
    expect(emptyProjectDraft(new Date(2026, 2, 1)).endDate).toBe("2026-06-30");
  });
});

describe("applySettingsToDraft", () => {
  it("pre-fills the budget from the settings, picking the first flagged type", () => {
    const next = applySettingsToDraft(emptyProjectDraft(), {
      ...DEFAULT_PROJECT_SETTINGS,
      defaultBudgetEnabled: false,
      showWeeklyBudget: true,
      showMonthlyBudget: true,
      defaultWeeklyBudget: "300",
      defaultMonthlyBudget: "1200",
    });
    expect(next).toMatchObject({
      budgetEnabled: false,
      budgetType: "weekly",
      weeklyBudget: "300",
      monthlyBudget: "1200",
      totalBudget: "",
    });
  });

  it("leaves zero or blank defaults empty rather than writing 0 into the field", () => {
    const next = applySettingsToDraft(emptyProjectDraft(), {
      ...DEFAULT_PROJECT_SETTINGS,
      showTotalBudget: true,
      defaultTotalBudget: "0",
    });
    expect(next.budgetType).toBe("total");
    expect(next.totalBudget).toBe("");
  });
});

describe("projectDraftFromProject", () => {
  it("seeds the edit form from the stored project", () => {
    expect(projectDraftFromProject(mapProject(DETAIL))).toMatchObject({
      client: { clientId: "12", contactId: "34", name: "abc", email: "abc@yopmail.com" },
      name: "sole app",
      code: "PRO-1",
      taskBased: true,
      budgetEnabled: true,
      budgetType: "weekly",
      totalBudget: "2000",
      weeklyBudget: "250",
      monthlyBudget: "",
    });
  });

  it("has no client when the project has none", () => {
    expect(projectDraftFromProject(mapProject({ ...DETAIL, client_id: null })).client).toBeNull();
  });
});

describe("totalFromPeriod", () => {
  it("is nothing for an overall budget", () => {
    expect(totalFromPeriod(draft({ budgetType: "total" }))).toBeNull();
  });

  it("multiplies a weekly budget by the weeks between the dates, rounded up", () => {
    // 1 Jul to 1 Aug is 31 days: 5 weeks.
    expect(
      totalFromPeriod(
        draft({ budgetType: "weekly", weeklyBudget: "100", startDate: "2026-07-01", endDate: "2026-08-01" }),
      ),
    ).toBe("500.00");
  });

  it("multiplies a monthly budget by the months the dates span", () => {
    // 1 Jul to 1 Oct counts July, August, September and October's first day.
    expect(
      totalFromPeriod(
        draft({ budgetType: "monthly", monthlyBudget: "1000", startDate: "2026-07-01", endDate: "2026-10-01" }),
      ),
    ).toBe("4000.00");
  });

  it("is nothing without an amount, or when the end isn't after the start", () => {
    expect(totalFromPeriod(draft({ budgetType: "weekly", weeklyBudget: "" }))).toBeNull();
    expect(
      totalFromPeriod(
        draft({ budgetType: "weekly", weeklyBudget: "100", startDate: "2026-07-01", endDate: "2026-07-01" }),
      ),
    ).toBeNull();
  });
});

describe("projectIssues", () => {
  const keys = (overrides: Partial<Draft>) => projectIssues(draft(overrides)).map((issue) => issue.key);

  it("passes a complete draft", () => {
    expect(projectIssues(draft())).toEqual([]);
  });

  it("requires a client, a 3+ character name and a code", () => {
    expect(keys({ client: null, name: "ab", code: " " })).toEqual(["client", "name", "code"]);
  });

  it("allows only letters, numbers and dashes in the code", () => {
    expect(projectIssues(draft({ code: "PRO 7" }))).toEqual([
      { key: "code", message: "Only letters, numbers and dashes allowed" },
    ]);
  });

  it("requires both dates and an end on or after the start", () => {
    expect(keys({ startDate: "", endDate: "" })).toEqual(["startDate", "endDate"]);
    expect(projectIssues(draft({ startDate: "2026-07-02", endDate: "2026-07-01" }))).toEqual([
      { key: "endDate", message: "End date cannot be before start date" },
    ]);
  });

  it("caps the description at 500 characters", () => {
    expect(keys({ description: "x".repeat(501) })).toEqual(["description"]);
  });

  it("requires a positive amount for the chosen budget type, only while budget is on", () => {
    expect(keys({ totalBudget: "0" })).toEqual(["totalBudget"]);
    expect(keys({ budgetType: "weekly", weeklyBudget: "" })).toEqual(["weeklyBudget"]);
    expect(keys({ budgetType: "monthly", monthlyBudget: "-5" })).toEqual(["monthlyBudget"]);
    expect(keys({ budgetEnabled: false, totalBudget: "" })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Payloads
 * ------------------------------------------------------------------ */

describe("createProjectPayload", () => {
  it("sends the create endpoint's field names", () => {
    expect(createProjectPayload(draft({ description: "Phase one" }))).toEqual({
      name: "Website rebuild",
      client_id: "12",
      contact_id: "34",
      project_code: "PRO-7",
      start_date: "2026-10-13",
      end_date: "2027-06-30",
      is_budget: true,
      show_total_budget: true,
      show_weekly_budget: false,
      show_monthly_budget: false,
      weekly_budget: "",
      monthly_budget: "",
      is_task_based: true,
      is_fixed: false,
      budget_type: "total",
      budget: "1000",
      description: "Phase one",
      project_status: "draft",
    });
  });

  it("drops a missing contact rather than sending an empty id", () => {
    const payload = createProjectPayload(
      draft({ client: { clientId: "12", contactId: null, name: "x", email: "" } }),
    );
    expect(payload).not.toHaveProperty("contact_id");
    expect(payload.client_id).toBe("12");
  });

  it("sends the weekly budget's projected total as the overall budget", () => {
    const payload = createProjectPayload(
      draft({ budgetType: "weekly", weeklyBudget: "100", startDate: "2026-07-01", endDate: "2026-08-01" }),
    );
    expect(payload).toMatchObject({
      budget_type: "weekly",
      show_weekly_budget: true,
      weekly_budget: "100",
      budget: "500.00",
    });
  });

  it("sends a zero budget when budget tracking is off", () => {
    expect(createProjectPayload(draft({ budgetEnabled: false }))).toMatchObject({
      is_budget: false,
      budget: "0",
      weekly_budget: "",
      monthly_budget: "",
    });
  });

  it("marks a fixed project as not task based", () => {
    expect(createProjectPayload(draft({ taskBased: false }))).toMatchObject({
      is_task_based: false,
      is_fixed: true,
    });
  });
});

describe("updateProjectPayload", () => {
  it("uses the update endpoint's names: project_name, total_budget, project_description", () => {
    const payload = updateProjectPayload(draft({ description: "Notes" }));
    expect(payload).toMatchObject({
      project_name: "Website rebuild",
      project_status: "draft",
      total_budget: "1000",
      project_description: "Notes",
      client_id: "12",
      contact_id: "34",
    });
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("budget");
    expect(payload).not.toHaveProperty("project_code");
  });
});

/* ------------------------------------------------------------------ *
 * Writes — every one encrypted
 * ------------------------------------------------------------------ */

describe("createProjectApi", () => {
  it("posts the payload encrypted and returns the new id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 88 } } });
    const payload = createProjectPayload(draft());
    const result = await createProjectApi(payload);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.create);
    // Booleans travel as strings and the rest as sent — what decryptPayload hands the controller.
    expect(decryptBody(body)).toMatchObject({
      name: "Website rebuild",
      client_id: "12",
      is_budget: "true",
      is_fixed: "false",
      budget: "1000",
    });
    expect(result).toEqual({ id: "88" });
  });

  it("throws the server's message on success:false", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Required data missing" } });
    await expect(createProjectApi({})).rejects.toThrow("Required data missing");
  });
});

describe("updateProjectApi", () => {
  it("puts the payload encrypted to /project/:id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await updateProjectApi("77", updateProjectPayload(draft()));
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.projects.update}/77`);
    expect(decryptBody(body)).toMatchObject({ project_name: "Website rebuild", total_budget: "1000" });
  });

  it("throws on success:false", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false, message: "Project not found" } });
    await expect(updateProjectApi("1", {})).rejects.toThrow("Project not found");
  });
});

describe("deleteProjectApi", () => {
  it("deletes /project/:id", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteProjectApi("77");
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.projects.delete}/77`);
  });

  it("throws on success:false", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: false } });
    await expect(deleteProjectApi("77")).rejects.toThrow("Failed to delete project");
  });
});

describe("next codes", () => {
  it("reads the next project and job code", async () => {
    apiMock.get
      .mockResolvedValueOnce({ data: { data: { code: "PRO-8" } } })
      .mockResolvedValueOnce({ data: { data: { code: "JOB-15" } } });
    expect(await fetchNextProjectCode()).toBe("PRO-8");
    expect(await fetchNextJobCode()).toBe("JOB-15");
    expect(apiMock.get.mock.calls.map((call) => call[0])).toEqual([
      apiRoutes.projects.nextProjectCode,
      apiRoutes.projects.nextJobCode,
    ]);
  });

  it("is empty when the server sends no code", async () => {
    apiMock.get.mockResolvedValue({ data: {} });
    expect(await fetchNextProjectCode()).toBe("");
  });
});

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

describe("mapProjectSettings", () => {
  it("returns the defaults when there's no record yet", () => {
    expect(mapProjectSettings(null)).toEqual(DEFAULT_PROJECT_SETTINGS);
  });

  it("maps the stored record", () => {
    expect(
      mapProjectSettings({
        default_hourly_rate: "50.00",
        project_prefix: "PR",
        project_next_number: 7,
        job_prefix: "JC",
        job_next_number: 15,
        default_budget_enabled: 0,
        show_total_budget: 1,
        default_total_budget: "1000.00",
      }),
    ).toMatchObject({
      defaultHourlyRate: "50.00",
      projectPrefix: "PR",
      projectNextNumber: "7",
      jobPrefix: "JC",
      jobNextNumber: "15",
      defaultBudgetEnabled: false,
      showTotalBudget: true,
      defaultTotalBudget: "1000.00",
    });
  });

  it("infers a budget flag from its amount when the flag itself is missing", () => {
    const settings = mapProjectSettings({ default_weekly_budget: 250, default_monthly_budget: 0 });
    expect(settings.showWeeklyBudget).toBe(true);
    expect(settings.showMonthlyBudget).toBe(false);
  });
});

describe("fetchProjectSettings", () => {
  it("reads the settings record", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { project_prefix: "AB" } } });
    expect((await fetchProjectSettings()).projectPrefix).toBe("AB");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.settings);
  });

  it("falls back to the defaults when the server says no", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchProjectSettings()).toEqual(DEFAULT_PROJECT_SETTINGS);
  });
});

describe("projectSettingsIssues", () => {
  const keys = (overrides: Partial<typeof DEFAULT_PROJECT_SETTINGS>) =>
    projectSettingsIssues({ ...DEFAULT_PROJECT_SETTINGS, ...overrides }).map((issue) => issue.key);

  it("passes the defaults", () => {
    expect(keys({})).toEqual([]);
  });

  it("wants letter-only prefixes of up to 10 characters", () => {
    expect(keys({ projectPrefix: "", jobPrefix: "JOB1" })).toEqual(["projectPrefix", "jobPrefix"]);
    expect(keys({ projectPrefix: "ABCDEFGHIJK" })).toEqual(["projectPrefix"]);
  });

  it("wants whole next numbers of at least 1", () => {
    expect(keys({ projectNextNumber: "0", jobNextNumber: "1.5" })).toEqual([
      "projectNextNumber",
      "jobNextNumber",
    ]);
    expect(keys({ projectNextNumber: "" })).toEqual(["projectNextNumber"]);
  });

  it("rejects a negative hourly rate", () => {
    expect(keys({ defaultHourlyRate: "-1" })).toEqual(["defaultHourlyRate"]);
  });
});

describe("projectSettingsPayload", () => {
  it("sends only the ticked budget's amount, and numbers as numbers", () => {
    expect(
      projectSettingsPayload({
        ...DEFAULT_PROJECT_SETTINGS,
        defaultHourlyRate: "50",
        projectNextNumber: "7",
        showWeeklyBudget: true,
        defaultWeeklyBudget: "250",
        defaultTotalBudget: "999",
      }),
    ).toEqual({
      default_hourly_rate: 50,
      default_km_rate: null,
      project_prefix: "PRO",
      project_next_number: 7,
      job_prefix: "JOB",
      job_next_number: 1,
      default_budget_enabled: true,
      show_total_budget: false,
      show_weekly_budget: true,
      show_monthly_budget: false,
      default_total_budget: null,
      default_weekly_budget: 250,
      default_monthly_budget: null,
    });
  });

  it("clears every amount when budgets are off by default", () => {
    const payload = projectSettingsPayload({
      ...DEFAULT_PROJECT_SETTINGS,
      defaultBudgetEnabled: false,
      showTotalBudget: true,
      defaultTotalBudget: "1000",
    });
    expect(payload.default_total_budget).toBeNull();
  });
});

describe("saveProjectSettingsApi", () => {
  it("posts the settings encrypted — nulls arrive as empty strings, as sole-webapp sent them", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { project_prefix: "PR" } } });
    const saved = await saveProjectSettingsApi({ ...DEFAULT_PROJECT_SETTINGS, projectPrefix: "PR" });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.projects.settings);
    expect(decryptBody(body)).toMatchObject({
      project_prefix: "PR",
      default_budget_enabled: "true",
      default_hourly_rate: "",
    });
    expect(saved.projectPrefix).toBe("PR");
  });

  it("returns what was sent when the server answers without a record", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const settings = { ...DEFAULT_PROJECT_SETTINGS, jobPrefix: "JC" };
    expect(await saveProjectSettingsApi(settings)).toEqual(settings);
  });

  it("throws on success:false", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(saveProjectSettingsApi(DEFAULT_PROJECT_SETTINGS)).rejects.toThrow("Nope");
  });
});
