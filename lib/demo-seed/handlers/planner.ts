/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like mock-server.ts */
import type { DemoHandler, HandlerCtx, HandlerResponse } from "./types";

/*
 * The task Planner (kanban board and list): tasks across four stages, generated from the
 * business's own clients, services and projects, dated around today so there is always work
 * overdue, due today and coming up.
 *
 * What the board shows and what the Calendar shows agree: the calendar's own events are the first
 * six tasks. Moving a card to another stage, or bulk-moving to the final stage, changes the tasks.
 */

const STAGES = [
  { id: "1", name: "To Do", order: 1, color: "#94a3b8", bg_color: "rgba(148, 163, 184, 0.12)", category: "open" },
  { id: "2", name: "In Progress", order: 2, color: "#38bdf8", bg_color: "rgba(56, 189, 248, 0.12)", category: "open" },
  { id: "3", name: "Review / Testing", order: 3, color: "#f59e0b", bg_color: "rgba(245, 158, 11, 0.12)", category: "open" },
  { id: "4", name: "Invoiced", order: 4, color: "#10b981", bg_color: "rgba(16, 185, 129, 0.12)", category: "closed" },
];

const PAGE = 8;
const ok = (data: any, extra: Record<string, unknown> = {}): HandlerResponse => ({ status: 200, data: { success: true, ...extra, data } });
const round2 = (n: number) => Math.round(n * 100) / 100;

const stores = new WeakMap<object, any[]>();

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function party(c: any) {
  return c ? { id: Number(c.id), label: c.name, name: c.name, email: c.email } : null;
}

function build(ctx: HandlerCtx): any[] {
  const { seed, story, today } = ctx;
  const clients = seed.clients as any[];
  const services = story.services;
  const projects = ((seed as any).projectRecords?.projects as any[]) ?? [];
  const jobs = ((seed as any).projectRecords?.jobs as any[]) ?? [];
  const tasks: any[] = [];

  // The calendar's events are tasks too.
  for (const e of seed.calendarEvents as any[]) {
    tasks.push({
      id: `e${e.id}`,
      event_id: `e${e.id}`,
      calendarId: String(e.id),
      task_name: e.task_name ?? e.title,
      task_details: e.task_details ?? "",
      label: "business",
      priority: e.priority ?? "medium",
      stage_id: String(e.stage_id ?? "1"),
      start_time: e.start_at,
      end_time: e.end_at,
      completed_at: String(e.stage_id) === "4" ? e.end_at : null,
      created_at: `${addDays(today, -20)}T09:00:00.000Z`,
      is_billable: Boolean(e.is_billable),
      fixed_amount: e.amount ?? 0,
      client: e.client ? { id: Number(e.client.id ?? e.client_id), label: e.client.name, name: e.client.name, email: clients.find((c) => String(c.id) === String(e.client_id))?.email ?? "" } : null,
      contact: null,
      project_id: e.project_id ?? "",
      project_name: e.project_name ?? "",
      job_id: "",
      job_name: "",
    });
  }

  const offsets = [-12, -9, -6, -4, -3, -2, -1, 0, 0, 1, 2, 3, 4, 6, 9, 12];
  const stageFor = [4, 4, 4, 3, 2, 2, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1];
  const hours = ["08:00", "09:30", "11:00", "13:00", "14:30", "16:00"];
  offsets.forEach((offset, i) => {
    const client = clients[(i * 3 + 2) % clients.length];
    const service = services[(i * 2 + 1) % services.length];
    const qty = service.unit === "hours" ? 2 + (i % 3) : 1 + (i % 2);
    const project = projects.length && i % 3 !== 2 ? projects[i % projects.length] : null;
    const projectJobs = project ? jobs.filter((j: any) => j.project_id === project.id) : [];
    const job = projectJobs.length ? projectJobs[i % projectJobs.length] : null;
    const date = addDays(today, offset);
    const startHour = hours[i % hours.length];
    const endHour = String(Number(startHour.slice(0, 2)) + 1 + (i % 3)).padStart(2, "0") + startHour.slice(2);
    const stage = String(stageFor[i]);
    tasks.push({
      id: `t${i + 1}`,
      event_id: `t${i + 1}`,
      task_name: `${client.name} — ${service.name}`,
      task_details: `${service.name} for ${client.contact} (${client.name}).`,
      label: "business",
      priority: ["high", "medium", "low"][i % 3],
      stage_id: stage,
      start_time: `${date}T${startHour}:00.000Z`,
      end_time: `${date}T${endHour}:00.000Z`,
      completed_at: stage === "4" ? `${date}T${endHour}:00.000Z` : null,
      created_at: `${addDays(today, offset - 7)}T09:00:00.000Z`,
      is_billable: i % 4 !== 3,
      fixed_amount: round2(service.price * qty),
      client: party(client),
      contact: { id: Number(client.contactId), label: client.contact, name: client.contact, email: client.email },
      project_id: project ? String(project.id) : "",
      project_name: project ? project.project_name : "",
      job_id: job ? String(job.id) : "",
      job_name: job ? job.job_name : "",
    });
  });
  return tasks;
}

const tasksOf = (ctx: HandlerCtx): any[] => {
  let t = stores.get(ctx.seed);
  if (!t) stores.set(ctx.seed, (t = build(ctx)));
  return t;
};

