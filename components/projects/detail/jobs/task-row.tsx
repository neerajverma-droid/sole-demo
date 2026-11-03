"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuAction } from "@/components/ui/menu-action";
import { useProjectMoney } from "@/components/projects/project-shared";
import {
  chargeTypeLabel,
  entryAmount,
  fixedTaskSelectionId,
  formatAgo,
  formatEntryTimeRange,
  formatMinutes,
  isEntryInvoiceable,
  priorityLabel,
  type ProjectTask,
  type TimeEntry,
} from "@/lib/project-jobs";
import { formatProjectDate } from "@/lib/projects";
import { cn } from "@/lib/utils";

const PRIORITY_BADGE: Record<
  string,
  { variant: "success" | "warning" | "danger"; dot: string }
> = {
  low: { variant: "success", dot: "bg-success" },
  medium: { variant: "warning", dot: "bg-warning" },
  high: { variant: "danger", dot: "bg-destructive" },
};

/**
 * The columns a task row and its header share — TaskRow.js's table: name,
 * charge type, billable, priority, time spent, amount, then the timer and
 * menu. One template for both, so the header can't drift off its column.
 */
const TASK_GRID =
  "grid grid-cols-[minmax(220px,1fr)_150px_96px_104px_88px_96px_76px] items-center gap-x-3";

/** Where a row's name starts: past the fold-out chevron and the checkbox. */
const NAME_INSET = "pl-[64px]";

/** The column headings above a job's tasks, as the old job accordion had them. */
export function TaskListHeader() {
  return (
    <div
      className={cn(
        TASK_GRID,
        "border-b border-border py-2 text-xs font-medium text-muted-foreground",
      )}
    >
      <span className={NAME_INSET}>Task Name</span>
      <span className="text-center">Charge Type</span>
      <span className="text-center">Billable</span>
      <span className="text-center">Priority</span>
      <span className="text-center">Time Spent</span>
      <span className="text-center">Amount</span>
      <span className="sr-only">Actions</span>
    </div>
  );
}

const STATUS_BADGE: Record<
  ProjectTask["status"],
  { label: string; variant: "secondary" | "success" }
> = {
  active: { label: "Active", variant: "secondary" },
  inactive: { label: "Inactive", variant: "secondary" },
  completed: { label: "Completed", variant: "success" },
};

/**
 * One task under a job — TaskRow.js. Its time entries fold out beneath it,
 * each selectable for an invoice until it's been billed; a billable fixed
 * task is selected as a whole instead, having no entries of its own to pick.
 */
