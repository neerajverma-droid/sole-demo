"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  ChevronRight,
  CircleAlert,
  Download,
  FileText,
  Landmark,
  Receipt,
  TriangleAlert,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollNotice } from "@/components/payroll/payroll-banners";
import {
  AdjustmentsTable,
  FactList,
  PayItemsTable,
  PayslipHeading,
  superFacts,
} from "@/components/payroll/payruns/payslip-parts";
import { usePayrunActions } from "@/components/payroll/payruns/use-payrun-actions";
import {
  usePayrunDetailQuery,
  usePayrunIssuesQuery,
} from "@/hooks/use-payroll-payruns-query";
import {
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
  formatHours,
  payrunHref,
  payrunName,
  payrunTotals,
  type Payslip,
} from "@/lib/payroll-payruns";
import { cn } from "@/lib/utils";

/**
 * A run's payslips at a glance — totals, then one row per employee that opens
 * onto what made up their pay. The full detail page is a click away for the
 * Summary view, issues per employee and per-payslip PDFs.
 */
export function PayrunPayslipsDrawer({
  run,
  onClose,
}: {
  /** The run to show; null closes the drawer. */
  run: { mkRunId: string; mkYear: string } | null;
  onClose: () => void;
}) {
  // Kept after close so the sheet's exit animation still has content to show.
  const [shown, setShown] = React.useState(run);
  React.useEffect(() => {
    if (run) setShown(run);
  }, [run]);

  const detailQuery = usePayrunDetailQuery(shown?.mkRunId ?? null, shown?.mkYear ?? null);
  const issuesQuery = usePayrunIssuesQuery(shown?.mkRunId ?? null, shown?.mkYear ?? null);
  const detail = detailQuery.data;
  const issues = issuesQuery.data ?? [];
  const actions = usePayrunActions();
  const [expanded, setExpanded] = React.useState<string | null>(null);

  // A different run starts with every row closed.
  React.useEffect(() => {
    setExpanded(null);
  }, [shown?.mkRunId, shown?.mkYear]);

  const totals = detail ? payrunTotals(detail) : null;
  const cards: StatCard[] = [
    { key: "gross", label: "Gross", value: payrollMoney(totals?.gross), icon: Banknote },
    { key: "tax", label: "Tax (PAYG)", value: payrollMoney(totals?.tax), icon: Landmark, tone: "warning" },
    { key: "net", label: "Net pay", value: payrollMoney(totals?.net), icon: Receipt, tone: "success" },
  ];

  return (
    <Sheet open={run !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="space-y-1 border-b p-6 text-left">
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <SheetTitle className="tabular">
              Payslips · {shown ? payrunName(shown) : ""}
            </SheetTitle>
            {detail && (
              <Badge variant={payrunStatusVariant(detail.status)}>
                {payrunStatusLabel(detail.status)}
              </Badge>
            )}
          </div>
          <SheetDescription className="tabular">
            {detail ? (
              <>
                {payPeriodLabel(String(detail.period))} ·{" "}
                {payrollDateRange(detail.startDate, detail.endDate)} · Paid{" "}
                {payrollDate(detail.paymentDate)} · {plural(detail.payslips.length, "employee")}
              </>
            ) : (
              "Loading the run…"
            )}
          </SheetDescription>
          {shown && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!detail || detail.payslips.length === 0}
                onClick={() => actions.downloadPayslips(shown)}
              >
                <Download />
                Download
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href={payrunHref(shown)}>
                  Full detail
                  <ArrowUpRight />
                </Link>
              </Button>
            </div>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {detailQuery.isError ? (
            <Empty className="gap-2.5 py-9">
              <EmptyMedia>
                <TriangleAlert aria-hidden />
              </EmptyMedia>
              <div className="space-y-1">
                <EmptyTitle>Couldn&apos;t load this run</EmptyTitle>
                <EmptyDescription>
                  Something went wrong reaching the server. Try again.
                </EmptyDescription>
              </div>
              <EmptyActions>
                <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>
                  Try again
                </Button>
              </EmptyActions>
            </Empty>
          ) : (
            <>
              <StatCards stats={cards} loading={!detail} />

              {issues.length > 0 && shown && (
                <PayrollNotice
                  icon={CircleAlert}
                  tone="warning"
                  title={plural(issues.length, "payroll issue") + " to review"}
                  description="Open the full detail to see which payslips they're on."
                  action={
                    <Button size="sm" variant="outline" asChild>
                      <Link href={payrunHref(shown)}>Review</Link>
                    </Button>
                  }
                />
              )}

              {!detail ? (
                <Shimmer className="h-64 w-full rounded-lg border border-border" />
              ) : detail.payslips.length === 0 ? (
                <Empty className="gap-2.5 py-9">
                  <EmptyMedia>
                    <FileText aria-hidden />
                  </EmptyMedia>
                  <div className="space-y-1">
                    <EmptyTitle>No payslips yet</EmptyTitle>
                    <EmptyDescription>
                      No payslips found for this pay run.
                    </EmptyDescription>
                  </div>
                </Empty>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
                  <Table className="min-w-[520px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="w-[44px]">
                          <span className="sr-only">Expand</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.payslips.map((slip) => (
                        <PayslipRow
                          key={slip.id}
                          slip={slip}
                          open={expanded === slip.id}
                          onToggle={() =>
                            setExpanded((current) => (current === slip.id ? null : slip.id))
                          }
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PayslipRow({
  slip,
  open,
  onToggle,
}: {
  slip: Payslip;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `payslip-${slip.id}`;
  return (
    <>
      <TableRow
        className="cursor-pointer"
        data-state={open ? "selected" : undefined}
        onClick={onToggle}
      >
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">
                {payrollInitials(slip.employeeName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{slip.employeeName}</p>
              <p className="text-xs text-muted-foreground tabular">
                {formatHours(slip.hours)} hours
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right tabular">{payrollMoney(slip.gross)}</TableCell>
        <TableCell className="text-right tabular text-muted-foreground">
          {payrollMoney(slip.tax)}
        </TableCell>
        <TableCell className="text-right font-medium tabular">{payrollMoney(slip.net)}</TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? "Hide" : "Show"} ${slip.employeeName}'s payslip`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <ChevronRight
              className={cn("size-4 transition-transform", open && "rotate-90")}
              aria-hidden
            />
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow id={panelId} className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-muted/30 p-4">
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-3">
                <PayslipHeading>Super</PayslipHeading>
                <div className="mt-2">
                  <FactList facts={superFacts(slip)} />
                </div>
              </div>
              <div className="space-y-2">
                <PayslipHeading>Earnings and hours</PayslipHeading>
                <PayItemsTable items={slip.payItems} showClass={false} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <PayslipHeading>Expenses and allowances</PayslipHeading>
                  <AdjustmentsTable label="Expense" rows={slip.expenses} emptyLabel="No expenses." />
                </div>
                <div className="space-y-2">
                  <PayslipHeading>Deductions</PayslipHeading>
                  <AdjustmentsTable label="Deduction" rows={slip.deductions} emptyLabel="No deductions." />
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
