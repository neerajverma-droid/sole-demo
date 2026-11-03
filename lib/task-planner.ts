/**
 * Task planner — the Scheduling add-on's board and list of calendar tasks,
 * moved through the account's stages (Backlog → To do → In progress → Done).
 *
 * Not the business planner (`lib/planner.ts`), which is budgets and goals.
 *
 * Ported from sole-webapp's `components/Planner` (Kanban/utils.js,
 * KanbanBoard, PlannerListView, KanbanInvoiceFlow) and `utils/filterQuery.js`.
 * Behaviour is deliberately the same — the board and list read the same
 * endpoints with the same params, and a task is identified by its calendar
 * `event_id` exactly as there.
 */
import type { CalendarEvent, CalendarUser } from "@/lib/calendar";
import { newLineItem, type InvoiceLineItem, type InvoiceSeed } from "@/lib/invoices";
import { activeCurrencySymbol } from "@/lib/country-context";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type PlannerView = "board" | "list";

/** A row as `/planner`, `/planner/stage/:id` and `/planner/tasks` return it. */
export type RawPlannerTask = Record<string, unknown> & {
  id?: string | number;
  _id?: string | number;
  event_id?: string | number;
  task_id?: string | number | null;
  task_name?: string;
  event_name?: string;
  title?: string;
  name?: string;
  task_details?: string;
  description?: string;
  priority?: string | null;
  stage_id?: string | number;
  status_id?: string | number;
  statusId?: string | number;
  label?: string;
  type?: string;
  category?: string;
  start_time?: string;
  start_date?: string;
  startDate?: string;
  event_start_at?: string;
  end_time?: string;
  end_date?: string;
  endDate?: string;
  event_end_at?: string;
  completed_at?: string | null;
  completedAt?: string | null;
  created_at?: string;
  createdAt?: string;
  is_billable?: boolean | number | string;
  fixed_amount?: string | number | null;
  amount?: string | number | null;
  price?: string | number | null;
  project_id?: string | number;
  project_name?: string;
  job_id?: string | number;
  job_name?: string;
};

type RawParty = Record<string, unknown> | null | undefined;

export type PlannerTask = {
  /** The board's key — the calendar event id, which is what every write uses. */
  id: string;
  /** "568" or "568_occ_3" for an occurrence of a recurring series. */
  event_id: string;
  /** Always null: the planner card is never the series' task row itself. */
  task_id: null;
  /** The task row behind the event, for its time entries. */
  source_task_id: string | number | null;
  priority: string | null;
  statusId: string;
  stage_id: string;
  task_name: string;
  task_details: string;
  label: "personal" | "business";
  start_time: string | null;
  end_time: string | null;
  completed_at: string | null;
  created_at: string | null;
  client: { id: string; label: string; email: string } | null;
  contact: { id: string; label: string; email: string } | null;
  calendar: { id: string; provider: string; email: string } | null;
  project_id: string;
  project_name: string;
  job_id: string;
  job_name: string;
  is_billable: boolean;
  fixed_amount: string | number;
  /** List rows only — the stage arrives on the row rather than as a column. */
  stage_name?: string;
  stage_color?: string;
  stage_bg_color?: string;
  stage_border_color?: string;
};

export type PlannerStage = {
  id: string;
  name: string;
  order: number;
  color: string;
  bgColor: string;
  category: string;
  nextCursor: string | null;
  isDefault: boolean;
};

export type PlannerSort = "date" | "priority" | "overdue";

export type PlannerFilters = {
  search: string;
  contact_id: string[];
  /** Kept equal to `contact_id` — an alias the old URLs and API still read. */
  client_id: string[];
  start_date: string | null;
  end_date: string | null;
  sortBy: string;
  billable: boolean;
  overdue: boolean;
};

export const DEFAULT_PLANNER_FILTERS: PlannerFilters = {
  search: "",
  contact_id: [],
  client_id: [],
  start_date: null,
  end_date: null,
  sortBy: "date",
  billable: false,
  overdue: false,
};

