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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, Required } from "@/components/documents/field";
import {
  useNpsSurveysQuery,
  useSaveTaskMutation,
  useTaskStagesQuery,
} from "@/hooks/use-project-jobs-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  TASK_PRIORITIES,
  emptyTaskDraft,
  taskDraftFromTask,
  taskIssues,
  taskPayload,
  type ProjectJob,
  type ProjectTask,
  type TaskChargeType,
  type TaskDraft,
  type TaskPriority,
} from "@/lib/project-jobs";
import { fetchProjectSettings, type Project } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

/** Radix Select can't hold an empty value, so "none" stands in for it. */
const NONE = "__none__";

/**
 * New / edit task — sole-webapp's NewTaskModal, in the design's modal.
 *
 * A new task opens under the job it was added from, with the default hourly
 * rate from the project settings; an edit opens with the task's own values.
 * Either way the job can't be changed here — the old drawer locked it too.
 * The status picker lists the planner stages, preselecting "In Progress".
 */
export function TaskFormDialog({
  open,
  project,
  jobs,
  jobId,
  task,
  onOpenChange,
}: {
  open: boolean;
  project: Project;
  jobs: ProjectJob[];
  /** The job a new task is being added to. */
  jobId: string | null;
  /** Set to edit that task; null to create one. */
  task: ProjectTask | null;
  onOpenChange: (open: boolean) => void;
}) {
  const editing = task !== null;
  const saveTask = useSaveTaskMutation(project.id);
  const stagesQuery = useTaskStagesQuery(open);
  const surveysQuery = useNpsSurveysQuery(open);
  const [draft, setDraft] = React.useState<TaskDraft>(() => emptyTaskDraft(null));
  const [attempted, setAttempted] = React.useState(false);
  const [touched, setTouched] = React.useState<Partial<Record<keyof TaskDraft, boolean>>>({});
  const [rateLoading, setRateLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAttempted(false);
    setTouched({});
    if (task) {
      setDraft(taskDraftFromTask(task));
      return;
    }
    setDraft(emptyTaskDraft(jobId));
    let cancelled = false;
    setRateLoading(true);
    fetchProjectSettings()
      .then((settings) => {
        if (!cancelled && settings.defaultHourlyRate) {
          setDraft((current) => ({ ...current, rate: settings.defaultHourlyRate }));
        }
      })
      .catch(() => {
        // No settings yet — the rate starts blank, as it did before.
      })
      .finally(() => !cancelled && setRateLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, task, jobId]);

  // Preselect the "In Progress" stage (else the first) when none is set —
  // `fetchPlannerStages` did this for new and stage-less tasks alike.
  const stages = React.useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);
  React.useEffect(() => {
    if (!open || stages.length === 0) return;
    const fallback =
      stages.find((stage) => String(stage.name ?? "").trim().toLowerCase().includes("in progress")) ??
      stages[0];
    if (!fallback) return;
    setDraft((current) => (current.stageId ? current : { ...current, stageId: String(fallback.id) }));
  }, [open, stages]);

  const issues = taskIssues(draft, project.budget);
  const issueFor = (key: keyof TaskDraft) =>
    attempted || touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setTouched((current) => ({ ...current, [key]: true }));
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (issues.length > 0 || saveTask.isPending) return;
    saveTask.mutate(
      { id: task?.id, payload: taskPayload(draft, project, editing) },
      {
        onSuccess: () => {
          toast.success(editing ? "Task updated successfully" : "Task created successfully");
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(
            apiErrorMessage(
              error,
              `An error occurred while ${editing ? "updating" : "creating"} the task`,
            ),
          ),
      },
    );
  };

  const saving = saveTask.isPending;
  const surveys = surveysQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update how this task is tracked and billed."
                : "Add a task to this job, then track time against it."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field label="Task name" htmlFor="task-name" required error={issueFor("name")}>
              <Input
                id="task-name"
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Enter task name"
                aria-invalid={!!issueFor("name")}
                className={cn(issueFor("name") && "border-destructive focus-visible:ring-destructive")}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status" htmlFor="task-stage">
                <Select
                  value={draft.stageId || undefined}
                  onValueChange={(value) => set("stageId", value)}
                  disabled={stagesQuery.isLoading}
                >
                  <SelectTrigger id="task-stage">
                    <SelectValue
                      placeholder={stagesQuery.isLoading ? "Loading status…" : "Select status"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={String(stage.id)} value={String(stage.id)}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Job code" htmlFor="task-job">
                <Select value={draft.jobId || NONE} disabled>
                  <SelectTrigger id="task-job">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No job code</SelectItem>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.code} - {job.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="divide-y divide-border rounded-md border border-border">
              <label className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2.5">
                <span className="text-sm font-medium">Billable</span>
                <Switch
                  checked={draft.isBillable}
                  onCheckedChange={(checked) => set("isBillable", checked)}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2.5">
                <span className="text-sm font-medium">NPS enabled</span>
                <Switch
                  checked={draft.npsEnabled}
                  onCheckedChange={(checked) => set("npsEnabled", checked)}
                />
              </label>
            </div>

            {draft.npsEnabled && (
              <Field label="Select survey" htmlFor="task-survey">
                <Select
                  value={draft.npsSurveyId || NONE}
                  onValueChange={(value) => set("npsSurveyId", value === NONE ? "" : value)}
                  disabled={surveysQuery.isLoading}
                >
                  <SelectTrigger id="task-survey">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      {surveysQuery.isLoading ? "Loading surveys…" : "Default survey"}
                    </SelectItem>
                    {surveys.map((survey) => (
                      <SelectItem key={survey.id} value={survey.id}>
                        {survey.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {draft.isBillable && (
              <div className="space-y-2">
                <Label className="flex items-center">
                  Charge type
                  <Required />
                </Label>
                <RadioGroup
                  value={draft.chargeType}
                  onValueChange={(value) => set("chargeType", value as TaskChargeType)}
                  className="flex flex-wrap gap-5"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="hourly" id="task-charge-hourly" />
                    Hourly rate
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="fixed" id="task-charge-fixed" />
                    Fixed budget
                  </label>
                </RadioGroup>
              </div>
            )}

            {draft.isBillable && draft.chargeType === "hourly" && (
              <Field label="Rate (per hour)" htmlFor="task-rate" required error={issueFor("rate")}>
                <MoneyInput
                  id="task-rate"
                  value={draft.rate}
                  onChange={(value) => set("rate", value)}
                  placeholder={rateLoading ? "Loading…" : "0.00"}
                  disabled={rateLoading}
                  loading={rateLoading}
                  invalid={!!issueFor("rate")}
                />
              </Field>
            )}

            {draft.isBillable && draft.chargeType === "fixed" && (
              <Field label="Amount" htmlFor="task-amount" required error={issueFor("amount")}>
                <MoneyInput
                  id="task-amount"
                  value={draft.amount}
                  onChange={(value) => set("amount", value)}
                  placeholder="0.00"
                  invalid={!!issueFor("amount")}
                />
              </Field>
            )}

            <div className="space-y-2">
              <Label>Priority</Label>
              <RadioGroup
                value={draft.priority}
                onValueChange={(value) => set("priority", value as TaskPriority)}
                className="flex flex-wrap gap-5"
              >
                {TASK_PRIORITIES.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value={option.value} id={`task-priority-${option.value}`} />
                    {option.label}
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Field label="Notes (optional)" htmlFor="task-notes" error={issueFor("notes")}>
              <Textarea
                id="task-notes"
                rows={3}
                maxLength={500}
                value={draft.notes}
                onChange={(event) => set("notes", event.target.value)}
                placeholder="Add any additional notes here…"
              />
            </Field>
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? "Update task" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  loading,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {activeCurrencySymbol()}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
        className={cn("pl-7 tabular", invalid && "border-destructive focus-visible:ring-destructive")}
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
