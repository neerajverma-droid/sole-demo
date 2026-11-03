"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { PageHeader } from "@/components/layout/page-header";
import { WizardStepper } from "@/components/bulk/wizard-parts";
import { PayrollSeatsNotice } from "@/components/payroll/payroll-banners";
import {
  AdjustmentStep,
  PayCycleStep,
  PayListStep,
  ReviewStep,
  RunSummary,
} from "@/components/payroll/payruns/payrun-create-steps";
import { usePayrunActions } from "@/components/payroll/payruns/use-payrun-actions";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { usePayrollSeatsQuery } from "@/hooks/use-payroll-query";
import {
  useCreatePayrunMutation,
  usePayrunEmployeesQuery,
  usePayrunLastCycleQuery,
  useProfileCompletenessCheck,
} from "@/hooks/use-payroll-payruns-query";
import { toIsoDate } from "@/lib/invoices";
import { payrollEnabled } from "@/lib/payroll";
import {
  DEDUCTION_PRESETS,
  EXPENSE_PRESETS,
  PAYRUNS_ROOT,
  PAYRUN_WIZARD_STEPS,
  adjustmentFromPreset,
  buildCreatePayrunPayload,
  defaultPayCycle,
  defaultPayLine,
  includedUsernames,
  incompleteProfiles,
  payrunDraftTotals,
  validateAdjustments,
  validatePayCycle,
  validatePayList,
  type AdjustmentDraft,
  type AdjustmentPreset,
  type PayCycleDraft,
  type PayCycleErrors,
  type PayLineDraft,
  type PayrunEmployee,
  type PayrunLastCycle,
  type ProfileCompleteness,
} from "@/lib/payroll-payruns";

function Heading() {
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={PAYRUNS_ROOT}>
          <ArrowLeft />
          Pay runs
        </Link>
      </Button>
      <PageHeader
        icon={Calculator}
        title="New pay run"
        description="Build a pay run, check it, then create it in Microkeeper."
      />
    </>
  );
}

/**
 * The five-step create flow. The synced employees and the last cycle load
 * first; the wizard itself only mounts once both have answered, so its state
 * can start from Microkeeper's suggested dates rather than patching them in
 * after someone has already started typing.
 */