export const SORT_OPTIONS: { id: PlannerSort; name: string }[] = [
  { id: "date", name: "Date" },
  { id: "priority", name: "Priority" },
  { id: "overdue", name: "Overdue" },
];

/** A client for the filter, from `/contact/list`. */
export type PlannerClient = { contact_id: string; id: string; name: string };

/* ------------------------------------------------------------------ *
 * Normalising rows
 * ------------------------------------------------------------------ */

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function party(value: RawParty, labelKeys: string[]) {
  if (!value) return null;
  const label = labelKeys.map((key) => value[key]).find(Boolean);
  return {
    id: str(value.id || value.client_id || value.contact_id || value._id),
    label: str(label),
    email: str(value.email || value.client_email),
  };
}

function nested(item: RawPlannerTask, ...keys: string[]): RawParty {
  for (const key of keys) {
    const value = item[key];
    if (value && typeof value === "object") return value as Record<string, unknown>;
  }
  return null;
}

/** Kanban/utils.js `normalizePlannerTask`, field for field. */
export function normalizePlannerTask(
  item: RawPlannerTask,
  stageId: string | number | null | undefined,
  index: number,
): PlannerTask {
  const client = nested(item, "client", "clientDetail");
  const contact = nested(item, "contact", "contactDetail");
  const calendar = nested(item, "calendar");
  const project = nested(item, "projectDetail", "project");
  const job = nested(item, "jobDetail", "job");

  const taskName =
    item.task_name || item.event_name || item.title || item.name || "Untitled task";
  const details = item.task_details || item.description || "";
  const startTime =
    item.start_time || item.start_date || item.startDate || item.event_start_at || null;
  const endTime =
    item.end_time || item.end_date || item.endDate || item.event_end_at || null;
  const label = item.label || item.type || item.category || "";
  const stage = str(stageId || item.stage_id || item.status_id || item.statusId);

  return {
    id: str(item.event_id || item.id || item._id || `${stageId}-${index}`),
    event_id: str(item.event_id || item.id),
    task_id: null,
    source_task_id: item.task_id ?? null,
    priority: item.priority ?? null,
    statusId: stage,
    stage_id: stage,
    task_name: taskName,
    task_details: details,
    label: label === "business" ? "business" : "personal",
    start_time: startTime,
    end_time: endTime,
    completed_at: item.completed_at || item.completedAt || null,
    created_at: item.created_at || item.createdAt || null,
    client: party(client, ["label", "name", "display_name", "company_name", "client_name"]),
    contact: party(contact, ["name"]),
    calendar: calendar
      ? {
          id: str(calendar.id || calendar.calendar_id || calendar._id),
          provider: str(calendar.provider),
          email: str(calendar.email),
        }
      : null,
    project_id: str(item.project_id || project?.id),
    project_name: str(item.project_name || project?.project_name || project?.name),
    job_id: str(item.job_id || job?.id),
    job_name: str(item.job_name || job?.job_name || job?.name),
    is_billable: Boolean(item.is_billable),
    fixed_amount: item.fixed_amount ?? item.amount ?? item.price ?? "",
  };
}

/** A `/planner/tasks` row, which also carries its stage's name and colours. */
export function normalizeListTask(item: RawPlannerTask, index: number): PlannerTask {
  const stage = nested(item, "stage");
  const status = nested(item, "status");
  const stageId = item.stage_id || item.status_id || stage?.id || status?.id || item.stageId || "";
  return {
    ...normalizePlannerTask(item, stageId as string, index),
    stage_name: str(
      item.stage_name || stage?.name || status?.name || stage?.label || status?.label,
    ),
    stage_color: str(stage?.color || status?.color || item.stage_color || item.status_color),
    stage_bg_color: str(
      stage?.bg_color || status?.bg_color || item.stage_bg_color || item.status_bg_color,
    ),
    stage_border_color: str(
      stage?.border_color ||
        status?.border_color ||
        item.stage_border_color ||
        item.status_border_color,
    ),
  };
}

