"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/documents/field";
import { ProjectClientSelect } from "@/components/projects/project-client-select";
import { useClientProjectsQuery, useProjectJobsQuery } from "@/hooks/use-calendar-query";
import { useUpdateAndStopTimerMutation } from "@/hooks/use-project-timer";
import { useProjectSettingsQuery } from "@/hooks/use-projects-query";
import { apiErrorMessage } from "@/lib/api-error";
import type { ActiveTimer } from "@/lib/project-timer";
import type { ProjectClient } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

type Draft = {
  client: ProjectClient | null;
  assignProject: boolean;
  projectId: string;
  jobId: string;
  isBillable: boolean;
  hourlyRate: string;
};

/**
 * The details a running timer needs before it can stop — sole-webapp's
 * ProjectSelector as the top bar's stop guard opened it, laid out as the
 * design's "Select Client & Project" panel: a client, optionally a project
 * and job, whether it's billable and at what rate. Saving writes them onto
 * the timer and stops it, as `handleUpdateTimerAndStop` did.
 */
export function TimerDetailsDialog({
  timer,
  open,
  onOpenChange,
}: {
  timer: ActiveTimer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settingsQuery = useProjectSettingsQuery(open);
  const defaultRate = settingsQuery.data?.defaultHourlyRate ?? "";
  const updateAndStop = useUpdateAndStopTimerMutation();

  const blank = React.useCallback(
    (): Draft => ({
      client: null,
      assignProject: false,
      projectId: "",
      jobId: "",
      isBillable: true,
      hourlyRate: defaultRate,
    }),
    [defaultRate],
  );

  const [draft, setDraft] = React.useState<Draft>(blank);
  const [rateError, setRateError] = React.useState("");

  // Prefilled from the timer each time it opens, as the old guard did.
  React.useEffect(() => {
    if (!open) return;
    setRateError("");
    setDraft({
      client: timer.clientId
        ? { clientId: timer.clientId, contactId: timer.contactId, name: timer.clientName, email: "" }
        : null,
      assignProject: !!(timer.projectId || timer.jobId),
      projectId: timer.projectId ?? "",
      jobId: timer.jobId ?? "",
      isBillable: timer.isBillable,
      hourlyRate: timer.hourlyRate || defaultRate,
    });
    // The rate default arriving later only fills an empty field — see below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, timer]);

  React.useEffect(() => {
    if (open && defaultRate) {
      setDraft((current) => (current.hourlyRate ? current : { ...current, hourlyRate: defaultRate }));
    }
  }, [open, defaultRate]);

  const projectsQuery = useClientProjectsQuery(draft.assignProject ? draft.client?.clientId : null);
  const jobsQuery = useProjectJobsQuery(draft.assignProject ? draft.projectId : "");
  const projects = projectsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];

  const save = () => {
    if (!draft.client) {
      toast.error("Please select a contact before stopping the timer");
      return;
    }
    if (draft.isBillable && !(Number(draft.hourlyRate) > 0)) {
      setRateError("Hourly rate must be greater than 0 if billable is checked.");
      return;
    }
    updateAndStop.mutate(
      {
        timer,
        details: {
          clientId: draft.client.clientId,
          contactId: draft.client.contactId,
          projectId: draft.assignProject ? draft.projectId || null : null,
          jobId: draft.assignProject ? draft.jobId || null : null,
          taskId: draft.assignProject ? timer.taskId : null,
          isBillable: draft.isBillable,
          hourlyRate: draft.isBillable ? draft.hourlyRate : "",
        },
      },
      {
        onSuccess: () => {
          toast.success("Timer stopped successfully");
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Failed to stop timer")),
      },
    );
  };

  const busy = updateAndStop.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select client &amp; project</DialogTitle>
          <DialogDescription>
            This timer needs a contact before it can stop. Pick one, then save to stop the timer.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <Field label="Client" htmlFor="timer-client" required>
            <ProjectClientSelect
              id="timer-client"
              value={draft.client}
              onChange={(client) =>
                setDraft((current) => ({ ...current, client, projectId: "", jobId: "" }))
              }
            />
          </Field>

          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm font-semibold">Assign to specific project</span>
            <Switch
              checked={draft.assignProject}
              onCheckedChange={(assignProject) =>
                setDraft((current) => ({ ...current, assignProject }))
              }
            />
          </label>

          {draft.assignProject && (
            <>
              <Field label="Project" htmlFor="timer-project">
                <Select
                  value={draft.projectId}
                  onValueChange={(projectId) =>
                    setDraft((current) => ({ ...current, projectId, jobId: "" }))
                  }
                  disabled={!draft.client || projects.length === 0}
                >
                  <SelectTrigger id="timer-project">
                    <SelectValue
                      placeholder={
                        !draft.client
                          ? "Select a client first"
                          : projectsQuery.isLoading
                            ? "Loading projects…"
                            : projects.length === 0
                              ? "No projects for this client"
                              : "Select a project"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={String(project.id)}>
                        {project.project_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Job / Milestone" htmlFor="timer-job">
                <Select
                  value={draft.jobId}
                  onValueChange={(jobId) => setDraft((current) => ({ ...current, jobId }))}
                  disabled={!draft.projectId || jobs.length === 0}
                >
                  <SelectTrigger id="timer-job">
                    <SelectValue
                      placeholder={
                        !draft.projectId
                          ? "Select a project first"
                          : jobsQuery.isLoading
                            ? "Loading jobs…"
                            : "Select a job"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={String(job.id)}>
                        {job.job_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}

          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm font-semibold">Billable</span>
            <Switch
              checked={draft.isBillable}
              onCheckedChange={(isBillable) => {
                setRateError("");
                setDraft((current) => ({ ...current, isBillable }));
              }}
            />
          </label>

          {draft.isBillable && (
            <Field label="Hourly rate" htmlFor="timer-rate" error={rateError || undefined}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {activeCurrencySymbol()}
                </span>
                <Input
                  id="timer-rate"
                  inputMode="decimal"
                  value={draft.hourlyRate}
                  onChange={(event) => {
                    setRateError("");
                    const hourlyRate = event.target.value.replace(/[^\d.]/g, "");
                    setDraft((current) => ({ ...current, hourlyRate }));
                  }}
                  placeholder="0"
                  aria-invalid={!!rateError}
                  className={cn("pl-7 tabular", rateError && "border-destructive")}
                />
              </div>
            </Field>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setRateError("");
              setDraft(blank());
            }}
          >
            Reset
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
