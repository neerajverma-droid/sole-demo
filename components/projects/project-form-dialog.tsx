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
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { ProjectClientSelect } from "@/components/projects/project-client-select";
import { useProjectMoney } from "@/components/projects/project-shared";
import {
  useCreateProjectMutation,
  useProjectQuery,
  useUpdateProjectMutation,
} from "@/hooks/use-projects-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  PROJECT_BUDGET_TYPES,
  PROJECT_STATUSES,
  applySettingsToDraft,
  createProjectPayload,
  emptyProjectDraft,
  fetchNextProjectCode,
  fetchProjectSettings,
  parseProjectDate,
  projectDraftFromProject,
  projectIssues,
  totalFromPeriod,
  updateProjectPayload,
  type ProjectBudgetType,
  type ProjectDraft,
  type ProjectStatus,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

const BUDGET_FIELD: Record<ProjectBudgetType, "totalBudget" | "weeklyBudget" | "monthlyBudget"> = {
  total: "totalBudget",
  weekly: "weeklyBudget",
  monthly: "monthlyBudget",
};

const BUDGET_PLACEHOLDER: Record<ProjectBudgetType, string> = {
  total: "10,000",
  weekly: "1,000",
  monthly: "5,000",
};

/**
 * New / edit project — sole-webapp's NewProjectModal, in the design's modal.
 *
 * Creating fetches the next project code and pre-fills the budget from the
 * project settings, as the old drawer did on open. Editing loads the project
 * fresh and locks the client, which the old drawer also did.
 */