/** `#RRGGBB` (or `#RGB`) as a translucent wash, slate when it can't be read. */
export function hexToRgba(hex: string | undefined, alpha = 0.12): string {
  const fallback = `rgba(203, 213, 225, ${alpha})`;
  if (!hex || typeof hex !== "string") return fallback;
  const normalized = hex.replace("#", "");
  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  if (safeHex.length !== 6) return fallback;
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(safeHex.slice(at, at + 2), 16));
  if ([r, g, b].some((value) => Number.isNaN(value))) return fallback;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type RawPlannerStage = Record<string, unknown> & {
  stage_id?: string | number;
  id?: string | number;
  stage_name?: string;
  name?: string;
  order?: number | string;
  color?: string;
  bg_color?: string;
  category?: string;
  next_cursor?: string | null;
  nextCursor?: string | null;
  pagination?: { next_cursor?: string | null; nextCursor?: string | null };
  is_default?: boolean;
  isDefault?: boolean;
  cards?: RawPlannerTask[];
};

export function stageNextCursor(stage: RawPlannerStage): string | null {
  return (
    stage.next_cursor ||
    stage.nextCursor ||
    stage.pagination?.next_cursor ||
    stage.pagination?.nextCursor ||
    null
  );
}

export function normalizePlannerStage(stage: RawPlannerStage, index: number): PlannerStage {
  const name = stage.stage_name || stage.name || "Untitled stage";
  return {
    id: str(stage.stage_id || stage.id || `stage-${index + 1}`),
    name,
    order: Number(stage.order ?? index),
    color: stage.color || "#CBD5E1",
    bgColor: stage.bg_color || hexToRgba(stage.color || "#CBD5E1"),
    category: stage.category || "",
    nextCursor: stageNextCursor(stage),
    isDefault: Boolean(stage.isDefault || stage.is_default),
  };
}

/** The board's columns and every card, from one `/planner` response. */
export function normalizeBoard(stages: RawPlannerStage[]) {
  const columns = stages.map(normalizePlannerStage).sort((a, b) => a.order - b.order);
  const tasks = stages.flatMap((stage, stageIndex) =>
    (stage.cards || []).map((card, cardIndex) =>
      normalizePlannerTask(card, stage.stage_id || stage.id || `stage-${stageIndex + 1}`, cardIndex),
    ),
  );
  return { columns, tasks };
}

/**
 * A response's rows, wherever this endpoint put them — the old service read
 * every one of these shapes, so they're all still honoured.
 */
export function rowsFromPayload<T = unknown>(payload: unknown): T[] {
  const p = payload as Record<string, unknown> & {
    data?: { cards?: unknown };
    stage?: { cards?: unknown };
  };
  const candidates = [
    payload,
    p?.cards,
    p?.data?.cards,
    p?.stage?.cards,
    p?.data,
    p?.rows,
    p?.events,
    p?.tasks,
  ];
  const found = candidates.find(Array.isArray);
  return (found as T[]) ?? [];
}

export function nextCursorFromPayload(payload: unknown): string | null {
  const p = payload as Record<string, Record<string, unknown> | undefined> | undefined;
  return (
    (p?.next_cursor as unknown as string) ||
    (p?.nextCursor as unknown as string) ||
    (p?.data?.next_cursor as string) ||
    (p?.data?.nextCursor as string) ||
    (p?.stage?.next_cursor as string) ||
    (p?.stage?.nextCursor as string) ||
    null
  );
}

export function totalFromPayload(payload: unknown): number {
  const p = payload as Record<string, Record<string, unknown> | undefined> | undefined;
  const pagination =
    (p?.pagination as Record<string, unknown>) ||
    (p?.data?.pagination as Record<string, unknown>) ||
    ((p?.meta as Record<string, unknown>)?.pagination as Record<string, unknown>) ||
    (p?.meta as Record<string, unknown>) ||
    {};
  return Number(
    pagination.total ||
      pagination.total_records ||
      pagination.count ||
      (p as Record<string, unknown> | undefined)?.total ||
      p?.data?.total ||
      0,
  );
}

