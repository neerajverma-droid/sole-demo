"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { InfoTip } from "@/components/ui/info-tip";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import {
  PLANNER_ROOT,
  PlannerDetailHeader,
  PlannerNotFound,
  usePlannerSection,
} from "@/components/planner/planner-detail";
import { DeletePlanDialog } from "@/components/planner/planner-dialogs";
import { StepNumber } from "@/components/planner/step-number";
import { deletePlanIdAtom } from "@/lib/atoms";
import { invoiceMoney, parseIsoDate, toIsoDate } from "@/lib/invoices";
import {
  BUDGET_LINE_STATUSES,
  PLANNER_CATEGORIES,
  PLAN_FUNDING_SOURCES,
  PLAN_TYPES,
  draftFromPlan,
  emptyPlanDraft,
  formatPayback,
  ledgerActual,
  lineActual,
  linePlanned,
  lineVariance,
  newBudgetLine,
  planActualTotal,
  planCommitted,
  planCost,
  planGap,
  planIssues,
  planRemaining,
  planStatus,
  planStatusVariant,
  signedMoney,
  type BudgetLineStatus,
  type ExpensePlanDraft,
  type PlanBudgetLine,
  type PlanFundingSource,
  type PlanType,
} from "@/lib/planner";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error";
import {
  usePlannerPlansQuery,
  useSavePlanMutation,
} from "@/hooks/use-planner-query";
import { useExpensesStore } from "@/stores/expenses";
import { usePlannerStore } from "@/stores/planner";
import { activeCurrencySymbol } from "@/lib/country-context";

const REVENUE_HINT = "Used to calculate ROI and payback.";
const VARIANCE_TIP = "Planned less actual. Negative means the line is overspent.";
const PAYBACK_TIP =
  "How long the expected revenue takes to cover the planned cost, at one twelfth of it a month.";
const REMAINING_TIP =
  "Total planned cost less what the ledger shows you've actually spent.";
const ACTUAL_TIP =
  "The sum of the Actual column — matched from your ledger, and editable to mirror your accounts.";

/** Indigo planned, warm-accent actual — the palette carrying the comparison. */
const chartConfig = {
  planned: { label: "Planned", color: "hsl(var(--chart-in))" },
  actual: { label: "Actual", color: "hsl(var(--chart-out))" },
} satisfies ChartConfig;

/** The plans list crumb. The tab is titled "Business planner"; this is clearer. */
const SECTION = "Expense plans";

/**
 * The expense-plan detail page: three numbered sections on one scrolling page —
 * define the plan, forecast the budget, forecast the return.
 *
 * Not a wizard. Everything is visible and editable at once, and every figure in
 * section 3 recomputes from the budget lines as they're typed, so the case for
 * the purchase is never a screen away from the numbers making it.
 */
