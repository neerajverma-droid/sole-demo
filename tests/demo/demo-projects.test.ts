/* eslint-disable @typescript-eslint/no-explicit-any -- drives the loosely typed mock API, like the other demo tests */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mapProject, mapProjectListItem, toProjectStatus } from "@/lib/projects";
import { buildStory } from "@/lib/demo-seed/build-story";
import { generateSeedData } from "@/lib/demo-seed/generator";
import { INDUSTRY_CATALOG } from "@/lib/demo-seed/industries/catalog";
import { getSeedData, handleMockRequest, resetSeedData } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";

type Country = "AU" | "NZ";

const login = (industry = "plumbing", country: Country = "AU") =>
  handleMockRequest("POST", "/demo/login", {}, { industry, country });
const get = (path: string, params: Record<string, any> = {}) => handleMockRequest("GET", path, params)!;
const send = (method: string, path: string, body: Record<string, any> = {}) =>
  handleMockRequest(method, path, {}, body)!;
const listAll = () => get("/project", { page: 1, limit: 100 }).data;

beforeEach(() => {
  endDemoSession();
  __resetSessionForTests();
  login();
});
afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
  delete (globalThis as any).window;
});

describe("projects list", () => {
  it("maps through the app's own mapper into a mix of draft, in progress and closed", () => {
    const body = listAll();
    expect(body.success).toBe(true);
    const items = body.data.map(mapProjectListItem);
    expect(items).toHaveLength(10);
    expect(items.filter((p: any) => p.status === "inprogress")).toHaveLength(5);
    expect(items.filter((p: any) => p.status === "closed")).toHaveLength(3);
    expect(items.filter((p: any) => p.status === "draft")).toHaveLength(2);
    expect(body.meta).toMatchObject({ all: 10, draft: 2, inprogress: 5, closed: 3 });
    expect(body.pagination.totalRecords).toBe(10);

    for (const row of body.data) {
      expect(["draft", "inprogress", "closed"]).toContain(row.project_status);
      expect(toProjectStatus(row.project_status)).toBe(row.project_status);
    }
    for (const p of items) {
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.clientName).not.toBe("");
      expect(p.budget).toBeGreaterThan(0);
      expect(p.startDate).toMatch(/^\d{2}-\d{2}-\d{4}$/);
      expect(p.endDate).toMatch(/^\d{2}-\d{2}-\d{4}$/);
      expect(p.jobsCount).toBeGreaterThanOrEqual(2);
      expect(p.jobsCount).toBeLessThanOrEqual(4);
      expect(p.jobNames.length).toBeLessThanOrEqual(2);
      expect(p.code).toMatch(/^PRO-\d+$/);
    }
  });

  it("keeps the story's four projects at the same ids, names and codes", () => {
    const seed = getSeedData();
    const byId = new Map(seed.projectRecords.projects.map((r) => [String(r.id), r]));
    const served = new Map(listAll().data.map((r: any) => [String(r.id), r]));
    for (const legacy of seed.projects) {
      expect(byId.get(legacy.id)?.project_name).toBe(legacy.name);
      expect((served.get(legacy.id) as any).project_code).toBe(legacy.code);
    }
  });

  it("filters by status, searches by name or code, and pages", () => {
    expect(get("/project", { status: "closed", limit: 100 }).data.data).toHaveLength(3);
    expect(get("/project", { status: "draft", limit: 100 }).data.pagination.totalRecords).toBe(2);
    // Counts stay whole while a filter is on.
    expect(get("/project", { status: "closed" }).data.meta.all).toBe(10);

    expect(get("/project", { search: "PRO-7" }).data.data.map((r: any) => r.project_code)).toEqual(["PRO-7"]);
    const firstName: string = listAll().data[0].project_name;
    expect(get("/project", { search: firstName.slice(0, 6).toUpperCase() }).data.data.length).toBeGreaterThan(0);
    expect(get("/project", { search: "zzz-nothing" }).data.data).toHaveLength(0);

    const page1 = get("/project", { page: 1, limit: 4 }).data;
    const page3 = get("/project", { page: 3, limit: 4 }).data;
    expect(page1.data).toHaveLength(4);
    expect(page3.data).toHaveLength(2);
    expect(page1.pagination.totalPages).toBe(3);
  });

  it("has exactly one in-progress project past its end date, and closed ones near their budget", () => {
    const rows = listAll().data;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = rows.filter((r: any) => {
      const [d, m, y] = r.end_date.split("-");
      return r.project_status === "inprogress" && `${y}-${m}-${d}` < today;
    });
    expect(overdue).toHaveLength(1);

    for (const r of rows.filter((x: any) => x.project_status === "closed")) {
      const ratio = r.used_budget / r.budget;
      expect(ratio).toBeGreaterThanOrEqual(0.85);
      expect(ratio).toBeLessThanOrEqual(1.0);
    }
    for (const r of rows.filter((x: any) => x.project_status === "draft")) expect(r.used_budget).toBe(0);
    // Finished work was billed and paid: closed projects end in profit.
    for (const r of rows.filter((x: any) => x.project_status === "closed")) {
      const f = get(`/project/stats/${r.id}/financial-metrics`).data.data;
      expect(f.paidValue + f.invoicedValue, r.project_code).toBeGreaterThan(0);
      expect(f.isActualLoss, r.project_code).toBe(false);
    }
  });
});