/* ------------------------------------------------------------------ *
 * Filters, the URL and the API
 * ------------------------------------------------------------------ */

/** `utils/filterQuery.js` `filtersToQuery` — the planner's URL. */
export function filtersToQuery(filters: PlannerFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.search) query.search_query = filters.search;
  if (filters.contact_id.length) query.contact_id = filters.contact_id.join(",");
  if (filters.client_id.length) query.client_id = filters.client_id.join(",");
  if (filters.start_date) query.start_date = filters.start_date;
  if (filters.end_date) query.end_date = filters.end_date;
  if (filters.sortBy) query.sortBy = filters.sortBy;
  if (filters.billable) query.billable = "true";
  if (filters.overdue) query.overdue = "true";
  return query;
}

export function queryToFilters(query: { get(key: string): string | null }): PlannerFilters {
  const list = (key: string) => {
    const value = query.get(key);
    return value ? value.split(",") : [];
  };
  return {
    search: query.get("search_query") || "",
    contact_id: list("contact_id"),
    client_id: list("client_id"),
    start_date: query.get("start_date") || null,
    end_date: query.get("end_date") || null,
    sortBy: query.get("sortBy") || "date",
    billable: query.get("billable") === "true",
    overdue: query.get("overdue") === "true",
  };
}

/** The contacts filtered on — `contact_id`, falling back to the legacy alias. */
function filterContactIds(filters: PlannerFilters): string[] {
  if (filters.contact_id.length) return filters.contact_id;
  if (filters.client_id.length) return filters.client_id;
  return [];
}

/**
 * Query params for the board, a column's next page, and the list — each only
 * when set, so a default filter sends nothing, exactly as before.
 */
export function plannerParams(filters: PlannerFilters): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (filters.search) params.search = filters.search;
  if (filters.overdue) params.overdue = true;
  const contactIds = filterContactIds(filters);
  if (contactIds.length > 0) params.contact_id = contactIds;
  if (filters.start_date) params.start_date = filters.start_date;
  if (filters.end_date) params.end_date = filters.end_date;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.billable) params.billable = true;
  return params;
}

export function activeFilterCount(filters: PlannerFilters): number {
  return (
    filterContactIds(filters).length +
    (filters.billable ? 1 : 0) +
    (filters.start_date || filters.end_date ? 1 : 0)
  );
}

/** The sort the dropdown shows: "Overdue" is a filter flag, the rest are sortBy. */
export function currentSort(filters: PlannerFilters): PlannerSort {
  if (filters.overdue) return "overdue";
  return (SORT_OPTIONS.find((option) => option.id === filters.sortBy)?.id ?? "date") as PlannerSort;
}

export function applySort(filters: PlannerFilters, sort: PlannerSort): PlannerFilters {
  if (sort === "overdue") return { ...filters, overdue: true };
  return { ...filters, sortBy: sort, overdue: false };
}

/* ------------------------------------------------------------------ *
 * Stages
 * ------------------------------------------------------------------ */

/** The final stage — highest order — where invoiced work lands. */
export function finalStageOf<T extends { id?: string | number; order?: number | string }>(
  stages: T[],
): T | null {
  if (stages.length === 0) return null;
  const maxOrder = Math.max(...stages.map((stage) => Number(stage.order ?? -1)));
  return stages.find((stage) => Number(stage.order ?? -1) === maxOrder) ?? null;
}

/** A Done column: cards there are locked and moving in goes via the invoice flow. */
export function isDoneStage(stage: Pick<PlannerStage, "category" | "name"> | undefined): boolean {
  return stage?.category === "closed" || stage?.name?.toLowerCase?.() === "done";
}

/** A list row in the final stage — by id once it's known, by name until then. */
export function isFinalStageTask(task: PlannerTask, finalStageId: string | number | null): boolean {
  if (finalStageId) return String(task.stage_id || task.statusId) === String(finalStageId);
  return String(task.stage_name || "").trim().toLowerCase().includes("done");
}

/* ------------------------------------------------------------------ *
 * Moving cards
 * ------------------------------------------------------------------ */

