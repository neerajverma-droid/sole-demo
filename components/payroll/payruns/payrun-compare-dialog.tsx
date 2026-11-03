"use client";

import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePayrunCompareQuery } from "@/hooks/use-payroll-payruns-query";
import {
  payrollDateRange,
  payrollMoney,
  payrunStatusLabel,
  payrunStatusVariant,
} from "@/lib/payroll";
import {
  compareOutcome,
  compareParams,
  formatHours,
  signedMoney,
  signedNumber,
  type CompareOutcome,
  type PayrunRow,
} from "@/lib/payroll-payruns";

const OUTCOME_VARIANT: Record<CompareOutcome, "secondary" | "outline" | "warning" | "success"> = {
  "New employee": "secondary",
  Removed: "outline",
  "Review variance": "warning",
  Normal: "success",
};

/** Two to five runs side by side, then each employee's change across them. */
export function PayrunCompareDialog({
  runs,
  open,
  onOpenChange,
}: {
  runs: PayrunRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const params = compareParams(runs);
  const query = usePayrunCompareQuery(params, open && runs.length >= 2);
  const data = query.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare pay runs</DialogTitle>
          <DialogDescription>
            Changes are calculated from the earliest selected run to the latest.
          </DialogDescription>
        </DialogHeader>

        {query.isPending ? (
          <div className="space-y-4" aria-hidden>
            <div className="grid gap-3 sm:grid-cols-2">
              <Shimmer className="h-36 rounded-lg border border-border" />
              <Shimmer className="h-36 rounded-lg border border-border" />
            </div>
            <Shimmer className="h-48 w-full rounded-lg border border-border" />
          </div>
        ) : query.isError || !data ? (
          <Empty className="gap-2.5 py-9">
            <EmptyMedia>
              <TriangleAlert aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Couldn&apos;t compare these runs</EmptyTitle>
              <EmptyDescription>
                Something went wrong reaching the server. Try again.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                Try again
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.runs.map((run) => (
                <div
                  key={run.mkRunId}
                  className="rounded-lg border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium tabular">Run {run.mkRunId}</p>
                    <Badge variant={payrunStatusVariant(run.status)}>
                      {payrunStatusLabel(run.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular">
                    {payrollDateRange(run.startDate, run.endDate)}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">Gross</dt>
                    <dd className="text-right font-medium tabular">
                      {payrollMoney(run.totals.gross)}
                    </dd>
                    <dt className="text-muted-foreground">Net</dt>
                    <dd className="text-right font-medium tabular">
                      {payrollMoney(run.totals.net)}
                    </dd>
                    <dt className="text-muted-foreground">Hours</dt>
                    <dd className="text-right font-medium tabular">
                      {formatHours(run.totals.hours)}
                    </dd>
                    <dt className="text-muted-foreground">Employees</dt>
                    <dd className="text-right font-medium tabular">
                      {run.employeeCount}
                    </dd>
                  </dl>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Gross change</TableHead>
                    <TableHead className="text-right">Net change</TableHead>
                    <TableHead className="text-right">Hours change</TableHead>
                    <TableHead className="text-center">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.employees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No employees in these runs.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.employees.map((employee) => {
                      const outcome = compareOutcome(employee.diff);
                      return (
                        <TableRow key={employee.employeeId || employee.employeeName}>
                          <TableCell className="font-medium">
                            {employee.employeeName}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular">
                            {signedMoney(employee.diff.grossDiff)}
                            {employee.diff.grossPct != null && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({signedNumber(employee.diff.grossPct, "%")})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular">
                            {signedMoney(employee.diff.netDiff)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular">
                            {signedNumber(employee.diff.hoursDiff)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={OUTCOME_VARIANT[outcome]}>{outcome}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
