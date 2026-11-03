"use client";

import * as React from "react";
import { Briefcase, DollarSign, Hash, LayoutGrid, Loader2, Save, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/documents/field";
import {
  useProjectSettingsQuery,
  useSaveProjectSettingsMutation,
} from "@/hooks/use-projects-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  DEFAULT_PROJECT_SETTINGS,
  projectSettingsIssues,
  type ProjectSettings,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

type BudgetKind = "Total" | "Weekly" | "Monthly";

const BUDGETS: { kind: BudgetKind; label: string; placeholder: string }[] = [
  { kind: "Total", label: "Overall budget", placeholder: "10,000" },
  { kind: "Weekly", label: "Weekly budget", placeholder: "1,000" },
  { kind: "Monthly", label: "Monthly budget", placeholder: "5,000" },
];

/**
 * Project Settings — sole-webapp's `projects/setting` page in the design's
 * sections: the default hourly rate, the project and job code sequences, and
 * the budget a new project starts with. Saved as one record.
 */
export function ProjectSettingsScreen() {
  const settingsQuery = useProjectSettingsQuery();
  const saveSettings = useSaveProjectSettingsMutation();

  const [draft, setDraft] = React.useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);
  const [attempted, setAttempted] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  // Seeded from the server until the first edit, so a refetch never clobbers typing.
  React.useEffect(() => {
    if (settingsQuery.data && !dirty) setDraft(settingsQuery.data);
  }, [settingsQuery.data, dirty]);

  const issues = projectSettingsIssues(draft);
  const issueFor = (key: keyof ProjectSettings) =>
    attempted ? issues.find((issue) => issue.key === key)?.message : undefined;

  const set = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  /** The three budget boxes are exclusive, and unticking clears the amount — as before. */
  const toggleBudget = (kind: BudgetKind, checked: boolean) => {
    setDirty(true);
    setDraft((current) => ({
      ...current,
      showTotalBudget: kind === "Total" ? checked : false,
      showWeeklyBudget: kind === "Weekly" ? checked : false,
      showMonthlyBudget: kind === "Monthly" ? checked : false,
      defaultTotalBudget: kind === "Total" && checked ? current.defaultTotalBudget : "",
      defaultWeeklyBudget: kind === "Weekly" && checked ? current.defaultWeeklyBudget : "",
      defaultMonthlyBudget: kind === "Monthly" && checked ? current.defaultMonthlyBudget : "",
    }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (issues.length > 0 || saveSettings.isPending) return;
    saveSettings.mutate(draft, {
      onSuccess: () => {
        toast.success("Settings saved successfully");
        setDirty(false);
        setAttempted(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Couldn't save project settings.")),
    });
  };

  const amountInput = (key: keyof ProjectSettings, placeholder: string, label: string) => (
    <div className="relative max-w-sm">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {activeCurrencySymbol()}
      </span>
      <Input
        inputMode="decimal"
        aria-label={label}
        value={String(draft[key])}
        onChange={(event) => set(key, event.target.value.replace(/[^\d.]/g, "") as never)}
        placeholder={placeholder}
        className="pl-7 tabular"
      />
    </div>
  );

  const codeSection = (
    kind: "project" | "job",
    prefixKey: "projectPrefix" | "jobPrefix",
    numberKey: "projectNextNumber" | "jobNextNumber",
  ) => (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={kind === "project" ? "Project prefix" : "Job prefix"}
          htmlFor={`${kind}-prefix`}
          error={issueFor(prefixKey)}
        >
          <Input
            id={`${kind}-prefix`}
            value={draft[prefixKey]}
            maxLength={10}
            onChange={(event) => set(prefixKey, event.target.value.toUpperCase())}
            placeholder={kind === "project" ? "PRO" : "JOB"}
            aria-invalid={!!issueFor(prefixKey)}
            className={cn(issueFor(prefixKey) && "border-destructive focus-visible:ring-destructive")}
          />
        </Field>
        <Field label="Next number" htmlFor={`${kind}-next`} error={issueFor(numberKey)}>
          <Input
            id={`${kind}-next`}
            type="number"
            min={1}
            step={1}
            value={draft[numberKey]}
            onChange={(event) => set(numberKey, event.target.value)}
            placeholder="1"
            aria-invalid={!!issueFor(numberKey)}
            className={cn("tabular", issueFor(numberKey) && "border-destructive focus-visible:ring-destructive")}
          />
        </Field>
      </div>
      <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">Preview of next {kind} code:</p>
        <p className="mt-0.5 text-sm font-semibold text-primary tabular">
          {draft[prefixKey] || (kind === "project" ? "PRO" : "JOB")}-{draft[numberKey] || "1"}
        </p>
      </div>
    </>
  );

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={LayoutGrid}
        title="Project Settings"
        description="Configure default settings for your projects, jobs, rates and budgets."
      />

      {settingsQuery.isLoading ? (
        <div className="space-y-[15px]">
          {Array.from({ length: 4 }).map((_, index) => (
            <Shimmer key={index} className="h-40 w-full rounded-lg border border-border" />
          ))}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-[15px]">
          {settingsQuery.isError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Couldn&apos;t load your saved settings — these are the defaults.
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => settingsQuery.refetch()}>
                Try again
              </Button>
            </div>
          )}

          <FormSection
            icon={DollarSign}
            title="Global rates"
            description="Set default rates that will be applied when creating new tasks."
            className="p-[15px]"
          >
            <div className="max-w-sm">
              <Field
                label={`Default hourly rate (${activeCurrencySymbol()})`}
                htmlFor="default-hourly-rate"
                error={issueFor("defaultHourlyRate")}
              >
                <Input
                  id="default-hourly-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.defaultHourlyRate}
                  onChange={(event) => set("defaultHourlyRate", event.target.value)}
                  placeholder="0.00"
                  className="tabular"
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            icon={Hash}
            title="Project code"
            description="Configure the prefix and next number for auto-generated project codes (e.g. PRO-1)."
            className="p-[15px]"
          >
            {codeSection("project", "projectPrefix", "projectNextNumber")}
          </FormSection>

          <FormSection
            icon={Briefcase}
            title="Job code"
            description="Configure the prefix and next number for auto-generated job codes (e.g. JOB-1)."
            className="p-[15px]"
          >
            {codeSection("job", "jobPrefix", "jobNextNumber")}
          </FormSection>

          <FormSection
            icon={Wallet}
            title="Default budget"
            description="Set default budget values for new projects."
            className="space-y-[15px] p-[15px]"
          >
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-border bg-muted/30 p-3">
              <span>
                <span className="block text-sm font-medium">Enable budget by default</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  New projects will have budget tracking enabled.
                </span>
              </span>
              <Switch
                checked={draft.defaultBudgetEnabled}
                onCheckedChange={(checked) => set("defaultBudgetEnabled", checked)}
              />
            </label>

            {draft.defaultBudgetEnabled && (
              <div className="space-y-4">
                {BUDGETS.map(({ kind, label: name, placeholder }) => {
                  const label = `${name} (${activeCurrencySymbol()})`;
                  const flag = `show${kind}Budget` as const;
                  const amount = `default${kind}Budget` as const;
                  return (
                    <div key={kind} className="space-y-2">
                      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={draft[flag]}
                          onCheckedChange={(checked) => toggleBudget(kind, checked === true)}
                        />
                        {label}
                      </label>
                      {draft[flag] && amountInput(amount, placeholder, label)}
                    </div>
                  );
                })}
              </div>
            )}
          </FormSection>

          <div className="flex justify-end">
            <Button type="submit" disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Save settings
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