/**
 * KanbanBoard's `moveTaskWithinColumns`: take the card out, put it into the
 * target column at `toIndex`. Returns the same array when nothing changes.
 */
export function moveTaskWithinColumns(
  prev: PlannerTask[],
  taskId: string,
  fromColumnId: string,
  toColumnId: string,
  toIndex: number,
): PlannerTask[] {
  const movingIndex = prev.findIndex((task) => task.id === taskId);
  if (movingIndex === -1) return prev;

  const next = [...prev];
  const moving = { ...next[movingIndex], statusId: toColumnId, stage_id: toColumnId };
  next.splice(movingIndex, 1);

  const targetCount = next.filter((task) => task.statusId === toColumnId).length;
  const boundedIndex = Math.max(0, Math.min(toIndex, targetCount));

  if (fromColumnId === toColumnId) {
    const sourceIndex = prev
      .filter((task) => task.statusId === fromColumnId)
      .findIndex((task) => task.id === taskId);
    if (sourceIndex === boundedIndex) return prev;
  }

  let insertionIndex = next.length;
  if (boundedIndex === targetCount) {
    for (let i = 0; i < next.length; i += 1) {
      if (next[i].statusId === toColumnId) insertionIndex = i + 1;
    }
  } else {
    let seen = 0;
    for (let i = 0; i < next.length; i += 1) {
      if (next[i].statusId !== toColumnId) continue;
      if (seen === boundedIndex) {
        insertionIndex = i;
        break;
      }
      seen += 1;
    }
  }

  next.splice(insertionIndex, 0, moving);
  return next;
}

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

export function isOverdueTask(task: PlannerTask, locked: boolean, now = new Date()): boolean {
  if (locked || !task.end_time) return false;
  return new Date(task.end_time) < now;
}