export function PayrunCreateScreen() {
  const employeesQuery = usePayrunEmployeesQuery();
  // Optional — a failure just means the wizard starts from today.
  const lastCycleQuery = usePayrunLastCycleQuery();

  if (employeesQuery.isPending || lastCycleQuery.isPending) {
    return (
      <div className="space-y-[15px]">
        <Heading />
        <div className="space-y-4" aria-hidden>
          <Shimmer className="h-12 w-full rounded-lg border border-border" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_288px]">
            <Shimmer className="h-96 w-full rounded-lg border border-border" />
            <Shimmer className="h-80 w-full rounded-lg border border-border" />
          </div>
        </div>
      </div>
    );
  }

  if (employeesQuery.isError) {
    return (
      <div className="space-y-[15px]">
        <Heading />
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t prepare a new pay run</EmptyTitle>
            <EmptyDescription>
              Something went wrong loading your synced employees. Try again.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={() => employeesQuery.refetch()}>
              Try again
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  return (
    <PayrunWizard
      employees={employeesQuery.data}
      lastCycle={lastCycleQuery.data ?? null}
    />
  );
}

function PayrunWizard({
  employees,
  lastCycle,
}: {
  employees: PayrunEmployee[];
  lastCycle: PayrunLastCycle | null;
}) {
  const router = useRouter();
  const seatsQuery = usePayrollSeatsQuery();
  const enabled = !!seatsQuery.data && payrollEnabled(seatsQuery.data);
  const { business } = useActiveBusiness();
  const checkProfile = useProfileCompletenessCheck();
  const createMutation = useCreatePayrunMutation();
  const { showError } = usePayrunActions();

  const [step, setStep] = React.useState(0);
  const [cycle, setCycle] = React.useState<PayCycleDraft>(() =>
    defaultPayCycle(toIsoDate(new Date()), lastCycle),
  );
  const [cycleErrors, setCycleErrors] = React.useState<PayCycleErrors>({});
  const [lines, setLines] = React.useState<PayLineDraft[]>(() => employees.map(defaultPayLine));
  const [expenses, setExpenses] = React.useState<AdjustmentDraft[]>([]);
  const [deductions, setDeductions] = React.useState<AdjustmentDraft[]>([]);
  // Which step last refused Continue — its invalid fields get outlined.
  const [issuesShownFor, setIssuesShownFor] = React.useState<number | null>(null);
  const [readiness, setReadiness] = React.useState<Record<string, ProfileCompleteness>>({});
  const [checking, setChecking] = React.useState<string[]>([]);
  const [checkingAll, setCheckingAll] = React.useState(false);
  const [sampleId, setSampleId] = React.useState("");

  const runCheck = React.useCallback(
    async (employeeId: string) => {
      const name = employees.find((employee) => employee.id === employeeId)?.name ?? "Employee";
      setChecking((current) => (current.includes(employeeId) ? current : [...current, employeeId]));
      try {
        const result = await checkProfile(employeeId, name);
        setReadiness((current) => ({ ...current, [employeeId]: result }));
      } finally {
        setChecking((current) => current.filter((id) => id !== employeeId));
      }
    },
    [checkProfile, employees],
  );

  // Every synced employee is checked as soon as the list arrives, so the
  // flags are there by the time anyone reaches the pay list.
  React.useEffect(() => {
    employees.forEach((employee) => void runCheck(employee.id));
  }, [employees, runCheck]);

  const included = includedUsernames(lines);
  const includedEmployees = employees.filter((employee) => included.has(employee.eusername));
  const totals = payrunDraftTotals(lines, expenses, deductions);
  const incomplete = incompleteProfiles(lines, readiness);
  const includedChecking = lines.some(
    (line) => line.included && checking.includes(line.employeeId),
  );

  const patchCycle = (patch: Partial<PayCycleDraft>) => {
    const next = { ...cycle, ...patch };
    setCycle(next);
    // Once a date has been flagged, its message follows the edits live.
    if (Object.keys(cycleErrors).length > 0) setCycleErrors(validatePayCycle(next, lastCycle));
  };

  const patchLine = (employeeId: string, patch: Partial<PayLineDraft>) =>
    setLines((current) =>
      current.map((line) => (line.employeeId === employeeId ? { ...line, ...patch } : line)),
    );

  const adjustmentHandlers = (
    setRows: React.Dispatch<React.SetStateAction<AdjustmentDraft[]>>,
  ) => ({
    onAdd: (preset?: AdjustmentPreset) =>
      setRows((current) => [...current, adjustmentFromPreset(crypto.randomUUID(), preset)]),
    onChange: (key: string, patch: Partial<AdjustmentDraft>) =>
      setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row))),
    onRemove: (key: string) => setRows((current) => current.filter((row) => row.key !== key)),
  });

  /** The first step that wouldn't pass, with its message — or null when all do. */
  const firstProblem = (upTo: number): { step: number; message?: string } | null => {
    const errors = validatePayCycle(cycle, lastCycle);
    if (Object.keys(errors).length > 0) {
      setCycleErrors(errors);
      return { step: 0 };
    }
    if (upTo >= 1) {
      const message = validatePayList(lines);
      if (message) return { step: 1, message };
    }
    if (upTo >= 2) {
      const message = validateAdjustments(expenses, included, "Expense");
      if (message) return { step: 2, message };
    }
    if (upTo >= 3) {
      const message = validateAdjustments(deductions, included, "Deduction");
      if (message) return { step: 3, message };
    }
    return null;
  };

  const next = async () => {
    const problem = firstProblem(step);
    if (problem) {
      setStep(problem.step);
      setIssuesShownFor(problem.step);
      if (problem.message) toast.error(problem.message);
      return;
    }
    setIssuesShownFor(null);
    if (step === 3) {
      // Profiles can change while the run is being built — the review step
      // decides whether Create is allowed, so it works from fresh answers.
      setCheckingAll(true);
      try {
        await Promise.all(
          lines.filter((line) => line.included).map((line) => runCheck(line.employeeId)),
        );
      } finally {
        setCheckingAll(false);
      }
    }
    setStep((current) => Math.min(PAYRUN_WIZARD_STEPS.length - 1, current + 1));
  };

  const create = async () => {
    const problem = firstProblem(3);
    if (problem) {
      setStep(problem.step);
      setIssuesShownFor(problem.step);
      if (problem.message) toast.error(problem.message);
      return;
    }
    try {
      await createMutation.mutateAsync(
        buildCreatePayrunPayload(cycle, lines, expenses, deductions),
      );
      toast.success("Pay run created in Microkeeper. It will sync automatically.");
      router.push(PAYRUNS_ROOT);
    } catch (error) {
      // Not enabled, or billing paused, carries a link to billing.
      showError(error, "Unable to create pay run.");
    }
  };

  const onReview = step === PAYRUN_WIZARD_STEPS.length - 1;
  const createBlock = !enabled
    ? "Payroll isn't enabled for this business"
    : includedChecking || checkingAll
      ? "Checking employee profiles"
      : incomplete.length > 0
        ? "Every included employee's profile must be complete"
        : undefined;

  return (
    <div className="space-y-[15px]">
      <Heading />
      {seatsQuery.data && <PayrollSeatsNotice seats={seatsQuery.data} />}

      <div data-usertour="payroll-payrun-steps">
        <WizardStepper steps={PAYRUN_WIZARD_STEPS} current={step} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="min-w-0 space-y-6" data-usertour="payroll-payrun-form">
          {step === 0 && <PayCycleStep cycle={cycle} errors={cycleErrors} onChange={patchCycle} />}
          {step === 1 && (
            <PayListStep
              employees={employees}
              lines={lines}
              readiness={readiness}
              checking={checking}
              showIssues={issuesShownFor === 1}
              onChange={patchLine}
              onToggle={(employeeId, value) => {
                patchLine(employeeId, { included: value });
                if (value) void runCheck(employeeId);
              }}
              onRecheck={(employeeId) => void runCheck(employeeId)}
            />
          )}
          {step === 2 && (
            <AdjustmentStep
              kind="Expense"
              rows={expenses}
              employees={includedEmployees}
              included={included}
              presets={EXPENSE_PRESETS}
              showIssues={issuesShownFor === 2}
              {...adjustmentHandlers(setExpenses)}
            />
          )}
          {step === 3 && (
            <AdjustmentStep
              kind="Deduction"
              rows={deductions}
              employees={includedEmployees}
              included={included}
              presets={DEDUCTION_PRESETS}
              showIssues={issuesShownFor === 3}
              {...adjustmentHandlers(setDeductions)}
            />
          )}
          {onReview && (
            <ReviewStep
              cycle={cycle}
              employees={employees}
              lines={lines}
              expenses={expenses}
              deductions={deductions}
              sampleId={sampleId}
              onSampleChange={setSampleId}
              businessName={business?.name || null}
              abn={business?.abn || null}
              incomplete={incomplete}
              checking={includedChecking || checkingAll}
            />
          )}

          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5"
            data-usertour="payroll-payrun-actions"
          >
            <Button
              variant="outline"
              disabled={step === 0 || createMutation.isPending}
              onClick={() => {
                setIssuesShownFor(null);
                setStep((current) => Math.max(0, current - 1));
              }}
            >
              <ArrowLeft />
              Back
            </Button>
            {onReview ? (
              <div className="flex flex-wrap items-center justify-end gap-3">
                {createBlock && (
                  <p className="text-sm text-muted-foreground">{createBlock}</p>
                )}
                <Button
                  disabled={!!createBlock || createMutation.isPending}
                  onClick={() => void create()}
                >
                  {createMutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
                  {createMutation.isPending ? "Creating…" : "Create in Microkeeper"}
                </Button>
              </div>
            ) : (
              <Button disabled={checkingAll} onClick={() => void next()}>
                {checkingAll && <Loader2 className="animate-spin" aria-hidden />}
                {checkingAll ? "Checking profiles" : "Continue"}
                {!checkingAll && <ArrowRight />}
              </Button>
            )}
          </div>
        </div>

        <RunSummary cycle={cycle} totals={totals} />
      </div>
    </div>
  );
}
