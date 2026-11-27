/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like mock-server.ts */
import { applyOverlayWrite } from "../overlay";
import type { JobRow, ProjectRecords, ProjectRow, TaskRow, TimeEntryRow } from "../projects-data";
import type { DemoHandler, HandlerCtx, HandlerResponse } from "./types";

/*
 * The Projects module: list, detail, the six Overview stats, jobs, tasks, time entries, the
 * project's invoices and expenses, settings, and every write behind them.
 *
 * Reads are computed from the records built in projects-data.ts and from the linked rows on
 * seed.invoices / seed.expenses (`project_id`), so what one screen shows always agrees with the
 * others and with edits made during the visit. Writes mutate those arrays in place, which is what
 * lets the session replay them onto fresh books after a reload.
 *
 * Shapes follow sole-ocr (services/project.js, models/invoices.js, models/expenses.js) and what
 * lib/projects.ts, lib/project-*.ts read.
 */

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const ok = (data: any, extra: Record<string, unknown> = {}): HandlerResponse => ({
  status: 200,
  data: { success: true, ...extra, data },
});
const fail = (status: number, message: string): HandlerResponse => ({
  status,
  data: { success: false, message, data: null },
});
const notFound = (what = "Project") => fail(404, `${what} not found`);

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const text = (value: unknown, fallback = ""): string => (value === undefined || value === null ? fallback : String(value).trim());
const flag = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const v = String(value).trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0" || v === "") return false;
  return fallback;
};
const optId = (value: unknown): number | null => {
  const n = num(value, 0);
  return n > 0 ? n : null;
};
const sameId = (a: unknown, b: unknown) => String(a) === String(b);
const nextId = (rows: { id: number }[], floor = 0) => rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), floor) + 1;

const listDate = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "");

function isoAdd(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);

/** A pre-formatted `YYYY-MM-DD` from whatever the date picker or API sent (DD-MM-YYYY too). */
function isoDay(value: unknown, fallback: string): string {
  const v = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) return `${v.slice(6, 10)}-${v.slice(3, 5)}-${v.slice(0, 2)}`;
  return fallback;
}

