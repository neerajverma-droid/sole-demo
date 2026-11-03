"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CELL, HEAD_TINT, RULE } from "@/components/reports/report-table-tokens";
import { basDate, type BasCode, type BasReport } from "@/lib/bas-report";
import { reportMoney } from "@/lib/report-periods";
import { cn } from "@/lib/utils";

/** What each code means, for the badge's tooltip. */
const CODE_TITLE: Record<BasCode, string> = {
  G1: "Sales (G1)",
  G10: "Capital purchase (G10)",
  G11: "Non-capital purchase (G11)",
  Other: "Not reported on the BAS",
};

/**
 * Every transaction behind the worksheet, one page at a time.
 *
 * The listing is the proof for the figures above it — the row an accountant
 * asks about is here with the code it was counted under. Read-only, like every
 * report: a coding is changed on the Transactions screen.
 */
export function BasTransactionsTable({
  report,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  fetching,
}: {
  report: BasReport;
  page: number;
  pageSize: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
  fetching: boolean;
}) {
  if (report.total === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <Receipt aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No GST transactions in this period</EmptyTitle>
          <EmptyDescription>
            Nothing reconciled between {report.rangeLabel} carries GST yet.
            Reconcile your bank feed and it&apos;ll be counted here.
          </EmptyDescription>
        </div>
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href="/transactions">Go to Transactions</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const pageInfo = {
    page,
    pageCount: report.pageCount,
    total: report.total,
    from,
    to: Math.min(report.total, from + report.transactions.length - 1),
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4 sm:px-5">
        <h2 className="text-sm font-semibold">Transactions</h2>
        <p className="text-xs text-muted-foreground tabular">
          {report.rangeLabel} · {report.total} transactions
        </p>
      </div>

      <Table containerClassName={cn("max-h-[38rem]", fetching && "opacity-60")}>
        <TableHeader className="sticky top-0 z-20">
          <TableRow>
            <TableHead className={cn(HEAD_TINT, HUG_COLUMN, "px-4")}>Date</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "px-4")}>Transaction</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "px-4")}>Client / Supplier</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "px-4")}>Category</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, HUG_COLUMN, "px-4")}>BAS</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "px-4 text-right")}>Ex GST</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "px-4 text-right")}>GST</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "px-4 text-right")}>Inc GST</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.transactions.map((row) => (
            <TableRow key={row.id}>
              <TableCell className={cn(CELL, HUG_COLUMN, "tabular")}>
                {basDate(row.date)}
              </TableCell>
              <TableCell className={cn(CELL, RULE, "min-w-48")}>
                <p className="font-medium">{row.name || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {row.type}
                  {row.description && ` · ${row.description}`}
                </p>
              </TableCell>
              <TableCell className={cn(CELL, RULE)}>{row.party || "—"}</TableCell>
              <TableCell className={cn(CELL, RULE)}>{row.category || "—"}</TableCell>
              <TableCell className={cn(CELL, RULE, HUG_COLUMN)}>
                <Badge
                  variant={row.basCode === "Other" ? "secondary" : "outline"}
                  className="font-mono"
                  title={CODE_TITLE[row.basCode]}
                >
                  {row.basCode}
                </Badge>
              </TableCell>
              <TableCell className={cn(CELL, RULE, "text-right tabular")}>
                {reportMoney(row.exGst)}
              </TableCell>
              <TableCell className={cn(CELL, RULE, "text-right tabular")}>
                {reportMoney(row.gst)}
              </TableCell>
              <TableCell className={cn(CELL, RULE, "text-right font-medium tabular")}>
                {reportMoney(row.incGst)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="border-t border-border p-3 sm:px-5">
        <NumberedPagination
          page={pageInfo}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          itemLabel="transaction"
          navLabel="BAS transactions pages"
          disabled={fetching}
        />
      </div>
    </section>
  );
}
