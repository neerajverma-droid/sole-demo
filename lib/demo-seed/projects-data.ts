/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like generator.ts */
/**
 * Projects module data for the demo: ten API-shaped projects per story (5 in progress, 3 closed,
 * 2 draft) with jobs, tasks and tracked time, and the links from invoices, quotes and expenses back
 * to them (`project_id`, and `project_job_id` on expenses) that the generator never made on its own.
 *
 * The first four projects are the story's own `story.projects` (same ids, names, codes, clients and
 * jobs, so calendar events and the like keep pointing at them); six more are derived from the
 * story's clients and services. Everything is deterministic for a story and a "today", and draws
 * from its own random stream so the rest of the seed is untouched.
 *
 * Money is built so it adds up: a project's `used_budget` is its linked expenses plus its labour
 * (tracked hours at the labour cost rate), closed projects sit at 86-98% of budget, and what has
 * been invoiced never exceeds the budget. The handler (handlers/projects.ts) reads everything back
 * out of these records, so edits made in the demo stay coherent.
 */

import type { DemoCountryConfig } from "./country";
import type { DemoClient, Story } from "./story";
import { makeRng, round2, type DateHelpers } from "./util";

export type ProjectStatus = "draft" | "inprogress" | "closed";
export type TaskChargeType = "hourly" | "fixed" | "per_km";
export type TaskStatus = "active" | "inactive" | "completed";

export interface ProjectRow {
  id: number;
  project_name: string;
  project_code: string;
  project_status: ProjectStatus;
  project_description: string;
  color: string;
  client_id: number;
  contact_id: number | null;
  clientDetail: { id: number; name: string; email: string; business_name: string | null };
  contactDetail: { id: number; name: string; email: string } | null;
  /** YYYY-MM-DD */
  start_date: string;
  end_date: string;
  is_budget: boolean;
  is_fixed: boolean;
  budget_type: "total" | "weekly" | "monthly";
  budget: number;
  weekly_budget: number;
  monthly_budget: number;
  show_total_budget: boolean;
  show_weekly_budget: boolean;
  show_monthly_budget: boolean;
  created_at: string;
}

export interface JobRow {
  id: number;
  project_id: number;
  job_name: string;
  job_code: string;
  job_description: string;
  is_budget: boolean;
  budget: number;
  created_at: string;
}

export interface TaskRow {
  id: number;
  project_id: number;
  project_job_id: number | null;
  task_name: string;
  charge_type: TaskChargeType;
  is_billable: boolean;
  priority: "low" | "medium" | "high";
  status: TaskStatus;
  rate: number;
  km_rate: number;
  fixed_amount: number;
  estimated_hours: number | null;
  km_distance: number | null;
  notes: string;
  stage_id: number | null;
  nps_enabled: boolean;
  nps_survey_id: number | null;
  client_id: number | null;
  contact_id: number | null;
  is_invoiced: boolean;
  invoice_id: number | null;
  created_at: string;
}

export interface TimeEntryRow {
  id: number;
  task_id: number;
  project_id: number;
  project_job_id: number | null;
  /** YYYY-MM-DD */
  log_date: string;
  /** Local ISO without a zone: 2026-11-20T08:30:00 */
  start_time: string;
  end_time: string | null;
  duration_minutes: number;
  hours_logged: number;
  rate: number;
  is_billable: boolean;
  status: "stopped" | "manual" | "running";
  is_invoiced: boolean;
  invoice_id: number | null;
  notes: string;
  client_id: number | null;
  contact_id: number | null;
}

export interface ProjectSettingsRow {
  default_hourly_rate: number;
  default_km_rate: number;
  project_prefix: string;
  project_next_number: number;
  job_prefix: string;
  job_next_number: number;
  default_budget_enabled: boolean;
  show_total_budget: boolean;
  show_weekly_budget: boolean;
  show_monthly_budget: boolean;
  default_total_budget: number | null;
  default_weekly_budget: number | null;
  default_monthly_budget: number | null;
}

export interface ProjectRecords {
  projects: ProjectRow[];
  jobs: JobRow[];
  tasks: TaskRow[];
  entries: TimeEntryRow[];
  /** expense id -> id of the project invoice it was charged on. */
  expenseInvoices: Record<string, number>;
  settings: ProjectSettingsRow;
  /** What an hour of labour costs the business (a share of the billing rate). */
  labourCostRate: number;
  /** The billing rate hourly tasks are priced from. */
  baseRate: number;
}