export function getInitials(value: string): string {
  const parts = (value || "")
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "NA";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export function taskClientName(task: PlannerTask): string {
  return task.contact?.label || task.client?.label || "";
}

export function taskClientEmail(task: PlannerTask): string {
  return task.contact?.email || task.client?.email || "";
}

/** "Oct 12, 9:00 AM" on a card. */
export function formatCardDateTime(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "12-10-2026, 9:00 AM" in a list cell. */
export function formatListDateTime(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  return `${formatListDate(value)}, ${time}`;
}

export function formatListDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

export function formatAmount(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const raw = String(value).trim();
  if (!raw) return "—";
  const symbol = activeCurrencySymbol();
  return raw.startsWith("$") || raw.startsWith(symbol) ? raw : `${symbol}${raw}`;
}

/** The calendar's details dialog and task form take an event; this is the card as one. */
export function plannerTaskAsEvent(task: PlannerTask, user: CalendarUser): CalendarEvent {
  const start = task.start_time || task.created_at || new Date().toISOString();
  const end = task.end_time || start;
  return {
    ...(task as unknown as Record<string, unknown>),
    id: task.id,
    event_id: task.event_id,
    task_id: null,
    title: task.task_name,
    displayTitle: task.task_name,
    description: task.task_details,
    startDate: new Date(start).toISOString(),
    endDate: new Date(end).toISOString(),
    color: "#DBEAFE",
    border_color: "#1D4ED8",
    user,
    is_recurring_parent: false,
    is_occurrence: task.event_id.includes("_occ_"),
  } as CalendarEvent;
}

export const PLANNER_USER: CalendarUser = { id: "planner-user", name: "Planner", picturePath: null };

/* ------------------------------------------------------------------ *
 * Invoicing a task from its time entries
 * ------------------------------------------------------------------ */

/** One uninvoiced time entry, joined with its task's charge settings. */
export type TaskTimeEntry = {
  id: string | number;
  duration_minutes?: number | string;
  amount?: number | string | null;
  is_invoiced?: boolean;
  task_id?: string | number;
  task_name?: string;
  charge_type?: string;
  rate?: number | string;
  client_id?: string | number | null;
  contact_id?: string | number | null;
  client_name?: string;
  project_id?: string | number | null;
  project_name?: string;
  is_billable?: boolean;
};

type RawTimeLogGroup = {
  task_id?: string | number;
  task_name?: string;
  charge_type?: string;
  rate?: number | string;
  client_id?: string | number | null;
  contact_id?: string | number | null;
  client_name?: string;
  contact_name?: string;
  project_id?: string | number | null;
  project_name?: string;
  job_name?: string;
  is_billable?: boolean;
  time_entries?: TaskTimeEntry[];
};

/** KanbanInvoiceFlow's `getTaskInvoiceEntries`: this task's group, uninvoiced entries only. */
export function taskInvoiceEntries(
  groups: RawTimeLogGroup[],
  sourceTaskId: string | number | null,
): TaskTimeEntry[] {
  if (sourceTaskId === null || sourceTaskId === undefined) return [];
  const matched = groups.find((group) => String(group.task_id) === String(sourceTaskId));
  if (!matched) return [];
  return (matched.time_entries || [])
    .filter((entry) => !entry.is_invoiced)
    .map((entry) => ({
      ...entry,
      task_id: matched.task_id,
      task_name: matched.task_name,
      charge_type: matched.charge_type,
      rate: matched.rate,
      client_id: matched.client_id,
      contact_id: matched.contact_id,
      client_name: matched.client_name || matched.contact_name,
      project_id: matched.project_id || null,
      project_name: matched.project_name,
      is_billable: matched.is_billable,
    }));
}

/** More than one client across the entries — the old flow refuses to invoice that. */
export function entriesSpanClients(entries: TaskTimeEntry[]): boolean {
  const clients = new Set(
    entries.map((entry) => String(entry.contact_id || entry.client_id || "")).filter(Boolean),
  );
  return clients.size > 1;
}

function entryAmount(entry: TaskTimeEntry): number {
  const minutes = Number.parseFloat(String(entry.duration_minutes ?? 0)) || 0;
  const rate = Number.parseFloat(String(entry.rate ?? 0)) || 0;
  return Number.parseFloat(String(entry.amount ?? "")) || (minutes / 60) * rate;
}

const trim = (value: number, digits: number) => String(Number(Number(value).toFixed(digits)));

/**
 * KanbanInvoiceFlow's `buildInvoiceData`, as the invoice editor's seed: one
 * line per task — hours at the rate, or one item at the fixed total — from
 * the billable entries (or all of them when none are billable). GST off, as
 * the old lines had it.
 */
export function invoiceSeedFromEntries(entries: TaskTimeEntry[]): InvoiceSeed | null {
  if (entries.length === 0) return null;
  const billable = entries.filter((entry) => entry.is_billable);
  const invoiceEntries = billable.length > 0 ? billable : entries;

  const groups = new Map<
    string,
    { taskName: string; chargeType: string; rate: number; minutes: number; amount: number }
  >();
  invoiceEntries.forEach((entry) => {
    const key = String(entry.task_id || entry.id);
    const group = groups.get(key) ?? {
      taskName: entry.task_name || "Time Tracking Entry",
      chargeType: entry.charge_type || "hourly",
      rate: Number.parseFloat(String(entry.rate ?? 0)) || 0,
      minutes: 0,
      amount: 0,
    };
    group.minutes += Number.parseFloat(String(entry.duration_minutes ?? 0)) || 0;
    group.amount += entryAmount(entry);
    groups.set(key, group);
  });

  const items: InvoiceLineItem[] = Array.from(groups.values()).map((group) => {
    const fixed = group.chargeType === "fixed";
    return {
      ...newLineItem(),
      description: group.taskName,
      quantity: fixed ? "1" : trim(group.minutes / 60, 4),
      price: trim(fixed ? group.amount : group.rate, 2),
      gst: false,
      qtyType: fixed ? "items" : "hours",
    };
  });

  const first = invoiceEntries[0] || entries[0];
  return {
    description: first.project_name || first.task_name || "Time tracking",
    items,
    clientId: first.client_id !== null && first.client_id !== undefined ? String(first.client_id) : null,
    clientName: first.client_name || "",
  };
}
