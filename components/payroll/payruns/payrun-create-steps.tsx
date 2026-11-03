"use client";

import Link from "next/link";
import {
  CalendarDays,
  CircleAlert,
  ExternalLink,
  Loader2,
  MinusCircle,
  PlusCircle,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import { addDays, parseIsoDate } from "@/lib/invoices";
import {
  PAYROLL_EMPTY,
  PAYROLL_ROOT,
  payPeriodLabel,
  payrollDate,
  payrollMoney,
  plural,
} from "@/lib/payroll";
import {
  ADJUSTMENT_NOTE_MAX,
  PAY_NOTE_MAX,
  PAY_PERIOD_OPTIONS,
  adjustmentTotal,
  adjustmentValid,
  completenessSummary,
  formatHours,
  payLineGross,
  payPeriodFor,
  runsInYearFor,
  type AdjustmentDraft,
  type AdjustmentPreset,
  type PayCycleDraft,
  type PayCycleErrors,
  type PayLineDraft,
  type PayrunDraftTotals,
  type PayrunEmployee,
  type ProfileCompleteness,
} from "@/lib/payroll-payruns";
import { cn } from "@/lib/utils";

const INVALID = "border-destructive focus-visible:ring-destructive";

function typed(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

/* ------------------------------------------------------------------ *
 * Run summary
 * ------------------------------------------------------------------ */

function shortDate(iso: string): string {
  const date = parseIsoDate(iso);
  return date
    ? date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
    : PAYROLL_EMPTY;
}

/** The sidebar that keeps the run's shape in view on every step. */
export function RunSummary({
  cycle,
  totals,
}: {
  cycle: PayCycleDraft;
  totals: PayrunDraftTotals;
}) {
  return (
    <aside
      className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm xl:sticky xl:top-6"
      aria-label="Run summary"
      data-usertour="payroll-payrun-summary"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Run summary
        </p>
        <p className="text-sm font-semibold">
          {payPeriodLabel(cycle.period)}{" "}
          <span className="font-normal text-muted-foreground tabular">
            {shortDate(cycle.startDate)} – {shortDate(cycle.endDate)}
          </span>
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground tabular">
          <CalendarDays className="size-3" aria-hidden />
          Paid {shortDate(cycle.paymentDate)}
          {cycle.runsInYear && <span>· {cycle.runsInYear} a year</span>}
        </p>
      </div>

      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Gross pay</p>
        <p className="text-2xl font-semibold tracking-tight tabular">{payrollMoney(totals.gross)}</p>
        {totals.included > 0 && (
          <p className="text-xs text-muted-foreground">
            Across {plural(totals.included, "employee")}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: "Included", value: String(totals.included) },
          { label: "Excluded", value: String(totals.excluded) },
          { label: "Hours", value: formatHours(totals.hours) },
        ].map((item) => (
          <div key={item.label} className="rounded-md bg-muted/50 p-2 text-center">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className="text-sm font-semibold tabular">{item.value}</dd>
          </div>
        ))}
      </dl>

      <dl className="space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Gross pay</dt>
          <dd className="font-medium tabular">{payrollMoney(totals.gross)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Deductions</dt>
          <dd className="font-medium tabular">−{payrollMoney(totals.deductions)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Expenses</dt>
          <dd className="font-medium tabular">+{payrollMoney(totals.expenses)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        PAYG and super are worked out by Microkeeper when the run is created.
      </p>
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * Step 1 — pay cycle
 * ------------------------------------------------------------------ */

/**
 * A new start date or period re-derives the end — Microkeeper only accepts
 * its own period ends — and pushes a payment date the new end overtook.
 */
function periodPatch(
  cycle: PayCycleDraft,
  start: string,
  period: PayCycleDraft["period"],
): Partial<PayCycleDraft> {
  if (!start) return { startDate: start };
  const span = payPeriodFor(start, period);
  return {
    ...span,
    ...(cycle.paymentDate && cycle.paymentDate >= span.endDate
      ? {}
      : { paymentDate: addDays(span.endDate, 1) }),
  };
}

export function PayCycleStep({
  cycle,
  errors,
  onChange,
}: {
  cycle: PayCycleDraft;
  errors: PayCycleErrors;
  onChange: (patch: Partial<PayCycleDraft>) => void;
}) {
  return (
    <FormSection
      icon={CalendarDays}
      title="Pay cycle"
      description="The period this run pays for, and when the money lands."
      className="grid gap-4 sm:grid-cols-2"
    >
      <Field label="Pay period" required>
        <Select
          value={cycle.period}
          onValueChange={(next) => {
            const period = next as PayCycleDraft["period"];
            const runs = runsInYearFor(next);
            onChange({
              period,
              ...(runs != null ? { runsInYear: String(runs) } : {}),
              ...periodPatch(cycle, cycle.startDate, period),
            });
          }}
        >
          <SelectTrigger aria-label="Pay period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAY_PERIOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Runs in year"
        htmlFor="payrun-runs-in-year"
        required
        error={errors.runsInYear}
        hint="Set from the pay period. Change it for an unusual year."
      >
        <Input
          id="payrun-runs-in-year"
          type="number"
          min={0}
          max={366}
          step={1}
          inputMode="numeric"
          className={cn("tabular", errors.runsInYear && INVALID)}
          aria-invalid={!!errors.runsInYear}
          value={cycle.runsInYear}
          onChange={(event) => onChange({ runsInYear: event.target.value })}
        />
      </Field>

      <Field label="Start date" required error={errors.startDate}>
        <DatePicker
          label="Start date"
          value={cycle.startDate}
          onChange={(iso) => onChange(periodPatch(cycle, iso, cycle.period))}
        />
      </Field>

      <Field
        label="End date"
        required
        error={errors.endDate}
        hint="Set from the start date. It must be a period end in your Microkeeper pay calendar."
      >
        <DatePicker
          label="End date"
          value={cycle.endDate}
          fromDate={parseIsoDate(cycle.startDate)}
          onChange={(iso) => onChange({ endDate: iso })}
        />
      </Field>

      <Field label="Payment date" required error={errors.paymentDate}>
        <DatePicker
          label="Payment date"
          value={cycle.paymentDate}
          fromDate={parseIsoDate(cycle.endDate || cycle.startDate)}
          onChange={(iso) => onChange({ paymentDate: iso })}
        />
      </Field>

      <div className="flex items-end pb-2 sm:col-span-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={cycle.runUnworkedPh}
            onCheckedChange={(checked) => onChange({ runUnworkedPh: checked === true })}
          />
          Run unworked public holidays
        </label>
      </div>
    </FormSection>
  );
}

/* ------------------------------------------------------------------ *
 * Step 2 — pay list
 * ------------------------------------------------------------------ */

export function PayListStep({
  employees,
  lines,
  readiness,
  checking,
  showIssues,
  onChange,
  onToggle,
  onRecheck,
}: {
  employees: PayrunEmployee[];
  lines: PayLineDraft[];
  readiness: Record<string, ProfileCompleteness>;
  checking: string[];
  /** Highlight the fields that stopped Continue. */
  showIssues: boolean;
  onChange: (employeeId: string, patch: Partial<PayLineDraft>) => void;
  onToggle: (employeeId: string, included: boolean) => void;
  onRecheck: (employeeId: string) => void;
}) {
  const included = lines.filter((line) => line.included);
  const payTotal = included.reduce((sum, line) => sum + payLineGross(line), 0);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">Employee pay list</h2>
          <p className="text-xs text-muted-foreground">
            Only employees synced with Microkeeper can be paid.
          </p>
        </div>
        <p className="text-sm text-muted-foreground tabular">
          {included.length} of {employees.length} included ·{" "}
          <span className="font-medium text-foreground">{payrollMoney(payTotal)}</span>
        </p>
      </div>

      {employees.length === 0 ? (
        <Empty className="gap-2.5 border-0 py-9 shadow-none">
          <EmptyMedia>
            <Users aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No synced employees</EmptyTitle>
            <EmptyDescription>
              Sync an employee with Microkeeper before creating a pay run.
            </EmptyDescription>
          </div>
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[64px]">Include</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[130px]">Rate</TableHead>
                <TableHead className="w-[100px]">Hours</TableHead>
                <TableHead className="w-[100px]">Multiplier</TableHead>
                <TableHead className="w-[110px]">Class</TableHead>
                <TableHead className="text-right">Gross</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => {
                const line = lines.find((entry) => entry.employeeId === employee.id);
                if (!line) return null;
                const status = readiness[employee.id];
                const busy = checking.includes(employee.id);
                const incomplete = line.included && !busy && status && !status.isComplete;
                const flag = showIssues && line.included;
                return (
                  <TableRow key={employee.id} className={cn(!line.included && "opacity-60")}>
                    <TableCell>
                      <Checkbox
                        checked={line.included}
                        onCheckedChange={(checked) => onToggle(employee.id, checked === true)}
                        aria-label={`Include ${employee.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium">{employee.name}</p>
                        {line.included && busy && (
                          <Loader2
                            className="size-3.5 animate-spin text-muted-foreground"
                            aria-label="Checking profile"
                          />
                        )}
                        {incomplete && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                role="img"
                                aria-label="Profile incomplete"
                                className="inline-flex rounded-full text-warning outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <CircleAlert className="size-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {status.checkFailed
                                ? "Couldn't check this profile. Check again before creating the run."
                                : "This employee profile is not complete."}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{employee.eusername}</p>
                      {incomplete && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {/* A new tab, so the run being built here survives the edit. */}
                          <Link
                            href={`${PAYROLL_ROOT}/employees?edit=${encodeURIComponent(employee.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-warning underline-offset-4 hover:underline"
                          >
                            Edit profile
                            <ExternalLink className="size-3" aria-hidden />
                          </Link>
                          <button
                            type="button"
                            onClick={() => onRecheck(employee.id)}
                            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            <RefreshCw className="size-3" aria-hidden />
                            Check again
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Description for ${employee.name}`}
                        disabled={!line.included}
                        value={line.note}
                        maxLength={PAY_NOTE_MAX}
                        className={cn(flag && !line.note.trim() && INVALID)}
                        onChange={(event) => onChange(employee.id, { note: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyInput
                        label={`Rate for ${employee.name}`}
                        disabled={!line.included}
                        value={line.rate}
                        invalid={flag && !(typed(line.rate) > 0)}
                        onChange={(value) => onChange(employee.id, { rate: value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Hours for ${employee.name}`}
                        type="number"
                        min={0}
                        step={0.25}
                        inputMode="decimal"
                        disabled={!line.included}
                        value={line.hours}
                        className={cn("tabular", flag && !(typed(line.hours) > 0) && INVALID)}
                        onChange={(event) => onChange(employee.id, { hours: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Multiplier for ${employee.name}`}
                        type="number"
                        min={0.01}
                        step={0.01}
                        inputMode="decimal"
                        disabled={!line.included}
                        value={line.mult}
                        className={cn("tabular", flag && !(typed(line.mult) > 0) && INVALID)}
                        onChange={(event) => onChange(employee.id, { mult: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Class for ${employee.name}`}
                        disabled={!line.included}
                        value={line.class}
                        placeholder="Optional"
                        onChange={(event) => onChange(employee.id, { class: event.target.value })}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular">
                      {line.included ? payrollMoney(payLineGross(line)) : PAYROLL_EMPTY}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Steps 3 and 4 — expenses and deductions
 * ------------------------------------------------------------------ */

export function AdjustmentStep({
  kind,
  rows,
  employees,
  included,
  presets,
  showIssues,
  onAdd,
  onChange,
  onRemove,
}: {
  kind: "Expense" | "Deduction";
  rows: AdjustmentDraft[];
  /** Only the employees on the pay list. */
  employees: PayrunEmployee[];
  included: Set<string>;
  presets: AdjustmentPreset[];
  showIssues: boolean;
  onAdd: (preset?: AdjustmentPreset) => void;
  onChange: (key: string, patch: Partial<AdjustmentDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const title = kind === "Expense" ? "Expenses" : "Deductions";
  const total = rows.reduce((sum, row) => sum + adjustmentTotal(row), 0);

  return (
    <FormSection
      icon={kind === "Expense" ? PlusCircle : MinusCircle}
      title={title}
      description={
        kind === "Expense"
          ? "Allowances and reimbursements paid on top of wages in this run."
          : "Amounts taken from pay in this run, after tax."
      }
      action={
        <Button type="button" variant="outline" size="sm" onClick={() => onAdd()}>
          <Plus />
          Add item
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Suggestions</span>
        {presets.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2.5 text-xs font-normal"
            onClick={() => onAdd(preset)}
          >
            <Plus className="size-3" aria-hidden />
            {preset.label}
            {preset.amount && (
              <span className="text-muted-foreground tabular">
                {payrollMoney(Number(preset.amount))}
              </span>
            )}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} added. This step is optional.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const flag = showIssues && !adjustmentValid(row, included);
            const notIncluded = !!row.eusername && !included.has(row.eusername);
            return (
              <div
                key={row.key}
                className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-12"
              >
                <div className="md:col-span-3">
                  <Field
                    label="Employee"
                    error={notIncluded ? "Not on the pay list" : undefined}
                  >
                    <Select
                      value={row.eusername}
                      onValueChange={(value) => onChange(row.key, { eusername: value })}
                    >
                      <SelectTrigger
                        aria-label="Employee"
                        className={cn("bg-background", flag && !row.eusername && INVALID)}
                      >
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.eusername}>
                            {employee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Description">
                    <Input
                      aria-label="Description"
                      className={cn("bg-background", flag && !row.note.trim() && INVALID)}
                      value={row.note}
                      maxLength={ADJUSTMENT_NOTE_MAX}
                      placeholder={kind === "Expense" ? "Travel allowance" : "Salary sacrifice"}
                      onChange={(event) => onChange(row.key, { note: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Amount">
                    <MoneyInput
                      label="Amount"
                      value={row.rate}
                      invalid={flag && !(typed(row.rate) >= 0)}
                      onChange={(value) => onChange(row.key, { rate: value })}
                    />
                  </Field>
                </div>
                <div className="md:col-span-1">
                  <Field label="Qty">
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min={0.01}
                      step={0.01}
                      inputMode="decimal"
                      className={cn("bg-background tabular", flag && !(typed(row.mult) > 0) && INVALID)}
                      value={row.mult}
                      onChange={(event) => onChange(row.key, { mult: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Class">
                    <Input
                      aria-label="Class"
                      className="bg-background"
                      value={row.class}
                      placeholder="Optional"
                      onChange={(event) => onChange(row.key, { class: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="flex items-end justify-end md:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${row.note || kind.toLowerCase()}`}
                    onClick={() => onRemove(row.key)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-right text-sm text-muted-foreground tabular">
            Total {title.toLowerCase()}:{" "}
            <span className="font-medium text-foreground">{payrollMoney(total)}</span>
          </p>
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ *
 * Step 5 — review
 * ------------------------------------------------------------------ */

function monthYear(iso: string): string {
  const date = parseIsoDate(iso);
  return date
    ? date.toLocaleDateString("en-AU", { month: "short", year: "numeric" })
    : PAYROLL_EMPTY;
}

export function ReviewStep({
  cycle,
  employees,
  lines,
  expenses,
  deductions,
  sampleId,
  onSampleChange,
  businessName,
  abn,
  incomplete,
  checking,
}: {
  cycle: PayCycleDraft;
  employees: PayrunEmployee[];
  lines: PayLineDraft[];
  expenses: AdjustmentDraft[];
  deductions: AdjustmentDraft[];
  sampleId: string;
  onSampleChange: (employeeId: string) => void;
  businessName: string | null;
  abn: string | null;
  incomplete: ProfileCompleteness[];
  checking: boolean;
}) {
  const included = lines.filter((line) => line.included);
  const line = included.find((entry) => entry.employeeId === sampleId) ?? included[0];
  const employee = employees.find((entry) => entry.id === line?.employeeId);
  const gross = line ? payLineGross(line) : 0;
  const ownExpenses = employee ? expenses.filter((row) => row.eusername === employee.eusername) : [];
  const ownDeductions = employee ? deductions.filter((row) => row.eusername === employee.eusername) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Review</h2>
          <p className="text-sm text-muted-foreground">
            A preview of the payslip each of your {plural(included.length, "employee")} will
            receive. Switch the sample to spot-check someone.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Field label="Sample for">
            <Select value={line?.employeeId ?? ""} onValueChange={onSampleChange}>
              <SelectTrigger aria-label="Sample employee">
                <SelectValue placeholder="No employees" />
              </SelectTrigger>
              <SelectContent>
                {included.map((entry) => (
                  <SelectItem key={entry.employeeId} value={entry.employeeId}>
                    {employees.find((candidate) => candidate.id === entry.employeeId)?.name ??
                      entry.eusername}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {(incomplete.length > 0 || checking) && (
        <section
          className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4"
          role="status"
        >
          {checking ? (
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-warning" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {checking
                ? "Checking employee profiles"
                : `${plural(incomplete.length, "employee profile")} ${incomplete.length === 1 ? "is" : "are"} incomplete`}
            </p>
            {!checking && (
              <>
                <p className="text-sm text-muted-foreground">
                  Microkeeper may reject or limit payslips when tax, super or banking details are
                  missing. Complete these profiles, or leave them off the pay list, to create the run.
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {incomplete.map((entry) => (
                    <li key={entry.employeeId}>{completenessSummary(entry)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {line && employee && (
        <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
            <div className="space-y-0.5">
              <p className="text-base font-semibold">{businessName || PAYROLL_EMPTY}</p>
              {abn && <p className="text-xs text-muted-foreground tabular">ABN {abn}</p>}
            </div>
            <div className="space-y-1 sm:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Payslip
              </p>
              <p className="text-lg font-semibold">
                {payPeriodLabel(cycle.period)} · {monthYear(cycle.startDate)}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                Pay period {payrollDate(cycle.startDate)} – {payrollDate(cycle.endDate)}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                Payment date {payrollDate(cycle.paymentDate)}
              </p>
            </div>
          </div>

          <dl className="grid gap-4 border-b border-border p-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Employee</dt>
              <dd className="text-sm font-medium">{employee.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Employment type</dt>
              <dd className="text-sm font-medium">{employee.employmentType || PAYROLL_EMPTY}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pay frequency</dt>
              <dd className="text-sm font-medium">
                {payPeriodLabel(cycle.period)}
                <span className="ml-1 text-xs font-normal text-muted-foreground tabular">
                  {cycle.runsInYear} runs a year
                </span>
              </dd>
            </div>
          </dl>

          <div className="space-y-4 p-5">
            <div className="overflow-x-auto">
              <Table className="min-w-[520px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Earnings</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Mult.</TableHead>
                    <TableHead className="text-right">This pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">{line.note || PAYROLL_EMPTY}</TableCell>
                    <TableCell className="text-right tabular">{formatHours(Number(line.hours) || 0)}</TableCell>
                    <TableCell className="text-right tabular">{payrollMoney(Number(line.rate) || 0)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">
                      {formatHours(Number(line.mult) || 1)}×
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{payrollMoney(gross)}</TableCell>
                  </TableRow>
                  {ownExpenses.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>{row.note || PAYROLL_EMPTY}</TableCell>
                      <TableCell colSpan={3} className="text-right text-xs text-muted-foreground">
                        Expense
                      </TableCell>
                      <TableCell className="text-right tabular">+{payrollMoney(adjustmentTotal(row))}</TableCell>
                    </TableRow>
                  ))}
                  {ownDeductions.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>{row.note || PAYROLL_EMPTY}</TableCell>
                      <TableCell colSpan={3} className="text-right text-xs text-muted-foreground">
                        Deduction
                      </TableCell>
                      <TableCell className="text-right tabular">−{payrollMoney(adjustmentTotal(row))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-medium">
                      Gross earnings
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular">{payrollMoney(gross)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              PAYG, super and leave are calculated by Microkeeper and appear on the final payslip.
            </p>
          </div>
        </article>
      )}
    </div>
  );
}
