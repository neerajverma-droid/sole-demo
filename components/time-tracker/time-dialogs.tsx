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
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { DurationFields, TimeDetailsFields } from "@/components/time-tracker/time-fields";
import {
  useCreateManualLogMutation,
  useDiscardTimerMutation,
  useSaveAndStopTimerMutation,
  useUpdateLogMutation,
  useUpdateTaskMutation,
} from "@/hooks/use-time-tracker-query";
import { useProjectSettingsQuery } from "@/hooks/use-projects-query";
import { apiErrorMessage } from "@/lib/api-error";
import type { ActiveTimer } from "@/lib/project-timer";
import {
  emptyManualLog,
  formatDuration,
  logDraft,
  logDraftErrors,
  logPayload,
  manualLogErrors,
  selectionError,
  taskDraft,
  taskDraftErrors,
  taskPayload,
  type DraftErrors,
  type LogDraft,
  type ManualLogDraft,
  type TaskDraft,
  type TimeLog,
  type TimerSelection,
  type TimeTask,
} from "@/lib/time-tracker";

function hasErrors(errors: DraftErrors) {
  return Object.keys(errors).length > 0;
}

/* ------------------------------------------------------------------ *
 * Add log (manual entry)
 * ------------------------------------------------------------------ */

export function ManualLogDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settingsQuery = useProjectSettingsQuery(open);
  const defaultRate = settingsQuery.data?.defaultHourlyRate ?? "";
  const create = useCreateManualLogMutation();
  const [draft, setDraft] = React.useState<ManualLogDraft>(() => emptyManualLog());
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(emptyManualLog());
    setSubmitted(false);
  }, [open]);

  // The business's default rate fills an empty field once it arrives.
  React.useEffect(() => {
    if (open && defaultRate) {
      setDraft((current) => (current.hourlyRate ? current : { ...current, hourlyRate: defaultRate }));
    }
  }, [open, defaultRate]);

  const errors = submitted ? manualLogErrors(draft) : {};
  const busy = create.isPending;

  const submit = () => {
    setSubmitted(true);
    if (hasErrors(manualLogErrors(draft))) return;
    create.mutate(draft, {
      onSuccess: () => {
        toast.success("Time entry added", { description: draft.description.trim() });
        onOpenChange(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Failed to create manual log")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add log</DialogTitle>
          <DialogDescription>Record a manual time entry against a client.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div data-usertour="time-log-description">
            <Field label="Description" htmlFor="log-description" required error={errors.description}>
              <Textarea
                id="log-description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="What did you work on?"
                aria-invalid={!!errors.description || undefined}
              />
            </Field>
          </div>

          <div data-usertour="time-log-duration">
            <DurationFields
              idPrefix="log"
              value={draft}
              error={errors.time}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
            />
          </div>

          <Field label="Date" htmlFor="log-date" required error={errors.date}>
            <DatePicker
              id="log-date"
              value={draft.date}
              onChange={(date) => setDraft({ ...draft, date })}
              invalid={!!errors.date}
            />
          </Field>

          <TimeDetailsFields idPrefix="log" value={draft} onChange={setDraft} errors={errors} />
        </div>

        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} data-usertour="time-log-submit">
            {busy && <Loader2 className="animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Edit log (the task a group of sessions belongs to)
 * ------------------------------------------------------------------ */

export function TaskEditDialog({ task, onClose }: { task: TimeTask | null; onClose: () => void }) {
  const update = useUpdateTaskMutation();
  const [draft, setDraft] = React.useState<TaskDraft | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setDraft(task ? taskDraft(task) : null);
    setSubmitted(false);
  }, [task]);

  const errors = submitted && draft ? taskDraftErrors(draft) : {};
  const busy = update.isPending;

  const submit = () => {
    if (!task || !draft) return;
    setSubmitted(true);
    if (hasErrors(taskDraftErrors(draft))) return;
    update.mutate(
      { taskId: task.taskId, payload: taskPayload(draft, task.rate) },
      {
        onSuccess: () => {
          toast.success("Time entry updated");
          onClose();
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Failed to update task")),
      },
    );
  };

  return (
    <Dialog open={task !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit log</DialogTitle>
          <DialogDescription>
            Changes apply to every session under this entry
            {task && task.entries.length > 1 ? ` (${task.entries.length} sessions)` : ""}.
          </DialogDescription>
        </DialogHeader>

        {draft && (
          <div className="space-y-4">
            <Field label="Description" htmlFor="task-description" required error={errors.description}>
              <Textarea
                id="task-description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                aria-invalid={!!errors.description || undefined}
              />
            </Field>
            <TimeDetailsFields
              idPrefix="task"
              value={draft}
              onChange={setDraft}
              errors={errors}
              clientRequired={false}
            />
            {task?.projectId && !draft.assignProject && (
              <p className="text-xs text-muted-foreground">
                This entry stays on {task.projectName || "its project"}: a project can be changed
                here, but not removed.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Edit one session
 * ------------------------------------------------------------------ */

export function LogEditDialog({
  target,
  onClose,
}: {
  target: { task: TimeTask; log: TimeLog } | null;
  onClose: () => void;
}) {
  const update = useUpdateLogMutation();
  const [draft, setDraft] = React.useState<LogDraft | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setDraft(target ? logDraft(target.log) : null);
    setSubmitted(false);
  }, [target]);

  const errors = submitted && draft ? logDraftErrors(draft) : {};
  const busy = update.isPending;

  const submit = () => {
    if (!target || !draft) return;
    setSubmitted(true);
    if (hasErrors(logDraftErrors(draft))) return;
    update.mutate(
      { id: target.log.id, payload: logPayload(draft) },
      {
        onSuccess: () => {
          toast.success("Time entry updated");
          onClose();
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Failed to update time entry")),
      },
    );
  };

  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit session</DialogTitle>
          <DialogDescription>
            {target ? `${target.task.name || "Untitled task"} · currently ${formatDuration(target.log.durationMinutes)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {draft && (
          <div className="space-y-4">
            <DurationFields
              idPrefix="session"
              value={draft}
              error={errors.time}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
            />
            <Field label="Date" htmlFor="session-date" required error={errors.date}>
              <DatePicker
                id="session-date"
                value={draft.date}
                onChange={(date) => setDraft({ ...draft, date })}
                invalid={!!errors.date}
              />
            </Field>
          </div>
        )}

        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Save time entry (stop the timer)
 * ------------------------------------------------------------------ */

type StopDraft = TimerSelection & { description: string };

export function StopTimerDialog({
  timer,
  open,
  seconds,
  description,
  selection,
  projectLabel,
  onOpenChange,
  onDone,
}: {
  timer: ActiveTimer | null;
  open: boolean;
  seconds: number;
  description: string;
  selection: TimerSelection;
  /** The running timer's project · job, which can't change after start. */
  projectLabel: string;
  onOpenChange: (open: boolean) => void;
  /** Closed by a save or a discard — the bar only scrolls to the list on a save. */
  onDone: (outcome: "saved" | "discarded") => void;
}) {
  const saveAndStop = useSaveAndStopTimerMutation();
  const discard = useDiscardTimerMutation();
  const [draft, setDraft] = React.useState<StopDraft>({ ...selection, description });
  const [error, setError] = React.useState<string | null>(null);

  // Seeded from the bar each time it opens.
  React.useEffect(() => {
    if (!open) return;
    setDraft({ ...selection, description });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const busy = saveAndStop.isPending || discard.isPending;

  const save = () => {
    if (!timer) return;
    if (!draft.description.trim()) {
      setError("Add a description to save this entry.");
      return;
    }
    const problem = selectionError({ ...draft, assignProject: false });
    if (problem) {
      setError(problem);
      return;
    }
    saveAndStop.mutate(
      { timer, description: draft.description, selection: { ...draft, assignProject: false } },
      {
        onSuccess: () => {
          toast.success("Time entry saved", { description: formatDuration(seconds / 60) });
          onDone("saved");
        },
        onError: (err) => toast.error(apiErrorMessage(err, "Failed to stop timer")),
      },
    );
  };

  const discardTimer = () => {
    if (!timer) return;
    discard.mutate(timer, {
      onSuccess: () => {
        toast.success("Timer discarded");
        onDone("discarded");
      },
      onError: (err) => toast.error(apiErrorMessage(err, "Couldn't discard the timer")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save time entry</DialogTitle>
          <DialogDescription>Confirm the details before this tracked time is saved.</DialogDescription>
        </DialogHeader>

        {/* No running-duration panel here: the clock is still going while
            this is open, and the client it repeated is the field below. The
            saved length shows in the toast. */}
        <div className="space-y-4">
          <div data-usertour="time-stop-description">
            <Field label="Description" htmlFor="stop-description" required>
              <Textarea
                id="stop-description"
                value={draft.description}
                onChange={(event) => {
                  setError(null);
                  setDraft({ ...draft, description: event.target.value });
                }}
                placeholder="What did you work on?"
              />
            </Field>
          </div>
          <TimeDetailsFields
            idPrefix="stop"
            value={draft}
            onChange={(next) => {
              setError(null);
              setDraft(next);
            }}
            projectReadOnly={
              projectLabel ? (
                <p className="text-sm text-muted-foreground">
                  Project: <span className="font-medium text-foreground">{projectLabel}</span>. To move
                  it, edit the entry after saving.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  To put this on a project, edit the entry after saving.
                </p>
              )
            }
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="mt-2 gap-2 sm:justify-between">
          <Button
            variant="outline"
            className="text-destructive"
            disabled={busy}
            onClick={discardTimer}
            data-usertour="time-stop-discard"
          >
            {discard.isPending && <Loader2 className="animate-spin" />}
            Discard
          </Button>
          <Button onClick={save} disabled={busy} data-usertour="time-stop-save">
            {saveAndStop.isPending && <Loader2 className="animate-spin" />}
            Save entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
