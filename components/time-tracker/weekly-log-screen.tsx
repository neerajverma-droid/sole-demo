"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, ChevronLeft, ChevronRight, Info, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import { ProjectClientSelect } from "@/components/projects/project-client-select";
import {
  useClientTasksQuery,
  useSaveWeeklyLogsMutation,
  useTaskProjectsQuery,
  useWeeklyRowsQuery,
} from "@/hooks/use-time-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  DAY_LIMIT_HOURS,
  TIME_TRACKER_ROOT,
  emptyWeeklyRow,
  hasWeeklyErrors,
  parseHoursInput,
  weekDays,
  weekOf,
  weekParams,
  weeklyErrors,
  weeklyProblems,
  type Option,
  type WeeklyErrors,
  type WeeklyRow,
} from "@/lib/time-tracker";
import { cn } from "@/lib/utils";

function hours(value: string): number {
  const parsed = parseHoursInput(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Options as saved plus as loaded, without duplicates — a row from a saved
 *  log shows its task before the client's task list arrives. */
function mergeOptions(seeded: Option[], loaded: Option[] | undefined): Option[] {
  if (!loaded) return seeded;
  const ids = new Set(loaded.map((option) => option.id));
  return [...loaded, ...seeded.filter((option) => !ids.has(option.id))];
}

/**
 * The weekly timesheet — sole-webapp's WeeklyLogDrawer as the design's full
 * page: a Sunday-to-Saturday grid of client, task, project and job rows, hours
 * typed per day as 7.5 or 7:30, saved in one go.
 */
export function WeeklyLogScreen() {
  const [sunday, setSunday] = React.useState(() => weekOf(new Date()));
  const query = useWeeklyRowsQuery(sunday);
  const save = useSaveWeeklyLogsMutation();
  const router = useRouter();
  const [rows, setRows] = React.useState<WeeklyRow[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const { guard, guardNavigate, dialog } = useUnsavedChanges(dirty);

  // The grid starts from what's saved for the week, once per week loaded.
  React.useEffect(() => {
    if (query.data) {
      setRows(query.data);
      setDirty(false);
      setShowErrors(false);
    }
  }, [query.data]);

  const days = weekDays(sunday);
  const { year, week } = weekParams(sunday);
  const errors = weeklyErrors(rows);
  const visibleErrors: WeeklyErrors = showErrors ? errors : { cells: errors.cells, days: errors.days, rows: {} };
  // Over-limit days and bad cells show as they're typed; missing pickers only
  // once a save has been tried.
  const problems = weeklyProblems(rows, errors, sunday, showErrors);

  const updateRow = (key: string, patch: Partial<WeeklyRow>, userEdit = true) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    if (userEdit) setDirty(true);
  };

  const goToWeek = (offsetDays: number) =>
    guard(() => setSunday((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + offsetDays)))();

  const submit = () => {
    setShowErrors(true);
    if (hasWeeklyErrors(errors)) {
      const all = weeklyProblems(rows, errors, sunday, true);
      toast.error(all[0], {
        description:
          all.length > 1
            ? `And ${all.length - 1} more ${all.length === 2 ? "problem" : "problems"} — listed under the timesheet.`
            : undefined,
      });
      return;
    }
    save.mutate(
      { rows, sunday },
      {
        onSuccess: (result) => {
          setDirty(false);
          if (result.skipped > 0) {
            toast.warning(`Saved with ${result.skipped} skipped. Running timers can't be edited here.`);
          } else {
            toast.success(result.message);
          }
          // Back to the list, where the new entries are — as WeeklyLogDrawer's
          // save closed it and returned to /time-tracking. Straight to the
          // route rather than through the unsaved-changes guard: the save just
          // landed, so there's nothing left to lose.
          router.push(TIME_TRACKER_ROOT);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Failed to save time entries")),
      },
    );
  };

  const dayTotal = (day: number) => rows.reduce((sum, row) => sum + hours(row.times[day]), 0);
  const rowTotal = (row: WeeklyRow) => row.times.reduce((sum, time) => sum + hours(time), 0);
  const grandTotal = rows.reduce((sum, row) => sum + rowTotal(row), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to Time Tracker" onClick={guardNavigate(TIME_TRACKER_ROOT)}>
          <ArrowLeft />
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly Time Log</h1>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground tabular">
          Year: {year} &nbsp;|&nbsp; Week: {week}
        </p>
        <div className="flex items-center gap-3 font-semibold">
          <Button variant="outline" size="icon" className="size-9" aria-label="Previous week" onClick={() => goToWeek(-7)}>
            <ChevronLeft />
          </Button>
          <span className="min-w-[180px] text-center tabular">
            {format(days[0], "MMMM d")} – {format(days[6], "MMMM d")}
          </span>
          <Button variant="outline" size="icon" className="size-9" aria-label="Next week" onClick={() => goToWeek(7)}>
            <ChevronRight />
          </Button>
        </div>
        <Button variant="outline" size="sm" disabled={sunday.getTime() === weekOf(new Date()).getTime()} onClick={guard(() => setSunday(weekOf(new Date())))}>
          This week
        </Button>
      </div>

      {query.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          <TriangleAlert className="size-5" aria-hidden />
          <p>{apiErrorMessage(query.error, "Couldn't load this week's time.")}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.isLoading ? (
        <Shimmer className="h-[260px] w-full rounded-lg border border-border" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[1240px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="w-[210px] px-2.5 py-3">Client</th>
                  <th className="w-[170px] px-2.5 py-3">Task</th>
                  <th className="w-[160px] px-2.5 py-3">Project</th>
                  <th className="w-[160px] px-2.5 py-3">Job</th>
                  {days.map((day, index) => (
                    <th key={index} className="px-1.5 py-3 text-center">
                      {format(day, "EEE")}
                      <span className="block font-medium normal-case">{format(day, "d MMM")}</span>
                    </th>
                  ))}
                  <th className="px-2.5 py-3 text-center">Billable</th>
                  <th className="px-2.5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <WeeklyRowView
                    key={row.key}
                    row={row}
                    index={index}
                    errors={visibleErrors}
                    total={rowTotal(row)}
                    canRemove={rows.length > 1 && row.logIds.every((id) => id === null)}
                    onChange={(patch, userEdit) => updateRow(row.key, patch, userEdit)}
                    onRemove={() => {
                      setRows((current) => current.filter((candidate) => candidate.key !== row.key));
                      setDirty(true);
                    }}
                  />
                ))}
                <tr className="bg-muted/25 font-semibold">
                  <td colSpan={4} className="px-2.5 py-3 text-right text-xs uppercase tracking-wide">
                    Total
                  </td>
                  {days.map((_, day) => (
                    <td
                      key={day}
                      className={cn("px-1.5 py-3 text-center tabular", visibleErrors.days[day] && "text-destructive")}
                    >
                      {dayTotal(day).toFixed(2)}h
                      {visibleErrors.days[day] && (
                        <span className="block text-[11px] font-medium">Max {DAY_LIMIT_HOURS}h</span>
                      )}
                    </td>
                  ))}
                  <td />
                  <td className="px-2.5 py-3 text-right tabular">{grandTotal.toFixed(2)}h</td>
                </tr>
              </tbody>
            </table>
          </div>

          {problems.length > 0 && (
            <div
              role="alert"
              className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <div className="space-y-1">
                <p className="font-semibold text-destructive">
                  {problems.length === 1 ? "Fix this before saving" : `Fix these ${problems.length} problems before saving`}
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="border-dashed border-primary/50 text-primary hover:text-primary"
            onClick={() => {
              setRows((current) => [...current, emptyWeeklyRow()]);
            }}
          >
            <Plus />
            Add new row
          </Button>

          <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/[0.06] px-4 py-3.5 text-sm">
            <Info className="size-5 shrink-0 text-primary" aria-hidden />
            <p>
              <span className="font-semibold">Supported time formats:</span>{" "}
              <span className="text-primary">
                decimal hours (8, 7.5, 2.25) or HH:MM (8:00, 7:30). Daily limit: {DAY_LIMIT_HOURS} hours.
              </span>{" "}
              <span className="text-muted-foreground">
                Clearing a saved day here doesn&apos;t delete it — remove it from the entry list instead.
              </span>
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" disabled={save.isPending} onClick={guardNavigate(TIME_TRACKER_ROOT)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending || !dirty}>
              {save.isPending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </>
      )}
      {dialog}
    </div>
  );
}

function WeeklyRowView({
  row,
  index,
  errors,
  total,
  canRemove,
  onChange,
  onRemove,
}: {
  row: WeeklyRow;
  index: number;
  errors: WeeklyErrors;
  total: number;
  canRemove: boolean;
  onChange: (patch: Partial<WeeklyRow>, userEdit?: boolean) => void;
  onRemove: () => void;
}) {
  const clientId = row.client?.clientId ?? null;
  const tasksQuery = useClientTasksQuery(row.isRunning ? null : clientId);
  const projectsQuery = useTaskProjectsQuery(row.isRunning ? null : clientId, row.taskId);
  const taskOptions = mergeOptions(row.taskOptions, tasksQuery.data);

  // Keep what the server offers on the row, so validation knows whether a
  // project and job are needed — and pick them when there's only one.
  const loaded = projectsQuery.data;
  React.useEffect(() => {
    if (!loaded) return;
    const projectOptions = mergeOptions(row.projectOptions, loaded.projects);
    const jobOptions = mergeOptions(row.jobOptions, loaded.jobs);
    const patch: Partial<WeeklyRow> = {};
    if (projectOptions.length !== row.projectOptions.length) patch.projectOptions = projectOptions;
    if (jobOptions.length !== row.jobOptions.length) patch.jobOptions = jobOptions;
    if (!row.projectId && projectOptions.length === 1) patch.projectId = projectOptions[0].id;
    if (!row.jobId && jobOptions.length === 1) patch.jobId = jobOptions[0].id;
    if (Object.keys(patch).length > 0) onChange(patch, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const rowError = errors.rows[row.key];
  const locked = row.isRunning;

  return (
    <>
      <tr className={cn("border-t border-border align-middle", rowError && "bg-destructive/[0.04]")}>
        <td className="px-2.5 py-2.5">
          <ProjectClientSelect
            value={row.client}
            disabled={locked}
            invalid={rowError === "Select a client"}
            onChange={(client) =>
              onChange({
                client,
                taskId: "",
                projectId: "",
                jobId: "",
                taskOptions: [],
                projectOptions: [],
                jobOptions: [],
                contactIds: Array(7).fill(client?.contactId ?? null),
              })
            }
          />
        </td>
        <td className="px-2.5 py-2.5">
          <RowSelect
            label={`Task, row ${index + 1}`}
            value={row.taskId}
            options={taskOptions}
            disabled={locked || !clientId}
            invalid={rowError === "Select a task"}
            placeholder={
              !clientId ? "Select a client first" : tasksQuery.isLoading ? "Loading…" : taskOptions.length === 0 ? "No tasks" : "Select task"
            }
            onChange={(taskId) => onChange({ taskId, projectId: "", jobId: "", projectOptions: [], jobOptions: [] })}
          />
        </td>
        <td className="px-2.5 py-2.5">
          <RowSelect
            label={`Project, row ${index + 1}`}
            value={row.projectId}
            options={row.projectOptions}
            disabled={locked || !row.taskId || row.projectOptions.length === 0}
            invalid={rowError === "Select a project"}
            placeholder={!row.taskId ? "Select a task first" : projectsQuery.isLoading ? "Loading…" : row.projectOptions.length === 0 ? "No project" : "Select project"}
            onChange={(projectId) => onChange({ projectId })}
          />
        </td>
        <td className="px-2.5 py-2.5">
          <RowSelect
            label={`Job, row ${index + 1}`}
            value={row.jobId}
            options={row.jobOptions}
            disabled={locked || !row.taskId || row.jobOptions.length === 0}
            invalid={rowError === "Select a job"}
            placeholder={!row.taskId ? "Select a task first" : projectsQuery.isLoading ? "Loading…" : row.jobOptions.length === 0 ? "No job" : "Select job"}
            onChange={(jobId) => onChange({ jobId })}
          />
        </td>
        {row.times.map((time, day) => {
          const cellError = errors.cells[`${row.key}:${day}`];
          return (
            <td key={day} className="px-1.5 py-2.5 text-center">
              <input
                aria-label={`Hours, row ${index + 1}, day ${day + 1}`}
                inputMode="decimal"
                value={time}
                disabled={locked}
                title={cellError}
                aria-invalid={!!cellError || undefined}
                placeholder="0.00"
                onChange={(event) => {
                  const times = [...row.times];
                  times[day] = event.target.value;
                  onChange({ times });
                }}
                className={cn(
                  "h-9 w-[72px] rounded-md border border-input bg-background px-2 text-center tabular outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  cellError && "border-destructive focus-visible:ring-destructive",
                )}
              />
              {cellError && <span className="mt-1 block text-[11px] font-medium text-destructive">{cellError}</span>}
            </td>
          );
        })}
        <td className="px-2.5 py-2.5 text-center">
          <Checkbox
            checked={row.isBillable}
            disabled={locked}
            onCheckedChange={(checked) => onChange({ isBillable: checked === true })}
            aria-label={`Billable, row ${index + 1}`}
          />
        </td>
        <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-semibold tabular">
          <span className="inline-flex items-center gap-1">
            {total.toFixed(2)}h
            {canRemove && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label={`Remove row ${index + 1}`} onClick={onRemove}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </span>
        </td>
      </tr>
      {(rowError || locked) && (
        <tr>
          <td colSpan={13} className={cn("px-2.5 pb-2 text-xs", rowError ? "text-destructive" : "text-muted-foreground")}>
            {rowError ? `${rowError} to save this row's hours.` : "A timer is running on this row — stop it to edit these hours."}
          </td>
        </tr>
      )}
    </>
  );
}

function RowSelect({
  label,
  value,
  options,
  disabled,
  invalid,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  invalid?: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} aria-invalid={invalid || undefined} className={cn("h-9", invalid && "border-destructive")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label || "Untitled"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
