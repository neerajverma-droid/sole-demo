/**
 * The task planner's logic, against sole-webapp's `components/Planner`:
 * Kanban/utils.js normalisers, utils/filterQuery.js, the board's
 * moveTaskWithinColumns, the list's final-stage lock, and
 * KanbanInvoiceFlow's time-entry → invoice lines.
 */
import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  applySort,
  currentSort,
  DEFAULT_PLANNER_FILTERS,
  entriesSpanClients,
  filtersToQuery,
  finalStageOf,
  formatAmount,
  formatListDate,
  getInitials,
  hexToRgba,
  invoiceSeedFromEntries,
  isDoneStage,
  isFinalStageTask,
  isOverdueTask,
  moveTaskWithinColumns,
  nextCursorFromPayload,
  normalizeBoard,
  normalizeListTask,
  normalizePlannerStage,
  normalizePlannerTask,
  plannerParams,
  plannerTaskAsEvent,
  PLANNER_USER,
  queryToFilters,
  rowsFromPayload,
  taskClientName,
  taskInvoiceEntries,
  totalFromPayload,
  type PlannerTask,
} from "@/lib/task-planner";

const CARD = {
  event_id: "568_occ_3",
  task_id: 77,
  task_name: "Site visit",
  task_details: "Measure up",
  priority: "high",
  label: "business",
  start_time: "2026-10-12T22:00:00.000Z",
  end_time: "2026-10-12T23:30:00.000Z",
  is_billable: 1,
  amount: 450,
  client: { client_id: 44994, client_name: "Harper & Co", client_email: "ops@harper.co" },
  contact: { contact_id: 38110, name: "Jordan Reyes", email: "jordan@reyes.co" },
  calendar: { calendar_id: "primary", provider: "google", email: "me@gmail.test" },
  projectDetail: { id: 11, project_name: "Fit-out" },
  jobDetail: { id: 5, job_name: "Stage 1" },
};

/* ------------------------------------------------------------------ *
 * Normalising
 * ------------------------------------------------------------------ */

describe("normalizePlannerTask", () => {
  it("keys the card by its event id, as every write does", () => {
    const task = normalizePlannerTask(CARD, 2, 0);
    expect(task).toMatchObject({
      id: "568_occ_3",
      event_id: "568_occ_3",
      task_id: null,
      source_task_id: 77,
      statusId: "2",
      stage_id: "2",
      task_name: "Site visit",
      task_details: "Measure up",
      label: "business",
      is_billable: true,
      fixed_amount: 450,
      project_id: "11",
      project_name: "Fit-out",
      job_id: "5",
      job_name: "Stage 1",
    });
  });

  it("reads client, contact and calendar from their nested records", () => {
    const task = normalizePlannerTask(CARD, 2, 0);
    expect(task.client).toEqual({ id: "44994", label: "Harper & Co", email: "ops@harper.co" });
    expect(task.contact).toEqual({ id: "38110", label: "Jordan Reyes", email: "jordan@reyes.co" });
    expect(task.calendar).toEqual({ id: "primary", provider: "google", email: "me@gmail.test" });
    // The contact's name wins over the company's on the card.
    expect(taskClientName(task)).toBe("Jordan Reyes");
  });

  it("falls back through every name the API has used", () => {
    expect(normalizePlannerTask({ id: 1, event_name: "From event" }, 1, 0).task_name).toBe("From event");
    expect(normalizePlannerTask({ id: 1 }, 1, 0).task_name).toBe("Untitled task");
    expect(normalizePlannerTask({ id: 1, label: "other" }, 1, 0).label).toBe("personal");
    expect(normalizePlannerTask({}, "4", 3).id).toBe("4-3");
  });

  it("adds the list row's stage name and colours", () => {
    const row = normalizeListTask(
      { ...CARD, stage: { id: 9, name: "In progress", color: "#C2410C", bg_color: "#FFF7ED" } },
      0,
    );
    expect(row).toMatchObject({ stage_id: "9", stage_name: "In progress", stage_color: "#C2410C", stage_bg_color: "#FFF7ED" });
  });
});

