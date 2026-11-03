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
  reportMoney,
  type PlBlock,
  type PlColumn,
  type PlReport,
} from "@/lib/reports";
import {
  CELL,
  HEAD_TINT,
  ROW_TONE as TONE,
  RESULT_TINT,
  RULE,
  TOTAL_RULE,
  type RowTone as Tone,
} from "@/components/reports/report-table-tokens";
import { cn } from "@/lib/utils";

/**
 * The two pinned columns.
 *
 * Fixed widths, because the second column's `left` has to equal the first
 * column's width — a frozen pane can't be laid out by the content it happens to
 * hold. `w-44` is 11rem, which is where `left-44` puts Account name.
 */
const PIN_SECTION = "sticky left-0 z-10 w-44";
const PIN_ACCOUNT = "sticky left-44 z-10 w-60";

/**
 * The working behind the headline, as an accounting ledger.
 *
 * Section down the left as a merged cell, the account beside it, then a column
 * per month of the range, the range total, and the same total last time. Read
 * across, a row is one account over time; read down, the report is the P&L ladder
 * — income, what it cost to earn, gross profit, what it cost to operate, EBITDA,
 * the non-cash and financing lines, and the two profit figures.
 *
 * Four row treatments, each saying what kind of fact it is: a grey section rail,
 * a plain account, a bold subtotal, and an indigo result. Someone scanning for
 * the bottom line should find it without reading a word.
 */