export function ProjectFormDialog({
  open,
  projectId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** Set to edit that project; absent to create one. */
  projectId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: string) => void;
}) {
  const editing = !!projectId;
  const money = useProjectMoney();
  const projectQuery = useProjectQuery(open && editing ? projectId : null);
  const createProject = useCreateProjectMutation();
  const updateProject = useUpdateProjectMutation();
  const saving = createProject.isPending || updateProject.isPending;

  const [draft, setDraft] = React.useState<ProjectDraft>(() => emptyProjectDraft());
  const [attempted, setAttempted] = React.useState(false);
  const [touched, setTouched] = React.useState<Partial<Record<keyof ProjectDraft, boolean>>>({});
  const [generatingCode, setGeneratingCode] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  // An edit is seeded once per opening, so a background refetch never
  // overwrites what's being typed.
  const seeded = React.useRef(false);

  // A fresh draft each time it opens: the next code and the settings'
  // budget defaults for a new project, the stored values for an edit.
  React.useEffect(() => {
    if (!open) return;
    seeded.current = false;
    setAttempted(false);
    setTouched({});
    if (editing) return;

    let cancelled = false;
    setDraft(emptyProjectDraft());
    setPreparing(true);
    setGeneratingCode(true);
    fetchProjectSettings()
      .then((settings) => {
        if (!cancelled) setDraft((current) => applySettingsToDraft(current, settings));
      })
      .catch(() => {
        // No settings yet — the form's own defaults stand.
      })
      .finally(() => !cancelled && setPreparing(false));
    fetchNextProjectCode()
      .then((code) => {
        if (!cancelled && code) setDraft((current) => ({ ...current, code: current.code || code }));
      })
      .catch((error) => toast.error(apiErrorMessage(error, "Something went wrong")))
      .finally(() => !cancelled && setGeneratingCode(false));
    return () => {
      cancelled = true;
    };
  }, [open, editing]);

  const loadedProject = projectQuery.data;
  React.useEffect(() => {
    if (!open || !editing || !loadedProject || seeded.current) return;
    seeded.current = true;
    setDraft(projectDraftFromProject(loadedProject));
  }, [open, editing, loadedProject]);

  const issues = projectIssues(draft);
  const issueFor = (key: keyof ProjectDraft) =>
    attempted || touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;

  const set = <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => {
    setTouched((current) => ({ ...current, [key]: true }));
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const calculated = draft.budgetEnabled ? totalFromPeriod(draft) : null;
  const loading = editing ? projectQuery.isLoading : preparing;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (issues.length > 0 || saving) return;

    if (editing && projectId) {
      updateProject.mutate(
        { id: projectId, payload: updateProjectPayload(draft) },
        {
          onSuccess: () => {
            toast.success("Project updated successfully");
            onOpenChange(false);
            onSaved?.(projectId);
          },
          onError: (error) =>
            toast.error(apiErrorMessage(error, "An error occurred while updating the project")),
        },
      );
      return;
    }
    createProject.mutate(createProjectPayload(draft), {
      onSuccess: ({ id }) => {
        toast.success("Project created successfully");
        onOpenChange(false);
        onSaved?.(id);
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, "An error occurred while creating the project")),
    });
  };

  const budgetKey = BUDGET_FIELD[draft.budgetType];
  const startDate = parseProjectDate(draft.startDate) ?? undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the project's details, dates and budget."
                : "Set up a project for a client, then add its jobs and milestones."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="mt-5 space-y-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Shimmer key={index} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : editing && projectQuery.isError ? (
            <div className="mt-5 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Couldn&apos;t load this project.
              <div className="mt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => projectQuery.refetch()}>
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <Field label="Client" htmlFor="project-client" required error={issueFor("client")}>
                <ProjectClientSelect
                  id="project-client"
                  value={draft.client}
                  onChange={(client) => set("client", client)}
                  invalid={!!issueFor("client")}
                  disabled={editing}
                />
              </Field>

              <Field label="Project name" htmlFor="project-name" required error={issueFor("name")}>
                <Input
                  id="project-name"
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="Enter project name"
                  aria-invalid={!!issueFor("name")}
                  className={cn(issueFor("name") && "border-destructive focus-visible:ring-destructive")}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project code" htmlFor="project-code" required={!editing} error={issueFor("code")}>
                  <div className="relative">
                    <Input
                      id="project-code"
                      value={draft.code}
                      onChange={(event) => set("code", event.target.value)}
                      placeholder={generatingCode ? "Generating project code…" : "PRO-123456"}
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
                <Field label="Status" htmlFor="project-status">
                  <Select
                    value={draft.status}
                    onValueChange={(value) => set("status", value as ProjectStatus)}
                  >
                    <SelectTrigger id="project-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUSES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start date" htmlFor="project-start" required error={issueFor("startDate")}>
                  <DatePicker
                    id="project-start"
                    value={draft.startDate}
                    onChange={(iso) => set("startDate", iso)}
                    invalid={!!issueFor("startDate")}
                  />
                </Field>
                <Field label="End date" htmlFor="project-end" required error={issueFor("endDate")}>
                  <DatePicker
                    id="project-end"
                    value={draft.endDate}
                    onChange={(iso) => set("endDate", iso)}
                    fromDate={startDate}
                    invalid={!!issueFor("endDate")}
                  />
                </Field>
              </div>

              <Field label="Description" htmlFor="project-description" error={issueFor("description")}>
                <Textarea
                  id="project-description"
                  rows={3}
                  maxLength={500}
                  value={draft.description}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder="Add any relevant details about the project here…"
                />
              </Field>

              <div className="space-y-2">
                <Label>Project type</Label>
                <RadioGroup
                  value={draft.taskBased ? "task" : "fixed"}
                  onValueChange={(value) => set("taskBased", value === "task")}
                  className="flex flex-wrap gap-5"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="task" id="project-type-task" />
                    Task based
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="fixed" id="project-type-fixed" />
                    Fixed
                  </label>
                </RadioGroup>
              </div>

              <div className="space-y-4 rounded-md border border-border bg-muted/30 p-3">
                <label className="flex cursor-pointer items-start justify-between gap-4">
                  <span>
                    <span className="block text-sm font-medium">Budget allocated</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Track spend against a budget for this project.
                    </span>
                  </span>
                  <Switch
                    checked={draft.budgetEnabled}
                    onCheckedChange={(checked) => set("budgetEnabled", checked)}
                  />
                </label>

                {draft.budgetEnabled && (
                  <div className="space-y-3">
                    <RadioGroup
                      value={draft.budgetType}
                      onValueChange={(value) => set("budgetType", value as ProjectBudgetType)}
                      className="flex flex-wrap gap-5"
                    >
                      {PROJECT_BUDGET_TYPES.map((option) => (
                        <label
                          key={option.value}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <RadioGroupItem value={option.value} id={`project-budget-${option.value}`} />
                          {option.label}
                        </label>
                      ))}
                    </RadioGroup>

                    <Field
                      label={`${PROJECT_BUDGET_TYPES.find((option) => option.value === draft.budgetType)?.label} budget`}
                      htmlFor="project-budget-amount"
                      required
                      error={issueFor(budgetKey)}
                    >
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          {activeCurrencySymbol()}
                        </span>
                        <Input
                          id="project-budget-amount"
                          inputMode="decimal"
                          value={draft[budgetKey]}
                          onChange={(event) =>
                            set(budgetKey, event.target.value.replace(/[^\d.]/g, ""))
                          }
                          placeholder={BUDGET_PLACEHOLDER[draft.budgetType]}
                          aria-invalid={!!issueFor(budgetKey)}
                          className={cn(
                            "pl-7 tabular",
                            issueFor(budgetKey) && "border-destructive focus-visible:ring-destructive",
                          )}
                        />
                      </div>
                    </Field>

                    {calculated && (
                      <div className="rounded-md border border-primary/20 bg-primary/[0.06] px-3 py-2">
                        <p className="text-sm font-medium text-primary">
                          Estimated total budget:{" "}
                          <span className="font-semibold tabular">{money(Number(calculated))}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Calculated from {draft.budgetType} budget × project duration
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || loading}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