describe("stages and the board", () => {
  it("normalises a stage with a washed background from its colour", () => {
    expect(
      normalizePlannerStage(
        { stage_id: 3, stage_name: "To do", order: 1, color: "#4F46E5", next_cursor: "c1" },
        0,
      ),
    ).toMatchObject({
      id: "3",
      name: "To do",
      order: 1,
      color: "#4F46E5",
      bgColor: "rgba(79, 70, 229, 0.12)",
      nextCursor: "c1",
    });
    expect(hexToRgba("#abc")).toBe("rgba(170, 187, 204, 0.12)");
    expect(hexToRgba("nope")).toBe("rgba(203, 213, 225, 0.12)");
  });

  it("orders columns and gives each card its column", () => {
    const { columns, tasks } = normalizeBoard([
      { stage_id: 2, stage_name: "Done", order: 3, cards: [{ event_id: "9" }] },
      { stage_id: 1, stage_name: "Backlog", order: 0, cards: [{ event_id: "7" }, { event_id: "8" }] },
    ]);
    expect(columns.map((column) => column.name)).toEqual(["Backlog", "Done"]);
    expect(tasks.map((task) => [task.id, task.statusId])).toEqual([
      ["9", "2"],
      ["7", "1"],
      ["8", "1"],
    ]);
  });

  it("finds rows, cursors and totals in any shape the old service accepted", () => {
    expect(rowsFromPayload([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(rowsFromPayload({ cards: [1] })).toEqual([1]);
    expect(rowsFromPayload({ stage: { cards: [2] } })).toEqual([2]);
    expect(rowsFromPayload({ rows: [3] })).toEqual([3]);
    expect(rowsFromPayload({ tasks: [4] })).toEqual([4]);
    expect(rowsFromPayload({})).toEqual([]);
    expect(nextCursorFromPayload({ stage: { next_cursor: "abc" } })).toBe("abc");
    expect(nextCursorFromPayload({})).toBeNull();
    expect(totalFromPayload({ pagination: { total: 42 } })).toBe(42);
    expect(totalFromPayload({ meta: { total_records: 7 } })).toBe(7);
  });

  it("treats a closed or 'Done' column as locked", () => {
    expect(isDoneStage({ category: "closed", name: "Finished" })).toBe(true);
    expect(isDoneStage({ category: "", name: "Done" })).toBe(true);
    expect(isDoneStage({ category: "", name: "In progress" })).toBe(false);
  });

  it("picks the final stage by highest order", () => {
    expect(finalStageOf([{ id: 1, order: 0 }, { id: 4, order: 3 }, { id: 2, order: 1 }])?.id).toBe(4);
    expect(finalStageOf([])).toBeNull();
  });

  it("locks a list row in the final stage, by id or (until known) by name", () => {
    const row = { ...normalizeListTask({ event_id: "1", stage_id: 4 }, 0), stage_name: "Done" };
    expect(isFinalStageTask(row, "4")).toBe(true);
    expect(isFinalStageTask(row, "3")).toBe(false);
    expect(isFinalStageTask(row, null)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

describe("filters", () => {
  const filters = {
    ...DEFAULT_PLANNER_FILTERS,
    search: "visit",
    contact_id: ["38110", "38111"],
    client_id: ["38110", "38111"],
    start_date: "2026-10-01",
    end_date: "2026-10-15",
    billable: true,
    overdue: true,
  };

  it("round-trips through the URL with the old keys", () => {
    const query = filtersToQuery(filters);
    expect(query).toEqual({
      search_query: "visit",
      contact_id: "38110,38111",
      client_id: "38110,38111",
      start_date: "2026-10-01",
      end_date: "2026-10-15",
      sortBy: "date",
      billable: "true",
      overdue: "true",
    });
    expect(queryToFilters(new URLSearchParams(query))).toEqual(filters);
    expect(queryToFilters(new URLSearchParams())).toEqual(DEFAULT_PLANNER_FILTERS);
  });

  it("sends only what's set, contact ids as an array", () => {
    expect(plannerParams(DEFAULT_PLANNER_FILTERS)).toEqual({ sortBy: "date" });
    expect(plannerParams(filters)).toEqual({
      search: "visit",
      overdue: true,
      contact_id: ["38110", "38111"],
      start_date: "2026-10-01",
      end_date: "2026-10-15",
      sortBy: "date",
      billable: true,
    });
  });

  it("falls back to the legacy client_id list", () => {
    expect(plannerParams({ ...DEFAULT_PLANNER_FILTERS, client_id: ["9"] }).contact_id).toEqual(["9"]);
  });

  it("counts active filters for the button badge", () => {
    expect(activeFilterCount(DEFAULT_PLANNER_FILTERS)).toBe(0);
    expect(activeFilterCount(filters)).toBe(4);
  });

  it("treats Overdue as a flag and the rest as sortBy", () => {
    const overdue = applySort(DEFAULT_PLANNER_FILTERS, "overdue");
    expect(overdue).toMatchObject({ overdue: true, sortBy: "date" });
    expect(currentSort(overdue)).toBe("overdue");
    const priority = applySort(overdue, "priority");
    expect(priority).toMatchObject({ overdue: false, sortBy: "priority" });
    expect(currentSort(priority)).toBe("priority");
  });
});

/* ------------------------------------------------------------------ *
 * Moving cards
 * ------------------------------------------------------------------ */

describe("moveTaskWithinColumns", () => {
  const task = (id: string, statusId: string) =>
    ({ ...normalizePlannerTask({ event_id: id }, statusId, 0) }) as PlannerTask;
  const board = [task("a", "1"), task("b", "1"), task("c", "2")];
  const layout = (tasks: PlannerTask[]) => tasks.map((t) => `${t.id}:${t.statusId}`).join(" ");

  it("moves a card into another column at the given index", () => {
    expect(layout(moveTaskWithinColumns(board, "a", "1", "2", 0))).toBe("b:1 a:2 c:2");
    expect(layout(moveTaskWithinColumns(board, "a", "1", "2", 5))).toBe("b:1 c:2 a:2");
  });

  it("updates both the column and the stage id the card reports", () => {
    const moved = moveTaskWithinColumns(board, "a", "1", "2", 0).find((t) => t.id === "a")!;
    expect([moved.statusId, moved.stage_id]).toEqual(["2", "2"]);
  });

  it("reorders within a column", () => {
    expect(layout(moveTaskWithinColumns(board, "a", "1", "1", 1))).toBe("b:1 a:1 c:2");
  });

  it("leaves the board untouched for a no-op or an unknown card", () => {
    expect(moveTaskWithinColumns(board, "a", "1", "1", 0)).toBe(board);
    expect(moveTaskWithinColumns(board, "zz", "1", "2", 0)).toBe(board);
  });
});

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

describe("display", () => {
  const task = normalizePlannerTask(CARD, 2, 0);

  it("flags overdue only on open cards past their end", () => {
    expect(isOverdueTask(task, false, new Date("2026-10-14T00:00:00Z"))).toBe(true);
    expect(isOverdueTask(task, true, new Date("2026-10-14T00:00:00Z"))).toBe(false);
    expect(isOverdueTask(task, false, new Date("2026-10-01T00:00:00Z"))).toBe(false);
    expect(isOverdueTask({ ...task, end_time: null }, false)).toBe(false);
  });

  it("formats initials, amounts and dates as the old cells did", () => {
    expect(getInitials("Install day — cabinets")).toBe("ID");
    expect(getInitials("")).toBe("NA");
    expect(formatAmount(450)).toBe("$450");
    expect(formatAmount("$12")).toBe("$12");
    expect(formatAmount("")).toBe("—");
    expect(formatListDate(new Date(2026, 9, 5).toISOString())).toBe("05-10-2026");
    expect(formatListDate(null)).toBe("Not scheduled");
  });

  it("opens in the calendar's details dialog by its event id", () => {
    const event = plannerTaskAsEvent(task, PLANNER_USER);
    expect(event).toMatchObject({ id: "568_occ_3", event_id: "568_occ_3", task_id: null, title: "Site visit", is_occurrence: true });
  });
});

/* ------------------------------------------------------------------ *
 * Invoicing a task
 * ------------------------------------------------------------------ */

describe("invoice from time entries", () => {
  const groups = [
    {
      task_id: 77,
      task_name: "Site visit",
      charge_type: "hourly",
      rate: 90,
      client_id: 44994,
      contact_id: 38110,
      client_name: "Harper & Co",
      project_name: "Fit-out",
      is_billable: true,
      time_entries: [
        { id: 1, duration_minutes: 90, is_invoiced: false },
        { id: 2, duration_minutes: 30, is_invoiced: false },
        { id: 3, duration_minutes: 60, is_invoiced: true },
      ],
    },
    { task_id: 88, task_name: "Other", time_entries: [{ id: 9, duration_minutes: 10 }] },
  ];

  it("takes only this task's uninvoiced entries, with its charge settings", () => {
    const entries = taskInvoiceEntries(groups, 77);
    expect(entries.map((entry) => entry.id)).toEqual([1, 2]);
    expect(entries[0]).toMatchObject({ task_name: "Site visit", rate: 90, client_id: 44994, contact_id: 38110 });
    expect(taskInvoiceEntries(groups, null)).toEqual([]);
    expect(taskInvoiceEntries(groups, 999)).toEqual([]);
  });

  it("refuses entries spanning more than one client", () => {
    expect(entriesSpanClients([{ id: 1, contact_id: 1 }, { id: 2, contact_id: 1 }])).toBe(false);
    expect(entriesSpanClients([{ id: 1, contact_id: 1 }, { id: 2, client_id: 2 }])).toBe(true);
  });

  it("bills hourly work as hours at the rate, without GST", () => {
    const seed = invoiceSeedFromEntries(taskInvoiceEntries(groups, 77))!;
    expect(seed.clientId).toBe("44994");
    expect(seed.clientName).toBe("Harper & Co");
    expect(seed.items).toHaveLength(1);
    expect(seed.items[0]).toMatchObject({
      description: "Site visit",
      quantity: "2",
      price: "90",
      gst: false,
      qtyType: "hours",
    });
  });

  it("bills fixed-price work as one item at the total", () => {
    const seed = invoiceSeedFromEntries([
      { id: 1, task_id: 5, task_name: "Fit-out", charge_type: "fixed", amount: 300, is_billable: true },
      { id: 2, task_id: 5, task_name: "Fit-out", charge_type: "fixed", amount: 200.5, is_billable: true },
    ])!;
    expect(seed.items[0]).toMatchObject({ quantity: "1", price: "500.5", qtyType: "items" });
  });

  it("invoices only billable entries when there are some", () => {
    const seed = invoiceSeedFromEntries([
      { id: 1, task_id: 5, task_name: "Billable", rate: 100, duration_minutes: 60, is_billable: true },
      { id: 2, task_id: 6, task_name: "Not", rate: 100, duration_minutes: 60, is_billable: false },
    ])!;
    expect(seed.items.map((item) => item.description)).toEqual(["Billable"]);
  });

  it("has nothing to invoice without entries", () => {
    expect(invoiceSeedFromEntries([])).toBeNull();
  });
});
