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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { useSaveJobMutation } from "@/hooks/use-project-jobs-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  emptyJobDraft,
  jobDraftFromJob,
  jobIssues,
  jobPayload,
  type JobDraft,
  type ProjectJob,
} from "@/lib/project-jobs";
import { fetchNextJobCode, type Project } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

/**
 * Create / edit job — sole-webapp's NewJobModal, in the design's modal.
 *
 * A new job asks the server for the next job code as it opens, as the old
 * drawer did (which also advances the server's counter). An existing job's
 * code is shown but locked: the update endpoint doesn't take it.
 */
export function JobFormDialog({
  open,
  project,
  job,
  onOpenChange,
}: {
  open: boolean;
  project: Project;
  /** Set to edit that job; null to create one. */
  job: ProjectJob | null;
  onOpenChange: (open: boolean) => void;
}) {
  const editing = job !== null;
  const saveJob = useSaveJobMutation(project.id);
  const [draft, setDraft] = React.useState<JobDraft>(emptyJobDraft);
  const [attempted, setAttempted] = React.useState(false);
  const [touched, setTouched] = React.useState<Partial<Record<keyof JobDraft, boolean>>>({});
  const [generatingCode, setGeneratingCode] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAttempted(false);
    setTouched({});
    if (job) {
      setDraft(jobDraftFromJob(job));
      return;
    }
    setDraft(emptyJobDraft());
    let cancelled = false;
    setGeneratingCode(true);
    fetchNextJobCode()
      .then((code) => {
        if (!cancelled) setDraft((current) => ({ ...current, code: current.code || code }));
      })
      .catch((error) => toast.error(apiErrorMessage(error, "Something went wrong")))
      .finally(() => !cancelled && setGeneratingCode(false));
    return () => {
      cancelled = true;
    };
  }, [open, job]);

  const issues = jobIssues(draft, project.budget);
  const issueFor = (key: keyof JobDraft) =>
    attempted || touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;

  const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => {
    setTouched((current) => ({ ...current, [key]: true }));
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (issues.length > 0 || saveJob.isPending) return;
    saveJob.mutate(
      { id: job?.id, payload: jobPayload(draft, project) },
      {
        onSuccess: () => {
          toast.success(editing ? "Job updated successfully" : "Job created successfully");
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Operation failed")),
      },
    );
  };

  const saving = saveJob.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit job" : "Create new job"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update this job's details and budget."
                : "Break the project into a job or milestone to track its tasks and time."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <Field label="Job name" htmlFor="job-name" required error={issueFor("name")}>
              <Input
                id="job-name"
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Enter job name"
                aria-invalid={!!issueFor("name")}
                className={cn(issueFor("name") && "border-destructive focus-visible:ring-destructive")}
              />
            </Field>

            <Field
              label="Job code"
              htmlFor="job-code"
              required
              error={issueFor("code")}
              hint={editing ? "A job's code can't be changed once it's created." : undefined}
            >
              <div className="relative">
                <Input
                  id="job-code"
                  value={draft.code}
                  onChange={(event) => set("code", event.target.value)}
                  placeholder={generatingCode ? "Generating job code…" : "JOB-123456"}
                  disabled={editing || generatingCode}
                  aria-invalid={!!issueFor("code")}
                  className={cn(
                    "tabular",
                    issueFor("code") && "border-destructive focus-visible:ring-destructive",
                  )}
                />
                {generatingCode && (
                  <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
            </Field>

            <Field label="Description" htmlFor="job-description" error={issueFor("description")}>
              <Textarea
                id="job-description"
                rows={4}
                maxLength={500}
                value={draft.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="Enter job description"
              />
            </Field>

            <div className="space-y-4 rounded-md border border-border bg-muted/30 p-3">
              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">Budget allocated</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Set a budget limit for this job
                  </span>
                </span>
                <Switch
                  checked={draft.budgetEnabled}
                  onCheckedChange={(checked) => {
                    setDraft((current) => ({
                      ...current,
                      budgetEnabled: checked,
                      budget: checked ? current.budget : "",
                    }));
                  }}
                />
              </label>

              {draft.budgetEnabled && (
                <Field label="Job budget" htmlFor="job-budget" error={issueFor("budget")}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {activeCurrencySymbol()}
                    </span>
                    <Input
                      id="job-budget"
                      inputMode="decimal"
                      value={draft.budget}
                      onChange={(event) => set("budget", event.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="10,000"
                      aria-invalid={!!issueFor("budget")}
                      className={cn(
                        "pl-7 tabular",
                        issueFor("budget") && "border-destructive focus-visible:ring-destructive",
                      )}
                    />
                  </div>
                </Field>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? "Update job" : "Create job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
