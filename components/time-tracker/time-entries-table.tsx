"use client";

import * as React from "react";
import {
  BriefcaseBusiness,
  ChevronDown,
  Clock,
  FileText,
  Folder,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { MenuAction } from "@/components/ui/menu-action";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectMoney } from "@/components/projects/project-shared";
import {
  LogEditDialog,
  TaskEditDialog,
} from "@/components/time-tracker/time-dialogs";
import { TimeInvoiceDialog } from "@/components/time-tracker/time-invoice-dialog";
import {
  useDeleteLogMutation,
  useDeleteTaskMutation,
  useTimeTasksQuery,
} from "@/hooks/use-time-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  TIME_PAGE_SIZE,
  buildTimeInvoice,
  formatAgo,
  formatDuration,
  formatLogDate,
  formatLogTimeRange,
  isLogInvoiceable,
  isRunningLog,
  taskBillingKey,
  type TimeInvoice,
  type TimeLog,
  type TimeTask,
} from "@/lib/time-tracker";
import { cn } from "@/lib/utils";

type Deleting =
  | { kind: "task"; task: TimeTask }
  | { kind: "log"; task: TimeTask; log: TimeLog };

const COLUMNS = 11;

/**
 * "All time entries": one row per task, opening onto the sessions logged
 * against it — sole-webapp's Listing.js in the design's table. Sessions are
 * what get selected and invoiced, one client at a time, as there.
 */
