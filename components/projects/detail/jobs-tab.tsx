"use client";

import * as React from "react";
import { FileText, Plus, Search, SearchX, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import { ConfirmDeleteDialog } from "@/components/projects/detail/jobs/confirm-delete-dialog";
import { JobCard } from "@/components/projects/detail/jobs/job-card";
import { JobFormDialog } from "@/components/projects/detail/jobs/job-form-dialog";
import { TaskFormDialog } from "@/components/projects/detail/jobs/task-form-dialog";
import {
  TimeEntryDialog,
  type TimeEntryTarget,
} from "@/components/projects/detail/jobs/time-entry-dialog";
import {
  useDeleteJobMutation,
  useDeleteTaskMutation,
  useDeleteTimeEntryMutation,
  useProjectJobsQuery,
  useProjectTasksQuery,
  useSaveTaskMutation,
} from "@/hooks/use-project-jobs-query";
import {
  useActiveTimerQuery,
  useStartTaskTimerMutation,
  useStopTimerMutation,
} from "@/hooks/use-project-timer";
import { apiErrorMessage } from "@/lib/api-error";
import type { ProjectJob, ProjectTask, TimeEntry } from "@/lib/project-jobs";
import type { Project } from "@/lib/projects";

type TaskDialogState = { jobId: string | null; task: ProjectTask | null } | null;

/**
 * The Job / Milestone tab — sole-webapp's Jobmilestonetab with the job, task
 * and time-entry flows ProjectDetail.js wired into it: jobs as expandable
 * cards, their tasks with start / stop timers, each task's time entries, and
 * invoicing a selection of them.
 */
export function ProjectJobsTab({ project }: { project: Project }) {
  const jobsQuery = useProjectJobsQuery(project.id);
  const tasksQuery = useProjectTasksQuery(project.id);
  const timerQuery = useActiveTimerQuery();
  const startTimer = useStartTaskTimerMutation();
  const stopTimer = useStopTimerMutation();
  const saveTask = useSaveTaskMutation(project.id);
  const deleteJob = useDeleteJobMutation(project.id);
  const deleteTask = useDeleteTaskMutation(project.id);
  const deleteEntry = useDeleteTimeEntryMutation(project.id);

  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [jobDialog, setJobDialog] = React.useState<{ job: ProjectJob | null } | null>(null);
  const [taskDialog, setTaskDialog] = React.useState<TaskDialogState>(null);
  const [entryTarget, setEntryTarget] = React.useState<TimeEntryTarget | null>(null);
  const [jobToDelete, setJobToDelete] = React.useState<ProjectJob | null>(null);
  const [taskToDelete, setTaskToDelete] = React.useState<ProjectTask | null>(null);
  const [entryToDelete, setEntryToDelete] = React.useState<TimeEntry | null>(null);

  const jobs = React.useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const tasks = React.useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const timer = timerQuery.data ?? null;

  const tasksByJob = React.useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    tasks.forEach((task) => {
      if (!task.jobId) return;
      map.set(task.jobId, [...(map.get(task.jobId) ?? []), task]);
    });
    return map;
  }, [tasks]);

  // A job matches on its name or code, or on any of its tasks' names.
  const query = search.trim().toLowerCase();
  const { shown, taskMatches } = React.useMemo(() => {
    if (!query) return { shown: jobs, taskMatches: [] as string[] };
    const matches: string[] = [];
    const filtered = jobs.filter((job) => {
      const jobMatch =
        job.name.toLowerCase().includes(query) || job.code.toLowerCase().includes(query);
      const taskMatch = (tasksByJob.get(job.id) ?? []).some((task) =>
        task.name.toLowerCase().includes(query),
      );
      if (taskMatch) matches.push(job.id);
      return jobMatch || taskMatch;
    });
    return { shown: filtered, taskMatches: matches };
  }, [jobs, tasksByJob, query]);

  // A search opens the jobs whose tasks it matched, so the hit is visible.
  const matchKey = taskMatches.join(",");
  React.useEffect(() => {
    setExpanded(new Set(matchKey ? matchKey.split(",") : []));
  }, [matchKey]);

  const setJobExpanded = (id: string, open: boolean) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  /** `handleStartStopTask` from ProjectDetail.js. */
  const startStop = async (task: ProjectTask, isRunning: boolean) => {
    try {
      if (isRunning) {
        if (!timer) return;
        await stopTimer.mutateAsync(timer);
        toast.success("Timer stopped");
      } else {
        await startTimer.mutateAsync({ projectId: project.id, taskId: task.id, taskName: task.name });
        toast.success("Timer started");
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, "Something went wrong"));
    }
  };

  /** TaskRow.js's Mark complete / Mark active. */
  const toggleTaskStatus = (task: ProjectTask) => {
    const status = task.status === "completed" ? "active" : "completed";
    saveTask.mutate(
      { id: task.id, payload: { status } },
      {
        onSuccess: () => toast.success(`Task marked as ${status}`),
        onError: () => toast.error("Failed to update task status"),
      },
    );
  };

  const confirmDeleteJob = () => {
    if (!jobToDelete) return;
    deleteJob.mutate(jobToDelete.id, {
      onSuccess: () => {
        toast.success("Job deleted successfully");
        setJobToDelete(null);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Failed to delete job")),
    });
  };

  const confirmDeleteTask = () => {
    if (!taskToDelete) return;
    deleteTask.mutate(taskToDelete.id, {
      onSuccess: () => {
        toast.success("Task deleted successfully");
        setTaskToDelete(null);
      },
      onError: () => {
        toast.error("Failed to delete task");
        setTaskToDelete(null);
      },
    });
  };

  const confirmDeleteEntry = () => {
    if (!entryToDelete) return;
    deleteEntry.mutate(entryToDelete.id, {
      onSuccess: () => {
        toast.success("Time entry deleted successfully");
        setEntryToDelete(null);
      },
      onError: () => {
        toast.error("Failed to delete time entry");
        setEntryToDelete(null);
      },
    });
  };

  const openAddJob = () => setJobDialog({ job: null });
  const loading = jobsQuery.isLoading || tasksQuery.isLoading;
  const failed = jobsQuery.isError || tasksQuery.isError;

  return (
    <div className="rounded-lg border border-border bg-card p-[15px] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Job / Milestone</h2>
          <InfoTip text="Manage jobs and milestones" />
        </div>
        <Button onClick={openAddJob}>
          <Plus />
          Add job
        </Button>
      </div>

      <div className="relative mt-[15px]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search job or task"
          aria-label="Search jobs or tasks"
          className="pl-9"
        />
      </div>

      <div className="mt-[15px]">
        {loading ? (
          <div className="space-y-[15px]">
            {Array.from({ length: 3 }).map((_, index) => (
              <Shimmer key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : failed ? (
          <Empty className="border-0 shadow-none">
            <EmptyMedia>
              <TriangleAlert aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Couldn&apos;t load jobs</EmptyTitle>
              <EmptyDescription>Something went wrong reaching the server. Try again.</EmptyDescription>
            </div>
            <EmptyActions>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  jobsQuery.refetch();
                  tasksQuery.refetch();
                }}
              >
                Try again
              </Button>
            </EmptyActions>
          </Empty>
        ) : jobs.length === 0 ? (
          <Empty className="border-0 shadow-none">
            <EmptyMedia>
              <FileText aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No jobs added yet</EmptyTitle>
              <EmptyDescription>
                Add your first job to break the project into manageable phases and start tracking
                work.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button size="sm" onClick={openAddJob}>
                <Plus />
                Add job
              </Button>
            </EmptyActions>
          </Empty>
        ) : shown.length === 0 ? (
          <Empty className="border-0 shadow-none">
            <EmptyMedia>
              <SearchX aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No jobs found</EmptyTitle>
              <EmptyDescription>No jobs match your search criteria.</EmptyDescription>
            </div>
          </Empty>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {shown.map((job) => (
                <JobCard
                  key={job.id}
                  project={project}
                  job={job}
                  tasks={tasksByJob.get(job.id) ?? []}
                  expanded={expanded.has(job.id)}
                  onExpandedChange={(open) => setJobExpanded(job.id, open)}
                  runningTaskId={timer?.taskId ?? null}
                  onAddTask={(target) => setTaskDialog({ jobId: target.id, task: null })}
                  onEditJob={(target) => setJobDialog({ job: target })}
                  onDeleteJob={setJobToDelete}
                  onStartStop={startStop}
                  onEditTask={(task) => setTaskDialog({ jobId: null, task })}
                  onToggleTaskStatus={toggleTaskStatus}
                  onDeleteTask={setTaskToDelete}
                  onEditEntry={(entry, task) => setEntryTarget({ entry, task })}
                  onDeleteEntry={setEntryToDelete}
                />
              ))}
            </div>
            <Button variant="outline" className="mt-[15px]" onClick={openAddJob}>
              <Plus />
              Add job
            </Button>
          </>
        )}
      </div>

      <JobFormDialog
        open={jobDialog !== null}
        project={project}
        job={jobDialog?.job ?? null}
        onOpenChange={(open) => !open && setJobDialog(null)}
      />

      <TaskFormDialog
        open={taskDialog !== null}
        project={project}
        jobs={jobs}
        jobId={taskDialog?.jobId ?? null}
        task={taskDialog?.task ?? null}
        onOpenChange={(open) => !open && setTaskDialog(null)}
      />

      <TimeEntryDialog
        projectId={project.id}
        target={entryTarget}
        onOpenChange={(open) => !open && setEntryTarget(null)}
      />

      <ConfirmDeleteDialog
        open={jobToDelete !== null}
        title="Delete job?"
        description={`Are you sure you want to delete "${jobToDelete?.name ?? ""}"? This action cannot be undone.`}
        confirmLabel="Delete job"
        pending={deleteJob.isPending}
        onOpenChange={(open) => !open && setJobToDelete(null)}
        onConfirm={confirmDeleteJob}
      />

      <ConfirmDeleteDialog
        open={taskToDelete !== null}
        title="Delete task?"
        description="Are you sure you want to delete this task? Its time entries are removed with it."
        confirmLabel="Delete task"
        pending={deleteTask.isPending}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
        onConfirm={confirmDeleteTask}
      />

      <ConfirmDeleteDialog
        open={entryToDelete !== null}
        title="Delete time entry?"
        description="Are you sure you want to delete this time entry?"
        confirmLabel="Delete"
        pending={deleteEntry.isPending}
        onOpenChange={(open) => !open && setEntryToDelete(null)}
        onConfirm={confirmDeleteEntry}
      />
    </div>
  );
}