const COLORS = [
  "#DCEBFF",
  "#D9F5E6",
  "#FFF1D6",
  "#EBE0FF",
  "#FFE0E0",
  "#D6F3F0",
  "#FFE1F0",
  "#E0E4FF",
  "#FFE8D1",
  "#EAF5CF",
];

const TASK_KINDS: { kind: string; charge: TaskChargeType; billable: boolean }[] = [
  { kind: "Labour on site", charge: "hourly", billable: true },
  { kind: "Materials & supplies", charge: "fixed", billable: true },
  { kind: "Site visit & scoping", charge: "hourly", billable: true },
  { kind: "Travel to site", charge: "per_km", billable: true },
  { kind: "Compliance check", charge: "fixed", billable: true },
  { kind: "Internal review & admin", charge: "hourly", billable: false },
];

const IN_PROGRESS_STATUS: TaskStatus[] = ["completed", "active", "active", "completed", "inactive", "active"];
const DRAFT_STATUS: TaskStatus[] = ["active", "inactive", "inactive", "inactive", "inactive", "inactive"];

interface Plan {
  status: ProjectStatus;
  span: [number, number];
  jobs: number;
  /** Fixed end date (days from today), used for the one project that is past its end date. */
  endInDays?: number;
}

const PLAN: Plan[] = [
  { status: "inprogress", span: [-4, 1], jobs: 3 },
  { status: "inprogress", span: [-2, 1], jobs: 2 },
  { status: "closed", span: [-5, -3], jobs: 2 },
  { status: "draft", span: [0, 2], jobs: 2 },
  { status: "inprogress", span: [-3, 1], jobs: 3 },
  { status: "inprogress", span: [-5, -1], jobs: 4, endInDays: -19 },
  { status: "inprogress", span: [-1, 2], jobs: 2 },
  { status: "closed", span: [-6, -4], jobs: 3 },
  { status: "closed", span: [-4, -2], jobs: 2 },
  { status: "draft", span: [1, 3], jobs: 3 },
];

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const ceilTo = (value: number, step: number) => Math.ceil(value / step) * step;

function isoAdd(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);

function workdays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = isoAdd(d, 1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d);
  }
  return out;
}

const shortClient = (name: string) =>
  name.replace(/\s+(Residence|Family|Body Corporate|Holiday Units|Pty Ltd|Ltd|Limited)$/i, "").trim() || name;