export function TimeEntriesTable({
  empty = false,
  onAddManual,
}: {
  /** Nothing has ever been logged: the empty state alone, without the frame. */
  empty?: boolean;
  onAddManual: () => void;
}) {
  const money = useProjectMoney();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(TIME_PAGE_SIZE);
  const query = useTimeTasksQuery(page, pageSize);
  const tasks = React.useMemo(() => query.data?.rows ?? [], [query.data]);

  const [open, setOpen] = React.useState<Set<string>>(() => new Set());
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [editingTask, setEditingTask] = React.useState<TimeTask | null>(null);
  const [editingLog, setEditingLog] = React.useState<{
    task: TimeTask;
    log: TimeLog;
  } | null>(null);
  const [deleting, setDeleting] = React.useState<Deleting | null>(null);
  const [invoice, setInvoice] = React.useState<TimeInvoice | null>(null);

  const deleteTask = useDeleteTaskMutation();
  const deleteLog = useDeleteLogMutation();

  // Every task opens onto its sessions, as Listing.js expanded them all. Only
  // tasks seen for the first time are opened, so one collapsed by hand stays
  // collapsed when the list refetches — after an edit, an invoice, a timer tick.
  const seenTasks = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const fresh = tasks
      .map((task) => task.taskId)
      .filter((id) => !seenTasks.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => seenTasks.current.add(id));
    setOpen((current) => new Set([...current, ...fresh]));
  }, [tasks]);

  // Selections never outlive the page they were made on, or a refetch that
  // invoiced or removed them.
  React.useEffect(() => {
    const live = new Set(
      tasks.flatMap((task) =>
        task.entries.filter(isLogInvoiceable).map((log) => log.id),
      ),
    );
    setSelected((current) => {
      const kept = [...current].filter((id) => live.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [tasks]);

  const taskOfLog = React.useMemo(() => {
    const map = new Map<string, TimeTask>();
    tasks.forEach((task) =>
      task.entries.forEach((log) => map.set(log.id, task)),
    );
    return map;
  }, [tasks]);

  const selectedClients = new Set(
    [...selected]
      .map((id) => taskOfLog.get(id))
      .filter(Boolean)
      .map((task) => taskBillingKey(task as TimeTask)),
  );

  /** sole-webapp's rule: an invoice goes to one client. */
  const addToSelection = (task: TimeTask, ids: string[]) => {
    const key = taskBillingKey(task);
    if (
      selected.size > 0 &&
      key &&
      [...selectedClients].some((other) => other && other !== key)
    ) {
      toast.error("Select time entries from one client at a time.");
      return;
    }
    setSelected((current) => new Set([...current, ...ids]));
  };

  const removeFromSelection = (ids: string[]) =>
    setSelected(
      (current) => new Set([...current].filter((id) => !ids.includes(id))),
    );

  const toggleTask = (task: TimeTask, checked: boolean) => {
    const ids = task.entries.filter(isLogInvoiceable).map((log) => log.id);
    if (ids.length === 0) return;
    if (checked) addToSelection(task, ids);
    else removeFromSelection(ids);
  };

  const startInvoice = (ids: Set<string>) => {
    const result = buildTimeInvoice(tasks, ids);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setInvoice(result);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const done = {
      // The server's message, as the old delete dialog showed it; ours only
      // if it sent none.
      onSuccess: (message: string) => {
        toast.success(
          message ||
            (deleting.kind === "task" ? "Time entry deleted" : "Time log deleted"),
        );
        setDeleting(null);
      },
      onError: (error: unknown) =>
        toast.error(apiErrorMessage(error, "Couldn't delete this time.")),
    };
    if (deleting.kind === "task") deleteTask.mutate(deleting.task.taskId, done);
    else deleteLog.mutate(deleting.log.id, done);
  };
  const deletingBusy = deleteTask.isPending || deleteLog.isPending;

  const loading = query.isLoading || query.isPlaceholderData;
  const failed = query.isError && !query.data;
  const selectionTask =
    selected.size > 0 ? taskOfLog.get([...selected][0]) : undefined;

  // Deleting the last task on the last page shouldn't strand the list on a
  // page that no longer exists.
  const pageCount = query.data?.pageCount ?? 1;
  React.useEffect(() => {
    if (query.data && page > pageCount) setPage(pageCount);
  }, [query.data, page, pageCount]);

  return (
    <div className="space-y-4">
      <section
        aria-label="All time entries"
        className={
          empty
            ? undefined
            : "overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        }
      >
        {!empty && (
          <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <h2 className="font-semibold">All time entries</h2>
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  <span className="font-medium">
                    {selected.size} {selected.size === 1 ? "session" : "sessions"}{" "}
                    selected
                  </span>
                  {selectionTask?.clientName && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {selectionTask.clientName}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                >
                  <X />
                  Clear
                </Button>
                <Button size="sm" onClick={() => startInvoice(selected)}>
                  <FileText />
                  Create invoice
                </Button>
              </div>
            )}
          </div>
        )}

        {failed ? (
          <Empty className="border-0 shadow-none">
            <EmptyMedia>
              <TriangleAlert aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Couldn&apos;t load time entries</EmptyTitle>
              <EmptyDescription>
                Something went wrong reaching the server. Try again.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
              >
                Try again
              </Button>
            </EmptyActions>
          </Empty>
        ) : !loading && tasks.length === 0 ? (
          <Empty className={empty ? undefined : "border-0 shadow-none"}>
            <EmptyMedia>
              <Clock aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No time entries yet</EmptyTitle>
              <EmptyDescription>
                Start the timer or add a manual entry to see it here.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button size="sm" onClick={onAddManual}>
                Add manual time entry
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Description</TableHead>
                  <TableHead className="text-center">Date</TableHead>
                  <TableHead className="text-center">Client</TableHead>
                  <TableHead className="text-center">Project</TableHead>
                  <TableHead className="text-center">Job</TableHead>
                  <TableHead className="text-center">Billable</TableHead>
                  <TableHead className="text-center">Rate</TableHead>
                  <TableHead className="text-center">Duration</TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="text-center">Invoice</TableHead>
                  <TableHead className="w-[52px]">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && tasks.length === 0
                  ? Array.from({ length: 5 }, (_, row) => (
                      <TableRow key={row}>
                        {Array.from({ length: COLUMNS }, (_, cell) => (
                          <TableCell key={cell}>
                            <Shimmer className="h-4 w-full rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : tasks.map((task) => {
                      const isOpen = open.has(task.taskId);
                      const invoiceable = task.entries.filter(isLogInvoiceable);
                      const picked = invoiceable.filter((log) =>
                        selected.has(log.id),
                      ).length;
                      return (
                        <React.Fragment key={task.taskId}>
                          <TableRow
                            className={cn("bg-card", loading && "opacity-60")}
                          >
                            <TableCell>
                              <div className="flex min-w-0 items-center gap-2.5">
                                <Checkbox
                                  checked={
                                    picked === 0
                                      ? false
                                      : picked === invoiceable.length
                                        ? true
                                        : "indeterminate"
                                  }
                                  disabled={invoiceable.length === 0}
                                  onCheckedChange={(checked) =>
                                    toggleTask(task, checked === true)
                                  }
                                  aria-label={`Select uninvoiced sessions of ${task.name || "this entry"}`}
                                />
                                <button
                                  type="button"
                                  className="grid size-[22px] shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent"
                                  aria-expanded={isOpen}
                                  aria-label={
                                    isOpen ? "Hide sessions" : "Show sessions"
                                  }
                                  onClick={() =>
                                    setOpen((current) => {
                                      const next = new Set(current);
                                      if (next.has(task.taskId))
                                        next.delete(task.taskId);
                                      else next.add(task.taskId);
                                      return next;
                                    })
                                  }
                                >
                                  <ChevronDown
                                    className={cn(
                                      "size-4 transition-transform",
                                      isOpen && "rotate-180",
                                    )}
                                  />
                                </button>
                                <span className="inline-grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-md bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular">
                                  {task.entries.length}
                                </span>
                                <span
                                  className="truncate font-medium"
                                  title={task.name}
                                >
                                  {task.name || "Untitled task"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-center tabular">
                              {formatLogDate(
                                task.entries[0]?.logDate ||
                                  task.entries[0]?.startTime ||
                                  "",
                              )}
                            </TableCell>
                            <TableCell
                              className="max-w-[160px] truncate text-center"
                              title={task.clientName}
                            >
                              {task.clientName || "—"}
                            </TableCell>
                            <TableCell className="max-w-[160px] text-center">
                              {task.projectName ? (
                                <span className="flex min-w-0 items-center justify-center gap-1.5">
                                  <Folder
                                    className="size-4 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                  <span className="truncate">
                                    {task.projectName}
                                  </span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="max-w-[160px] text-center">
                              {task.jobName ? (
                                <span className="flex min-w-0 items-center justify-center gap-1.5">
                                  <BriefcaseBusiness
                                    className="size-4 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                  <span className="truncate">
                                    {task.jobName}
                                  </span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-center">
                              {task.isBillable ? (
                                <Badge className="whitespace-nowrap border-transparent bg-primary/10 text-primary hover:bg-primary/10">
                                  Billable
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="whitespace-nowrap"
                                >
                                  Non-billable
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center tabular">
                              {task.chargeType === "fixed"
                                ? "Fixed"
                                : money(task.rate)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-center tabular">
                              {formatDuration(task.totalMinutes)}
                            </TableCell>
                            <TableCell className="text-center font-medium tabular">
                              {money(task.totalAmount)}
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">
                              —
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    aria-label={`Actions for ${task.name || "this entry"}`}
                                  >
                                    <MoreHorizontal className="size-4 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-40"
                                >
                                  {/* Listing.js's task row: Edit and Delete. */}
                                  <MenuAction
                                    icon={<Pencil />}
                                    label="Edit"
                                    onSelect={() => setEditingTask(task)}
                                  />
                                  <DropdownMenuSeparator />
                                  <MenuAction
                                    icon={<Trash2 />}
                                    label="Delete"
                                    destructive
                                    onSelect={() =>
                                      setDeleting({ kind: "task", task })
                                    }
                                    disabledReason={
                                      task.entries.some(isRunningLog)
                                        ? "Stop the timer first"
                                        : undefined
                                    }
                                  />
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>

                          {isOpen &&
                            task.entries.map((log) => (
                              <SessionRow
                                key={log.id}
                                task={task}
                                log={log}
                                money={money}
                                selected={selected.has(log.id)}
                                onToggle={(checked) =>
                                  checked
                                    ? addToSelection(task, [log.id])
                                    : removeFromSelection([log.id])
                                }
                                onEdit={() => setEditingLog({ task, log })}
                                onDelete={() =>
                                  setDeleting({ kind: "log", task, log })
                                }
                              />
                            ))}

                          {/* Listing.js's button under the task's sessions once
                              any are picked, so a selection made far down the
                              list can be invoiced without scrolling back up.
                              It bills the whole selection — one client's, by
                              the selection rule — like the one in the header. */}
                          {isOpen && picked > 0 && (
                            <TableRow className="bg-muted/25 hover:bg-muted/25">
                              <TableCell colSpan={COLUMNS} className="pb-3 pt-1">
                                <div className="pl-[34px]">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-primary/50 text-primary hover:text-primary"
                                    onClick={() => startInvoice(selected)}
                                  >
                                    <FileText />
                                    Create invoice
                                    {selected.size > 1 ? ` (${selected.size} sessions)` : ""}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
              </TableBody>
            </Table>
          </div>
        )}

        <TaskEditDialog
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
        <LogEditDialog
          target={editingLog}
          onClose={() => setEditingLog(null)}
        />
        <TimeInvoiceDialog
          invoice={invoice}
          onClose={() => {
            setInvoice(null);
            setSelected(new Set());
          }}
        />

        <AlertDialog
          open={deleting !== null}
          onOpenChange={(next) => !next && !deletingBusy && setDeleting(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleting?.kind === "log"
                  ? "Delete this session?"
                  : "Delete time entry?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleting?.kind === "task"
                  ? `“${deleting.task.name || "Untitled task"}” and its ${deleting.task.entries.length} logged ${
                      deleting.task.entries.length === 1
                        ? "session"
                        : "sessions"
                    } will be permanently deleted. This can’t be undone.`
                  : deleting
                    ? `${formatDuration(deleting.log.durationMinutes)} on ${formatLogDate(
                        deleting.log.logDate || deleting.log.startTime,
                      )} will be removed from “${deleting.task.name || "Untitled task"}”. This can’t be undone.`
                    : ""}
                {deleting &&
                deleting.kind === "task" &&
                deleting.task.entries.some((log) => log.isInvoiced)
                  ? " Some of this time is already on an invoice; the invoice itself isn’t changed."
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingBusy}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletingBusy}
                onClick={(event) => {
                  // Stay open until the request lands, so a failure is seen here.
                  event.preventDefault();
                  confirmDelete();
                }}
              >
                {deletingBusy && <Loader2 className="animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      {query.data && query.data.total > 0 && (
        <NumberedPagination
          page={query.data}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            // Task 30 is on a different page at 10 a page than at 50, so a
            // resize goes back to the top rather than to whichever page
            // number happens to still be in range — the expenses list's rule.
            setPage(1);
          }}
          itemLabel="entry"
          itemLabelPlural="entries"
          navLabel="Time entry pages"
          disabled={loading}
        />
      )}
    </div>
  );
}

function SessionRow({
  task,
  log,
  money,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: TimeTask;
  log: TimeLog;
  money: (value: number) => string;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const running = isRunningLog(log);
  const range = formatLogTimeRange(log);
  return (
    <TableRow className="bg-muted/25 text-sm">
      <TableCell>
        <div className="flex min-w-0 items-center gap-2.5 pl-[34px]">
          <Checkbox
            checked={selected}
            disabled={!isLogInvoiceable(log)}
            onCheckedChange={(checked) => onToggle(checked === true)}
            aria-label="Select this session"
          />
          <span className="truncate text-muted-foreground">
            {task.name || "Untitled task"}
          </span>
          {running && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
              <span
                className="size-1.5 animate-pulse rounded-full bg-success"
                aria-hidden
              />
              running
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular">
        {formatLogDate(log.logDate || log.startTime)}
      </TableCell>
      <TableCell
        colSpan={3}
        className="whitespace-nowrap text-center text-[13px] text-muted-foreground tabular"
      >
        {range || "Manual entry"}
      </TableCell>
      <TableCell
        colSpan={2}
        className="whitespace-nowrap text-center text-[13px] text-muted-foreground"
      >
        {formatAgo(log.createdAt || log.startTime)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular">
        {formatDuration(log.durationMinutes)}
      </TableCell>
      <TableCell className="text-center tabular">{money(log.amount)}</TableCell>
      <TableCell className="text-center">
        {log.invoiceNo ? (
          <span className="inline-block whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {log.invoiceNo}
          </span>
        ) : log.isInvoiced ? (
          <span className="text-xs text-muted-foreground">Invoiced</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Session actions"
              // Listing.js disabled an invoiced session's menu outright.
              disabled={log.isInvoiced}
              title={log.isInvoiced ? "Already on an invoice" : undefined}
            >
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <MenuAction
              icon={<Pencil />}
              label="Edit"
              onSelect={onEdit}
              disabledReason={running ? "Stop the timer first" : undefined}
            />
            <DropdownMenuSeparator />
            <MenuAction
              icon={<Trash2 />}
              label="Delete"
              destructive
              onSelect={onDelete}
              disabledReason={running ? "Stop the timer first" : undefined}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