export function TaskRow({
  task,
  entries,
  isRunning,
  selected,
  onToggleEntry,
  onToggleAll,
  onCreateInvoice,
  onStartStop,
  onEdit,
  onToggleStatus,
  onDelete,
  onEditEntry,
  onDeleteEntry,
}: {
  task: ProjectTask;
  entries: TimeEntry[];
  isRunning: boolean;
  selected: Set<string>;
  onToggleEntry: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onCreateInvoice: () => void;
  onStartStop: (task: ProjectTask, isRunning: boolean) => Promise<void>;
  onEdit: (task: ProjectTask) => void;
  onToggleStatus: (task: ProjectTask) => void;
  onDelete: (task: ProjectTask) => void;
  onEditEntry: (entry: TimeEntry, task: ProjectTask) => void;
  onDeleteEntry: (entry: TimeEntry) => void;
}) {
  const money = useProjectMoney();
  const [open, setOpen] = React.useState(false);
  const [timerBusy, setTimerBusy] = React.useState(false);

  const fixedId = fixedTaskSelectionId(task);
  const invoiceableIds = entries
    .filter(isEntryInvoiceable)
    .map((entry) => entry.id);
  const allSelected = fixedId
    ? selected.has(fixedId)
    : invoiceableIds.length > 0 &&
      invoiceableIds.every((id) => selected.has(id));
  const selectDisabled = (!fixedId && entries.length === 0) || isRunning;
  const fixed = task.chargeType === "fixed";
  const completed = task.status === "completed";
  const status = STATUS_BADGE[task.status];

  const startStop = async () => {
    if (timerBusy) return;
    setTimerBusy(true);
    try {
      await onStartStop(task, isRunning);
    } finally {
      setTimerBusy(false);
    }
  };

  return (
    <div className="border-t border-border first:border-t-0">
      <div className={cn(TASK_GRID, "py-3")}>
        <div className="flex min-w-0 items-center gap-2.5">
          {entries.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-expanded={open}
              aria-label={open ? "Hide time entries" : "Show time entries"}
              onClick={() => setOpen((current) => !current)}
            >
              {open ? <ChevronDown /> : <ChevronRight />}
            </Button>
          ) : (
            <span className="size-7 shrink-0" aria-hidden />
          )}
          <Checkbox
            checked={allSelected}
            disabled={selectDisabled}
            onCheckedChange={() =>
              onToggleAll(fixedId ? [fixedId] : invoiceableIds)
            }
            aria-label={`Select ${task.name} for invoicing`}
            title={isRunning ? "Cannot select a running task" : undefined}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">{task.name}</span>
              <Badge variant={status.variant} className="whitespace-nowrap">
                {status.label}
              </Badge>
            </div>
            {!fixed && task.isBillable && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entries.length} time{" "}
                {entries.length === 1 ? "entry" : "entries"}
              </p>
            )}
          </div>
        </div>

        <span className="text-center text-sm tabular">
          {fixed ? (
            chargeTypeLabel(task.chargeType)
          ) : (
            <>
              {chargeTypeLabel(task.chargeType)}
              <span className="block text-xs text-muted-foreground">
                {money(task.rate)}
                {task.chargeType === "per_km" ? "/km" : "/h"}
              </span>
            </>
          )}
        </span>
        <span className="flex justify-center">
          <Badge
            variant={task.isBillable ? "success" : "secondary"}
            className="whitespace-nowrap"
          >
            {task.isBillable ? "Yes" : "No"}
          </Badge>
        </span>
        <span className="flex justify-center">
          <Badge
            variant={PRIORITY_BADGE[task.priority]?.variant ?? "secondary"}
            className="gap-1.5 whitespace-nowrap"
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                PRIORITY_BADGE[task.priority]?.dot ?? "bg-muted-foreground",
              )}
            />
            {priorityLabel(task.priority)}
          </Badge>
        </span>
        <span className="text-center text-sm tabular">
          {fixed ? "--" : formatMinutes(task.totalMinutes)}
        </span>
        <span className="text-center text-sm font-medium tabular">
          {money(task.amount)}
        </span>
        <div className="flex items-center justify-end gap-1">
          {!fixed && (
            <Button
              size="icon"
              variant={isRunning ? "destructive" : "default"}
              className="size-8 rounded-full"
              disabled={timerBusy}
              aria-label={
                isRunning
                  ? `Stop timer on ${task.name}`
                  : `Start timer on ${task.name}`
              }
              onClick={startStop}
            >
              {timerBusy ? (
                <Loader2 className="animate-spin" />
              ) : isRunning ? (
                <Square className="fill-current" />
              ) : (
                <Play className="fill-current" />
              )}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${task.name}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <MenuAction
                icon={completed ? <RotateCcw /> : <CheckCircle2 />}
                label={completed ? "Mark active" : "Mark complete"}
                onSelect={() => onToggleStatus(task)}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Pencil />}
                label="Edit task"
                onSelect={() => onEdit(task)}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Remove task"
                onSelect={() => onDelete(task)}
                destructive
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {open && entries.length > 0 && (
        <div className="space-y-2 pb-3 pl-[38px]">
          {!fixed && (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Since</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Duration
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="w-10 px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          {isEntryInvoiceable(entry) ? (
                            <Checkbox
                              checked={selected.has(entry.id)}
                              onCheckedChange={() => onToggleEntry(entry.id)}
                              aria-label="Select time entry for invoicing"
                            />
                          ) : (
                            <span className="size-4 shrink-0" aria-hidden />
                          )}
                          <span className="text-foreground">{task.name}</span>
                          {entry.isInvoiced ? (
                            <Badge variant="success">Invoiced</Badge>
                          ) : (
                            <Badge variant="secondary" className="capitalize">
                              {entry.status || "stopped"}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular">
                        {entry.logDate
                          ? formatProjectDate(entry.logDate)
                          : "--"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular">
                        {formatEntryTimeRange(entry)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatAgo(entry.logDate)}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {formatMinutes(entry.durationMinutes)}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {money(entryAmount(entry, task))}
                      </td>
                      <td className="px-3 py-1 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              disabled={entry.isInvoiced}
                              aria-label="Time entry actions"
                              title={
                                entry.isInvoiced
                                  ? "Invoiced entries can't be changed"
                                  : undefined
                              }
                            >
                              <MoreHorizontal className="size-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <MenuAction
                              icon={<Pencil />}
                              label="Edit"
                              onSelect={() => onEditEntry(entry, task)}
                            />
                            <DropdownMenuSeparator />
                            <MenuAction
                              icon={<Trash2 />}
                              label="Delete"
                              onSelect={() => onDeleteEntry(entry)}
                              destructive
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={selected.size === 0}
            onClick={onCreateInvoice}
          >
            Create invoice ({selected.size})
          </Button>
        </div>
      )}
    </div>
  );
}
