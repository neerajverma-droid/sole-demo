"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, FolderKanban, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";

import {
  CardAddButton,
  CardRow,
  CardRows,
  RowAction,
  UniboxCard,
} from "@/components/actions/unibox/unibox-ui";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectStatusBadge, projectHref } from "@/components/projects/project-shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useActiveTimerQuery,
  useStartTaskTimerMutation,
  useStopTimerMutation,
} from "@/hooks/use-project-timer";
import { useRefreshUnibox, useUniboxQuery } from "@/hooks/use-unibox-query";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchProjectJobs, fetchProjectTasks, type ProjectTask } from "@/lib/project-jobs";
import { fetchProject } from "@/lib/projects";
import { formatDuration, shortDate, type UniboxProject } from "@/lib/unibox";
import { isDemoRow, showSampleNotice } from "@/lib/unibox-demo";
import { CARD_ROW_LIMIT, projectName, projectStatusKey, projectSub, uniboxMoney } from "@/lib/unibox-rules";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  active: "bg-success/10 text-success",
  completed: "bg-primary/10 text-primary",
  on_hold: "bg-warning/10 text-warning",
};


/** ProjectsCard.js: the first five projects, View, and New. */
export function ProjectsCard() {
  const refresh = useRefreshUnibox();
  const query = useUniboxQuery("projects");
  const [creating, setCreating] = React.useState(false);
  const [viewing, setViewing] = React.useState<UniboxProject | null>(null);
  const projects = query.data ?? [];

  return (
    <UniboxCard
      icon={FolderKanban}
      title="Projects"
      tourId="quick-actions-projects"
      sample={query.isDemo}
      count={projects.length}
      loading={query.isLoading}
      action={<CardAddButton label="New" onClick={() => setCreating(true)} />}
    >
      <CardRows loading={query.isLoading} empty={projects.length === 0} emptyText="No active projects">
        {projects.slice(0, CARD_ROW_LIMIT).map((project) => {
          const key = projectStatusKey(project);
          return (
            <CardRow
              key={String(project.id)}
              icon={FolderKanban}
              iconTone={STATUS_TONE[key] ?? "bg-muted text-muted-foreground"}
              title={projectName(project)}
              sub={projectSub(project)}
              action={
                <RowAction
                  label="View"
                  onClick={() => (isDemoRow(project) ? showSampleNotice() : setViewing(project))}
                />
              }
            />
          );
        })}
      </CardRows>

      <ProjectFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => void refresh("projects")}
      />
      <ProjectQuickView project={viewing} onClose={() => setViewing(null)} />
    </UniboxCard>
  );
}

/**
 * ProjectQuickViewDialog.js: the project, its jobs, and each job's tasks with
 * a timer to start or stop — without leaving Quick Actions. The full project
 * page is a click away for anything more (editing, invoicing a job).
 */
function ProjectQuickView({ project, onClose }: { project: UniboxProject | null; onClose: () => void }) {
  const id = project ? String(project.id) : "";
  const open = project !== null;

  const detail = useQuery({ queryKey: ["project", id], queryFn: () => fetchProject(id), enabled: open });
  const jobs = useQuery({ queryKey: ["project-jobs", id], queryFn: () => fetchProjectJobs(id), enabled: open });
  const tasks = useQuery({ queryKey: ["project-tasks", id], queryFn: () => fetchProjectTasks(id), enabled: open });
  const timerQuery = useActiveTimerQuery();
  const timer = timerQuery.data ?? null;
  const start = useStartTaskTimerMutation();
  const stop = useStopTimerMutation();
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [pendingTask, setPendingTask] = React.useState<string | null>(null);

  // The first job opens on its own, as it did in the old dialog.
  React.useEffect(() => {
    const first = jobs.data?.[0]?.id;
    setExpanded(first ? new Set([first]) : new Set());
  }, [jobs.data]);

  const toggle = (jobId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });

  const handleTimer = (task: ProjectTask) => {
    const runningHere = timer && String(timer.taskId) === task.id;
    if (!runningHere && timer) {
      toast.info("Stop the current timer before starting another task");
      return;
    }
    setPendingTask(task.id);
    const done = { onSettled: () => setPendingTask(null) };
    if (runningHere && timer) {
      stop.mutate(timer, {
        ...done,
        onSuccess: () => toast.success("Timer stopped"),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not update the timer")),
      });
    } else {
      start.mutate(
        { projectId: id, taskId: task.id, taskName: task.name },
        {
          ...done,
          onSuccess: () => toast.success("Timer started"),
          onError: (error) => toast.error(apiErrorMessage(error, "Could not update the timer")),
        },
      );
    }
  };

  const loading = detail.isLoading || jobs.isLoading || tasks.isLoading;
  const info = detail.data;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[88svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            {info?.name || (project ? projectName(project) : "Project")}
            {info ? <ProjectStatusBadge status={info.status} /> : null}
          </DialogTitle>
          <DialogDescription>
            {[
              info?.clientName || project?.client_name,
              info?.startDate && `Starts ${shortDate(info.startDate)}`,
              info?.endDate && `Due ${shortDate(info.endDate)}`,
              info?.isBudget ? `Budget ${uniboxMoney(info.budget)} · ${uniboxMoney(info.usedBudget)} used` : "",
            ]
              .filter(Boolean)
              .join(" · ") || "Jobs, tasks and timers for this project."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {loading ? (
            [0, 1, 2].map((row) => <Skeleton key={row} className="h-12 w-full rounded-xl" />)
          ) : (jobs.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No jobs on this project yet.</p>
          ) : (
            (jobs.data ?? []).map((job) => {
              const jobTasks = (tasks.data ?? []).filter((task) => task.jobId === job.id);
              const isOpen = expanded.has(job.id);
              return (
                <section key={job.id} className="rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => toggle(job.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{job.name || "Untitled job"}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {jobTasks.length} {jobTasks.length === 1 ? "task" : "tasks"}
                    </span>
                  </button>
                  {isOpen ? (
                    jobTasks.length === 0 ? (
                      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                        No tasks in this job.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border border-t border-border">
                        {jobTasks.map((task) => {
                          const running = timer !== null && String(timer.taskId) === task.id;
                          return (
                            <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{task.name}</p>
                                <p
                                  className={cn(
                                    "text-xs text-muted-foreground",
                                    running && "font-medium text-success",
                                  )}
                                >
                                  {running
                                    ? "Running now"
                                    : `${formatDuration(task.totalMinutes)} · ${task.isBillable ? "billable" : "non-billable"}`}
                                </p>
                              </div>
                              {task.amount > 0 ? (
                                <span className="text-sm font-semibold tabular">{uniboxMoney(task.amount)}</span>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                className={cn(
                                  "min-w-[84px] rounded-[10px] border-0 shadow-none",
                                  running
                                    ? "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                                    : "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                                )}
                                disabled={pendingTask === task.id}
                                onClick={() => handleTimer(task)}
                              >
                                {pendingTask === task.id ? (
                                  <Loader2 className="animate-spin" />
                                ) : running ? (
                                  <Square className="fill-current" />
                                ) : (
                                  <Play className="fill-current" />
                                )}
                                {running ? "Stop" : "Start"}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )
                  ) : null}
                </section>
              );
            })
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {project ? (
            <Button asChild>
              <Link href={projectHref(id)}>
                Open project
                <ExternalLink />
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
