"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

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
import { TimePicker } from "@/components/documents/time-picker";
import { ProjectClientSelect } from "@/components/projects/project-client-select";
import { useClientProjectsQuery, useProjectJobsQuery } from "@/hooks/use-calendar-query";
import { formatHoursMinutes, hoursBetween, type DraftErrors, type TimerClient } from "@/lib/time-tracker";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

/** The part of every time form that says whose time it is and what it's worth. */
export type TimeDetails = {
  client: TimerClient | null;
  assignProject: boolean;
  projectId: string;
  jobId: string;
  isBillable: boolean;
  hourlyRate: string;
};

/**
 * Client, then optionally a project and job under that client, then billable
 * and the hourly rate — the design's "Select Client & Project" panel, shared
 * by the timer bar, Add/Edit log and the save-and-stop dialog.
 */
export function TimeDetailsFields<T extends TimeDetails>({
  idPrefix,
  value,
  onChange,
  errors = {},
  clientRequired = true,
  showRate = true,
  /** When the project can't be changed any more (a running timer's job is fixed at start). */
  projectReadOnly,
}: {
  idPrefix: string;
  value: T;
  onChange: (next: T) => void;
  errors?: DraftErrors;
  clientRequired?: boolean;
  showRate?: boolean;
  projectReadOnly?: React.ReactNode;
}) {
  const set = (patch: Partial<TimeDetails>) => onChange({ ...value, ...patch });

  const projectsQuery = useClientProjectsQuery(value.assignProject ? value.client?.clientId : null);
  const jobsQuery = useProjectJobsQuery(value.assignProject ? value.projectId : "");
  const projects = projectsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  // While a list is on its way the field can't open, and says why: a spinner
  // in place of the value, dimmed — even when editing, where a project is
  // already picked and would otherwise sit there blank until its list lands.
  const projectsLoading = !!value.client && projectsQuery.isLoading;
  const jobsLoading = !!value.projectId && jobsQuery.isLoading;

  return (
    <div className="space-y-4">
      <Field label="Client" htmlFor={`${idPrefix}-client`} required={clientRequired} error={errors.client}>
        <ProjectClientSelect
          id={`${idPrefix}-client`}
          value={value.client}
          invalid={!!errors.client}
          onChange={(client) => {
            // Projects belong to a client, so a new client clears them.
            const sameClient = client?.clientId === value.client?.clientId;
            set(sameClient ? { client } : { client, projectId: "", jobId: "" });
          }}
        />
      </Field>

      {projectReadOnly ?? (
        <>
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">Assign to specific project</span>
              <span className="block text-xs text-muted-foreground">
                Record this time against a project and job.
              </span>
            </span>
            <Switch
              checked={value.assignProject}
              onCheckedChange={(assignProject) =>
                set(assignProject ? { assignProject } : { assignProject, projectId: "", jobId: "" })
              }
            />
          </label>

          {value.assignProject && (
            <>
              <Field label="Project" htmlFor={`${idPrefix}-project`} required error={errors.project}>
                <Select
                  value={value.projectId}
                  onValueChange={(projectId) => set({ projectId, jobId: "" })}
                  disabled={!value.client || projectsLoading || projects.length === 0}
                >
                  <SelectTrigger
                    id={`${idPrefix}-project`}
                    aria-invalid={!!errors.project || undefined}
                    aria-busy={projectsLoading || undefined}
                    className={cn(projectsLoading && "cursor-wait bg-muted/40")}
                  >
                    {projectsLoading ? (
                      <LoadingValue label="Loading projects…" />
                    ) : (
                      <SelectValue
                        placeholder={
                          !value.client
                            ? "Select a client first"
                            : projects.length === 0
                              ? "No projects for this client"
                              : "Select a project"
                        }
                      />
                    )}
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
              <Field label="Job / Milestone" htmlFor={`${idPrefix}-job`} required error={errors.job}>
                <Select
                  value={value.jobId}
                  onValueChange={(jobId) => set({ jobId })}
                  disabled={!value.projectId || jobsLoading || jobs.length === 0}
                >
                  <SelectTrigger
                    id={`${idPrefix}-job`}
                    aria-invalid={!!errors.job || undefined}
                    aria-busy={jobsLoading || undefined}
                    className={cn(jobsLoading && "cursor-wait bg-muted/40")}
                  >
                    {jobsLoading ? (
                      <LoadingValue label="Loading jobs…" />
                    ) : (
                      <SelectValue
                        placeholder={
                          !value.projectId
                            ? "Select a project first"
                            : jobs.length === 0
                              ? "No jobs in this project"
                              : "Select a job"
                        }
                      />
                    )}
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
        </>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-sm font-semibold">Billable</span>
        <Switch checked={value.isBillable} onCheckedChange={(isBillable) => set({ isBillable })} />
      </label>

      {showRate && value.isBillable && (
        <Field label="Hourly rate" htmlFor={`${idPrefix}-rate`} error={errors.rate}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {activeCurrencySymbol()}
            </span>
            <Input
              id={`${idPrefix}-rate`}
              inputMode="decimal"
              value={value.hourlyRate}
              onChange={(event) => set({ hourlyRate: event.target.value.replace(/[^\d.]/g, "") })}
              placeholder="0.00"
              aria-invalid={!!errors.rate || undefined}
              className={cn("pl-7 tabular", errors.rate && "border-destructive")}
            />
          </div>
        </Field>
      )}
    </div>
  );
}

/** A select's value while its options load: spinner and a muted label. */
function LoadingValue({ label }: { label: string }) {
  return (
    // `!flex`: SelectTrigger clamps its direct <span> children to one line
    // with `-webkit-box`, which otherwise stacks the spinner over the label.
    <span className="!flex min-w-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** The two ways to say how long: a start and end time, or a duration. */
export function DurationFields({
  idPrefix,
  value,
  onChange,
  error,
}: {
  idPrefix: string;
  value: { useDuration: boolean; startTime: string; endTime: string; hours: string; minutes: string };
  onChange: (patch: Partial<{ useDuration: boolean; startTime: string; endTime: string; hours: string; minutes: string }>) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      {value.useDuration ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hours" htmlFor={`${idPrefix}-hours`} required>
            <Input
              id={`${idPrefix}-hours`}
              inputMode="numeric"
              value={value.hours}
              onChange={(event) => onChange({ hours: event.target.value.replace(/\D/g, "").slice(0, 2) })}
              placeholder="0"
              aria-invalid={!!error || undefined}
              className="tabular"
            />
          </Field>
          <Field label="Minutes" htmlFor={`${idPrefix}-minutes`}>
            <Input
              id={`${idPrefix}-minutes`}
              inputMode="numeric"
              value={value.minutes}
              onChange={(event) => onChange({ minutes: event.target.value.replace(/\D/g, "").slice(0, 2) })}
              placeholder="0"
              aria-invalid={!!error || undefined}
              className="tabular"
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* The app's own picker (hour · minute · AM/PM) — the native time
              input only opened from its little clock icon, and not at all in
              some browsers. */}
          <Field label="Start time" htmlFor={`${idPrefix}-start`} required>
            <TimePicker
              id={`${idPrefix}-start`}
              label="Start time"
              value={value.startTime}
              onChange={(startTime) => onChange({ startTime })}
              invalid={!!error}
              className="w-full"
            />
          </Field>
          <Field label="End time" htmlFor={`${idPrefix}-end`} required>
            <TimePicker
              id={`${idPrefix}-end`}
              label="End time"
              value={value.endTime}
              onChange={(endTime) => onChange({ endTime })}
              invalid={!!error}
              className="w-full"
            />
          </Field>
        </div>
      )}
      {!value.useDuration && value.startTime && value.endTime && !error && (
        <p className="text-xs text-muted-foreground tabular">
          Duration: {formatHoursMinutes(hoursBetween(value.startTime, value.endTime))}
          {value.endTime < value.startTime ? " (ends the next day)" : ""}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        className="text-sm font-medium text-primary hover:underline"
        onClick={() => onChange({ useDuration: !value.useDuration })}
      >
        {value.useDuration ? "Enter start / end instead" : "Enter duration instead"}
      </button>
    </div>
  );
}
