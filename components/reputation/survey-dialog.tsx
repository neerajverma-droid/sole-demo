"use client";

import * as React from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/documents/field";
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
  createReputationSurvey,
  reputationErrorMessage,
  updateReputationSurvey,
} from "@/lib/reputation-api";
import {
  buildSurveyPayload,
  surveyDraftFrom,
  type ReputationSurvey,
  type SurveyDraft,
  type SurveyStatus,
} from "@/lib/reputation";
import { cn } from "@/lib/utils";

export function SurveyDialog({
  open,
  survey,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  survey: ReputationSurvey | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const [draft, setDraft] = React.useState<SurveyDraft>(() => surveyDraftFrom(survey));
  const [attempted, setAttempted] = React.useState(false);
  const [saving, setSaving] = React.useState<SurveyStatus | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(surveyDraftFrom(survey));
    setAttempted(false);
    setSaving(null);
  }, [open, survey]);

  const nameError = attempted && !draft.name.trim() ? "Survey name is required" : undefined;
  const questionError = attempted && !draft.question.trim() ? "Survey question is required" : undefined;

  const set = (key: keyof SurveyDraft) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  const save = async (status: SurveyStatus) => {
    setAttempted(true);
    if (!draft.name.trim() || !draft.question.trim()) return;
    setSaving(status);
    try {
      const payload = buildSurveyPayload(draft, status, survey);
      if (survey) await updateReputationSurvey(survey.id, payload);
      else await createReputationSurvey(payload);
      await onSaved();
      toast.success(status === "draft" ? "Survey saved as draft" : survey ? "Survey updated" : "Survey created");
      onOpenChange(false);
    } catch (error) {
      toast.error(reputationErrorMessage(error, "Failed to save the survey"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save("active");
          }}
        >
          <DialogHeader>
            <DialogTitle>{survey ? "Edit survey" : "New survey"}</DialogTitle>
            <DialogDescription>
              Pick the question clients answer after a job — their written comments are captured as well.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Survey name" htmlFor="survey-name" required error={nameError}>
              <Input
                id="survey-name"
                value={draft.name}
                onChange={set("name")}
                placeholder="e.g. End of job — standard"
                aria-invalid={!!nameError}
                className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
                autoFocus
              />
            </Field>
            <Field label="When to use it" htmlFor="survey-description">
              <Input
                id="survey-description"
                value={draft.description}
                onChange={set("description")}
                placeholder="e.g. After any completed job"
              />
            </Field>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs font-semibold text-primary">
              1 <span className="ml-1 tracking-wide text-muted-foreground">QUESTION</span>
            </p>
            <div className="mt-2.5">
              <Field label="Question text" htmlFor="survey-question" required error={questionError}>
                <Input
                  id="survey-question"
                  value={draft.question}
                  onChange={set("question")}
                  placeholder="e.g. How would you rate this job?"
                  aria-invalid={!!questionError}
                  className={cn("bg-background", questionError && "border-destructive focus-visible:ring-destructive")}
                />
              </Field>
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">Answer type</span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary">
                <Star className="size-4 fill-amber-500 text-amber-500" aria-hidden />
                Star rating (1–5)
              </span>
            </div>
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" disabled={!!saving} onClick={() => void save("draft")}>
              {saving === "draft" && <Loader2 className="animate-spin" />}
              Save as draft
            </Button>
            <Button type="submit" disabled={!!saving}>
              {saving === "active" && <Loader2 className="animate-spin" />}
              Save survey
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