describe("project detail", () => {
  it("returns the detail shape with ISO dates", () => {
    const res = get("/project/1");
    expect(res.status).toBe(200);
    const project = mapProject(res.data.data);
    expect(project.id).toBe("1");
    expect(project.clientId).not.toBeNull();
    expect(project.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(project.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(project.isBudget).toBe(true);
    expect(project.budgetType).toBe("total");
    expect(project.remainingBudget).toBeCloseTo(project.budget - project.usedBudget, 2);
  });

  it("answers an unknown id with a 404 instead of the first project", () => {
    for (const path of ["/project/9999", "/project/stats/9999/summary", "/v2/expense/project/9999"]) {
      const res = get(path);
      expect(res.status).toBe(404);
      expect(res.data.success).toBe(false);
    }
  });
});

describe("overview stats", () => {
  const PERIODS = ["Today", "This Week", "This Month", "This Quarter", "This Year"];
  const hm = (v: any) => {
    expect(typeof v.hours).toBe("number");
    expect(typeof v.minutes).toBe("number");
  };

  it("every endpoint returns the keys the overview mappers read", () => {
    for (const period of PERIODS) {
      const summary = get("/project/stats/1/summary", { period }).data.data;
      hm(summary.totalTracked);
      hm(summary.billableHours);
      hm(summary.nonBillableHours);
      for (const key of ["billableAmount", "totalTasks", "completedTasks", "remainingTasks", "progress"]) {
        expect(typeof summary[key]).toBe("number");
      }
      expect(summary.totalTasks).toBe(summary.completedTasks + summary.remainingTasks);

      const chart = get("/project/stats/1/time-chart", { period }).data.data;
      expect(chart.labels.length).toBeGreaterThan(0);
      expect(chart.billable).toHaveLength(chart.labels.length);
      expect(chart.nonBillable).toHaveLength(chart.labels.length);

      const split = get("/project/stats/1/billable-breakdown", { period }).data.data;
      for (const key of ["percentage", "totalHours", "totalMinutes"]) expect(typeof split[key]).toBe("number");

      const status = get("/project/stats/1/task-status", { period }).data.data;
      for (const key of ["active", "inactive", "completed"]) expect(typeof status[key]).toBe("number");

      const overdue = get("/project/stats/1/overdue", { period }).data.data;
      expect(typeof overdue.isOverdue).toBe("boolean");
      expect(typeof overdue.daysOverdue).toBe("number");
    }
  });

  it("an in-progress project has tracked time this month and a wider period never shows less", () => {
    const week = get("/project/stats/1/summary", { period: "This Week" }).data.data;
    const month = get("/project/stats/1/summary", { period: "This Month" }).data.data;
    const year = get("/project/stats/1/summary", { period: "This Year" }).data.data;
    const mins = (s: any) => s.totalTracked.hours * 60 + s.totalTracked.minutes;
    expect(mins(year)).toBeGreaterThan(0);
    expect(mins(year)).toBeGreaterThanOrEqual(mins(month));
    expect(mins(month)).toBeGreaterThanOrEqual(mins(week));
    expect(mins(get("/project/stats/1/summary", { period: "This Quarter" }).data.data)).toBeGreaterThanOrEqual(mins(month));
  });

  it("the overdue project reports itself", () => {
    const flagged = listAll().data.filter((r: any) => get(`/project/stats/${r.id}/overdue`).data.data.isOverdue);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].project_status).toBe("inprogress");
    const overdue = get(`/project/stats/${flagged[0].id}/overdue`).data.data;
    expect(overdue.daysOverdue).toBeGreaterThan(0);
    expect(overdue.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("financial metrics carry every key and agree with the project's budget", () => {
    const KEYS = [
      "totalBudget", "remainingBudget", "remainingBudgetPercent", "actualProfitLoss", "expectedProfit",
      "paidValue", "invoicedValue", "committedValue", "futureWorkValue", "uncommittedValue", "forecastIncome",
      "forecastCost", "totalCostIncurred", "remainingCashToCollect", "totalRecognisedRevenue", "totalExpenses",
      "invoicedExpenses", "uninvoicedExpenses", "expenseMarginPercent", "totalTaskValue", "totalTasks",
      "completedTasks", "invoicedTasks", "totalLabourCost", "totalTrackedHours",
    ];
    for (const row of listAll().data) {
      const f = get(`/project/stats/${row.id}/financial-metrics`).data.data;
      for (const key of KEYS) expect(typeof f[key], `${row.project_code} ${key}`).toBe("number");
      expect(typeof f.isActualLoss).toBe("boolean");
      expect(typeof f.isForecastLoss).toBe("boolean");
      expect(f.costBreakdown.labourCost).toBe(f.totalLabourCost);
      expect(f.totalBudget).toBe(row.budget);
      // Used = linked expenses + labour; what's left is the budget less that.
      expect(row.used_budget).toBeCloseTo(f.totalExpenses + f.totalLabourCost, 1);
      expect(row.remaining_budget).toBeCloseTo(row.budget - row.used_budget, 1);
      // What has been billed never outgrows the budget.
      expect(f.paidValue + f.invoicedValue).toBeLessThanOrEqual(f.totalBudget);
      expect(f.remainingBudget).toBeGreaterThanOrEqual(0);
      expect(f.invoicedExpenses + f.uninvoicedExpenses).toBeCloseTo(f.totalExpenses, 1);
    }
  });
});

describe("jobs, tasks and time", () => {
  it("lists a project's jobs and tasks in the shapes the Jobs tab reads", () => {
    for (const row of listAll().data) {
      const jobs = get("/project-job", { project_id: row.id, page: 1, limit: 100 }).data;
      expect(jobs.data).toHaveLength(row.jobs_count);
      expect(jobs.pagination.totalPages).toBe(1);
      for (const j of jobs.data) {
        expect(j.job_name).toBeTruthy();
        expect(j.job_code).toBeTruthy();
        expect(typeof j.is_budget).toBe("boolean");
        expect(typeof j.used_budget).toBe("number");
      }
      const picker = get(`/project-job/project/${row.id}`, { page: 1, limit: 100 }).data.data;
      expect(picker.map((j: any) => j.id).sort()).toEqual(jobs.data.map((j: any) => j.id).sort());

      const tasks = get("/tasks", { project_id: row.id, page: 1, limit: 100 }).data.data;
      expect(tasks.length).toBeGreaterThanOrEqual(3);
      expect(tasks.length).toBeLessThanOrEqual(6);
      for (const t of tasks) {
        expect(["hourly", "fixed", "per_km"]).toContain(t.charge_type);
        expect(["active", "inactive", "completed"]).toContain(t.status);
        expect(jobs.data.map((j: any) => j.id)).toContain(t.project_job_id);
        expect(typeof t.totalDurationMinutes).toBe("number");
      }
    }
  });

  it("mixes charge types and statuses on in-progress work, and lists time entries by project and job", () => {
    const tasks = get("/tasks", { project_id: 1, limit: 100 }).data.data;
    expect(new Set(tasks.map((t: any) => t.charge_type)).size).toBeGreaterThan(1);
    expect(new Set(tasks.map((t: any) => t.status)).size).toBeGreaterThan(1);
    expect(tasks.some((t: any) => t.is_billable)).toBe(true);

    const entries = get("/time-tracking", { project_id: 1, limit: 1000 }).data.data;
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.every((e: any) => String(e.project_id) === "1")).toBe(true);
    const minutes = entries.reduce((s: number, e: any) => s + e.duration_minutes, 0);
    expect(minutes).toBe(tasks.reduce((s: number, t: any) => s + t.totalDurationMinutes, 0));

    const jobId = entries[0].project_job_id;
    const forJob = get("/time-tracking", { project_id: 1, project_job_id: jobId, limit: 1000 }).data.data;
    expect(forJob.length).toBeGreaterThan(0);
    expect(forJob.every((e: any) => e.project_job_id === jobId)).toBe(true);
    expect(entries[0]).toMatchObject({ log_date: expect.any(String), hours_logged: expect.any(Number) });
  });

  it("leaves the generic time tracker alone when no project is asked for", () => {
    const res = get("/time-tracking", {});
    expect(res.data.success).toBe(true);
    expect(res.data.data.some((e: any) => e.id === "tt-1")).toBe(true);
  });
});

describe("invoices and expenses on a project", () => {
  it("invoiceList returns the project's own invoices", () => {
    const seed = getSeedData();
    let withInvoices = 0;
    for (const row of listAll().data) {
      const res = get("/project/invoiceList", { project_id: row.id, page: 1, limit: 100 }).data.data;
      const expected = (seed.invoices as any[]).filter((i) => String(i.project_id) === String(row.id));
      expect(res.invoices).toHaveLength(expected.length);
      expect(res.pagination.totalItems).toBe(expected.length);
      for (const inv of res.invoices) {
        expect(String(inv.project_id)).toBe(String(row.id));
        expect(["draft", "sent", "paid", "partially_paid"]).toContain(inv.mark_as);
        expect(inv.client.name).toBeTruthy();
        expect(Array.isArray(inv.invoiceItem)).toBe(true);
      }
      if (row.project_status === "draft") expect(res.invoices).toHaveLength(0);
      if (expected.length) withInvoices += 1;
    }
    expect(withInvoices).toBeGreaterThanOrEqual(5);
  });

  it("expenses list sums, with labour, to used_budget", () => {
    for (const row of listAll().data) {
      const res = get(`/v2/expense/project/${row.id}`, { page: 1, limit: 1000 }).data;
      expect(res.meta.total).toBe(res.data.length);
      const sum = res.data.reduce((s: number, e: any) => s + Number(e.price), 0);
      const f = get(`/project/stats/${row.id}/financial-metrics`).data.data;
      expect(sum).toBeCloseTo(f.totalExpenses, 1);
      expect(sum + f.totalLabourCost).toBeCloseTo(row.used_budget, 1);
      for (const e of res.data) {
        expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(e.client.name).toBeTruthy();
        if (e.is_invoiced) expect(e.invoice.invoice_no).toBeTruthy();
        if (e.project_job_id) expect(e.projectJob.job_name).toBeTruthy();
      }
    }
  });

  it("offers unassigned expenses and attaches them to a project", () => {
    const before = get("/v2/expense", { mode: "project", page: 1, limit: 1000 }).data;
    expect(before.data.length).toBeGreaterThan(0);
    expect(before.meta.total).toBe(before.data.length);
    const pick = before.data[0];
    const jobId = get("/project-job", { project_id: 2, limit: 100 }).data.data[0].id;

    const res = send("PATCH", "/v2/expense/add-to-project", { projectId: "2", expenseIds: [pick.id], projectJobId: String(jobId) });
    expect(res.data.success).toBe(true);
    const after = get("/v2/expense", { mode: "project", page: 1, limit: 1000 }).data;
    expect(after.meta.total).toBe(before.meta.total - 1);
    const onProject = get("/v2/expense/project/2", { limit: 1000 }).data.data.find((e: any) => e.id === pick.id);
    expect(onProject.project_job_id).toBe(jobId);
    // The generic expense list is untouched by the link.
    expect(get("/v2/expense", {}).data.success).toBe(true);
  });

  it("an expense created from the project tab lands on that project", () => {
    const before = get("/v2/expense/project/1", { limit: 1000 }).data.meta.total;
    const created = send("POST", "/v2/expense", { name: "Site skip bin", price: 240, date: "2026-11-01", project_id: "1" });
    expect(created.data.success).toBe(true);
    const after = get("/v2/expense/project/1", { limit: 1000 }).data;
    expect(after.meta.total).toBe(before + 1);
    expect(after.data.some((e: any) => e.name === "Site skip bin")).toBe(true);
  });
});

describe("project settings", () => {
  it("serves the settings record and the next codes", () => {
    const settings = get("/project/settings").data.data;
    expect(settings.project_prefix).toBe("PRO");
    expect(settings.default_hourly_rate).toBeGreaterThan(0);
    expect(get("/project/settings/init").data.success).toBe(true);
    expect(get("/project/settings/next-project-code").data.data.code).toBe("PRO-11");
    expect(get("/project/settings/next-job-code").data.data.code).toMatch(/^JOB-\d+$/);

    send("POST", "/project/settings", { project_prefix: "JOBX", project_next_number: 40, job_prefix: "JOB", job_next_number: 7 });
    expect(get("/project/settings/next-project-code").data.data.code).toBe("JOBX-40");
    expect(get("/project/settings/next-job-code").data.data.code).toBe("JOB-7");
  });

  it("answers the client and draft lookups", () => {
    const p = listAll().data[0];
    expect(get(`/project/client/${p.client_id}`).data.data.some((r: any) => r.id === p.id)).toBe(true);
    expect(get("/project/draft-invoice-list", { project_id: p.id }).data.success).toBe(true);
    const pair = get("/tasks/by-client", { client_id: p.client_id }).data.data;
    expect(pair.projects.some((r: any) => r.project_name === p.project_name)).toBe(true);
  });
});

describe("writes persist and survive a reload", () => {
  it("creates, updates and deletes projects, jobs, tasks and time", () => {
    (globalThis as any).window = { name: "" };
    login("plumbing", "AU");
    const client = getSeedData().clients[2];

    const created = send("POST", "/project", {
      name: "Rooftop solar retrofit",
      client_id: client.id,
      contact_id: client.contactId,
      project_code: "PRO-11",
      start_date: "2026-11-02",
      end_date: "2027-02-27",
      project_status: "inprogress",
      is_budget: "true",
      budget: "12500",
      description: "New array and inverter",
    });
    expect(created.data.success).toBe(true);
    const id = String(created.data.data.id);
    expect(id).toBe("11");
    expect(send("POST", "/project", { name: "Dupe code", client_id: client.id, project_code: "PRO-11" }).data.success).toBe(false);

    send("PUT", `/project/${id}`, { project_name: "Rooftop solar retrofit v2", project_status: "closed", total_budget: "13000" });
    const detail = mapProject(get(`/project/${id}`).data.data);
    expect(detail).toMatchObject({ name: "Rooftop solar retrofit v2", status: "closed", budget: 13000, usedBudget: 0 });

    const job = send("POST", "/project-job", { project_id: id, job_name: "Design", job_code: "JOB-1", is_budget: "true", budget: "2000" });
    expect(job.data.success).toBe(true);
    const task = send("POST", "/tasks", { project_id: id, project_job_id: job.data.data.id, task_name: "Roof survey", charge_type: "hourly", rate: 120, is_billable: "true" });
    expect(task.data.success).toBe(true);
    send("PUT", `/tasks/${task.data.data.id}`, { status: "completed", hourly_rate: 135 });

    const mapped = get("/tasks", { project_id: id }).data.data[0];
    expect(mapped).toMatchObject({ task_name: "Roof survey", status: "completed", rate: 135 });
    expect(get("/project", { limit: 100 }).data.meta).toMatchObject({ all: 11, closed: 4 });

    // "Reload": memory is lost, the tab keeps its name (and with it the session and its writes).
    __resetSessionForTests();
    resetSeedData();

    const again = get(`/project/${id}`).data.data;
    expect(again.project_name).toBe("Rooftop solar retrofit v2");
    expect(again.project_status).toBe("closed");
    expect(get("/project-job", { project_id: id }).data.data.map((j: any) => j.job_name)).toEqual(["Design"]);
    expect(get("/tasks", { project_id: id }).data.data[0].status).toBe("completed");
    expect(get("/project", { limit: 100 }).data.meta.all).toBe(11);

    send("DELETE", `/tasks/${get("/tasks", { project_id: id }).data.data[0].id}`);
    send("DELETE", `/project-job/${get("/project-job", { project_id: id }).data.data[0].id}`);
    expect(get("/tasks", { project_id: id }).data.data).toHaveLength(0);
    expect(get("/project-job", { project_id: id }).data.data).toHaveLength(0);
    send("DELETE", `/project/${id}`);
    expect(get(`/project/${id}`).status).toBe(404);
    expect(get("/project", { limit: 100 }).data.meta.all).toBe(10);

    __resetSessionForTests();
    resetSeedData();
    expect(get(`/project/${id}`).status).toBe(404);
    expect(get("/project", { limit: 100 }).data.meta.all).toBe(10);
  });

  it("deleting a project frees its invoices and expenses", () => {
    const withInvoices = listAll().data.find(
      (r: any) => get("/project/invoiceList", { project_id: r.id, limit: 100 }).data.data.invoices.length > 0,
    );
    const unassignedBefore = get("/v2/expense", { mode: "project", limit: 1000 }).data.meta.total;
    const linked = get(`/v2/expense/project/${withInvoices.id}`, { limit: 1000 }).data.meta.total;
    send("DELETE", `/project/${withInvoices.id}`);
    expect(get("/v2/expense", { mode: "project", limit: 1000 }).data.meta.total).toBe(unassignedBefore + linked);
    const seed = getSeedData();
    expect((seed.invoices as any[]).some((i) => String(i.project_id) === String(withInvoices.id))).toBe(false);
  });

  it("starts and stops a timer on a project task and logs it", () => {
    const task = get("/tasks", { project_id: 1, limit: 100 }).data.data.find((t: any) => t.status === "active");
    const before = get("/time-tracking", { project_id: 1, limit: 1000 }).data.data.length;
    const started = send("POST", "/time-tracking/start", { project_id: "1", task_id: String(task.id), description: "Working" });
    expect(started.data.success).toBe(true);
    expect(get("/time-tracking/active").data.data.id).toBe(started.data.data.id);
    const stopped = send("PUT", `/time-tracking/${started.data.data.id}/stop`, {});
    expect(stopped.data.success).toBe(true);
    expect(get("/time-tracking/active").data.data).toBeNull();
    const rows = get("/time-tracking", { project_id: 1, limit: 1000 }).data.data;
    expect(rows).toHaveLength(before + 1);

    const gone = send("DELETE", `/time-tracking/${started.data.data.id}`);
    expect(gone.data.success).toBe(true);
    expect(get("/time-tracking", { project_id: 1, limit: 1000 }).data.data).toHaveLength(before);
  });
});

describe("every industry and country has a coherent projects module", () => {
  for (const entry of INDUSTRY_CATALOG) {
    for (const country of ["AU", "NZ"] as const) {
      it(`${entry.slug} / ${country}`, () => {
        const seed = generateSeedData(buildStory(entry.slug, country));
        const rec = seed.projectRecords;
        expect(rec.projects).toHaveLength(10);
        expect(rec.projects.map((p) => p.project_status).sort()).toEqual(
          ["closed", "closed", "closed", "draft", "draft", "inprogress", "inprogress", "inprogress", "inprogress", "inprogress"],
        );
        expect(new Set(rec.projects.map((p) => p.project_code)).size).toBe(10);
        expect(new Set(rec.projects.map((p) => p.project_name)).size).toBe(10);
        // The story's own four are still there under the same ids.
        seed.projects.forEach((legacy, i) => expect(rec.projects[i].project_name).toBe(legacy.name));

        for (const p of rec.projects) {
          const jobs = rec.jobs.filter((j) => j.project_id === p.id);
          const tasks = rec.tasks.filter((t) => t.project_id === p.id);
          expect(jobs.length).toBeGreaterThanOrEqual(2);
          expect(jobs.length).toBeLessThanOrEqual(4);
          expect(tasks.length).toBeGreaterThanOrEqual(3);
          expect(tasks.length).toBeLessThanOrEqual(6);
          expect(p.budget).toBeGreaterThan(0);
          expect(p.end_date >= p.start_date).toBe(true);
          for (const t of tasks) expect(jobs.map((j) => j.id)).toContain(t.project_job_id);
        }
        // Linked rows point at real projects and jobs.
        const ids = new Set(rec.projects.map((p) => p.id));
        for (const inv of seed.invoices as any[]) if (inv.project_id) expect(ids.has(inv.project_id)).toBe(true);
        for (const exp of seed.expenses as any[]) {
          if (!exp.project_id) continue;
          expect(ids.has(exp.project_id)).toBe(true);
          if (exp.project_job_id) {
            expect(rec.jobs.find((j) => j.id === exp.project_job_id)?.project_id).toBe(exp.project_id);
          }
        }
        expect((seed.invoices as any[]).filter((i) => i.project_id).length).toBeGreaterThan(3);
        expect((seed.expenses as any[]).filter((e) => e.project_id).length).toBeGreaterThan(2);
      });
    }
  }

  it("serves the list and stats through the mock for a few of them", () => {
    for (const [industry, country] of [["hairdressers", "NZ"], ["cleaning", "AU"], ["hospitality", "NZ"]] as const) {
      login(industry, country);
      const body = listAll();
      expect(body.data).toHaveLength(10);
      for (const row of body.data) {
        expect(["draft", "inprogress", "closed"]).toContain(row.project_status);
        expect(get(`/project/stats/${row.id}/financial-metrics`).data.success).toBe(true);
        expect(get(`/project/stats/${row.id}/summary`, { period: "This Month" }).data.success).toBe(true);
      }
    }
  });
});