export function ProfitLossTable({
  report,
  empty = false,
}: {
  report: PlReport;
  empty?: boolean;
}) {
  /**
   * Which sections are folded away, by id. Only the closed ones are tracked, so a
   * period that introduces a section opens it rather than inheriting a state that
   * has never heard of it.
   */
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  /*
   * A section can only fold if there's something left behind when it does. A
   * one-account section has no subtotal, so folding it would hide the figure
   * altogether — that's a control that loses information rather than hiding it.
   */
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

  const months = report.columns.filter((column) => column.kind === "month");

  /*
   * A ladder of zeros would be a table pretending to be a report. The shared
   * Empty is its own card, so it stands in place of the whole section rather
   * than sitting inside an empty one — the same substitution every other list
   * screen makes. No action on it: the hero above owns the one worth taking, and
   * a second copy of it here would only split the decision.
   */
  if (empty) {
    return (
      <Empty>
        <EmptyMedia>
          <Table2 aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No accounts to break down yet</EmptyTitle>
          <EmptyDescription>
            Every account you code a transaction to shows up here, grouped into
            the P&amp;L ladder — income, cost of sales, overheads, and the
            profit figures they add up to.
          </EmptyDescription>
        </div>
      </Empty>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Detailed breakdown</h2>
          <p className="text-xs text-muted-foreground tabular">
            {report.rangeLabel}
            {months.length > 1 && ` · ${months.length} months`}
          </p>
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

      {/*
        The scroll container for both axes: a bounded height is what a sticky
        header sticks inside, and the same overflow is what the month columns
        scroll through while Section and Account name stay pinned. Twelve months
        of a full year is where that matters — see `containerClassName`.
      */}
      <Table containerClassName="max-h-[38rem]">
        <TableHeader className="sticky top-0 z-20">
          {/* Every cell carries its own opaque paint, so the row needs none —
              and `TableHeader`'s own `[&_tr]:hover:bg-transparent` can't undo it
              on hover, which is what a background on the row would have fought. */}
          <TableRow>
            <TableHead
              className={cn(PIN_SECTION, HEAD_TINT, "px-4 py-2 align-bottom")}
            >
              Section
            </TableHead>
            <TableHead
              className={cn(
                PIN_ACCOUNT,
                HEAD_TINT,
                RULE,
                "px-4 py-2 align-bottom",
              )}
            >
              Account name
            </TableHead>
            {report.columns.map((column) => (
              <ColumnHead key={column.key} column={column} />
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {report.blocks.map((block, index) => (
            <BlockRows
              key={block.id}
              block={block}
              width={report.columns.length}
              collapsed={!!collapsed[block.id]}
              onToggle={() => toggle(block.id)}
              // Every block but the first opens with the stronger rule that
              // groups it away from the one above.
              divide={index > 0}
            />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/**
 * One amount column's heading: what the column is, and which period that is.
 *
 * The scope line is the header's own indigo at 70% rather than the muted grey —
 * grey inside an indigo wash reads as dirt, where the same colour stepped back
 * reads as secondary.
 */
function ColumnHead({ column }: { column: PlColumn }) {
  return (
    <TableHead
      className={cn(
        HEAD_TINT,
        "whitespace-nowrap px-4 py-2 text-right align-bottom",
        // The total detaches from the months it sums with a full-strength rule.
        column.kind === "month" ? RULE : TOTAL_RULE,
      )}
    >
      <span className="block leading-tight">{column.label}</span>
      <span className="block text-[11px] font-normal leading-tight text-primary-heading/70">
        {column.scope}
      </span>
    </TableHead>
  );
}

/**
 * One section: its merged label cell, its accounts, and the row that closes it.
 *
 * The Section cell spans however many rows are currently showing, which is what
 * makes folding a section shrink its own rail rather than leave a gap where the
 * accounts were.
 */
function BlockRows({
  block,
  width,
  collapsed,
  onToggle,
  divide,
}: {
  block: PlBlock;
  width: number;
  collapsed: boolean;
  onToggle: () => void;
  divide: boolean;
}) {
  const foldable = block.rows.length > 0 && block.summary !== null;
  const showRows = !foldable || !collapsed;
  const visibleRows =
    (showRows ? block.rows.length : 0) + (block.summary ? 1 : 0);

  const tone: Tone = block.isResult ? "result" : "subtotal";
  const sectionTone = block.isResult ? RESULT_TINT : "bg-muted";

  /*
   * A result's label goes in the Section cell and spans the Account name column
   * with it. "Gross profit" is both the section and the line, and printing it in
   * both cells would read as two different things that happen to match.
   */
  const sectionCell = (
    <TableCell
      rowSpan={visibleRows}
      colSpan={block.isResult ? 2 : 1}
      className={cn(
        PIN_SECTION,
        sectionTone,
        "px-4 py-3 align-middle",
        block.isResult && "w-auto font-semibold",
      )}
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
        <span
          className={cn(
            block.isResult
              ? "text-sm"
              : "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
          )}
        >
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
            {row.label}
          </TableCell>
          <Amounts values={row.values} columnCount={width} />
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
          // Always ruled off above: from the accounts it sums when they're
          // showing, and from the section before it when they're folded away.
          "border-t border-border",
          "border-b-border/70",
        )}
      >
        {first && sectionCell}
        {/* A result already spans this column from its Section cell. */}
        {!block.isResult && (
          <TableCell className={cn(PIN_ACCOUNT, TONE[tone], CELL, RULE)}>
            {block.summary.label}
          </TableCell>
        )}
        <Amounts
          values={block.summary.values}
          columnCount={width}
          tone={tone}
          large={block.isResult}
        />
      </TableRow>,
    );
  }

  return <>{rows}</>;
}

/** A row's figures: right-aligned, ruled off, two decimals, tabular. */
function Amounts({
  values,
  columnCount,
  tone = "item",
  large = false,
}: {
  values: number[];
  columnCount: number;
  tone?: Tone;
  large?: boolean;
}) {
  return (
    <>
      {values.map((value, index) => {
        const isTotal = index === columnCount - 2;
        const isPrevious = index === columnCount - 1;

        return (
          <TableCell
            key={index}
            className={cn(
              TONE[tone],
              CELL,
              "whitespace-nowrap text-right tabular",
              // Same rule the header uses, so the columns line up with their
              // own headings rather than with each other.
              isTotal || isPrevious ? TOTAL_RULE : RULE,
              isPrevious && tone === "item" && "text-muted-foreground",
              large && "text-[0.9375rem]",
            )}
          >
            {reportMoney(value)}
          </TableCell>
        );
      })}
    </>
  );
}
