"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Calculator,
  ChevronRight,
  CircleAlert,
  Clock,
  Download,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SearchX,
  Timer,
  TriangleAlert,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { Highlight } from "@/components/contacts/highlight";
import {
  AdjustmentsTable,
  FactList,
  LeaveAccrualList,
  PayItemsTable,
  PayslipHeading,
  PayslipIssues,
  superFacts,
} from "@/components/payroll/payruns/payslip-parts";
import { usePayrunActions } from "@/components/payroll/payruns/use-payrun-actions";
import {
  usePayrunDetailQuery,
  usePayrunIssuesQuery,
} from "@/hooks/use-payroll-payruns-query";
import {
  PAYROLL_EMPTY,
  payPeriodLabel,
  payrollDate,
  payrollDateRange,
  payrollInitials,
  payrollMoney,
  payrunStatusLabel,
  payrunStatusVariant,
  plural,
} from "@/lib/payroll";
import {
  PAYRUNS_ROOT,
  formatHours,
  payrunErrorMessage,
  issuesForPayslip,
  payrunHours,
  payrunTotals,
  signedNumber,
  sumValues,
  type PayrunIssue,
  type Payslip,
} from "@/lib/payroll-payruns";
import { cn } from "@/lib/utils";

type DetailTab = "summary" | "payslips";

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href={PAYRUNS_ROOT}>
        <ArrowLeft />
        Pay runs
      </Link>
    </Button>
  );
}

/**
 * One run in full: a Summary of every employee's hours and pay, and the
 * Payslips themselves, with what Microkeeper flagged on each. The sidebar is
 * the run's roster — pick someone to jump straight to their payslip.
 */
