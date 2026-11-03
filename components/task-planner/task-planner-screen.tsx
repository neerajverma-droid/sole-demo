"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ListChecks, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EventDetailsDialog } from "@/components/calendar/event-details-dialog";
import { TaskForm } from "@/components/calendar/task-form";
import { TaskInvoiceFlow } from "@/components/task-planner/invoice-flow";
import {
  KanbanBoard,
  KanbanSkeleton,
  type PendingDoneMove,
} from "@/components/task-planner/kanban-board";
import { PlannerList } from "@/components/task-planner/planner-list";
import { PlannerToolbar } from "@/components/task-planner/planner-toolbar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useFinalStageIdQuery,
  usePlannerBoardQuery,
  usePlannerClientsQuery,
  usePlannerListQuery,
} from "@/hooks/use-task-planner-query";
import { apiErrorMessage } from "@/lib/api-error";
import { deleteCalendarEvent, fetchCalendarEventDetail } from "@/lib/calendar-api";
import type { CalendarEvent, RawCalendarEvent } from "@/lib/calendar";
import { bulkMovePlannerTasks, updatePlannerTaskStage } from "@/lib/task-planner-api";
import {
  filtersToQuery,
  normalizeListTask,
  PLANNER_USER,
  plannerTaskAsEvent,
  queryToFilters,
  type PlannerFilters,
  type PlannerTask,
  type PlannerView,
} from "@/lib/task-planner";

type FormState = {
  mode: "create" | "edit";
  taskData: RawCalendarEvent | null;
  initialStageId: string | null;
};

/** The planner's query params; anything else in the URL is left alone. */
const PLANNER_PARAMS = [
  "search_query",
  "contact_id",
  "client_id",
  "start_date",
  "end_date",
  "sortBy",
  "billable",
  "overdue",
];

