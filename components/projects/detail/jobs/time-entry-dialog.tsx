"use client";

import * as React from "react";
import { Clock, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { useUpdateTimeEntryMutation } from "@/hooks/use-project-jobs-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  timeEntryDraft,
  timeEntryPayload,
  type ProjectTask,
  type TimeEntry,
  type TimeEntryDraft,
} from "@/lib/project-jobs";

export type TimeEntryTarget = { entry: TimeEntry; task: ProjectTask };

/**
 * Edit time entry — sole-webapp's TimeEntryEdit in its "project-edit" mode,
 * opened from a task row: the project, job and task are fixed by the row, so
 * only the time, date and description are offered.
 */
export function TimeEntryDialog({
  projectId,
  target,
  onOpenChange,
}: {
  projectId: string;
  target: TimeEntryTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateEntry = useUpdateTimeEntryMutation(projectId);
  const [draft, setDraft] = React.useState<TimeEntryDraft | null>(null);

  React.useEffect(() => {
    setDraft(target ? timeEntryDraft(target.entry, target.task) : null);
  }, [target]);

  const set = <K extends keyof TimeEntryDraft>(key: K, value: TimeEntryDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const saving = updateEntry.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || !draft || saving) return;
    const result = timeEntryPayload(draft, target.task, projectId);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    updateEntry.mutate(
      { id: target.entry.id, payload: result.payload },
      {
        onSuccess: () => {
          toast.success("Time entry updated successfully");
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, "An error occurred while updating the time entry")),
      },
    );
  };

  return (
    <Dialog open={target !== null} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Edit time entry</DialogTitle>
            <DialogDescription>{target?.task.name}</DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="mt-5 space-y-4">
              <Field label="Task name / description" htmlFor="entry-description">
                <Textarea
                  id="entry-description"
                  rows={2}
                  value={draft.description}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder="Type descriptions…"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                {draft.useStartEnd ? (
                  <>
                    <Field label="Start time" htmlFor="entry-start" required>
                      <TimeInput
                        id="entry-start"
                        value={draft.startTime}
                        onChange={(value) => set("startTime", value)}
                      />
                    </Field>
                    <Field label="End time" htmlFor="entry-end" required>
                      <TimeInput
                        id="entry-end"
                        value={draft.endTime}
                        onChange={(value) => set("endTime", value)}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Hours" htmlFor="entry-hours" required>
                      <Input
                        id="entry-hours"
                        inputMode="numeric"
                        value={draft.hours}
                        onChange={(event) => set("hours", event.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                        className="tabular"
                      />
                    </Field>
                    <Field label="Minutes" htmlFor="entry-minutes" required>
                      <Input
                        id="entry-minutes"
                        inputMode="numeric"
                        value={draft.minutes}
                        onChange={(event) =>
                          set("minutes", event.target.value.replace(/\D/g, "").slice(0, 2))
                        }
                        placeholder="0"
                        className="tabular"
                      />
                    </Field>
                  </>
                )}
                <button
                  type="button"
                  className="justify-self-start text-sm font-medium text-primary hover:underline sm:col-span-2"
                  onClick={() => set("useStartEnd", !draft.useStartEnd)}
                >
                  {draft.useStartEnd ? "Enter duration instead" : "Set start and end time instead"}
                </button>
              </div>

              <Field label="Date" htmlFor="entry-date">
                <DatePicker id="entry-date" value={draft.date} onChange={(iso) => set("date", iso)} />
              </Field>
            </div>
          )}

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Update time entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TimeInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9 tabular [&::-webkit-calendar-picker-indicator]:hidden"
      />
    </div>
  );
}
