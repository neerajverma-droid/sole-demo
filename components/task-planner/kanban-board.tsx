"use client";

import * as React from "react";
import { CalendarDays, CheckCircle2, Clock3, Lock, Plus, User } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchPlannerStagePage, updatePlannerTaskStage } from "@/lib/task-planner-api";
import {
  formatCardDateTime,
  getInitials,
  isDoneStage,
  isOverdueTask,
  moveTaskWithinColumns,
  normalizePlannerTask,
  plannerParams,
  taskClientName,
  type PlannerFilters,
  type PlannerStage,
  type PlannerTask,
} from "@/lib/task-planner";
import { cn } from "@/lib/utils";

const PENDING_DONE_MESSAGE =
  "Finish the current invoice flow before moving another event to Done";

type ColumnPaging = { nextCursor: string | null; hasMore: boolean; isLoading: boolean };

/** Where the dragged card started, and where it's been hovered to so far. */
type DragState = {
  id: string;
  fromColumnId: string;
  fromIndex: number;
  columnId: string;
  index: number;
  /** Where in another column the card would land — moved there only on drop. */
  targetIndex: number | null;
  dropped: boolean;
};

export type PendingDoneMove = {
  task: PlannerTask;
  fromColumnId: string;
  fromIndex: number;
};

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

