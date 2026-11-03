"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuAction } from "@/components/ui/menu-action";
import { Shimmer } from "@/components/ui/shimmer";
import { useProjectMoney } from "@/components/projects/project-shared";
import { JobInvoiceDialog } from "@/components/projects/detail/jobs/job-invoice-dialog";
import {
  TaskListHeader,
  TaskRow,
} from "@/components/projects/detail/jobs/task-row";
import { useJobTimeEntriesQuery } from "@/hooks/use-project-jobs-query";
import {
  buildJobInvoice,
  type JobInvoice,
  type ProjectJob,
  type ProjectTask,
  type TimeEntry,
} from "@/lib/project-jobs";
import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

const NOTHING_SELECTED =
  "Select time entries or fixed tasks below to invoice them";

/**
 * One job and its tasks — Jobaccordionitem.js. The card loads its own time
 * entries and keeps its own invoice selection, as the old accordion item did,
 * so picking entries in one job never mixes them with another's.
 */
export function JobCard({
  project,
  job,
  tasks,
  expanded,
  onExpandedChange,
  runningTaskId,
  onAddTask,
  onEditJob,
  onDeleteJob,
  onStartStop,
  onEditTask,
  onToggleTaskStatus,
  onDeleteTask,
  onEditEntry,
  onDeleteEntry,
}: {
  project: Project;
  job: ProjectJob;
  tasks: ProjectTask[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  runningTaskId: string | null;
  onAddTask: (job: ProjectJob) => void;
  onEditJob: (job: ProjectJob) => void;
  onDeleteJob: (job: ProjectJob) => void;
  onStartStop: (task: ProjectTask, isRunning: boolean) => Promise<void>;
  onEditTask: (task: ProjectTask) => void;
  onToggleTaskStatus: (task: ProjectTask) => void;
  onDeleteTask: (task: ProjectTask) => void;
  onEditEntry: (entry: TimeEntry, task: ProjectTask) => void;
  onDeleteEntry: (entry: TimeEntry) => void;
}) {
  const money = useProjectMoney();
  const entriesQuery = useJobTimeEntriesQuery(project.id, job.id);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [invoice, setInvoice] = React.useState<JobInvoice | null>(null);

  const entries = React.useMemo(
    () => entriesQuery.data ?? [],
    [entriesQuery.data],
  );
  const entriesByTask = React.useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    entries.forEach((entry) => {
      if (!entry.taskId) return;
      map.set(entry.taskId, [...(map.get(entry.taskId) ?? []), entry]);
    });
    return map;
  }, [entries]);

  const toggleEntry = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (ids: string[]) =>
    setSelected((current) => {
      const next = new Set(current);
      const all = ids.every((id) => next.has(id));
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });

  const createInvoice = () => {
    const result = buildJobInvoice({ selected, tasks, entries, project });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setInvoice(result);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(job.code);
      toast.success("Copied successfully!");
    } catch {
      toast.error("Copy failed!");
    }
  };

  const count = selected.size;
  // Buttons inside the header mustn't also toggle it.
  const stop = (action: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    action();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onExpandedChange(!expanded);
          }
        }}
        className={cn(
          "flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          expanded && "bg-primary/[0.06] hover:bg-primary/[0.06]",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-[15px] font-semibold">{job.name}</span>
          <span className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground tabular">
            {tasks.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="outline"
            size="sm"
            disabled={count === 0}
            onClick={stop(createInvoice)}
          >
            Create invoice{count > 0 ? ` (${count})` : ""}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            Job Code:{" "}
            <b className="font-semibold text-foreground tabular">
              {job.code || "—"}
            </b>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label="Copy job code"
              disabled={!job.code}
              onClick={stop(copyCode)}
            >
              <Copy className="!size-3.5" />
            </Button>
          </span>
          <span className="text-[13px] text-muted-foreground">
            Budget Allocated:{" "}
            <b className="font-semibold text-foreground tabular">
              {money(job.usedBudget)} / {money(job.budget)}
            </b>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={stop(() => onAddTask(job))}
          >
            <Plus />
            Task
          </Button>
          <div
            className="flex items-center gap-0.5"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Actions for ${job.name}`}
                >
                  <MoreHorizontal className="size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <MenuAction
                  icon={<Pencil />}
                  label="Edit job"
                  onSelect={() => onEditJob(job)}
                />
                <MenuAction
                  icon={<FileText />}
                  label="Create invoice"
                  onSelect={createInvoice}
                  disabledReason={count === 0 ? NOTHING_SELECTED : undefined}
                />
                <MenuAction
                  icon={<Plus />}
                  label="Add task"
                  onSelect={() => onAddTask(job)}
                />
                <DropdownMenuSeparator />
                <MenuAction
                  icon={<Trash2 />}
                  label="Delete job"
                  onSelect={() => onDeleteJob(job)}
                  destructive
                />
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label={expanded ? "Collapse job" : "Expand job"}
              onClick={() => onExpandedChange(!expanded)}
            >
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-1">
          {tasks.length === 0 ? (
            <div className="py-7 text-center">
              <p className="text-sm text-muted-foreground">
                No tasks in this job yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3.5"
                onClick={() => onAddTask(job)}
              >
                <Plus />
                Add first task
              </Button>
            </div>
          ) : (
            <>
              {/* Scrolls sideways rather than wrapping, so the columns stay
                  under their headings on a narrow screen. */}
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <TaskListHeader />
                  {entriesQuery.isLoading ? (
                    <div className="space-y-2 py-3">
                      {tasks.map((task) => (
                        <Shimmer
                          key={task.id}
                          className="h-10 w-full rounded-md"
                        />
                      ))}
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        entries={entriesByTask.get(task.id) ?? []}
                        isRunning={runningTaskId === task.id}
                        selected={selected}
                        onToggleEntry={toggleEntry}
                        onToggleAll={toggleAll}
                        onCreateInvoice={createInvoice}
                        onStartStop={onStartStop}
                        onEdit={onEditTask}
                        onToggleStatus={onToggleTaskStatus}
                        onDelete={onDeleteTask}
                        onEditEntry={onEditEntry}
                        onDeleteEntry={onDeleteEntry}
                      />
                    ))
                  )}
                </div>
              </div>
              <div className="border-t border-border py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddTask(job)}
                >
                  <Plus />
                  Add task
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <JobInvoiceDialog
        projectId={project.id}
        jobName={job.name}
        invoice={invoice}
        onClose={() => {
          // Closing the invoice clears the selection, as sole-webapp's did.
          setInvoice(null);
          setSelected(new Set());
        }}
        onInvoiced={() => setSelected(new Set())}
      />
    </div>
  );
}