export function PlanDetail({
  planId,
}: {
  /** Undefined when creating; a plan id when opening one. */
  planId?: string;
}) {
  const router = useRouter();
  const today = toIsoDate(new Date());
  usePlannerSection("Business planner");
  const [, setDeleteId] = useAtom(deletePlanIdAtom);
  const plans = usePlannerStore((state) => state.plans);
  const expenses = useExpensesStore((state) => state.expenses);

  // Reachable directly, so this page loads the plans itself.
  const plansQuery = usePlannerPlansQuery();
  const savePlan = useSavePlanMutation();

  const editing = planId ? plans.find((plan) => plan.id === planId) : undefined;
  const [draft, setDraft] = React.useState<ExpensePlanDraft>(() =>
    editing ? draftFromPlan(editing) : emptyPlanDraft(today),
  );
  const [edited, setEdited] = React.useState(false);

  // Seed the form again the first time the plan arrives — see GoalDetail for
  // why: this page often mounts before its list has loaded.
  const seededId = React.useRef<string | null>(editing?.id ?? null);
  React.useEffect(() => {
    if (!editing || seededId.current === editing.id) return;
    seededId.current = editing.id;
    setDraft(draftFromPlan(editing));
    setEdited(false);
  }, [editing]);

  const patch = (values: Partial<ExpensePlanDraft>) => {
    setEdited(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  const patchLine = (id: string, values: Partial<PlanBudgetLine>) => {
    setEdited(true);
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === id ? { ...line, ...values } : line,
      ),
    }));
  };

  const addLine = () => {
    setEdited(true);
    setDraft((current) => ({
      ...current,
      lines: [...current.lines, newBudgetLine()],
    }));
  };

  const removeLine = (id: string) => {
    setEdited(true);
    setDraft((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    }));
  };

  /**
   * Choosing a ledger source fills the Actual from matched records in the plan's
   * window. It stays editable after — the spec's own note is that actuals mirror
   * your accounts rather than being dictated by them.
   */
  const chooseSource = (id: string, category: string) => {
    const matched = ledgerActual(
      expenses,
      category,
      draft.startDate,
      draft.endDate,
    );
    patchLine(id, {
      ledgerSource: category,
      actual: matched > 0 ? matched.toFixed(2) : "0",
    });
  };

  const issues = planIssues(draft);
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  /* Every figure below is derived from the draft, so it moves as you type. */
  const planned = planCost(draft);
  const actual = planActualTotal(draft);
  const remaining = planRemaining(draft);
  const committed = planCommitted(draft);
  const gap = planGap(draft);
  const status = planStatus(draft);
  const payback = formatPayback(draft);

  const chartData = draft.lines
    .filter((line) => line.name.trim() || linePlanned(line) > 0)
    .map((line) => ({
      line: line.name.trim() || "Untitled",
      planned: linePlanned(line),
      actual: lineActual(line),
    }));

  const onSave = async () => {
    setEdited(true);
    if (issues.length > 0) return;
    const line = `${invoiceMoney(planned)} · ${payback}`;

    try {
      // One call saves the plan and its lines in order — a new plan has to
      // exist before there's anything to hang lines off.
      const saved = await savePlan.mutateAsync({
        id: editing?.id ?? null,
        draft,
      });

      if (editing) {
        toast.success("Expense plan saved", {
          description: `${draft.name.trim()} · ${line}`,
        });
        router.push(PLANNER_ROOT);
        return;
      }

      toast.success("Expense plan created", {
        description: `${draft.name.trim()} · ${line}`,
      });
      router.replace(`${PLANNER_ROOT}/plans/${saved.id}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save expense plan."));
    }
  };

  const crumbs = [
    { label: "Business planner", href: PLANNER_ROOT },
    { label: SECTION, href: PLANNER_ROOT },
    { label: editing ? editing.name || "Untitled plan" : "New expense plan" },
  ];

  // Not found only once the list has loaded; until then it hasn't arrived yet.
  if (planId && !editing && !plansQuery.isLoading) {
    return (
      <div className="space-y-4">
        <PlannerDetailHeader
          backHref={PLANNER_ROOT}
          backLabel={SECTION}
          crumbs={[crumbs[0], crumbs[1], { label: "Not found" }]}
        />
        <PlannerNotFound
          what="expense plan"
          backHref={PLANNER_ROOT}
          backLabel="Back to expense plans"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PlannerDetailHeader
        backHref={PLANNER_ROOT}
        backLabel={SECTION}
        crumbs={crumbs}
        action={
          <Button
            onClick={onSave}
            disabled={(edited && issues.length > 0) || savePlan.isPending}
            data-usertour="plan-save"
          >
            {savePlan.isPending ? "Saving..." : "Save expense plan"}
          </Button>
        }
      />

      {/* Step 1 ----------------------------------------------------------- */}
      <Card data-usertour="plan-define">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <StepNumber n={1} />
              Define the expense plan
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              What you&apos;re planning and how you&apos;ll pay for it.
            </p>
          </div>
          {/* Derived from the figures below, so it can't be set by hand. */}
          {planned > 0 && (
            <Badge variant={planStatusVariant(status)}>{status}</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Expense name" required error={issueFor("name")}>
            <Input
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Replace the work van"
              aria-invalid={!!issueFor("name")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select
                value={draft.type}
                onValueChange={(value) => patch({ type: value as PlanType })}
              >
                <SelectTrigger aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Funding source">
              <Select
                value={draft.fundingSource}
                onValueChange={(value) =>
                  patch({ fundingSource: value as PlanFundingSource })
                }
              >
                <SelectTrigger aria-label="Funding source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_FUNDING_SOURCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Planned start date"
              required
              error={issueFor("startDate")}
            >
              <DatePicker
                value={draft.startDate}
                onChange={(startDate) => patch({ startDate })}
                label="Planned start date"
              />
            </Field>
            <Field label="Planned end date" required error={issueFor("endDate")}>
              <DatePicker
                value={draft.endDate}
                onChange={(endDate) => patch({ endDate })}
                // Can't end before it starts.
                fromDate={parseIsoDate(draft.startDate)}
                label="Planned end date"
              />
            </Field>
          </div>

          <div className="sm:max-w-xs">
            <Field
              label="Expected revenue from this plan"
              hint={REVENUE_HINT}
              error={issueFor("expectedRevenue")}
            >
              <MoneyInput
                value={draft.expectedRevenue}
                onChange={(expectedRevenue) => patch({ expectedRevenue })}
                label="Expected revenue from this plan"
                invalid={!!issueFor("expectedRevenue")}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 ----------------------------------------------------------- */}
      <Card data-usertour="plan-budget">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <StepNumber n={2} />
            Forecast the budget
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Planned costs and actuals matched from your ledger.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Budget line</TableHead>
                  <TableHead className="w-[130px]">Planned</TableHead>
                  <TableHead className="w-[130px]">Actual from ledger</TableHead>
                  <TableHead className="w-[120px] text-right">
                    <span className="inline-flex items-center gap-1.5">
                      Variance
                      <InfoTip text={VARIANCE_TIP} />
                    </span>
                  </TableHead>
                  <TableHead className="w-[190px]">Ledger source</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[52px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.lines.map((line, index) => {
                  const variance = lineVariance(line);
                  return (
                    <TableRow key={line.id} className="align-top">
                      <TableCell>
                        <Input
                          className={cn(
                            "h-9",
                            issueFor(`name-${line.id}`) &&
                              "border-destructive focus-visible:ring-destructive",
                          )}
                          value={line.name}
                          onChange={(event) =>
                            patchLine(line.id, { name: event.target.value })
                          }
                          placeholder="Cost item"
                          aria-label={`Budget line ${index + 1}`}
                        />
                      </TableCell>

                      <TableCell>
                        <MoneyInput
                          value={line.planned}
                          onChange={(planned) =>
                            patchLine(line.id, { planned })
                          }
                          label={`Planned, line ${index + 1}`}
                          invalid={!!issueFor(`planned-${line.id}`)}
                        />
                      </TableCell>

                      <TableCell>
                        <MoneyInput
                          value={line.actual}
                          onChange={(actual) => patchLine(line.id, { actual })}
                          label={`Actual, line ${index + 1}`}
                          invalid={!!issueFor(`actual-${line.id}`)}
                        />
                      </TableCell>

                      {/* Auto, never typed. */}
                      <TableCell
                        className={cn(
                          "pt-4 text-right font-medium tabular",
                          variance < 0 && "text-destructive",
                        )}
                      >
                        {linePlanned(line) > 0 || lineActual(line) > 0
                          ? signedMoney(variance)
                          : "—"}
                      </TableCell>

                      <TableCell>
                        <Select
                          value={line.ledgerSource || undefined}
                          onValueChange={(category) =>
                            chooseSource(line.id, category)
                          }
                        >
                          <SelectTrigger
                            className="h-9"
                            aria-label={`Ledger source, line ${index + 1}`}
                          >
                            <SelectValue placeholder="Not matched" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {PLANNER_CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <Select
                          value={line.status}
                          onValueChange={(value) =>
                            patchLine(line.id, {
                              status: value as BudgetLineStatus,
                            })
                          }
                        >
                          <SelectTrigger
                            className="h-9"
                            aria-label={`Status, line ${index + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BUDGET_LINE_STATUSES.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          // The last line stays, so the table is never empty.
                          disabled={draft.lines.length === 1}
                          onClick={() => removeLine(line.id)}
                          aria-label={`Remove budget line ${index + 1}`}
                        >
                          <X className="size-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus />
              Add budget line
            </Button>
            <p className="text-xs text-muted-foreground">
              Actuals come from matched ledger records. Edit to mirror your
              accounts.
            </p>
          </div>

          {issueFor("lines") && (
            <p className="text-xs text-destructive">{issueFor("lines")}</p>
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">
                Planned vs actual, by budget line
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <LegendKey label="Planned" className="bg-chart-in" />
                <LegendKey label="Actual" className="bg-chart-out" />
              </div>
            </div>

            {chartData.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border surface-subtle p-6 text-center text-sm text-muted-foreground">
                Add a budget line to see the comparison.
              </p>
            ) : (
              <ChartContainer config={chartConfig} className="h-[260px] w-full">
                <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="line"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    className="text-xs"
                    interval={0}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickMargin={8}
                    className="text-xs tabular"
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `${activeCurrencySymbol()}${value / 1000}k` : `${activeCurrencySymbol()}${value}`
                    }
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => invoiceMoney(Number(value))}
                        indicator="dot"
                      />
                    }
                  />
                  <Bar
                    dataKey="planned"
                    fill="var(--color-planned)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="actual"
                    fill="var(--color-actual)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 3 ----------------------------------------------------------- */}
      <Card data-usertour="plan-return">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <StepNumber n={3} />
            Forecast the return
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Budget totals, ledger actuals, funding gap and payback — updated live
            as you type.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="Total planned cost"
              value={invoiceMoney(planned)}
              meta={`${draft.lines.length} ${draft.lines.length === 1 ? "line" : "lines"}`}
            />
            <Tile
              label="Actual from ledger"
              value={invoiceMoney(actual)}
              tip={ACTUAL_TIP}
              meta={
                planned > 0
                  ? `${Math.round((actual / planned) * 100)}% of planned`
                  : undefined
              }
            />
            <Tile
              label="Budget remaining"
              value={signedMoney(remaining)}
              tip={REMAINING_TIP}
              meta={remaining < 0 ? "overspent" : "still to spend"}
              tone={remaining < 0 ? "text-destructive" : undefined}
            />
            {/* Nothing costed yet: no payback figure to state, rather than a
                verdict of "No payback" on an empty form. */}
            <Tile
              label="Payback"
              value={planned > 0 ? payback : "—"}
              tip={PAYBACK_TIP}
            />
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border surface-subtle px-4 py-3">
            {/* An empty plan isn't "fully funded" — it has nothing to fund. */}
            <p className="text-sm text-muted-foreground">
              {planned <= 0 ? (
                "Add a budget line to see the funding position."
              ) : gap > 0 ? (
                <>
                  <span className="font-medium text-foreground tabular">
                    {invoiceMoney(gap)}
                  </span>{" "}
                  of the planned cost has no cash committed to it yet.
                </>
              ) : (
                <>
                  Fully funded —{" "}
                  <span className="font-medium text-foreground tabular">
                    {invoiceMoney(committed)}
                  </span>{" "}
                  committed across the lines.
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              A line counts as committed once its status leaves Planned.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer. Save lives in the header row, so it isn't offered twice. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={!editing}
          onClick={() => editing && setDeleteId(editing.id)}
        >
          <Trash2 />
          Delete
        </Button>
        <Button variant="outline" asChild>
          <Link href={PLANNER_ROOT}>Back to expense plans</Link>
        </Button>
      </div>

      <DeletePlanDialog onDeleted={() => router.push(PLANNER_ROOT)} />
    </div>
  );
}

function Tile({
  label,
  value,
  tip,
  meta,
  tone,
}: {
  label: string;
  value: string;
  tip?: string;
  meta?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-4">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {tip && <InfoTip text={tip} />}
      </dt>
      <dd className="mt-2 space-y-1">
        <p
          className={cn(
            "text-xl font-semibold leading-none tracking-tight tabular",
            tone,
          )}
        >
          {value}
        </p>
        {meta && (
          <p className="text-xs text-muted-foreground tabular">{meta}</p>
        )}
      </dd>
    </div>
  );
}

function LegendKey({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}
