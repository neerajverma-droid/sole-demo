"use client";

import * as React from "react";
import { ArrowRightCircle, Eye, Loader2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatAmount,
  formatListDate,
  formatListDateTime,
  isFinalStageTask,
  isOverdueTask,
  taskClientEmail,
  taskClientName,
  type PlannerTask,
} from "@/lib/task-planner";
import { cn } from "@/lib/utils";

const PRIORITY_PILL: Record<string, string> = {
  high: "border-destructive/20 bg-destructive/10 text-destructive",
  medium: "border-warning/20 bg-warning/10 text-warning",
  low: "border-success/20 bg-success/10 text-success",
};

const COLUMNS = [
  "Task",
  "Client",
  "Stage",
  "Priority",
  "Start",
  "End",
  "Created",
  "Completed",
  "Billable",
  "Amount",
];

function RowAction({
  label,
  onClick,
  disabled,
  busy,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled || busy}
          className={cn("size-8", className)}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * PlannerListView — every task in a paged table. A final-stage row is locked:
 * no checkbox, no edit, delete or move. The row itself opens the details.
 */
export function PlannerList({
  rows,
  total,
  loading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  finalStageId,
  isSelected,
  onToggleSelect,
  onSetSelected,
  busyRow,
  moveLocked,
  onView,
  onEdit,
  onDelete,
  onMoveToDone,
}: {
  rows: PlannerTask[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  finalStageId: string | null;
  isSelected: (task: PlannerTask) => boolean;
  onToggleSelect: (task: PlannerTask) => void;
  onSetSelected: (tasks: PlannerTask[], selected: boolean) => void;
  /** Which row's action is in flight, and which action. */
  busyRow: { id: string; action: "edit" | "delete" | "move" } | null;
  /** An invoice flow is open — no other row can head to Done meanwhile. */
  moveLocked: boolean;
  onView: (task: PlannerTask) => void;
  onEdit: (task: PlannerTask) => void;
  onDelete: (task: PlannerTask) => void;
  onMoveToDone: (task: PlannerTask) => void;
}) {
  const selectable = rows.filter(
    (task) => !isFinalStageTask(task, finalStageId),
  );
  const allSelected = selectable.length > 0 && selectable.every(isSelected);
  const someSelected = selectable.some(isSelected);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    aria-label="Select all tasks on this page"
                    checked={
                      allSelected
                        ? true
                        : someSelected
                          ? "indeterminate"
                          : false
                    }
                    disabled={selectable.length === 0}
                    onCheckedChange={() =>
                      onSetSelected(selectable, !allSelected)
                    }
                  />
                </th>
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold text-muted-foreground"
                  >
                    {column}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, row) => (
                  <tr key={row} className="border-t border-border">
                    {Array.from({ length: COLUMNS.length + 2 }, (__, cell) => (
                      <td key={cell} className="px-4 py-3.5">
                        <Skeleton className="h-4 w-full min-w-6" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr className="border-t border-border">
                  <td
                    colSpan={COLUMNS.length + 2}
                    className="px-6 py-12 text-center"
                  >
                    <p className="font-medium">No tasks found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try adjusting your filters or search.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((task) => {
                  const locked = isFinalStageTask(task, finalStageId);
                  const overdue = isOverdueTask(task, locked);
                  const busy = busyRow?.id === task.id ? busyRow.action : null;
                  const client = taskClientName(task);
                  const email = taskClientEmail(task);
                  return (
                    <tr
                      key={task.id}
                      onClick={() => onView(task)}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-accent/40"
                    >
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!locked && (
                          <Checkbox
                            aria-label={`Select ${task.task_name}`}
                            checked={isSelected(task)}
                            onCheckedChange={() => onToggleSelect(task)}
                          />
                        )}
                      </td>
                      <td className="max-w-[320px] px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2 font-medium">
                          <span className="truncate" title={task.task_name}>
                            {task.task_name || "Untitled"}
                          </span>
                          {overdue && (
                            <span className="shrink-0 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                              Overdue
                            </span>
                          )}
                        </div>
                        {task.task_details && (
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={task.task_details}
                          >
                            {task.task_details}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-center">
                        <p className="truncate" title={client}>
                          {client || "—"}
                        </p>
                        {email && (
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={email}
                          >
                            {email}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <span
                          className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                          style={
                            task.stage_color
                              ? {
                                  backgroundColor:
                                    task.stage_bg_color ||
                                    `color-mix(in srgb, ${task.stage_color} 12%, transparent)`,
                                  color: task.stage_color,
                                  borderColor:
                                    task.stage_border_color ||
                                    `color-mix(in srgb, ${task.stage_color} 30%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          {task.stage_name || "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        {task.priority ? (
                          <span
                            className={cn(
                              "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize",
                              PRIORITY_PILL[
                                String(task.priority).toLowerCase()
                              ] ??
                                "border-transparent bg-secondary text-secondary-foreground",
                            )}
                          >
                            {task.priority}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums">
                        {formatListDateTime(task.start_time)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums">
                        {formatListDateTime(task.end_time)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums">
                        {task.created_at
                          ? formatListDate(task.created_at)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums">
                        {task.completed_at
                          ? formatListDateTime(task.completed_at)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        {task.is_billable ? "Yes" : "No"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums">
                        {formatAmount(task.fixed_amount)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <RowAction
                            label="View task"
                            onClick={() => onView(task)}
                          >
                            <Eye />
                          </RowAction>
                          {!locked && (
                            <>
                              <RowAction
                                label="Edit task"
                                busy={busy === "edit"}
                                onClick={() => onEdit(task)}
                              >
                                <Pencil />
                              </RowAction>
                              <RowAction
                                label="Delete task"
                                busy={busy === "delete"}
                                className="text-destructive hover:text-destructive"
                                onClick={() => onDelete(task)}
                              >
                                <Trash2 />
                              </RowAction>
                              <RowAction
                                label="Move to done"
                                busy={busy === "move"}
                                disabled={moveLocked}
                                className="text-success hover:text-success"
                                onClick={() => onMoveToDone(task)}
                              >
                                <ArrowRightCircle />
                              </RowAction>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* The shared listing pagination — the expense and asset tables' own. */}
      <NumberedPagination
        page={{
          page,
          pageCount,
          total,
          from: total === 0 ? 0 : (page - 1) * pageSize + 1,
          to: Math.min(page * pageSize, total),
        }}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        itemLabel="task"
        navLabel="Planner pages"
        disabled={loading}
      />
    </div>
  );
}