function paginate<T>(rows: T[], params: Record<string, any>, defaultLimit = 10) {
  const limit = Math.max(1, Math.min(num(params.limit ?? params.page_size, defaultLimit) || defaultLimit, 1000));
  const totalRecords = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
  const page = Math.max(1, Math.min(num(params.page, 1) || 1, totalPages));
  return {
    rows: rows.slice((page - 1) * limit, page * limit),
    pagination: {
      totalRecords,
      totalPages,
      currentPage: page,
      perPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

const records = (ctx: HandlerCtx): ProjectRecords => ctx.seed.projectRecords;
const findProject = (rec: ProjectRecords, id: unknown) => rec.projects.find((p) => sameId(p.id, id));

/* ------------------------------------------------------------------ *
 * Derived numbers
 * ------------------------------------------------------------------ */

const invoicesOf = (ctx: HandlerCtx, projectId: number): any[] =>
  (ctx.seed.invoices as any[]).filter((inv) => sameId(inv.project_id, projectId));
const expensesOf = (ctx: HandlerCtx, projectId: number): any[] =>
  (ctx.seed.expenses as any[]).filter((exp) => sameId(exp.project_id, projectId));
const finishedEntries = (rec: ProjectRecords, projectId: number) =>
  rec.entries.filter((e) => e.project_id === projectId && e.status !== "running");

const expensePrice = (exp: any) => num(exp.price);
const markAs = (inv: any): string => {
  const status = String(inv.mark_as ?? inv.status ?? "").toLowerCase();
  return status === "paid" || status === "draft" || status === "partially_paid" ? status : "sent";
};

function labourOf(rec: ProjectRecords, entries: TimeEntryRow[]) {
  const hours = entries.reduce((sum, e) => sum + e.hours_logged, 0);
  return { hours, cost: round2(hours * rec.labourCostRate) };
}

/** Linked expenses plus labour — what the project has cost so far. */
function usedBudgetOf(ctx: HandlerCtx, p: ProjectRow): number {
  const rec = records(ctx);
  const expenses = expensesOf(ctx, p.id).reduce((sum, e) => sum + expensePrice(e), 0);
  return round2(expenses + labourOf(rec, finishedEntries(rec, p.id)).cost);
}

function effectiveBudget(p: ProjectRow): number {
  if (!p.is_budget) return 0;
  if (p.budget_type === "weekly" && p.weekly_budget && p.start_date && p.end_date) {
    return p.weekly_budget * Math.ceil(daysBetween(p.start_date, p.end_date) / 7);
  }
  if (p.budget_type === "monthly" && p.monthly_budget && p.start_date && p.end_date) {
    const s = new Date(`${p.start_date}T12:00:00Z`);
    const e = new Date(`${p.end_date}T12:00:00Z`);
    const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + (e.getUTCDate() >= s.getUTCDate() ? 1 : 0);
    return p.monthly_budget * Math.max(months, 1);
  }
  return p.budget;
}

function projectFields(ctx: HandlerCtx, p: ProjectRow) {
  const used = usedBudgetOf(ctx, p);
  const budget = p.is_budget ? p.budget : 0;
  const remaining = p.is_budget ? round2(budget - used) : 0;
  return {
    id: p.id,
    project_name: p.project_name,
    project_code: p.project_code,
    project_status: p.project_status,
    project_description: p.project_description,
    color: p.color,
    client_id: p.client_id,
    contact_id: p.contact_id,
    clientDetail: p.clientDetail,
    contactDetail: p.contactDetail,
    is_budget: p.is_budget,
    is_fixed: p.is_fixed,
    budget_type: p.budget_type,
    show_total_budget: p.show_total_budget,
    show_weekly_budget: p.show_weekly_budget,
    show_monthly_budget: p.show_monthly_budget,
    budget,
    weekly_budget: p.is_budget ? p.weekly_budget : 0,
    monthly_budget: p.is_budget ? p.monthly_budget : 0,
    used_budget: used,
    remaining_budget: remaining,
    is_over_budget: p.is_budget && remaining < 0,
    created_at: p.created_at,
    updated_at: p.created_at,
  };
}

function listRow(ctx: HandlerCtx, p: ProjectRow) {
  const jobs = records(ctx)
    .jobs.filter((j) => j.project_id === p.id)
    .sort((a, b) => b.id - a.id);
  return {
    ...projectFields(ctx, p),
    start_date: listDate(p.start_date),
    end_date: listDate(p.end_date),
    jobs_count: jobs.length,
    job_names: jobs.slice(0, 2).map((j) => j.job_name),
  };
}

function detailRow(ctx: HandlerCtx, p: ProjectRow) {
  return { ...projectFields(ctx, p), start_date: p.start_date, end_date: p.end_date };
}

function jobRow(ctx: HandlerCtx, j: JobRow) {
  const rec = records(ctx);
  const expenses = (ctx.seed.expenses as any[])
    .filter((e) => sameId(e.project_id, j.project_id) && sameId(e.project_job_id, j.id))
    .reduce((sum, e) => sum + expensePrice(e), 0);
  const labour = labourOf(
    rec,
    rec.entries.filter((e) => e.project_job_id === j.id && e.status !== "running"),
  ).cost;
  return {
    id: j.id,
    project_id: j.project_id,
    job_name: j.job_name,
    job_code: j.job_code,
    job_description: j.job_description,
    is_budget: j.is_budget,
    budget: j.is_budget ? j.budget : 0,
    used_budget: round2(expenses + labour),
    created_at: j.created_at,
  };
}

const entryAmount = (rec: ProjectRecords, e: TimeEntryRow) => {
  const task = rec.tasks.find((t) => t.id === e.task_id);
  if (!e.is_billable || !task || task.charge_type !== "hourly") return 0;
  return round2(e.hours_logged * (e.rate || task.rate));
};

function taskRow(ctx: HandlerCtx, t: TaskRow) {
  const rec = records(ctx);
  const entries = rec.entries.filter((e) => e.task_id === t.id && e.status !== "running");
  const minutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
  let amount = 0;
  if (t.charge_type === "fixed") amount = t.fixed_amount;
  else if (t.charge_type === "per_km") amount = t.status === "completed" ? round2(t.km_rate * (t.km_distance ?? 0)) : 0;
  else amount = round2(entries.reduce((sum, e) => sum + entryAmount(rec, e), 0));
  return {
    id: t.id,
    project_id: t.project_id,
    project_job_id: t.project_job_id,
    task_name: t.task_name,
    charge_type: t.charge_type,
    is_billable: t.is_billable,
    priority: t.priority,
    status: t.status,
    rate: t.charge_type === "fixed" ? "N/A" : t.charge_type === "per_km" ? t.km_rate : t.rate,
    km_rate: t.km_rate,
    fixed_amount: t.fixed_amount,
    amount,
    totalDurationMinutes: minutes,
    estimated_hours: t.estimated_hours,
    km_distance: t.km_distance,
    notes: t.notes,
    stage_id: t.stage_id,
    nps_enabled: t.nps_enabled,
    nps_survey_id: t.nps_survey_id,
    client_id: t.client_id,
    contact_id: t.contact_id,
    is_invoiced: t.is_invoiced,
    invoice_id: t.invoice_id,
    created_at: t.created_at,
  };
}

function entryRow(ctx: HandlerCtx, e: TimeEntryRow) {
  const rec = records(ctx);
  const task = rec.tasks.find((t) => t.id === e.task_id);
  const project = findProject(rec, e.project_id);
  return {
    id: e.id,
    task_id: e.task_id,
    project_id: e.project_id,
    project_job_id: e.project_job_id,
    log_date: e.log_date,
    start_time: e.start_time,
    end_time: e.end_time,
    duration_minutes: e.duration_minutes,
    hours_logged: e.hours_logged,
    amount: entryAmount(rec, e),
    rate: e.rate,
    status: e.status,
    is_billable: e.is_billable,
    is_invoiced: e.is_invoiced,
    invoice_id: e.invoice_id,
    notes: e.notes,
    description: e.notes,
    client_id: e.client_id,
    contact_id: e.contact_id,
    client_name: project?.clientDetail.name ?? "",
    taskDetail: task
      ? { id: task.id, task_name: task.task_name, project_id: task.project_id, project_job_id: task.project_job_id, rate: task.rate, is_billable: task.is_billable }
      : null,
    clientDetail: project ? { id: project.clientDetail.id, name: project.clientDetail.name } : null,
    contactDetail: project?.contactDetail ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function periodRange(period: unknown, today: string): { start: string; end: string; kind: "day" | "week" | "month" } {
  const now = new Date(`${today}T12:00:00Z`);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const ymd = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd, 12)).toISOString().slice(0, 10);
  switch (String(period ?? "").toLowerCase()) {
    case "today":
      return { start: today, end: today, kind: "day" };
    case "this month":
    case "month":
      return { start: ymd(y, m, 1), end: ymd(y, m + 1, 0), kind: "day" };
    case "this quarter":
    case "quarter": {
      const qs = Math.floor(m / 3) * 3;
      return { start: ymd(y, qs, 1), end: ymd(y, qs + 3, 0), kind: "week" };
    }
    case "this year":
    case "year":
      return { start: ymd(y, 0, 1), end: ymd(y, 11, 31), kind: "month" };
    default: {
      const start = isoAdd(today, -now.getUTCDay());
      return { start, end: isoAdd(start, 6), kind: "day" };
    }
  }
}

const hm = (minutes: number) => ({ hours: Math.floor(minutes / 60), minutes: Math.round(minutes % 60) });

function summaryNumbers(ctx: HandlerCtx, p: ProjectRow, period: unknown) {
  const rec = records(ctx);
  const range = periodRange(period, ctx.today);
  const tasks = rec.tasks.filter((t) => t.project_id === p.id);
  const inRange = finishedEntries(rec, p.id).filter((e) => e.log_date >= range.start && e.log_date <= range.end);
  let billable = 0;
  let nonBillable = 0;
  let billableAmount = 0;
  for (const e of inRange) {
    if (e.is_billable) {
      billable += e.duration_minutes;
      billableAmount += entryAmount(rec, e);
    } else nonBillable += e.duration_minutes;
  }
  const completed = tasks.filter((t) => t.status === "completed").length;
  return {
    range,
    inRange,
    billable,
    nonBillable,
    billableAmount: round2(billableAmount),
    totalTasks: tasks.length,
    completed,
    progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
}

function timeChart(ctx: HandlerCtx, p: ProjectRow, period: unknown) {
  const { range, inRange, ...rest } = summaryNumbers(ctx, p, period);
  void rest;
  const buckets: { key: string; label: string }[] = [];
  const keyOf = (day: string): string => {
    if (range.kind === "month") return day.slice(0, 7);
    if (range.kind === "week") {
      const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
      return isoAdd(day, -dow);
    }
    return day;
  };
  if (range.kind === "month") {
    const y = range.start.slice(0, 4);
    for (let mo = 0; mo < 12; mo++) buckets.push({ key: `${y}-${String(mo + 1).padStart(2, "0")}`, label: MON[mo] });
  } else if (range.kind === "week") {
    for (let d = keyOf(range.start); d <= range.end; d = isoAdd(d, 7)) {
      buckets.push({ key: d, label: `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` });
    }
  } else {
    for (let d = range.start; d <= range.end; d = isoAdd(d, 1)) {
      buckets.push({ key: d, label: `${Number(d.slice(8, 10))} ${DOW[new Date(`${d}T12:00:00Z`).getUTCDay()]}` });
    }
  }
  const billable = buckets.map(() => 0);
  const nonBillable = buckets.map(() => 0);
  for (const e of inRange) {
    const idx = buckets.findIndex((b) => b.key === keyOf(e.log_date));
    if (idx < 0) continue;
    if (e.is_billable) billable[idx] += e.hours_logged;
    else nonBillable[idx] += e.hours_logged;
  }
  return {
    labels: buckets.map((b) => b.label),
    billable: billable.map((v) => Math.round(v * 10) / 10),
    nonBillable: nonBillable.map((v) => Math.round(v * 10) / 10),
  };
}

const taskValue = (t: TaskRow): number => {
  if (t.charge_type === "fixed") return t.fixed_amount;
  if (t.charge_type === "per_km") return t.km_rate * (t.km_distance ?? 0);
  return t.rate * (t.estimated_hours ?? 0);
};

function financialMetrics(ctx: HandlerCtx, p: ProjectRow) {
  const rec = records(ctx);
  const totalBudget = effectiveBudget(p);
  const tasks = rec.tasks.filter((t) => t.project_id === p.id);
  const invoices = invoicesOf(ctx, p.id);
  const expenses = expensesOf(ctx, p.id);

  const paidValue = invoices.filter((i) => markAs(i) === "paid").reduce((s, i) => s + num(i.total), 0);
  const invoicedValue = invoices.filter((i) => ["sent", "partially_paid"].includes(markAs(i))).reduce((s, i) => s + num(i.total), 0);

  let committed = 0;
  let recognised = 0;
  let future = 0;
  let totalTaskValue = 0;
  for (const t of tasks) {
    const value = taskValue(t);
    totalTaskValue += value;
    if (t.status === "completed" && !t.is_invoiced) recognised += value;
    else if (t.status === "completed") continue;
    else if (!t.is_invoiced && t.status === "active") committed += value;
    else if (!t.is_invoiced) future += value;
  }

  const totalExpenses = expenses.reduce((s, e) => s + expensePrice(e), 0);
  const isInvoicedExpense = (e: any) => rec.expenseInvoices[String(e.expense_id)] !== undefined;
  const invoicedExpenses = expenses.filter(isInvoicedExpense).reduce((s, e) => s + expensePrice(e), 0);
  const uninvoicedExpenses = totalExpenses - invoicedExpenses;
  const expenseMargin = invoicedExpenses - totalExpenses;

  const labour = labourOf(rec, finishedEntries(rec, p.id));
  const allocated = paidValue + invoicedValue + committed + recognised + future;
  const uncommitted = Math.max(totalBudget - allocated, 0);
  const totalCostIncurred = round2(labour.cost + totalExpenses);
  const totalRecognisedRevenue = recognised + paidValue + invoicedValue;
  const forecastCost = totalCostIncurred;
  const end = p.end_date;
  const remainingDays = end && end > ctx.today ? daysBetween(ctx.today, end) : end ? 0 : null;

  return {
    totalBudget,
    weeklyBudget: p.weekly_budget,
    monthlyBudget: p.monthly_budget,
    paidValue: round2(paidValue),
    invoicedValue: round2(invoicedValue),
    committedValue: round2(committed),
    recognisedValue: round2(recognised),
    futureWorkValue: round2(future),
    uncommittedValue: round2(uncommitted),
    totalExpenses: round2(totalExpenses),
    invoicedExpenses: round2(invoicedExpenses),
    uninvoicedExpenses: round2(uninvoicedExpenses),
    expenseMargin: round2(expenseMargin),
    expenseMarginPercent: totalExpenses > 0 ? round2((expenseMargin / totalExpenses) * 100) : 0,
    totalTrackedHours: round2(labour.hours),
    totalLabourCost: labour.cost,
    totalCostIncurred,
    costBreakdown: { labourCost: labour.cost, expenseCost: round2(totalExpenses) },
    forecastIncome: totalBudget,
    financialProgress: totalBudget > 0 ? round2(((totalRecognisedRevenue + uninvoicedExpenses) / totalBudget) * 100) : 0,
    remainingBudget: round2(uncommitted),
    remainingBudgetPercent: totalBudget > 0 ? round2((uncommitted / totalBudget) * 100) : 0,
    remainingDays,
    remainingCashToCollect: round2(invoicedValue + committed + uncommitted),
    totalRecognisedRevenue: round2(totalRecognisedRevenue),
    expectedProfit: round2(totalBudget - totalCostIncurred),
    actualProfitLoss: round2(totalRecognisedRevenue - totalCostIncurred),
    isActualLoss: totalCostIncurred > totalRecognisedRevenue,
    forecastCost,
    isForecastLoss: forecastCost > totalBudget,
    isProjectLoss: paidValue + invoicedValue + committed + uninvoicedExpenses + labour.cost > totalBudget,
    totalTaskValue: round2(totalTaskValue),
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === "completed").length,
    invoicedTasks: tasks.filter((t) => t.is_invoiced).length,
  };
}

function statsAnswer(ctx: HandlerCtx, p: ProjectRow, which: string): HandlerResponse | null {
  const period = ctx.params.period;
  switch (which) {
    case "summary": {
      const s = summaryNumbers(ctx, p, period);
      return ok({
        totalTracked: hm(s.billable + s.nonBillable),
        billableHours: hm(s.billable),
        billableAmount: s.billableAmount,
        nonBillableHours: hm(s.nonBillable),
        totalTasks: s.totalTasks,
        completedTasks: s.completed,
        remainingTasks: s.totalTasks - s.completed,
        progress: s.progress,
      });
    }
    case "time-chart":
      return ok(timeChart(ctx, p, period));
    case "billable-breakdown": {
      const s = summaryNumbers(ctx, p, period);
      const total = s.billable + s.nonBillable;
      return ok({
        percentage: total > 0 ? Math.round((s.billable / total) * 100) : 0,
        totalHours: Math.floor(total / 60),
        totalMinutes: total % 60,
      });
    }
    case "task-status": {
      const range = periodRange(period, ctx.today);
      const counts = { active: 0, inactive: 0, completed: 0 };
      for (const t of records(ctx).tasks) {
        if (t.project_id === p.id && t.created_at >= range.start && t.created_at <= range.end) counts[t.status] += 1;
      }
      return ok(counts);
    }
    case "overdue": {
      const overdue = !!p.end_date && p.end_date < ctx.today && p.project_status !== "closed";
      return ok({
        isOverdue: overdue,
        endDate: p.end_date || null,
        daysOverdue: overdue ? daysBetween(p.end_date, ctx.today) : 0,
      });
    }
    case "financial-metrics":
      return ok(financialMetrics(ctx, p));
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Lists
 * ------------------------------------------------------------------ */

function projectList(ctx: HandlerCtx): HandlerResponse {
  const rec = records(ctx);
  const status = text(ctx.params.status).toLowerCase();
  const search = text(ctx.params.search).toLowerCase();
  const meta = {
    all: rec.projects.length,
    draft: rec.projects.filter((p) => p.project_status === "draft").length,
    inprogress: rec.projects.filter((p) => p.project_status === "inprogress").length,
    closed: rec.projects.filter((p) => p.project_status === "closed").length,
    cancelled: 0,
  };
  let rows = [...rec.projects];
  if (status && status !== "all") rows = rows.filter((p) => p.project_status === status);
  if (search) {
    rows = rows.filter((p) => p.project_name.toLowerCase().includes(search) || p.project_code.toLowerCase().includes(search));
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const page = paginate(rows, ctx.params);
  return {
    status: 200,
    data: { success: true, data: page.rows.map((p) => listRow(ctx, p)), pagination: page.pagination, meta },
  };
}

function invoiceList(ctx: HandlerCtx, draftOnly: boolean): HandlerResponse {
  const rec = records(ctx);
  const project = findProject(rec, ctx.params.project_id);
  if (!project) return notFound();
  let rows = invoicesOf(ctx, project.id);
  const status = text(ctx.params.status);
  if (draftOnly) rows = rows.filter((i) => markAs(i) === "draft");
  else if (status) rows = rows.filter((i) => markAs(i) === status);
  rows = [...rows].sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)));
  const limit = Math.max(1, Math.min(num(ctx.params.limit, 10) || 10, 100));
  const page = paginate(rows, { ...ctx.params, limit });
  const mapped = page.rows.map((inv) => ({
    id: inv.invoice_id,
    invoice_no: inv.invoice_no,
    invoice_date: inv.invoice_date,
    due_date: inv.due_date,
    total: inv.total,
    sub_total: inv.sub_total,
    total_gst: inv.tax_amount,
    total_discount: 0,
    mark_as: markAs(inv),
    description: inv.description,
    notes: inv.notes,
    template_id: 1,
    client_id: inv.client_id,
    project_id: inv.project_id,
    created_at: inv.created_at,
    paid_with_cash: false,
    is_recurring_invoice: false,
    bank_transaction_id: markAs(inv) === "paid" ? 5000 + Number(inv.invoice_id) : null,
    bulk_upload: false,
    client: {
      id: inv.client?.client_id ?? inv.client_id,
      name: inv.client?.name,
      email: inv.client?.email,
      business_name: inv.client?.business_name ?? null,
    },
    invoiceItem: (inv.invoice_items ?? inv.items ?? []).map((it: any, i: number) => ({
      id: it.id ?? i + 1,
      description: it.description,
      price: it.price,
      qty: it.qty,
      qty_type: it.qty_type,
      total: round2(num(it.qty, 1) * num(it.price)),
    })),
  }));
  return ok(
    { invoices: mapped, pagination: { currentPage: page.pagination.currentPage, totalPages: page.pagination.totalPages, totalItems: page.pagination.totalRecords, itemsPerPage: page.pagination.perPage } },
  );
}

function expenseRow(ctx: HandlerCtx, exp: any) {
  const rec = records(ctx);
  const job = rec.jobs.find((j) => sameId(j.id, exp.project_job_id));
  const invoiceId = rec.expenseInvoices[String(exp.expense_id)];
  const invoice = invoiceId !== undefined ? (ctx.seed.invoices as any[]).find((i) => sameId(i.invoice_id, invoiceId)) : null;
  return {
    id: exp.expense_id,
    name: exp.name,
    price: exp.price,
    business_amount: exp.price,
    date: exp.date,
    project_id: exp.project_id ?? null,
    project_job_id: exp.project_job_id ?? null,
    invoice_id: invoice ? invoice.invoice_id : null,
    is_invoiced: invoice ? 1 : 0,
    client: { name: exp.client?.name ?? "" },
    accountSubcategory: { name: exp.account_subcategory?.name ?? "" },
    invoice: invoice ? { invoice_no: invoice.invoice_no } : null,
    projectJob: job ? { job_name: job.job_name, job_code: job.job_code } : null,
  };
}

const byDateDesc = (a: any, b: any) => String(b.date).localeCompare(String(a.date));

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

function clientParts(ctx: HandlerCtx, clientId: number | null, contactId: number | null) {
  const client: any = [...ctx.seed.clients, ...ctx.seed.suppliers].find((c: any) => sameId(c.id, clientId));
  if (!client) return null;
  const contact = sameId(client.contactId, contactId) || !contactId
    ? { id: Number(client.contactId), name: client.contact, email: client.email }
    : { id: Number(contactId), name: client.contact, email: client.email };
  return {
    clientDetail: {
      id: Number(client.id),
      name: client.name,
      email: client.email,
      business_name: client.kind === "residential" ? null : client.name,
    },
    contactDetail: contact,
    contactId: contact.id,
  };
}

function applyBudgetFields(p: ProjectRow, f: Record<string, any>, total: unknown) {
  if (f.is_budget !== undefined) p.is_budget = flag(f.is_budget, p.is_budget);
  if (f.budget_type !== undefined) p.budget_type = ["weekly", "monthly"].includes(text(f.budget_type)) ? (text(f.budget_type) as any) : "total";
  if (f.show_total_budget !== undefined) p.show_total_budget = flag(f.show_total_budget);
  if (f.show_weekly_budget !== undefined) p.show_weekly_budget = flag(f.show_weekly_budget);
  if (f.show_monthly_budget !== undefined) p.show_monthly_budget = flag(f.show_monthly_budget);
  if (f.is_fixed !== undefined) p.is_fixed = flag(f.is_fixed);
  else if (f.is_task_based !== undefined) p.is_fixed = !flag(f.is_task_based, true);
  if (total !== undefined) p.budget = num(total);
  if (f.weekly_budget !== undefined) p.weekly_budget = num(f.weekly_budget);
  if (f.monthly_budget !== undefined) p.monthly_budget = num(f.monthly_budget);
}

function createProject(ctx: HandlerCtx): HandlerResponse {
  const rec = records(ctx);
  const f = ctx.fields();
  const name = text(f.name ?? f.project_name);
  if (name.length < 3) return fail(400, "Project name must be at least 3 characters");
  const clientId = optId(f.client_id);
  const parts = clientParts(ctx, clientId, optId(f.contact_id));
  if (!parts) return fail(400, "Client is required");
  const id = nextId(rec.projects);
  const code = text(f.project_code) || `${rec.settings.project_prefix}-${id}`;
  if (rec.projects.some((p) => p.project_code.toLowerCase() === code.toLowerCase())) {
    return fail(400, "Project code already exists");
  }
  const status = text(f.project_status);
  const row: ProjectRow = {
    id,
    project_name: name,
    project_code: code,
    project_status: status === "inprogress" || status === "closed" ? status : "draft",
    project_description: text(f.description ?? f.project_description),
    color: ["#DCEBFF", "#D9F5E6", "#FFF1D6", "#EBE0FF", "#FFE0E0", "#D6F3F0"][id % 6],
    client_id: Number(clientId),
    contact_id: parts.contactId,
    clientDetail: parts.clientDetail,
    contactDetail: parts.contactDetail,
    start_date: isoDay(f.start_date, ctx.today),
    end_date: isoDay(f.end_date, isoAdd(ctx.today, 90)),
    is_budget: true,
    is_fixed: false,
    budget_type: "total",
    budget: 0,
    weekly_budget: 0,
    monthly_budget: 0,
    show_total_budget: true,
    show_weekly_budget: false,
    show_monthly_budget: false,
    created_at: ctx.today,
  };
  applyBudgetFields(row, f, f.budget ?? f.overall ?? f.total_budget);
  rec.projects.push(row);
  rec.settings.project_next_number = Math.max(rec.settings.project_next_number, id + 1);
  return ok({ id, project_name: row.project_name, project_code: row.project_code }, { message: "Project created successfully" });
}

function updateProject(ctx: HandlerCtx, p: ProjectRow): HandlerResponse {
  const f = ctx.fields();
  const name = text(f.project_name ?? f.name);
  if (name) p.project_name = name;
  const status = text(f.project_status ?? f.status);
  if (status === "draft" || status === "inprogress" || status === "closed") p.project_status = status;
  if (f.project_description !== undefined || f.description !== undefined) p.project_description = text(f.project_description ?? f.description);
  if (f.start_date) p.start_date = isoDay(f.start_date, p.start_date);
  if (f.end_date) p.end_date = isoDay(f.end_date, p.end_date);
  if (f.project_code && text(f.project_code) !== p.project_code) p.project_code = text(f.project_code);
  const clientId = optId(f.client_id);
  if (clientId && clientId !== p.client_id) {
    const parts = clientParts(ctx, clientId, optId(f.contact_id));
    if (parts) {
      p.client_id = clientId;
      p.contact_id = parts.contactId;
      p.clientDetail = parts.clientDetail;
      p.contactDetail = parts.contactDetail;
    }
  }
  applyBudgetFields(p, f, f.total_budget ?? f.budget ?? f.overall);
  return ok({ id: p.id }, { message: "Project updated successfully" });
}

function deleteProject(ctx: HandlerCtx, p: ProjectRow): HandlerResponse {
  const rec = records(ctx);
  rec.projects.splice(rec.projects.indexOf(p), 1);
  const gone = (x: { project_id: number }) => x.project_id === p.id;
  rec.jobs = rec.jobs.filter((x) => !gone(x));
  rec.tasks = rec.tasks.filter((x) => !gone(x));
  rec.entries = rec.entries.filter((x) => !gone(x));
  for (const list of [ctx.seed.invoices, ctx.seed.quotes, ctx.seed.expenses] as any[][]) {
    for (const row of list) {
      if (sameId(row.project_id, p.id)) {
        delete row.project_id;
        delete row.project_job_id;
      }
    }
  }
  return ok(null, { message: "Project deleted successfully" });
}

function createJob(ctx: HandlerCtx): HandlerResponse {
  const rec = records(ctx);
  const f = ctx.fields();
  const project = findProject(rec, f.project_id);
  if (!project) return fail(400, "Project is required");
  const name = text(f.job_name);
  const code = text(f.job_code);
  if (name.length < 3) return fail(400, "Job name must be at least 3 characters");
  if (!code) return fail(400, "Job code is required");
  if (rec.jobs.some((j) => j.job_code.toLowerCase() === code.toLowerCase())) return fail(400, "Job code already exists");
  const job: JobRow = {
    id: nextId(rec.jobs),
    project_id: project.id,
    job_name: name,
    job_code: code,
    job_description: text(f.job_description),
    is_budget: flag(f.is_budget),
    budget: num(f.budget),
    created_at: ctx.today,
  };
  rec.jobs.push(job);
  rec.settings.job_next_number = Math.max(rec.settings.job_next_number, jobNumber(job.job_code, rec.settings.job_prefix) + 1);
  return ok({ id: job.id, job_name: job.job_name, job_code: job.job_code }, { message: "Job created successfully" });
}

const jobNumber = (code: string, prefix: string) => {
  const m = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(code);
  return m ? Number(m[1]) : 0;
};

function updateJob(ctx: HandlerCtx, job: JobRow): HandlerResponse {
  const f = ctx.fields();
  if (f.job_name !== undefined && text(f.job_name)) job.job_name = text(f.job_name);
  if (f.job_description !== undefined) job.job_description = text(f.job_description);
  if (f.is_budget !== undefined) job.is_budget = flag(f.is_budget, job.is_budget);
  if (f.budget !== undefined) job.budget = num(f.budget);
  return ok({ id: job.id }, { message: "Job updated successfully" });
}

function deleteJob(ctx: HandlerCtx, job: JobRow): HandlerResponse {
  const rec = records(ctx);
  rec.jobs.splice(rec.jobs.indexOf(job), 1);
  rec.tasks.forEach((t) => {
    if (t.project_job_id === job.id) t.project_job_id = null;
  });
  rec.entries.forEach((e) => {
    if (e.project_job_id === job.id) e.project_job_id = null;
  });
  for (const exp of ctx.seed.expenses as any[]) {
    if (sameId(exp.project_job_id, job.id)) exp.project_job_id = null;
  }
  return ok(null, { message: "Job deleted successfully" });
}

function applyTaskFields(t: TaskRow, f: Record<string, any>) {
  if (f.task_name !== undefined && text(f.task_name)) t.task_name = text(f.task_name);
  if (f.charge_type !== undefined && ["hourly", "fixed", "per_km"].includes(text(f.charge_type))) t.charge_type = text(f.charge_type) as any;
  if (f.is_billable !== undefined) t.is_billable = flag(f.is_billable, t.is_billable);
  if (f.priority !== undefined && ["low", "medium", "high"].includes(text(f.priority))) t.priority = text(f.priority) as any;
  if (f.status !== undefined && ["active", "inactive", "completed"].includes(text(f.status))) t.status = text(f.status) as any;
  if (f.notes !== undefined) t.notes = text(f.notes);
  if (f.project_job_id !== undefined) t.project_job_id = optId(f.project_job_id);
  if (f.stage_id !== undefined) t.stage_id = optId(f.stage_id);
  if (f.nps_enabled !== undefined) t.nps_enabled = flag(f.nps_enabled);
  if (f.nps_survey_id !== undefined) t.nps_survey_id = optId(f.nps_survey_id);
  if (f.estimated_hours !== undefined) t.estimated_hours = text(f.estimated_hours) === "" ? null : num(f.estimated_hours);
  if (f.km_distance !== undefined) t.km_distance = text(f.km_distance) === "" ? null : num(f.km_distance);
  if (f.fixed_amount !== undefined) t.fixed_amount = num(f.fixed_amount);
  if (f.km_rate !== undefined) t.km_rate = num(f.km_rate);
  const hourly = f.hourly_rate ?? f.rate;
  if (hourly !== undefined && t.charge_type !== "per_km") t.rate = num(hourly);
}

function createTask(ctx: HandlerCtx): HandlerResponse {
  const rec = records(ctx);
  const f = ctx.fields();
  const project = findProject(rec, f.project_id);
  if (!project) return fail(400, "Project is required");
  if (text(f.task_name).length < 3) return fail(400, "Task name must be at least 3 characters long");
  const task: TaskRow = {
    id: nextId(rec.tasks),
    project_id: project.id,
    project_job_id: null,
    task_name: text(f.task_name),
    charge_type: "hourly",
    is_billable: true,
    priority: "medium",
    status: "active",
    rate: 0,
    km_rate: 0,
    fixed_amount: 0,
    estimated_hours: null,
    km_distance: null,
    notes: "",
    stage_id: null,
    nps_enabled: false,
    nps_survey_id: null,
    client_id: optId(f.client_id) ?? project.client_id,
    contact_id: optId(f.contact_id) ?? project.contact_id,
    is_invoiced: false,
    invoice_id: null,
    created_at: ctx.today,
  };
  applyTaskFields(task, f);
  task.status = "active";
  rec.tasks.push(task);
  return ok({ id: task.id, task_name: task.task_name }, { message: "Task created successfully" });
}

/* ---- time tracking ----------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");
const localStamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

function startTimer(ctx: HandlerCtx): HandlerResponse | null {
  const rec = records(ctx);
  const f = ctx.fields();
  const task = rec.tasks.find((t) => sameId(t.id, f.task_id));
  if (!task || (f.project_id && !sameId(f.project_id, task.project_id))) return null;
  if (rec.entries.some((e) => e.status === "running")) return fail(400, "A timer is already running. Stop it before starting another.");
  const project = findProject(rec, task.project_id);
  const now = new Date();
  const entry: TimeEntryRow = {
    id: nextId(rec.entries),
    task_id: task.id,
    project_id: task.project_id,
    project_job_id: task.project_job_id,
    log_date: ctx.today,
    start_time: localStamp(now),
    end_time: null,
    duration_minutes: 0,
    hours_logged: 0,
    rate: task.charge_type === "hourly" ? task.rate : 0,
    is_billable: task.is_billable,
    status: "running",
    is_invoiced: false,
    invoice_id: null,
    notes: text(f.description, `Working on ${task.task_name}`),
    client_id: task.client_id,
    contact_id: task.contact_id,
  };
  rec.entries.push(entry);
  return ok({ ...entryRow(ctx, entry), start_time: now.toISOString(), clientDetail: { id: project?.clientDetail.id, name: project?.clientDetail.name, client_id: project?.clientDetail.id } });
}

function stopTimer(ctx: HandlerCtx, entry: TimeEntryRow): HandlerResponse {
  const rec = records(ctx);
  const started = new Date(entry.start_time).getTime();
  const elapsed = Number.isFinite(started) ? Math.round((Date.now() - started) / 60000) : 0;
  const minutes = Math.max(15, elapsed);
  entry.status = "stopped";
  entry.duration_minutes = minutes;
  entry.hours_logged = Math.round((minutes / 60) * 100) / 100;
  entry.end_time = localStamp(new Date(started + minutes * 60000));
  const total = rec.entries.filter((e) => e.task_id === entry.task_id && e.status !== "running").reduce((s, e) => s + e.duration_minutes, 0);
  return ok({ id: entry.id, task_total_duration_minutes: total, task_amount: entryAmount(rec, entry) }, { message: "Timer stopped" });
}

function updateEntry(ctx: HandlerCtx, entry: TimeEntryRow): HandlerResponse {
  const f = ctx.fields();
  const day = isoDay(f.log_date, entry.log_date);
  const start = text(f.start_time);
  const end = text(f.end_time);
  let hours = entry.hours_logged;
  entry.log_date = day;
  if (/^\d{1,2}:\d{2}/.test(start) && /^\d{1,2}:\d{2}/.test(end)) {
    hours = hoursBetween(start, end);
    entry.start_time = `${day}T${start.slice(0, 5).padStart(5, "0")}:00`;
    entry.end_time = `${day}T${end.slice(0, 5).padStart(5, "0")}:00`;
  } else if (f.hours_logged !== undefined) {
    hours = num(f.hours_logged, hours);
    const startPart = entry.start_time.slice(11, 16) || "09:00";
    const startMin = Number(startPart.slice(0, 2)) * 60 + Number(startPart.slice(3, 5));
    const endMin = Math.min(23 * 60 + 59, startMin + Math.round(hours * 60));
    entry.start_time = `${day}T${startPart}:00`;
    entry.end_time = `${day}T${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00`;
  }
  entry.hours_logged = Math.round(hours * 10000) / 10000;
  entry.duration_minutes = Math.round(hours * 60);
  return ok({ id: entry.id }, { message: "Time entry updated successfully" });
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function settingsAnswer(ctx: HandlerCtx): HandlerResponse {
  return ok({ ...records(ctx).settings });
}

function nextProjectCode(ctx: HandlerCtx): string {
  const rec = records(ctx);
  const prefix = rec.settings.project_prefix;
  const highest = rec.projects.reduce((max, p) => {
    const m = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(p.project_code);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `${prefix}-${Math.max(rec.settings.project_next_number, highest + 1)}`;
}

function nextJobCode(ctx: HandlerCtx): string {
  const rec = records(ctx);
  const prefix = rec.settings.job_prefix;
  const highest = rec.jobs.reduce((max, j) => Math.max(max, jobNumber(j.job_code, prefix)), 0);
  return `${prefix}-${Math.max(rec.settings.job_next_number, highest + 1)}`;
}

function saveSettings(ctx: HandlerCtx): HandlerResponse {
  const s = records(ctx).settings;
  const f = ctx.fields();
  if (f.default_hourly_rate !== undefined) s.default_hourly_rate = num(f.default_hourly_rate);
  if (f.default_km_rate !== undefined) s.default_km_rate = num(f.default_km_rate);
  if (text(f.project_prefix)) s.project_prefix = text(f.project_prefix);
  if (f.project_next_number !== undefined) s.project_next_number = Math.max(1, num(f.project_next_number, 1));
  if (text(f.job_prefix)) s.job_prefix = text(f.job_prefix);
  if (f.job_next_number !== undefined) s.job_next_number = Math.max(1, num(f.job_next_number, 1));
  if (f.default_budget_enabled !== undefined) s.default_budget_enabled = flag(f.default_budget_enabled, true);
  if (f.show_total_budget !== undefined) s.show_total_budget = flag(f.show_total_budget);
  if (f.show_weekly_budget !== undefined) s.show_weekly_budget = flag(f.show_weekly_budget);
  if (f.show_monthly_budget !== undefined) s.show_monthly_budget = flag(f.show_monthly_budget);
  const amount = (v: unknown) => (v === undefined || v === null || text(v) === "" ? null : num(v) || null);
  s.default_total_budget = amount(f.default_total_budget);
  s.default_weekly_budget = amount(f.default_weekly_budget);
  s.default_monthly_budget = amount(f.default_monthly_budget);
  return ok({ ...s }, { message: "Settings saved successfully" });
}

/** An expense or invoice written elsewhere in the app that names a project: let the generic overlay save it, then link it. */
function linkedWrite(ctx: HandlerCtx, kind: "expense" | "invoice"): HandlerResponse | null {
  const f = ctx.fields();
  const rec = records(ctx);
  const isCreate = ctx.path === (kind === "expense" ? "/v2/expense" : "/invoice/add");
  const isEdit = ctx.path === "/v2/expense/edit";
  if (kind === "expense" ? !(isCreate || isEdit) : !isCreate) return null;
  if (isCreate && !optId(f.project_id)) return null;
  if (isEdit && !("project_id" in f)) return null;
  const result = applyOverlayWrite(ctx.method, ctx.path, f, ctx.seed, ctx.today, ctx.cfg.taxRate);
  if (!result) return null;
  if (result.data?.success !== false) {
    const id = result.data?.data?.id ?? result.data?.data?.invoice_id ?? f.id;
    const list = (kind === "expense" ? ctx.seed.expenses : ctx.seed.invoices) as any[];
    const row = list.find((r) => sameId(kind === "expense" ? r.expense_id : r.invoice_id, id));
    const project = findProject(rec, f.project_id);
    if (row) {
      if (project) {
        row.project_id = project.id;
        if (kind === "expense") {
          const job = rec.jobs.find((j) => j.project_id === project.id && sameId(j.id, f.project_job_id));
          if (job) row.project_job_id = job.id;
        }
      } else {
        delete row.project_id;
        delete row.project_job_id;
      }
    }
  }
  return result;
}

export const handle: DemoHandler = (ctx) => {
  const rec = ctx.seed.projectRecords;
  if (!rec) return null;
  const { method, path, params } = ctx;
  let m: RegExpMatchArray | null;

  /* ---- Reads --------------------------------------------------------- */
  if (method === "GET") {
    if (path === "/project" || path === "/projects" || path === "/project/all") return projectList(ctx);

    if (path === "/project/settings" || path === "/project/settings/init") return settingsAnswer(ctx);
    if (path === "/project/settings/next-project-code") return ok({ code: nextProjectCode(ctx) });
    if (path === "/project/settings/next-job-code") return ok({ code: nextJobCode(ctx) });
    if (path === "/project/invoiceList") return invoiceList(ctx, false);
    if (path === "/project/draft-invoice-list") return invoiceList(ctx, true);

    if ((m = path.match(/^\/project\/client\/(\d+)$/))) {
      const rows = rec.projects.filter((p) => sameId(p.client_id, m![1]) || sameId(p.contact_id, m![1]));
      return ok(rows.map((p) => ({ id: p.id, project_name: p.project_name, project_code: p.project_code, project_status: p.project_status, client_id: p.client_id })), { pagination: { totalRecords: rows.length } });
    }
    if ((m = path.match(/^\/project\/tasks(?:\/(\d+))?$/))) {
      const clientId = m[1] ?? params.client_id;
      const rows = rec.tasks.filter((t) => !clientId || sameId(t.client_id, clientId));
      return ok(rows.map((t) => ({ id: t.id, task_name: t.task_name, project_id: t.project_id, project_job_id: t.project_job_id })));
    }
    if ((m = path.match(/^\/project\/stats\/(\d+)\/([\w-]+)$/))) {
      const project = findProject(rec, m[1]);
      if (!project) return notFound();
      return statsAnswer(ctx, project, m[2]);
    }
    if ((m = path.match(/^\/project\/(\d+)$/))) {
      const project = findProject(rec, m[1]);
      return project ? ok(detailRow(ctx, project)) : notFound();
    }

    if (path === "/project-job") {
      let rows = [...rec.jobs];
      if (params.project_id) rows = rows.filter((j) => sameId(j.project_id, params.project_id));
      rows.sort((a, b) => b.id - a.id);
      const page = paginate(rows, params);
      return { status: 200, data: { success: true, data: page.rows.map((j) => jobRow(ctx, j)), pagination: page.pagination } };
    }
    if ((m = path.match(/^\/project-job\/project\/(\d+)$/))) {
      const project = findProject(rec, m[1]);
      if (!project) return notFound();
      const rows = rec.jobs.filter((j) => j.project_id === project.id).sort((a, b) => b.id - a.id);
      const page = paginate(rows, params, 100);
      return { status: 200, data: { success: true, data: page.rows.map((j) => jobRow(ctx, j)), pagination: page.pagination } };
    }
    if ((m = path.match(/^\/project-job\/(\d+)$/))) {
      const job = rec.jobs.find((j) => sameId(j.id, m![1]));
      return job ? ok(jobRow(ctx, job)) : notFound("Job");
    }

    if (path === "/tasks") {
      let rows = [...rec.tasks];
      if (params.project_id) rows = rows.filter((t) => sameId(t.project_id, params.project_id));
      if (params.project_job_id) rows = rows.filter((t) => sameId(t.project_job_id, params.project_job_id));
      rows.sort((a, b) => b.id - a.id);
      const page = paginate(rows, params);
      return { status: 200, data: { success: true, data: page.rows.map((t) => taskRow(ctx, t)), pagination: page.pagination } };
    }
    if (path === "/tasks/by-client") {
      const projects = rec.projects.filter((p) => !params.client_id || sameId(p.client_id, params.client_id) || sameId(p.contact_id, params.client_id));
      const task = rec.tasks.find((t) => sameId(t.id, params.task_id));
      const jobs = task
        ? rec.jobs.filter((j) => j.project_id === task.project_id)
        : rec.jobs.filter((j) => projects.some((p) => p.id === j.project_id));
      return ok({
        projects: projects.map((p) => ({ id: p.id, project_name: p.project_name, project_code: p.project_code })),
        jobs: jobs.map((j) => ({ id: j.id, job_name: j.job_name, job_code: j.job_code, project_id: j.project_id })),
      });
    }
    if ((m = path.match(/^\/tasks\/(\d+)$/))) {
      const task = rec.tasks.find((t) => sameId(t.id, m![1]));
      return task ? ok(taskRow(ctx, task)) : notFound("Task");
    }

    if (path === "/time-tracking" && params.project_id) {
      let rows = rec.entries.filter((e) => sameId(e.project_id, params.project_id));
      if (params.project_job_id) rows = rows.filter((e) => sameId(e.project_job_id, params.project_job_id));
      rows = [...rows].sort((a, b) => b.log_date.localeCompare(a.log_date) || b.id - a.id);
      const page = paginate(rows, params, 100);
      return { status: 200, data: { success: true, data: page.rows.map((e) => entryRow(ctx, e)), pagination: page.pagination } };
    }
    if (path === "/time-tracking/active") {
      const running = rec.entries.find((e) => e.status === "running");
      return running ? ok({ ...entryRow(ctx, running), current_duration_minutes: Math.max(0, (Date.now() - new Date(running.start_time).getTime()) / 60000) }) : null;
    }

    if ((m = path.match(/^\/v2\/expense\/project\/(\d+)$/))) {
      const project = findProject(rec, m[1]);
      if (!project) return notFound();
      const rows = expensesOf(ctx, project.id).sort(byDateDesc);
      const page = paginate(rows, params);
      return { status: 200, data: { success: true, data: page.rows.map((e) => expenseRow(ctx, e)), meta: { total: rows.length } } };
    }
    if (path === "/v2/expense" && text(params.mode) === "project") {
      const rows = (ctx.seed.expenses as any[]).filter((e) => !e.project_id).sort(byDateDesc);
      const page = paginate(rows, params);
      return { status: 200, data: { success: true, data: page.rows.map((e) => expenseRow(ctx, e)), meta: { total: rows.length } } };
    }
    return null;
  }

  /* ---- Writes -------------------------------------------------------- */
  if (path === "/project" && method === "POST") return createProject(ctx);
  if (path === "/project/settings" && method === "POST") return saveSettings(ctx);
  if ((m = path.match(/^\/project\/(\d+)(?:\/status)?$/)) && ["PUT", "PATCH", "DELETE"].includes(method)) {
    const project = findProject(rec, m[1]);
    if (!project) return notFound();
    return method === "DELETE" ? deleteProject(ctx, project) : updateProject(ctx, project);
  }

  if (path === "/project-job" && method === "POST") return createJob(ctx);
  if ((m = path.match(/^\/project-job\/(\d+)$/)) && ["PUT", "PATCH", "DELETE"].includes(method)) {
    const job = rec.jobs.find((j) => sameId(j.id, m![1]));
    if (!job) return notFound("Job");
    return method === "DELETE" ? deleteJob(ctx, job) : updateJob(ctx, job);
  }

  if (path === "/tasks" && method === "POST") return createTask(ctx);
  if ((m = path.match(/^\/tasks\/(\d+)$/)) && ["PUT", "PATCH", "DELETE"].includes(method)) {
    const task = rec.tasks.find((t) => sameId(t.id, m![1]));
    if (!task) return notFound("Task");
    if (method === "DELETE") {
      rec.tasks.splice(rec.tasks.indexOf(task), 1);
      rec.entries = rec.entries.filter((e) => e.task_id !== task.id);
      return ok(null, { message: "Task deleted successfully" });
    }
    applyTaskFields(task, ctx.fields());
    return ok({ id: task.id }, { message: "Task updated successfully" });
  }

  if (path === "/time-tracking/start" && method === "POST") return startTimer(ctx);
  if (path === "/time-tracking/bulk" && method === "PUT") {
    const f = ctx.fields();
    const ids: unknown[] = Array.isArray(f.id) ? f.id : f.id !== undefined ? [f.id] : [];
    const mine = rec.entries.filter((e) => ids.some((id) => sameId(id, e.id)));
    if (!mine.length) return null;
    mine.forEach((e) => {
      e.is_invoiced = flag(f.is_invoiced, true);
      e.invoice_id = e.is_invoiced ? optId(f.invoice_id) : null;
    });
    return ok(null, { message: "Time entries updated successfully" });
  }
  if ((m = path.match(/^\/time-tracking\/(\d+)(\/stop)?$/)) && ["PUT", "PATCH", "DELETE"].includes(method)) {
    const entry = rec.entries.find((e) => sameId(e.id, m![1]));
    if (!entry) return null;
    if (method === "DELETE") {
      rec.entries.splice(rec.entries.indexOf(entry), 1);
      return ok(null, { message: "Time Log Deleted Successfully" });
    }
    if (m[2] || (entry.status === "running" && !ctx.fields().hours_logged)) return stopTimer(ctx, entry);
    return updateEntry(ctx, entry);
  }

  if (path === "/v2/expense/add-to-project" && ["PATCH", "POST", "PUT"].includes(method)) {
    const f = ctx.fields();
    const project = findProject(rec, f.projectId ?? f.project_id);
    if (!project) return notFound();
    const job = rec.jobs.find((j) => j.project_id === project.id && sameId(j.id, f.projectJobId ?? f.project_job_id));
    const ids: unknown[] = Array.isArray(f.expenseIds) ? f.expenseIds : f.expenseIds !== undefined ? [f.expenseIds] : [];
    let count = 0;
    for (const exp of ctx.seed.expenses as any[]) {
      if (!ids.some((id) => sameId(id, exp.expense_id))) continue;
      exp.project_id = project.id;
      if (job) exp.project_job_id = job.id;
      else delete exp.project_job_id;
      count += 1;
    }
    return { status: 200, data: { success: true, message: "Expenses added to project successfully.", data: { updated: count } } };
  }
  if (method === "POST") {
    const linked = linkedWrite(ctx, path.startsWith("/invoice") ? "invoice" : "expense");
    if (linked) return linked;
  }
  return null;
};