export function TaskPlannerScreen() {
  const pathname = usePathname() ?? "/planner";
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [view, setView] = React.useState<PlannerView>("board");
  const [filters, setFilters] = React.useState<PlannerFilters>(() =>
    queryToFilters(new URLSearchParams(searchParams?.toString() ?? "")),
  );
  // Fetches wait for typing to settle, as the old board's 400ms debounce did.
  const debouncedFilters = useDebouncedValue(filters, 400);

  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Map<string, string>>(() => new Map());
  const [bulkConfirmOpen, setBulkConfirmOpen] = React.useState(false);
  const [bulkMoving, setBulkMoving] = React.useState(false);

  const [form, setForm] = React.useState<FormState | null>(null);
  const [detail, setDetail] = React.useState<{ event: CalendarEvent; locked: boolean } | null>(null);
  const [invoiceTask, setInvoiceTask] = React.useState<PlannerTask | null>(null);
  const [pendingDone, setPendingDone] = React.useState<PendingDoneMove | null>(null);
  const [busyRow, setBusyRow] = React.useState<{ id: string; action: "edit" | "delete" | "move" } | null>(null);

  const [page, setPage] = React.useState(1);
  // 25 a page, as the expense and asset listings open.
  const [pageSize, setPageSize] = React.useState(25);

  /* --- URL --- */

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    PLANNER_PARAMS.forEach((key) => params.delete(key));
    Object.entries(filtersToQuery(filters)).forEach(([key, value]) => params.set(key, value));
    const next = params.toString();
    if (next !== window.location.search.replace(/^\?/, "")) {
      // The browser's own history, not router.replace: Next keeps useSearchParams
      // in step with it, without re-requesting the page (an `_rsc` fetch) on
      // every keystroke.
      window.history.replaceState(null, "", next ? `${pathname}?${next}` : pathname);
    }
  }, [filters, pathname]);

  // A new filter starts the list from the first page.
  React.useEffect(() => setPage(1), [debouncedFilters]);

  /* --- data --- */

  const finalStageQuery = useFinalStageIdQuery();
  const finalStageId = finalStageQuery.data ?? null;
  const clientsQuery = usePlannerClientsQuery();
  const boardQuery = usePlannerBoardQuery(debouncedFilters, view === "board");
  const listQuery = usePlannerListQuery(debouncedFilters, page, pageSize, view === "list");

  React.useEffect(() => {
    const error = boardQuery.error || listQuery.error || clientsQuery.error || finalStageQuery.error;
    if (error) toast.error(apiErrorMessage(error, "Couldn't load your planner."));
  }, [boardQuery.error, listQuery.error, clientsQuery.error, finalStageQuery.error]);

  const listRows = React.useMemo(
    () => (listQuery.data?.rows ?? []).map(normalizeListTask),
    [listQuery.data],
  );

  const reload = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task-planner", "board"] }),
      queryClient.invalidateQueries({ queryKey: ["task-planner", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["calendar", "events"] }),
    ]);
  }, [queryClient]);

  /* --- selection (shared by board and list, kept across views) --- */

  const isSelected = React.useCallback((task: PlannerTask) => selected.has(task.id), [selected]);

  const toggleSelect = React.useCallback((task: PlannerTask) => {
    if (!task.event_id) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(task.id)) next.delete(task.id);
      else next.set(task.id, task.event_id);
      return next;
    });
  }, []);

  const setManySelected = React.useCallback((tasks: PlannerTask[], value: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      tasks.forEach((task) => {
        if (!task.event_id) return;
        if (value) next.set(task.id, task.event_id);
        else next.delete(task.id);
      });
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Map());

  const handleBulkMove = async () => {
    if (bulkMoving) return;
    const eventIds = Array.from(selected.values()).map((id) => id.trim()).filter(Boolean);
    if (eventIds.length === 0) {
      toast.info("Select at least one task to bulk move");
      return;
    }
    setBulkMoving(true);
    try {
      await bulkMovePlannerTasks(eventIds);
      clearSelection();
      setSelectMode(false);
      setBulkConfirmOpen(false);
      toast.success("Tasks moved successfully");
      await reload();
    } catch (error) {
      // The dialog stays open to retry or cancel.
      toast.error(apiErrorMessage(error, "Bulk move failed"));
    } finally {
      setBulkMoving(false);
    }
  };

  /* --- tasks --- */

  const openDetail = (task: PlannerTask, locked: boolean) =>
    setDetail({ event: plannerTaskAsEvent(task, PLANNER_USER), locked });

  const openCreate = (stageId: string | null = null) =>
    setForm({ mode: "create", taskData: null, initialStageId: stageId });

  /** The list's Edit: the task form needs the full record, so it's fetched first. */
  const editFromList = async (task: PlannerTask) => {
    const occurrenceBase = task.id.includes("_occ_") ? task.id.split("_occ_")[0] : null;
    const eventId = task.event_id || occurrenceBase || task.id;
    if (!eventId) {
      toast.error("Event id not found");
      return;
    }
    setBusyRow({ id: task.id, action: "edit" });
    try {
      const details = await fetchCalendarEventDetail(eventId);
      if (!details) {
        toast.error("Task details not found");
        return;
      }
      setForm({ mode: "edit", taskData: details, initialStageId: null });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't load that task."));
    } finally {
      setBusyRow(null);
    }
  };

  const deleteFromList = async (task: PlannerTask) => {
    const id = task.event_id || task.id;
    if (!id) {
      toast.error("Event id not found");
      return;
    }
    setBusyRow({ id: task.id, action: "delete" });
    try {
      await deleteCalendarEvent(id);
      toast.success("Task deleted successfully.");
      await reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to delete event"));
    } finally {
      setBusyRow(null);
    }
  };

  const moveToDoneFromList = async (task: PlannerTask) => {
    if (!finalStageId) {
      toast.error("Final stage not found");
      return;
    }
    if (!task.event_id) {
      toast.error("Event id not found");
      return;
    }
    if (invoiceTask) {
      toast.info("Finish the current invoice flow before moving another event to Done");
      return;
    }
    if (task.is_billable) {
      setInvoiceTask(task);
      return;
    }
    setBusyRow({ id: task.id, action: "move" });
    try {
      await updatePlannerTaskStage(task.event_id, finalStageId);
      await reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to update stage"));
    } finally {
      setBusyRow(null);
    }
  };

  const finishInvoiceFlow = () => {
    setInvoiceTask(null);
    setPendingDone(null);
  };

  /* --- render --- */

  const dialogs = (
    <>
      <EventDetailsDialog
        event={detail?.event ?? null}
        locked={detail?.locked}
        onClose={() => setDetail(null)}
        onEdit={(taskData) => setForm({ mode: "edit", taskData, initialStageId: null })}
        onDeleted={() => reload()}
      />
      <TaskInvoiceFlow
        task={invoiceTask}
        onCancel={finishInvoiceFlow}
        onDone={async () => {
          finishInvoiceFlow();
          await reload();
        }}
      />
    </>
  );

  if (form) {
    return (
      <>
        <TaskForm
          key={`${form.mode}-${form.taskData?.id ?? "new"}-${form.initialStageId ?? ""}`}
          mode={form.mode}
          taskData={form.taskData}
          initialDateTime={null}
          initialStageId={form.initialStageId}
          backLabel="Planner"
          fallbackUser={PLANNER_USER}
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            await reload();
          }}
        />
        {dialogs}
      </>
    );
  }

  const selectedCount = selected.size;
  const showBulkBar = selectMode || selectedCount > 0;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={ListChecks}
        title="Planner"
        titleTip="Plan and track your events in stages like Backlog, To Do, In Progress, and Done. Click a card to view or edit details, or add a new event to organize your work."
        description="Your tasks on a board — move them through Backlog, To do, In progress and Done."
      >
        <Button onClick={() => openCreate()} data-usertour="scheduling-planner-add-task">
          <Plus />
          Add task
        </Button>
      </PageHeader>

      <PlannerToolbar
        view={view}
        onViewChange={setView}
        search={filters.search}
        onSearchChange={(search) => setFilters((prev) => ({ ...prev, search }))}
        filters={filters}
        onFiltersChange={setFilters}
        clients={clientsQuery.data ?? []}
        loadingClients={clientsQuery.isLoading}
        selectMode={selectMode}
        onToggleSelectMode={() => setSelectMode((prev) => !prev)}
      />

      {view === "board" ? (
        // Every reload shows the skeleton — after adding, editing or deleting a
        // task, a bulk move or an invoice — as the old board's fetch did.
        boardQuery.isPending || boardQuery.isFetching ? (
          <KanbanSkeleton />
        ) : (
          <KanbanBoard
            columns={boardQuery.data?.columns ?? []}
            initialTasks={boardQuery.data?.tasks ?? []}
            filters={debouncedFilters}
            selectMode={selectMode}
            isSelected={isSelected}
            onToggleSelect={toggleSelect}
            onOpenTask={openDetail}
            onAddTask={(stageId) => openCreate(stageId)}
            pendingDone={pendingDone}
            onRequestDone={(move) => {
              setPendingDone(move);
              setInvoiceTask(move.task);
            }}
          />
        )
      ) : (
        <PlannerList
          rows={listRows}
          total={listQuery.data?.total ?? 0}
          loading={listQuery.isPending || listQuery.isFetching}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          finalStageId={finalStageId}
          isSelected={isSelected}
          onToggleSelect={toggleSelect}
          onSetSelected={setManySelected}
          busyRow={busyRow}
          moveLocked={Boolean(invoiceTask)}
          onView={(task) => openDetail(task, Boolean(finalStageId) && task.stage_id === finalStageId)}
          onEdit={(task) => void editFromList(task)}
          onDelete={(task) => void deleteFromList(task)}
          onMoveToDone={(task) => void moveToDoneFromList(task)}
        />
      )}

      {showBulkBar && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3 shadow-lg">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeftRight className="size-4 text-primary" />
            <span>
              <b className="font-semibold text-foreground tabular-nums">{selectedCount}</b> selected
            </span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {selectedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            )}
            <Button size="sm" disabled={selectedCount === 0} onClick={() => setBulkConfirmOpen(true)}>
              Move to Done
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectMode(false);
                clearSelection();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      <Dialog open={bulkConfirmOpen} onOpenChange={(open) => !bulkMoving && setBulkConfirmOpen(open)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader className="items-center text-center sm:text-center">
            <span className="mb-1 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <ArrowLeftRight className="size-6" />
            </span>
            <DialogTitle>Bulk move to Done</DialogTitle>
            <DialogDescription>
              Draft invoices will be created for all selected billable tasks before moving them to
              Done.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              disabled={bulkMoving}
              onClick={() => setBulkConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={bulkMoving || selectedCount === 0} onClick={handleBulkMove}>
              {bulkMoving && <Loader2 className="animate-spin" />}
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {dialogs}
    </div>
  );
}