const listParam = (params: Record<string, any>, key: string): string[] => {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (k === key || k.startsWith(`${key}[`)) for (const x of Array.isArray(v) ? v : [v]) if (x !== "" && x != null) out.push(String(x));
  }
  return out;
};

function filtered(ctx: HandlerCtx): any[] {
  const { params, today } = ctx;
  const search = String(params.search ?? "").trim().toLowerCase();
  const clients = listParam(params, "client_id");
  const contacts = listParam(params, "contact_id");
  const from = params.start_date ? String(params.start_date).slice(0, 10) : "";
  const to = params.end_date ? String(params.end_date).slice(0, 10) : "";
  const billable = String(params.billable) === "true" || params.billable === true || params.billable === 1;
  const overdue = String(params.overdue) === "true" || params.overdue === true || params.overdue === 1;

  const rows = tasksOf(ctx).filter((t) => {
    if (search && !`${t.task_name} ${t.client?.label ?? ""} ${t.project_name}`.toLowerCase().includes(search)) return false;
    if (clients.length && !clients.includes(String(t.client?.id))) return false;
    if (contacts.length && !contacts.includes(String(t.contact?.id))) return false;
    if (from && String(t.start_time).slice(0, 10) < from) return false;
    if (to && String(t.start_time).slice(0, 10) > to) return false;
    if (billable && !t.is_billable) return false;
    if (overdue && !(t.stage_id !== "4" && String(t.end_time).slice(0, 10) < today)) return false;
    return true;
  });

  const sort = String(params.sortBy ?? "date");
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...rows].sort((a, b) => {
    if (sort === "priority") return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || String(a.start_time).localeCompare(String(b.start_time));
    if (sort === "overdue") {
      const ao = a.stage_id !== "4" && String(a.end_time).slice(0, 10) < today ? 0 : 1;
      const bo = b.stage_id !== "4" && String(b.end_time).slice(0, 10) < today ? 0 : 1;
      return ao - bo || String(a.start_time).localeCompare(String(b.start_time));
    }
    return String(a.start_time).localeCompare(String(b.start_time));
  });
}

function column(ctx: HandlerCtx, stageId: string, cursor: number) {
  const rows = filtered(ctx).filter((t) => t.stage_id === stageId);
  const page = rows.slice(cursor, cursor + PAGE);
  return { cards: page, next_cursor: cursor + PAGE < rows.length ? String(cursor + PAGE) : null, total: rows.length };
}

export const handle: DemoHandler = (ctx) => {
  const { method, path, params } = ctx;

  if (method === "GET") {
    if (path === "/stage" || path === "/stage/list" || path === "/stage/default-seed") return ok(STAGES);

    if (path === "/planner") {
      return ok(
        STAGES.map((s) => {
          const col = column(ctx, s.id, 0);
          return { ...s, stage_id: s.id, stage_name: s.name, cards: col.cards, tasks: col.cards, next_cursor: col.next_cursor, total: col.total };
        }),
      );
    }

    const stage = /^\/planner\/stage\/(\d+)$/.exec(path);
    if (stage) {
      const cursor = Number(params.cursor ?? params.next_cursor ?? 0) || 0;
      const col = column(ctx, stage[1], cursor);
      return ok({ cards: col.cards, next_cursor: col.next_cursor });
    }

    if (path === "/planner/tasks") {
      const page = Math.max(1, Number(params.page) || 1);
      const limit = Math.max(1, Number(params.limit ?? params.page_size) || 5);
      const rows = filtered(ctx).map((t) => {
        const s = STAGES.find((x) => x.id === t.stage_id);
        return { ...t, stage_name: s?.name, stage_color: s?.color, stage_bg_color: s?.bg_color };
      });
      return ok({ rows: rows.slice((page - 1) * limit, page * limit), pagination: { total: rows.length, page, limit } });
    }
    return null;
  }

  const moved = /^\/calendar\/(.+)$/.exec(path);
  if ((method === "PUT" || method === "PATCH") && moved) {
    const fields = ctx.fields();
    if (fields.stage_id === undefined) return null; // any other calendar edit isn't kept
    const task = tasksOf(ctx).find((t) => t.event_id === moved[1] || t.calendarId === moved[1]);
    if (!task) return null;
    task.stage_id = String(fields.stage_id);
    task.completed_at = task.stage_id === "4" ? task.end_time : null;
    const event = (ctx.seed.calendarEvents as any[]).find((e) => String(e.id) === String(task.calendarId));
    if (event) event.stage_id = task.stage_id;
    return ok({ id: task.id }, { message: "Stage updated." });
  }

  if (method === "POST" && path === "/planner/tasks/bulk-move-final") {
    const ids: string[] = (Array.isArray(ctx.fields().event_ids) ? ctx.fields().event_ids : []).map(String);
    for (const t of tasksOf(ctx)) {
      if (ids.includes(String(t.event_id))) {
        t.stage_id = "4";
        t.completed_at = t.end_time;
      }
    }
    return ok(null, { message: `${ids.length} task(s) moved.` });
  }

  const draft = /^\/planner\/event\/(.+)$/.exec(path);
  if (method === "PUT" && draft) {
    const t = tasksOf(ctx).find((x) => String(x.event_id) === draft[1]);
    if (!t) return null;
    t.stage_id = "4";
    t.completed_at = t.end_time;
    return ok(null, { message: "Invoice drafted." });
  }
  return null;
};