export function buildProjectRecords(input: {
  story: Story;
  cfg: DemoCountryConfig;
  invoices: any[];
  quotes: any[];
  expenses: any[];
  dates: DateHelpers;
}): ProjectRecords {
  const { story, cfg, invoices, quotes, expenses, dates } = input;
  const { today, addDaysIso, addMonthsIso } = dates;
  const rng = makeRng(((story.seed ?? 1) ^ 0x5bd1e995) >>> 0);
  const { services, clients, suppliers } = story;

  /* ---- Rates ------------------------------------------------------------ */
  const hourly = services.find((s) => s.unit === "hours");
  const prices = services.map((s) => s.price).sort((a, b) => a - b);
  const typicalPrice = prices[Math.floor(prices.length / 2)] ?? 100;
  const baseRate = Math.min(200, Math.max(60, Math.round(hourly?.price ?? typicalPrice)));
  const labourCostRate = round2(baseRate * 0.55);

  /* ---- Which clients and what names ------------------------------------ */
  const seedProjects = story.projects;
  const usedClientIds = new Set(seedProjects.map((p) => p.clientId));
  const spare = clients.filter((c) => !usedClientIds.has(c.id));
  // The clients with the most invoices make the best project clients: there is billing to hang on them.
  const invoiceCount = (c: DemoClient) => invoices.filter((inv) => Number(inv.client_id) === Number(c.id)).length;
  const derivedClients: DemoClient[] = [...spare]
    .map((c, idx) => ({ c, idx, n: invoiceCount(c) }))
    .sort((a, b) => b.n - a.n || a.idx - b.idx)
    .slice(0, PLAN.length - seedProjects.length)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.c);
  while (derivedClients.length < PLAN.length - seedProjects.length) derivedClients.push(clients[derivedClients.length % clients.length]);
  const bigServices = services.filter(
    (s) => s.unit !== "hours" && s.price >= typicalPrice && !/call-?out|fee|labour|per hour/i.test(s.name),
  );
  const servicePool = bigServices.length >= 3 ? bigServices : services.filter((s) => s.unit !== "hours");
  const cleanService = (name: string) => name.replace(/\s*\(.*?\)/g, "").replace(/\s+supply\s*&\s*install/i, " install").trim();

  const stageNames = Array.from(new Set(seedProjects.flatMap((p) => p.jobs.map((j) => j.name))));

  /* ---- Projects and jobs ------------------------------------------------ */
  const projects: ProjectRow[] = [];
  const jobs: JobRow[] = [];
  const baseBudgets: number[] = [];

  PLAN.forEach((plan, i) => {
    const pid = i + 1;
    const seeded = seedProjects[i];
    const client: DemoClient = seeded
      ? (clients.find((c) => c.id === seeded.clientId) as DemoClient) ?? clients[i % clients.length]
      : derivedClients[i - seedProjects.length];
    const service = servicePool[(i * 2) % Math.max(servicePool.length, 1)] ?? services[0];
    const name = seeded ? seeded.name : `${shortClient(client.name)} — ${cleanService(service.name)}`;
    const code = seeded ? seeded.code : `PRO-${pid}`;

    const startDay = 3 + ((pid * 5) % 20);
    const endDay = 12 + ((pid * 7) % 14);
    const start = addMonthsIso(plan.span[0], startDay);
    const end = plan.endInDays !== undefined ? addDaysIso(plan.endInDays) : addMonthsIso(plan.span[1], endDay);

    // Jobs: the story's own for the first four, else cycle the stage names.
    const jobNames: { id: number; name: string; code: string }[] = [];
    for (let j = 0; j < plan.jobs; j++) {
      const own = seeded?.jobs[j];
      if (own) {
        jobNames.push({ id: Number(own.id), name: own.name, code: own.code });
      } else {
        let jobName = stageNames[(pid + j) % Math.max(stageNames.length, 1)] ?? `Stage ${j + 1}`;
        if (jobNames.some((x) => x.name === jobName)) jobName = `${jobName} (${j + 1})`;
        jobNames.push({ id: pid * 100 + j + 1, name: jobName, code: `${code}-J${j + 1}` });
      }
    }

    const baseBudget = Math.max(2000, roundTo(typicalPrice * (8 + ((pid * 3) % 9)), 100));
    baseBudgets.push(Math.max(baseBudget, seeded?.budget ?? 0));

    const created = addDaysIso(-Math.max(0, Math.min(200, daysBetween(start, today) + 10)));
    projects.push({
      id: pid,
      project_name: name,
      project_code: code,
      project_status: plan.status,
      project_description: `${service.name.replace(/\s*\(.*?\)/g, "")} works for ${client.name}: ${jobNames
        .map((j) => j.name.toLowerCase())
        .join(", ")}.`,
      color: COLORS[(pid - 1) % COLORS.length],
      client_id: Number(client.id),
      contact_id: Number(client.contactId),
      clientDetail: {
        id: Number(client.id),
        name: client.name,
        email: client.email,
        business_name: client.kind === "residential" ? null : client.name,
      },
      contactDetail: { id: Number(client.contactId), name: client.contact, email: client.email },
      start_date: start,
      end_date: end,
      is_budget: true,
      is_fixed: false,
      budget_type: "total",
      budget: 0,
      weekly_budget: 0,
      monthly_budget: 0,
      show_total_budget: true,
      show_weekly_budget: false,
      show_monthly_budget: false,
      created_at: created,
    });
    jobNames.forEach((j) => {
      jobs.push({
        id: j.id,
        project_id: pid,
        job_name: j.name,
        job_code: j.code,
        job_description: `${j.name} for ${name}`,
        is_budget: false,
        budget: 0,
        created_at: created,
      });
    });
  });

  /* ---- Link invoices, quotes and expenses ------------------------------- */
  const linkedInvoices = new Map<number, any[]>();
  const linkedExpenses = new Map<number, any[]>();
  const live = projects.filter((p) => p.project_status !== "draft");

  for (const p of live) {
    const winEnd = p.end_date < today ? p.end_date : today;
    const mine = invoices.filter((inv) => Number(inv.client_id) === p.client_id && !inv.project_id && inv.invoice_date <= today);
    let picked = mine.filter((inv) => inv.invoice_date >= isoAdd(p.start_date, -15) && inv.invoice_date <= isoAdd(winEnd, 15));
    if (picked.length < 2) {
      picked = mine.filter((inv) => inv.invoice_date >= isoAdd(p.start_date, -45) && inv.invoice_date <= isoAdd(winEnd, 45));
    }
    if (picked.length < 2) {
      picked = mine.filter((inv) => inv.invoice_date >= isoAdd(p.start_date, -120) && inv.invoice_date <= isoAdd(winEnd, 120));
    }
    picked = picked.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)).slice(0, 4);
    picked.forEach((inv) => {
      inv.project_id = p.id;
    });
    linkedInvoices.set(p.id, picked);

    const quote = quotes.find((q) => Number(q.client_id) === p.client_id && !q.project_id);
    if (quote) quote.project_id = p.id;
  }

  // How much of the budget each project has used, and a first estimate of the budget (from billing),
  // so the expenses linked below stay a believable share of it.
  const usedShare = new Map<number, number>();
  const estBudget = new Map<number, number>();
  const billedOf = (id: number) =>
    (linkedInvoices.get(id) ?? []).filter((inv) => inv.status !== "draft").reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  projects.forEach((p, i) => {
    if (p.project_status === "draft") return;
    let used: number;
    if (p.project_status === "closed") used = 0.86 + rng.next() * 0.1;
    else if (PLAN[i].endInDays !== undefined) used = 0.9;
    else {
      const elapsed = daysBetween(p.start_date, today) / Math.max(1, daysBetween(p.start_date, p.end_date));
      used = Math.min(0.68, Math.max(0.25, elapsed * 0.75));
    }
    usedShare.set(p.id, used);
    const billed = billedOf(p.id);
    estBudget.set(p.id, p.project_status === "closed" && billed > 0 ? billed / 0.98 : Math.max(baseBudgets[i], billed / 0.6));
  });
  const expenseTotals = new Map<number, number>();

  // Expenses that belong on a job: skip the standing costs (phone, insurance, fuel, stationery).
  const standing = /insurance|telephone|internet|fuel|motor|office|uniform|clothing/i;
  const jobSuppliers = new Set(
    suppliers
      .filter((s) => s.typical[0] !== s.typical[1] && !s.category.some((c) => standing.test(c)))
      .map((s) => String(s.id)),
  );
  const fallbackSuppliers = new Set(suppliers.filter((s) => s.typical[0] !== s.typical[1]).map((s) => String(s.id)));
  const eligibleSuppliers = jobSuppliers.size >= 2 ? jobSuppliers : fallbackSuppliers;
  const sortedExpenses = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  sortedExpenses.forEach((exp, idx) => {
    if (!eligibleSuppliers.has(String(exp.client_id)) || exp.date > today) return;
    const candidates = live.filter((p) => exp.date >= p.start_date && exp.date <= (p.end_date < today ? p.end_date : today));
    if (!candidates.length) return;
    if (rng.chance(0.3)) return; // left for the "attach existing expenses" picker
    const price = Number(exp.price || 0);
    const rotated = [...candidates.slice(idx % candidates.length), ...candidates.slice(0, idx % candidates.length)];
    const p = rotated.find((c) => (expenseTotals.get(c.id) ?? 0) + price <= Math.max((estBudget.get(c.id) ?? 0) * 0.3, 500));
    if (!p) return;
    expenseTotals.set(p.id, (expenseTotals.get(p.id) ?? 0) + price);
    const jobsOfP = jobs.filter((j) => j.project_id === p.id);
    const span = Math.max(1, daysBetween(p.start_date, p.end_date < today ? p.end_date : today));
    const frac = Math.min(0.999, Math.max(0, daysBetween(p.start_date, exp.date) / span));
    exp.project_id = p.id;
    exp.project_job_id = jobsOfP[Math.floor(frac * jobsOfP.length)]?.id ?? null;
    if (!linkedExpenses.has(p.id)) linkedExpenses.set(p.id, []);
    linkedExpenses.get(p.id)!.push(exp);
  });

  // A third of linked expenses were passed on to the client on one of the project's invoices.
  const expenseInvoices: Record<string, number> = {};
  for (const p of live) {
    const invs = (linkedInvoices.get(p.id) ?? []).filter((inv) => inv.status !== "draft");
    if (!invs.length) continue;
    (linkedExpenses.get(p.id) ?? []).forEach((exp, k) => {
      if (k % 3 !== 0) return;
      const inv = invs.find((x) => x.invoice_date >= exp.date) ?? invs[invs.length - 1];
      expenseInvoices[String(exp.expense_id)] = Number(inv.invoice_id);
    });
  }

  /* ---- Budgets, tasks and time ------------------------------------------ */
  const tasks: TaskRow[] = [];
  const entries: TimeEntryRow[] = [];
  let taskId = 1;
  let entryId = 1;

  projects.forEach((p, i) => {
    const plan = PLAN[i];
    const projectJobs = jobs.filter((j) => j.project_id === p.id);
    const invs = (linkedInvoices.get(p.id) ?? []).filter((inv) => inv.status !== "draft");
    const expenseSum = (linkedExpenses.get(p.id) ?? []).reduce((sum, e) => sum + Number(e.price || 0), 0);
    const isLive = p.project_status !== "draft";
    const winEnd = p.end_date < today ? p.end_date : today;

    const used = usedShare.get(p.id) ?? 0;
    const minLabour = 600 + (i % 3) * 150;
    let budget = baseBudgets[i];
    if (isLive) budget = Math.max(estBudget.get(p.id) ?? budget, (expenseSum + minLabour) / used);
    budget = ceilTo(budget, 100);
    p.budget = budget;

    // Tasks ----------------------------------------------------------------
    const taskCount = 3 + ((i * 2) % 4);
    const offset = (i + 1) % 3;
    const weights = Array.from({ length: taskCount }, () => 1 + rng.next() * 2);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const valueShare = p.project_status === "closed" ? 0.9 : isLive ? 0.4 : 0.75;
    const projectTasks: TaskRow[] = [];
    for (let t = 0; t < taskCount; t++) {
      const kind = TASK_KINDS[(offset + t) % TASK_KINDS.length];
      const job = projectJobs[t % projectJobs.length];
      const status: TaskStatus =
        p.project_status === "closed" ? "completed" : isLive ? IN_PROGRESS_STATUS[t % 6] : DRAFT_STATUS[t % 6];
      let value = (budget * valueShare * weights[t]) / weightSum;
      if (!kind.billable) value *= 0.25;
      if (kind.charge === "per_km") value *= 0.4;
      const rate = round2(baseRate * [1, 1, 1.15, 0.9][(i + t) % 4]);
      const kmRate = round2(cfg.kmRate * [1, 1.1, 0.95][(i + t) % 3] * 1.0);
      const invoiced =
        isLive && invs.length > 0 && status === "completed" && kind.billable && (p.project_status === "closed" || t % 2 === 0);
      const row: TaskRow = {
        id: taskId++,
        project_id: p.id,
        project_job_id: job.id,
        task_name: `${job.job_name} — ${kind.kind}`,
        charge_type: kind.charge,
        is_billable: kind.billable,
        priority: (["high", "medium", "low"] as const)[(i + t) % 3],
        status,
        rate: kind.charge === "per_km" ? 0 : kind.charge === "hourly" ? rate : 0,
        km_rate: kind.charge === "per_km" ? kmRate : 0,
        fixed_amount: kind.charge === "fixed" ? Math.max(50, roundTo(value, 10)) : 0,
        estimated_hours: kind.charge === "hourly" ? Math.max(1, Math.round((value / rate) * 2) / 2) : null,
        km_distance: kind.charge === "per_km" ? Math.max(10, Math.round(value / kmRate)) : null,
        notes: t % 2 === 0 ? `Agreed with ${p.contactDetail?.name ?? p.clientDetail.name} at kick-off.` : "",
        stage_id: null,
        nps_enabled: false,
        nps_survey_id: null,
        client_id: p.client_id,
        contact_id: p.contact_id,
        is_invoiced: invoiced,
        invoice_id: invoiced ? Number(invs[invs.length - 1].invoice_id) : null,
        created_at: isLive ? (isoAdd(p.start_date, t * 12) < winEnd ? isoAdd(p.start_date, t * 12) : winEnd) : p.start_date,
      };
      projectTasks.push(row);
      tasks.push(row);
    }

    // Job budgets: every other job carries one.
    projectJobs.forEach((job, j) => {
      if (j % 2 === 0) {
        job.is_budget = true;
        job.budget = ceilTo((budget / projectJobs.length) * 1.1, 100);
      }
    });

    if (!isLive) return;

    // Time -----------------------------------------------------------------
    const labourCost = Math.max(minLabour, budget * used - expenseSum);
    const totalHours = labourCost / labourCostRate;
    const workable = projectTasks.filter((t) => t.status !== "inactive" && t.charge_type !== "per_km");
    const pool = workable.length ? workable : projectTasks;
    const n = Math.min(150, Math.max(6, Math.ceil(totalHours / 6)));
    const raw = Array.from({ length: n }, () => 1 + rng.next() * 2.4);
    const rawSum = raw.reduce((a, b) => a + b, 0);
    const hoursList = raw.map((r) => Math.max(0.5, Math.round(((r / rawSum) * totalHours) * 4) / 4));
    const drift = Math.round((totalHours - hoursList.reduce((a, b) => a + b, 0)) * 4) / 4;
    hoursList[hoursList.length - 1] = Math.max(0.25, hoursList[hoursList.length - 1] + drift);

    const days = workdays(p.start_date, winEnd);
    const recent7 = days.filter((d) => d >= isoAdd(today, -6));
    const recent21 = days.filter((d) => d >= isoAdd(today, -20));
    const recentRight = p.project_status === "inprogress" && plan.endInDays === undefined;
    const dated = hoursList.map((hours, k) => {
      let day: string;
      if (recentRight && k < 4 && recent7.length) day = recent7[k % recent7.length];
      else if (recentRight && k < 12 && recent21.length) day = recent21[rng.int(0, recent21.length - 1)];
      else day = days[rng.int(0, Math.max(0, days.length - 1))] ?? p.start_date;
      return { hours, day };
    });
    dated.sort((a, b) => a.day.localeCompare(b.day));

    dated.forEach(({ hours, day }, k) => {
      const task = pool[(k + i) % pool.length];
      const startHour = 6 + rng.int(0, 8);
      const startMin = rng.int(0, 3) * 15;
      const lengthMinutes = Math.round(hours * 60);
      const startMinutes = Math.max(0, Math.min(startHour * 60 + startMin, 23 * 60 + 45 - lengthMinutes));
      const endMinutes = Math.min(23 * 60 + 45, startMinutes + lengthMinutes);
      const stamp = (mins: number) =>
        `${day}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00`;
      const invoice = invs.find((inv) => inv.invoice_date >= day) ?? invs[invs.length - 1];
      const invoiced = !!invoice && task.is_billable && day <= isoAdd(today, -21);
      entries.push({
        id: entryId++,
        task_id: task.id,
        project_id: p.id,
        project_job_id: task.project_job_id,
        log_date: day,
        start_time: stamp(startMinutes),
        end_time: stamp(endMinutes),
        duration_minutes: Math.round(hours * 60),
        hours_logged: hours,
        rate: task.charge_type === "hourly" ? task.rate : 0,
        is_billable: task.is_billable,
        status: k % 7 === 3 ? "manual" : "stopped",
        is_invoiced: invoiced,
        invoice_id: invoiced ? Number(invoice.invoice_id) : null,
        notes: `${task.task_name}`,
        client_id: p.client_id,
        contact_id: p.contact_id,
      });
    });
  });

  const settings: ProjectSettingsRow = {
    default_hourly_rate: baseRate,
    default_km_rate: cfg.kmRate,
    project_prefix: "PRO",
    project_next_number: PLAN.length + 1,
    job_prefix: "JOB",
    job_next_number: 1,
    default_budget_enabled: true,
    show_total_budget: true,
    show_weekly_budget: false,
    show_monthly_budget: false,
    default_total_budget: null,
    default_weekly_budget: null,
    default_monthly_budget: null,
  };

  return { projects, jobs, tasks, entries, expenseInvoices, settings, labourCostRate, baseRate };
}
