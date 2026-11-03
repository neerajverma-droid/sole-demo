"use client";

import * as React from "react";
import { ChevronDown, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CELL,
  HEAD_TINT,
  ROW_TONE as TONE,
  RESULT_TINT,
  RULE,
  TOTAL_RULE,
} from "@/components/reports/report-table-tokens";
import { reportMoney } from "@/lib/report-periods";
import type { LadderBlock, LadderColumn, LadderReport } from "@/lib/ladder-report";
import { cn } from "@/lib/utils";

/**
 * The two pinned columns — the same fixed widths `ProfitLossTable` uses, kept
 * local rather than shared: P&L's own file isn't touched by this report suite
 * work, so duplicating two class strings costs less than reaching into it.
 */
const PIN_SECTION = "sticky left-0 z-10 w-44";
const PIN_ACCOUNT = "sticky left-44 z-10 w-60";

/**
 * The ladder every section-and-total report shares: Balance Sheet and Trial
 * Balance. Section down the left as a merged cell, the account beside it, then
 * one column per `LadderColumn` — financial years for a Balance Sheet, Debit
 * and Credit for a Trial Balance. Unlike P&L's table, no column here is ever a
 * "previous period" comparison, so every column is drawn the same way.
 */
export function LadderTable({
  report,
  emptyTitle,
  emptyDescription,
}: {
  report: LadderReport;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  // A section can only fold if there's a total left behind when it does —
  // folding a summary-less section would hide its one line entirely.
  const foldable = report.blocks.filter(
    (block) => block.rows.length > 0 && block.summary !== null,
  );
  const allCollapsed =
    foldable.length > 0 && foldable.every((block) => collapsed[block.id]);

  const toggle = (id: string) =>
    setCollapsed((current) => ({ ...current, [id]: !current[id] }));

  const toggleAll = () =>
    setCollapsed(
      allCollapsed
        ? {}
        : Object.fromEntries(foldable.map((block) => [block.id, true])),
    );

  if (report.blocks.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <Table2 aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </div>
      </Empty>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Detailed breakdown</h2>
          <p className="text-xs text-muted-foreground tabular">{report.rangeLabel}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleAll}
          disabled={foldable.length === 0}
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </Button>
      </div>

      <Table containerClassName="max-h-[38rem]">
        <TableHeader className="sticky top-0 z-20">
          <TableRow>
            <TableHead className={cn(PIN_SECTION, HEAD_TINT, "px-4 py-2 align-bottom")}>
              Section
            </TableHead>
            <TableHead
              className={cn(PIN_ACCOUNT, HEAD_TINT, RULE, "px-4 py-2 align-bottom")}
            >
              Account name
            </TableHead>
            {report.columns.map((column, index) => (
              <ColumnHead key={column.key} column={column} last={index === report.columns.length - 1} />
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {report.blocks.map((block, index) => (
            <BlockRows
              key={block.id}
              block={block}
              collapsed={!!collapsed[block.id]}
              onToggle={() => toggle(block.id)}
              divide={index > 0}
            />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function ColumnHead({ column, last }: { column: LadderColumn; last: boolean }) {
  return (
    <TableHead
      className={cn(
        HEAD_TINT,
        "whitespace-nowrap px-4 py-2 text-right align-bottom",
        last ? TOTAL_RULE : RULE,
      )}
    >
      <span className="block leading-tight">{column.label}</span>
      {column.scope && (
        <span className="block text-[11px] font-normal leading-tight text-primary-heading/70">
          {column.scope}
        </span>
      )}
    </TableHead>
  );
}

function BlockRows({
  block,
  collapsed,
  onToggle,
  divide,
}: {
  block: LadderBlock;
  collapsed: boolean;
  onToggle: () => void;
  divide: boolean;
}) {
  const foldable = block.rows.length > 0 && block.summary !== null;
  const showRows = !foldable || !collapsed;
  const visibleRows = (showRows ? block.rows.length : 0) + (block.summary ? 1 : 0);

  const sectionCell = (
    <TableCell
      rowSpan={visibleRows}
      className={cn(PIN_SECTION, "bg-muted px-4 py-3 align-middle")}
    >
      {foldable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            "flex w-full items-center gap-1.5 rounded text-left outline-none",
            "text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150",
              collapsed && "-rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0 text-xs font-semibold uppercase tracking-wider">
            {block.section}
          </span>
        </button>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {block.section}
        </span>
      )}
    </TableCell>
  );

  const rows: React.ReactNode[] = [];

  if (showRows) {
    block.rows.forEach((row, index) => {
      rows.push(
        <TableRow
          key={row.id}
          className={cn(
            "hover:bg-transparent",
            index === 0 && divide ? "border-t border-border" : undefined,
            "border-b-border/70",
          )}
        >
          {index === 0 && sectionCell}
          <TableCell className={cn(PIN_ACCOUNT, TONE.item, CELL, RULE)}>
            <AccountLabel code={row.code} label={row.label} />
          </TableCell>
          <Amounts values={row.values} />
        </TableRow>,
      );
    });
  }

  if (block.summary) {
    const first = rows.length === 0;
    rows.push(
      <TableRow
        key={block.summary.id}
        className={cn(
          "font-semibold hover:bg-transparent",
          "border-t border-border",
          "border-b-border/70",
        )}
      >
        {first && sectionCell}
        <TableCell className={cn(PIN_ACCOUNT, RESULT_TINT, CELL, RULE)}>
          {block.summary.label}
        </TableCell>
        <Amounts values={block.summary.values} tone="result" />
      </TableRow>,
    );
  }

  return <>{rows}</>;
}

/**
 * An account's name, with its code where it has one — the same `font-mono`,
 * muted treatment Chart of Accounts gives a code, just inline rather than its
 * own column: a third sticky column here would need its own pinned offset and
 * a rule for every summary row to skip it, for a value only one of these two
 * reports (Trial Balance) ever carries.
 */
function AccountLabel({ code, label }: { code?: string; label: string }) {
  return (
    <>
      {code && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{code}</span>}
      {label}
    </>
  );
}

function Amounts({
  values,
  tone = "item",
}: {
  values: number[];
  tone?: "item" | "result";
}) {
  return (
    <>
      {values.map((value, index) => (
        <TableCell
          key={index}
          className={cn(
            tone === "result" ? RESULT_TINT : TONE.item,
            CELL,
            "whitespace-nowrap text-right tabular",
            index === values.length - 1 ? TOTAL_RULE : RULE,
          )}
        >
          {reportMoney(value)}
        </TableCell>
      ))}
    </>
  );
}