function TaskCard({
  task,
  locked,
  selectMode,
  selected,
  dragging,
  onOpen,
  onToggleSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  task: PlannerTask;
  locked: boolean;
  selectMode: boolean;
  selected: boolean;
  dragging: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const overdue = isOverdueTask(task, locked);
  const client = taskClientName(task);
  const canSelect = selectMode && !locked && Boolean(task.event_id);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!locked && !selectMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={() => (canSelect ? onToggleSelect() : onOpen())}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (canSelect) onToggleSelect();
          else onOpen();
        }
      }}
      className={cn(
        "w-full select-none rounded-lg border border-border bg-card p-3.5 text-left shadow-sm transition-[box-shadow,border-color,opacity,transform] hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        !locked && !selectMode && "cursor-grab active:cursor-grabbing",
        selected && "border-primary ring-1 ring-primary",
        dragging && "rotate-[-1.5deg] scale-[0.98] border-dashed opacity-50",
      )}
    >
      <div className="flex items-center gap-2.5">
        {selectMode && !locked && (
          <span
            aria-hidden
            className={cn(
              "grid size-[18px] shrink-0 place-items-center rounded border border-input bg-card",
              selected && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {selected && (
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2.5 6.5 5 9l4.5-6" />
              </svg>
            )}
          </span>
        )}
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
          {getInitials(task.task_name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{task.task_name}</span>
        {overdue && (
          <span className="shrink-0 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
            Overdue
          </span>
        )}
        {task.is_billable && (
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold">
            Billable
          </span>
        )}
        {locked && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Locked" />}
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border pt-2.5 text-[13px] text-muted-foreground">
        {client && (
          <span className="flex min-w-0 items-center gap-2">
            <User className="size-3.5 shrink-0" />
            <span className="truncate">{client}</span>
          </span>
        )}
        {(task.calendar?.provider || task.calendar?.email) && (
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="truncate capitalize">
              {[task.calendar?.provider, task.calendar?.email].filter(Boolean).join(" · ")}
            </span>
          </span>
        )}
        {task.fixed_amount !== "" && task.fixed_amount !== null && Number(task.fixed_amount) !== 0 && (
          <span>
            <span className="inline-flex items-center rounded-md bg-success/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-success">
              $ {task.fixed_amount}
            </span>
          </span>
        )}
        <span className="flex items-center gap-2">
          <Clock3 className="size-3.5 shrink-0" />
          <span className="truncate tabular-nums">
            {task.start_time ? `Starts ${formatCardDateTime(task.start_time)}` : "No time set"}
          </span>
        </span>
        {task.end_time && (
          <span className="flex items-center gap-2">
            <Clock3 className="size-3.5 shrink-0" />
            <span className="truncate tabular-nums">Ends {formatCardDateTime(task.end_time)}</span>
          </span>
        )}
        {task.completed_at && !Number.isNaN(new Date(task.completed_at).getTime()) && (
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span className="truncate tabular-nums">
              Completed {formatCardDateTime(task.completed_at)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-4 flex-1" />
      </div>
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Board
 * ------------------------------------------------------------------ */

/**
 * KanbanBoard — the stages as columns, cards dragged between them.
 *
 * Dragging reorders in place as you hover (kept local — the API has no card
 * order); dropping in another column saves the new stage and puts the card
 * back if that fails. Done cards are locked, and moving into Done goes
 * through the invoice flow for a billable task.
 */
export function KanbanBoard({
  columns,
  initialTasks,
  filters,
  selectMode,
  isSelected,
  onToggleSelect,
  onOpenTask,
  onAddTask,
  pendingDone,
  onRequestDone,
}: {
  columns: PlannerStage[];
  initialTasks: PlannerTask[];
  filters: PlannerFilters;
  selectMode: boolean;
  isSelected: (task: PlannerTask) => boolean;
  onToggleSelect: (task: PlannerTask) => void;
  onOpenTask: (task: PlannerTask, locked: boolean) => void;
  onAddTask: (stageId: string) => void;
  /** A billable card waiting on the invoice flow; others can't go to Done meanwhile. */
  pendingDone: PendingDoneMove | null;
  onRequestDone: (move: PendingDoneMove) => void;
}) {
  const [tasks, setTasks] = React.useState(initialTasks);
  const [paging, setPaging] = React.useState<Record<string, ColumnPaging>>({});
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overColumn, setOverColumn] = React.useState<string | null>(null);
  const drag = React.useRef<DragState | null>(null);
  const loadingStages = React.useRef(new Set<string>());

  // A fresh fetch replaces whatever was moved or paged in locally.
  React.useEffect(() => {
    setTasks(initialTasks);
    setPaging(
      Object.fromEntries(
        columns.map((column) => [
          column.id,
          { nextCursor: column.nextCursor, hasMore: Boolean(column.nextCursor), isLoading: false },
        ]),
      ),
    );
  }, [columns, initialTasks]);

  const isDoneColumn = React.useCallback(
    (stageId: string) => isDoneStage(columns.find((column) => column.id === stageId)),
    [columns],
  );

  const tasksByColumn = React.useMemo(() => {
    const byColumn: Record<string, PlannerTask[]> = {};
    columns.forEach((column) => {
      byColumn[column.id] = tasks.filter((task) => task.statusId === column.id);
    });
    return byColumn;
  }, [columns, tasks]);

  const move = (taskId: string, from: string, to: string, index: number) =>
    setTasks((prev) => moveTaskWithinColumns(prev, taskId, from, to, index));

  /* --- paging --- */

  const loadMore = async (stageId: string) => {
    const state = paging[stageId];
    if (!state?.nextCursor || !state.hasMore || state.isLoading || loadingStages.current.has(stageId)) {
      return;
    }
    loadingStages.current.add(stageId);
    setPaging((prev) => ({ ...prev, [stageId]: { ...prev[stageId], isLoading: true } }));
    try {
      const result = await fetchPlannerStagePage(stageId, {
        after: state.nextCursor,
        ...plannerParams(filters),
      });
      const cards = result.cards.map((card, index) => normalizePlannerTask(card, stageId, index));
      setTasks((prev) => {
        const existing = new Set(prev.map((task) => task.id));
        return [...prev, ...cards.filter((task) => !existing.has(task.id))];
      });
      setPaging((prev) => ({
        ...prev,
        [stageId]: { nextCursor: result.nextCursor, hasMore: Boolean(result.nextCursor), isLoading: false },
      }));
    } catch (error) {
      setPaging((prev) => ({ ...prev, [stageId]: { ...prev[stageId], isLoading: false } }));
      toast.error(apiErrorMessage(error, "Couldn't load more tasks."));
    } finally {
      loadingStages.current.delete(stageId);
    }
  };

  const loadMoreIfNearBottom = (el: HTMLElement, stageId: string) => {
    const state = paging[stageId];
    if (!state?.hasMore || state.isLoading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 120) void loadMore(stageId);
  };

  /* --- saving a stage change --- */

  const revert = (taskId: string, current: string, back: string, index: number) =>
    setTasks((prev) => moveTaskWithinColumns(prev, taskId, current, back, index));

  const saveStage = async (task: PlannerTask, from: string, to: string, fromIndex: number) => {
    try {
      await updatePlannerTaskStage(task.event_id, to);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to update stage"));
      revert(task.id, to, from, fromIndex);
    }
  };

  /**
   * A card dropped in another column: shown there straight away, saved in the
   * background, and put back where it came from if the save fails. Done takes
   * the invoice flow for a billable task instead.
   */
  const commitStageChange = async (
    taskId: string,
    fromColumnId: string,
    fromIndex: number,
    toColumnId: string,
    toIndex: number,
  ) => {
    if (fromColumnId === toColumnId || isDoneColumn(fromColumnId)) return;

    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task?.event_id) {
      toast.error("Event id not found");
      return;
    }

    if (isDoneColumn(toColumnId)) {
      if (pendingDone) {
        toast.info(PENDING_DONE_MESSAGE);
        return;
      }
      if (task.is_billable) {
        // The card stays put until the invoice flow finishes.
        onRequestDone({ task, fromColumnId, fromIndex });
        return;
      }
    }

    move(taskId, fromColumnId, toColumnId, toIndex);
    await saveStage(task, fromColumnId, toColumnId, fromIndex);
  };

  /* --- native drag and drop --- */

  const startDrag = (task: PlannerTask, columnId: string, index: number) => (e: React.DragEvent) => {
    drag.current = {
      id: task.id,
      fromColumnId: columnId,
      fromIndex: index,
      columnId,
      index,
      targetIndex: null,
      dropped: false,
    };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    requestAnimationFrame(() => setDraggingId(task.id));
  };

  const clearDrag = () => {
    drag.current = null;
    setDraggingId(null);
    setOverColumn(null);
  };

  const endDrag = () => {
    const state = drag.current;
    clearDrag();
    // Let go outside the board: undo the in-column reorder.
    if (state && !state.dropped && state.index !== state.fromIndex) {
      revert(state.id, state.fromColumnId, state.fromColumnId, state.fromIndex);
    }
  };

  /**
   * Hovering a card. In its own column the dragged card slides into place, as
   * react-dnd's hover did. In another column it only marks where it would land:
   * moving it there mid-drag would unmount the card being dragged, and the
   * browser would never report the drop.
   */
  const hoverCard = (columnId: string, hoverIndex: number) => (e: React.DragEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    e.preventDefault();
    if (isDoneColumn(columnId) && columnId !== state.fromColumnId) {
      state.targetIndex = tasksByColumn[columnId]?.length ?? 0;
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const pastMiddle = e.clientY - rect.top > rect.height / 2;

    if (columnId !== state.fromColumnId) {
      state.targetIndex = pastMiddle ? hoverIndex + 1 : hoverIndex;
      return;
    }

    if (state.index === hoverIndex) return;
    if (state.index < hoverIndex && !pastMiddle) return;
    if (state.index > hoverIndex && pastMiddle) return;
    move(state.id, columnId, columnId, hoverIndex);
    state.index = hoverIndex;
  };

  const overColumnArea = (columnId: string) => (e: React.DragEvent) => {
    const state = drag.current;
    if (!state) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Over the column's empty space rather than a card: the end of the list.
    if (columnId !== state.fromColumnId && e.target === e.currentTarget) {
      state.targetIndex = tasksByColumn[columnId]?.length ?? 0;
    }
    if (overColumn !== columnId) setOverColumn(columnId);
  };

  /** The drop itself makes the change, so it never waits on dragend. */
  const dropOnColumn = (columnId: string) => (e: React.DragEvent) => {
    const state = drag.current;
    if (!state) return;
    e.preventDefault();
    state.dropped = true;
    if (columnId === state.fromColumnId) {
      setOverColumn(null);
      return;
    }
    const toIndex = state.targetIndex ?? tasksByColumn[columnId]?.length ?? 0;
    // Any in-column reorder made before leaving goes back first.
    if (state.index !== state.fromIndex) {
      revert(state.id, state.fromColumnId, state.fromColumnId, state.fromIndex);
    }
    clearDrag();
    void commitStageChange(state.id, state.fromColumnId, state.fromIndex, columnId, toIndex);
  };

  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        No records
      </div>
    );
  }

  return (
    <div
      className="scrollbar-thin grid auto-cols-[minmax(260px,1fr)] grid-flow-col items-start gap-4 overflow-x-auto pb-2"
      data-usertour="scheduling-planner-board"
    >
      {columns.map((column) => {
        const columnTasks = tasksByColumn[column.id] ?? [];
        const done = isDoneColumn(column.id);
        const state = paging[column.id];
        return (
          <section key={column.id} aria-label={column.name} className="flex min-w-0 flex-col">
            <div
              className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2.5 shadow-sm"
              style={{
                backgroundColor: `color-mix(in srgb, ${column.color} 10%, transparent)`,
                borderColor: `color-mix(in srgb, ${column.color} 30%, transparent)`,
              }}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
              <h2
                className="truncate text-xs font-semibold uppercase tracking-wide"
                style={{ color: `color-mix(in srgb, ${column.color} 75%, hsl(var(--foreground)))` }}
              >
                {column.name}
              </h2>
              <span
                className="ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
                style={{
                  backgroundColor: `color-mix(in srgb, ${column.color} 20%, transparent)`,
                  color: `color-mix(in srgb, ${column.color} 75%, hsl(var(--foreground)))`,
                }}
              >
                {columnTasks.length}
              </span>
            </div>

            <div
              onDragOver={overColumnArea(column.id)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null);
              }}
              onDrop={dropOnColumn(column.id)}
              // Next page as the column nears its bottom — on scroll, and on
              // the wheel too, as the old board did, so a first page too short
              // to scroll still pages on.
              onScroll={(e) => loadMoreIfNearBottom(e.currentTarget, column.id)}
              onWheel={(e) => loadMoreIfNearBottom(e.currentTarget, column.id)}
              className={cn(
                "scrollbar-thin flex max-h-[calc(100vh-18rem)] min-h-[120px] flex-col gap-3 overflow-y-auto rounded-lg p-0.5 transition-colors",
                overColumn === column.id &&
                  "bg-primary/[0.06] outline-dashed outline-2 outline-offset-2 outline-primary/50",
              )}
            >
              {columnTasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  locked={done}
                  selectMode={selectMode}
                  selected={isSelected(task)}
                  dragging={draggingId === task.id}
                  onOpen={() => onOpenTask(task, done)}
                  onToggleSelect={() => onToggleSelect(task)}
                  onDragStart={startDrag(task, column.id, index)}
                  onDragEnd={endDrag}
                  onDragOver={hoverCard(column.id, index)}
                />
              ))}

              {columnTasks.length === 0 && (
                <button
                  type="button"
                  onClick={() => onAddTask(column.id)}
                  className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-7 text-center transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Plus className="size-4" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">No tasks</span>
                  <span className="text-xs text-muted-foreground">Click to add a task in {column.name}</span>
                </button>
              )}

              {state?.isLoading && <CardSkeleton />}
              {state?.hasMore && !state.isLoading && (
                <button
                  type="button"
                  onClick={() => void loadMore(column.id)}
                  className="rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Load more
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
