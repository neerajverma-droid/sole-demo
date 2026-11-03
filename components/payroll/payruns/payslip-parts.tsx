"use client";

import { CircleAlert } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAYROLL_EMPTY, payrollMoney } from "@/lib/payroll";
import {
  formatHours,
  issueLabel,
  sumValues,
  type LeaveAccrual,
  type Payslip,
  type PayslipAdjustment,
  type PayslipItem,
  type PayrunIssue,
} from "@/lib/payroll-payruns";

/**
 * The pieces of one payslip, shared by the payslips drawer and the full detail
 * page so a pay line reads the same in both. Every figure is the payslip's own
 * — where Microkeeper didn't send something, it's a dash, never a stand-in.
 */

export function PayslipHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

const TABLE_FRAME = "overflow-x-auto rounded-lg border border-border bg-card";

export function PayItemsTable({
  items,
  showClass = true,
}: {
  items: PayslipItem[];
  showClass?: boolean;
}) {
  return (
    <div className={TABLE_FRAME}>
      <Table className="min-w-[520px]">
        <TableHeader>
          <TableRow>
            <TableHead>Payment</TableHead>
            {showClass && <TableHead>Class</TableHead>}
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Mult.</TableHead>
            <TableHead className="text-right">Earnings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showClass ? 6 : 5}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                No pay items on this payslip.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => (
              <TableRow key={`${item.note}-${index}`}>
                <TableCell className="font-medium">{item.note || PAYROLL_EMPTY}</TableCell>
                {showClass && (
                  <TableCell className="text-muted-foreground">
                    {item.class || PAYROLL_EMPTY}
                  </TableCell>
                )}
                <TableCell className="text-right tabular">{payrollMoney(item.rate)}</TableCell>
                <TableCell className="text-right tabular">{formatHours(item.hours)}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">
                  {formatHours(item.mult || 1)}×
                </TableCell>
                <TableCell className="text-right font-medium tabular">
                  {payrollMoney(item.value)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {items.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={showClass ? 5 : 4} className="font-medium">
                Total payments
              </TableCell>
              <TableCell className="text-right font-semibold tabular">
                {payrollMoney(sumValues(items))}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

export function AdjustmentsTable({
  label,
  rows,
  emptyLabel,
}: {
  /** "Expense" or "Deduction" — the first column's heading. */
  label: string;
  rows: PayslipAdjustment[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className={TABLE_FRAME}>
      <Table className="min-w-[360px]">
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.note}-${index}`}>
              <TableCell className="font-medium">{row.note || PAYROLL_EMPTY}</TableCell>
              <TableCell className="text-right tabular text-muted-foreground">
                {formatHours(row.mult || 1)}
              </TableCell>
              <TableCell className="text-right font-medium tabular">
                {payrollMoney(row.value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {rows.length > 1 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-medium">
                Total
              </TableCell>
              <TableCell className="text-right font-semibold tabular">
                {payrollMoney(sumValues(rows))}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

/** Label / value pairs in a quiet card. */
export function FactList({
  facts,
}: {
  facts: { label: string; value: string }[];
}) {
  return (
    <dl className="space-y-1.5 text-sm">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="text-right font-medium tabular">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function superFacts(slip: Payslip): { label: string; value: string }[] {
  return [
    { label: "Fund", value: slip.superFund || PAYROLL_EMPTY },
    { label: "Member number", value: slip.superMemberNo || PAYROLL_EMPTY },
    {
      label: "Contribution",
      value: slip.superAmount == null ? PAYROLL_EMPTY : payrollMoney(slip.superAmount),
    },
  ];
}

export function LeaveAccrualList({ leave }: { leave: LeaveAccrual[] }) {
  if (leave.length === 0) {
    return <p className="text-sm text-muted-foreground">No leave accrued on this payslip.</p>;
  }
  return (
    <dl className="space-y-1.5 text-sm">
      {leave.map((entry) => (
        <div key={entry.type} className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{entry.type}</dt>
          <dd className="text-right tabular">
            <span className="font-medium">{formatHours(entry.balance)}h</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              +{formatHours(entry.accrual)}h
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What Microkeeper flagged on this payslip. Where the issues call returned
 * nothing but the payslip itself says it has one, its variance is the issue.
 */
export function PayslipIssues({
  issues,
  slip,
}: {
  issues: PayrunIssue[];
  slip: Payslip;
}) {
  const fallback =
    issues.length === 0 && slip.hasIssue
      ? `High pay alert: gross pay differs by ${Math.abs(slip.diffPercent ?? 0)}% from the previous run.`
      : null;
  if (issues.length === 0 && !fallback) return null;
  const count = issues.length || 1;

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3" role="status">
      <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
        <CircleAlert className="size-4" aria-hidden />
        {count === 1 ? "1 issue to review" : `${count} issues to review`}
      </p>
      <ul className="mt-1.5 space-y-1 text-sm">
        {issues.map((issue, index) => {
          const label = issueLabel(issue.type);
          return (
            <li key={`${issue.type}-${index}`}>
              {label && <span className="font-medium">{label}: </span>}
              {issue.message}
            </li>
          );
        })}
        {fallback && <li>{fallback}</li>}
      </ul>
    </div>
  );
}