export function PayrunDetailScreen({ runId }: { runId: string }) {
  const searchParams = useSearchParams();
  const year = searchParams?.get("year") ?? null;

  const detailQuery = usePayrunDetailQuery(runId, year);
  const issuesQuery = usePayrunIssuesQuery(runId, year);
  const detail = detailQuery.data;
  const issues = React.useMemo(() => issuesQuery.data ?? [], [issuesQuery.data]);

  const actions = usePayrunActions();
  const [tab, setTab] = React.useState<DetailTab>("summary");
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  // Bring the payslip someone picked into view once its tab has rendered.
  React.useEffect(() => {
    if (tab !== "payslips" || !expanded) return;
    document
      .getElementById(`payslip-${expanded}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab, expanded]);

  const openPayslip = (slipId: string) => {
    setTab("payslips");
    setExpanded(slipId);
  };

  if (!year) {
    return (
      <div className="space-y-[15px]">
        <BackLink />
        <Empty>
          <EmptyMedia>
            <SearchX aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>This link is missing the run&apos;s year</EmptyTitle>
            <EmptyDescription>
              A run ID is only unique within its year. Open the run from the pay runs list instead.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button size="sm" asChild>
              <Link href={PAYRUNS_ROOT}>Go to pay runs</Link>
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  const title = `Run ${year}/${runId}`;

  if (detailQuery.isPending) {
    return (
      <div className="space-y-[15px]">
        <BackLink />
        <PageHeader icon={Calculator} title={title} description="Loading the run…" />
        <div className="space-y-4" aria-hidden>
          <Shimmer className="h-9 w-64 rounded-md" />
          <Shimmer className="h-24 w-full rounded-lg border border-border" />
          <Shimmer className="h-96 w-full rounded-lg border border-border" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="space-y-[15px]">
        <BackLink />
        <PageHeader icon={Calculator} title={title} />
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t load this run</EmptyTitle>
            <EmptyDescription>
              {payrunErrorMessage(
                detailQuery.error,
                "Something went wrong reaching the server. Try again.",
              )}
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>
              Try again
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  const payslips = detail.payslips;
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? payslips.filter((slip) => slip.employeeName.toLowerCase().includes(needle))
    : payslips;
  const totals = payrunTotals(detail);
  const hours = payrunHours(payslips);
  // The issues call is the detail; the summary's count only stands in when
  // that call came back empty.
  const issueCount = issues.length || detail.summary.issueCount || 0;
  const firstWithIssue = payslips.find(
    (slip) => issuesForPayslip(issues, slip).length > 0 || slip.hasIssue,
  );

  const cards: StatCard[] = [
    {
      key: "gross",
      label: "Gross pay",
      value: payrollMoney(totals.gross),
      meta: `Across ${plural(payslips.length, "employee")}`,
      icon: Banknote,
    },
    {
      key: "normal",
      label: "Normal hours",
      value: formatHours(hours.normal),
      icon: Clock,
    },
    {
      key: "additional",
      label: "Additional hours",
      value: formatHours(hours.additional),
      icon: Timer,
    },
    {
      key: "issues",
      label: "Issues",
      value: String(issueCount),
      meta: issueCount > 0 ? "Review them on the payslips" : "Nothing flagged",
      icon: CircleAlert,
      tone: issueCount > 0 ? "warning" : "success",
    },
  ];

  return (
    <div className="space-y-[15px]">
      <BackLink />
      <PageHeader
        icon={Calculator}
        title={title}
        description={`${payPeriodLabel(String(detail.period))} · ${payrollDateRange(detail.startDate, detail.endDate)} · Paid ${payrollDate(detail.paymentDate)}`}
      >
        <Badge variant={payrunStatusVariant(detail.status)}>
          {payrunStatusLabel(detail.status)}
        </Badge>
        <Button
          variant="outline"
          disabled={payslips.length === 0}
          onClick={() => actions.downloadPayslips({ mkRunId: runId, mkYear: year })}
        >
          <Download />
          Download payslips
        </Button>
      </PageHeader>

      <div
        className={cn(
          "grid items-start gap-6",
          sidebarOpen ? "lg:grid-cols-[260px_minmax(0,1fr)]" : "lg:grid-cols-[48px_minmax(0,1fr)]",
        )}
      >
        <aside
          className="rounded-lg border border-border bg-card shadow-sm lg:sticky lg:top-6"
          aria-label="Employees in this run"
        >
          <div
            className={cn(
              "flex items-center gap-2 p-2",
              sidebarOpen ? "justify-between border-b border-border pl-4" : "justify-center",
            )}
          >
            {sidebarOpen && <p className="text-sm font-medium">Employees</p>}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "Collapse employee list" : "Expand employee list"}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              {sidebarOpen ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
            </Button>
          </div>
          {sidebarOpen && (
            <div className="space-y-4 p-4">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Payment date</p>
                <p className="text-sm font-medium tabular">{payrollDate(detail.paymentDate)}</p>
                <p className="text-xs text-muted-foreground tabular">
                  {plural(payslips.length, "payslip")} · Gross {payrollMoney(totals.gross)}
                </p>
              </div>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search employees"
                  aria-label="Search employees"
                  className="pl-9"
                />
              </div>
              <ul className="space-y-0.5">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setExpanded(null);
                      setTab("summary");
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    All employees
                    <span className="text-xs text-muted-foreground tabular">{payslips.length}</span>
                  </button>
                </li>
                {visible.map((slip) => {
                  const flagged = issuesForPayslip(issues, slip).length > 0 || slip.hasIssue;
                  return (
                    <li key={slip.id}>
                      <button
                        type="button"
                        onClick={() => openPayslip(slip.id)}
                        aria-current={tab === "payslips" && expanded === slip.id ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          tab === "payslips" && expanded === slip.id && "bg-accent font-medium",
                        )}
                      >
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[10px]">
                            {payrollInitials(slip.employeeName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate">
                          <Highlight text={slip.employeeName} query={search} />
                        </span>
                        {flagged && (
                          <>
                            <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                            <span className="sr-only">has issues</span>
                          </>
                        )}
                      </button>
                    </li>
                  );
                })}
                {visible.length === 0 && (
                  <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
                )}
              </ul>
            </div>
          )}
        </aside>

        <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)} className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="payslips" className="gap-1.5">
                Payslips
                <span className="text-xs text-muted-foreground tabular">{payslips.length}</span>
              </TabsTrigger>
            </TabsList>
            {issueCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                onClick={() => {
                  setSearch("");
                  if (firstWithIssue) openPayslip(firstWithIssue.id);
                  else setTab("payslips");
                }}
              >
                <CircleAlert />
                {plural(issueCount, "issue")} to review
              </Button>
            )}
          </div>

          <TabsContent value="summary" className="mt-4 space-y-6">
            <StatCards stats={cards} />
            {payslips.length === 0 ? (
              <NoPayslips />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Norm hrs</TableHead>
                      <TableHead className="text-right">Add hrs</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Vs prior run</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No employees match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visible.map((slip) => (
                        <TableRow key={slip.id}>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => openPayslip(slip.id)}
                              className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Highlight text={slip.employeeName} query={search} />
                            </button>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {slip.employmentType || PAYROLL_EMPTY}
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {formatHours(slip.normalHours ?? slip.hours)}
                          </TableCell>
                          <TableCell className="text-right tabular text-muted-foreground">
                            {formatHours(slip.additionalHours)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular">
                            {payrollMoney(slip.gross)}
                          </TableCell>
                          <TableCell className="text-right tabular">{payrollMoney(slip.net)}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular",
                              slip.hasIssue ? "text-warning" : "text-muted-foreground",
                            )}
                          >
                            {signedNumber(slip.diffPercent, "%")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="payslips" className="mt-4 space-y-3">
            {payslips.length === 0 ? (
              <NoPayslips />
            ) : visible.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No employees match your search.
              </p>
            ) : (
              visible.map((slip) => (
                <PayslipCard
                  key={slip.id}
                  slip={slip}
                  issues={issuesForPayslip(issues, slip)}
                  open={expanded === slip.id}
                  onOpenChange={(open) => setExpanded(open ? slip.id : null)}
                  onDownload={() =>
                    actions.downloadPayslips(
                      { mkRunId: runId, mkYear: year },
                      // An unlinked payslip is found by Microkeeper's slip id instead.
                      { id: slip.employeeId || slip.mkSlipId, name: slip.employeeName },
                    )
                  }
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function NoPayslips() {
  return (
    <Empty className="gap-2.5 py-9">
      <EmptyMedia>
        <FileText aria-hidden />
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>No payslips yet</EmptyTitle>
        <EmptyDescription>
          Payslips show here once Microkeeper has processed the run.
        </EmptyDescription>
      </div>
    </Empty>
  );
}

function PayslipCard({
  slip,
  issues,
  open,
  onOpenChange,
  onDownload,
}: {
  slip: Payslip;
  issues: PayrunIssue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
}) {
  const flagged = issues.length > 0 || slip.hasIssue;
  const deductionTotal = slip.deductionTotal ?? sumValues(slip.deductions);

  return (
    <Collapsible
      id={`payslip-${slip.id}`}
      open={open}
      onOpenChange={onOpenChange}
      className="scroll-mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            aria-hidden
          />
          <Avatar className="size-9">
            <AvatarFallback className="text-xs">{payrollInitials(slip.employeeName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{slip.employeeName}</p>
            <p className="text-xs text-muted-foreground tabular">
              {slip.employmentType || PAYROLL_EMPTY} · {formatHours(slip.hours)} hours
            </p>
          </div>
          {flagged && (
            <Badge variant="warning" className="gap-1">
              <CircleAlert className="size-3" aria-hidden />
              {issues.length > 1 ? `${issues.length} issues` : "Issue"}
            </Badge>
          )}
          <div className="flex gap-6">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Gross</p>
              <p className="text-sm font-medium tabular">{payrollMoney(slip.gross)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Net</p>
              <p className="text-sm font-semibold tabular">{payrollMoney(slip.net)}</p>
            </div>
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-5 border-t border-border p-4">
          <PayslipIssues issues={issues} slip={slip} />

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={onDownload}>
              <FileText />
              Download PDF
            </Button>
          </div>

          <div className="space-y-2">
            <PayslipHeading>Payments</PayslipHeading>
            <PayItemsTable items={slip.payItems} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <PayslipHeading>Super</PayslipHeading>
              <div className="mt-2">
                <FactList facts={superFacts(slip)} />
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <PayslipHeading>Leave</PayslipHeading>
              <div className="mt-2">
                <LeaveAccrualList leave={slip.leaveAccrual} />
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <PayslipHeading>Hours</PayslipHeading>
              <div className="mt-2">
                <FactList
                  facts={[
                    { label: "Normal", value: formatHours(slip.normalHours) },
                    { label: "Additional", value: formatHours(slip.additionalHours) },
                    { label: "Total", value: formatHours(slip.hours) },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <PayslipHeading>Expenses</PayslipHeading>
              <AdjustmentsTable label="Expense" rows={slip.expenses} emptyLabel="No expenses on this payslip." />
            </div>
            <div className="space-y-2">
              <PayslipHeading>Deductions</PayslipHeading>
              <AdjustmentsTable label="Deduction" rows={slip.deductions} emptyLabel="No deductions on this payslip." />
            </div>
          </div>

          <div className="ml-auto max-w-xs rounded-lg border border-border bg-muted/30 p-3">
            <FactList
              facts={[
                { label: "Gross", value: payrollMoney(slip.gross) },
                { label: "Tax (PAYG)", value: `−${payrollMoney(slip.tax)}` },
                { label: "Deductions", value: `−${payrollMoney(deductionTotal)}` },
                { label: "Expenses", value: `+${payrollMoney(sumValues(slip.expenses))}` },
              ]}
            />
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2 text-sm">
              <span className="font-medium">Net earnings</span>
              <span className="font-semibold tabular">{payrollMoney(slip.net)}</span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
