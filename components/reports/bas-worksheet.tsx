"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Calculator, Landmark } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { InfoTip } from "@/components/ui/info-tip";
import { STAT_TONES } from "@/components/ui/stat-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HeroHairline } from "@/components/layout/page-header";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import {
  CELL,
  HEAD_TINT,
  RESULT_TINT,
  ROW_TONE,
  RULE,
} from "@/components/reports/report-table-tokens";
import { basTotals, type BasLine, type BasQuarter, type BasReport } from "@/lib/bas-report";
import { reportMoney } from "@/lib/report-periods";
import { cn } from "@/lib/utils";

/**
 * The Australian form prints the same two figures twice: the GST calculation
 * worksheet calls them G9 and G20, the front of the BAS calls them 1A and 1B.
 * Showing both is what lets someone copy the worksheet into the form.
 *
 * Nothing else needs this — a GST101A's Box 8 is Box 8 wherever it appears —
 * so the map is keyed by the worksheet code and simply misses for every other
 * country's form.
 */
const ALT_BOX_LABEL: Record<string, string> = { G9: "1A", G20: "1B" };

/**
 * The GST worksheet: what's owed or coming back, then the labels behind it.
 *
 * The answer first — payable or refund, and how much — because that's the one
 * number someone opens a BAS to find. The G-code table underneath is what they
 * copy into the ATO form, line by line, so it keeps the backend's own labels
 * and codes rather than paraphrasing them.
 *
 * A period that spans several quarters (a financial year) gets a picker: "All
 * quarters" headlines the year, and each quarter shows its own worksheet, since
 * a BAS is lodged one quarter at a time.
 */
export function BasWorksheet({ report }: { report: BasReport }) {
  // The country's own words, as the backend's return template named them:
  // GST and the ATO in Australia, GST and Inland Revenue in New Zealand, VAT
  // and SARS in South Africa.
  const tax = report.taxLabel;
  const authority = report.taxAuthority;

  const multi = report.quarters.length > 1;
  const worksheetTitle = `${report.returnName} worksheet`;
  const [selected, setSelected] = React.useState<string>("all");

  // A new period brings new quarters; a selection from the old one is stale.
  React.useEffect(() => setSelected("all"), [report.range.from, report.range.to]);

  const quarter =
    selected === "all" ? null : (report.quarters[Number(selected)] ?? null);
  const shown = quarter ? [quarter] : report.quarters;
  const totals = basTotals(shown);

  const scopeLabel = quarter
    ? `${quarter.label} · ${quarter.rangeLabel}`
    : multi
      ? `${report.quarters.length} quarters · ${report.rangeLabel}`
      : report.quarters[0]
        ? `${report.quarters[0].label} · ${report.quarters[0].rangeLabel}`
        : report.rangeLabel;

  const refund = totals.outcome === "refund";

  return (
    <div className="space-y-4">
      {multi && (
        <ToggleGroup
          type="single"
          value={selected}
          onValueChange={(next) => next && setSelected(next)}
          variant="outline"
          // The choice has already narrowed what's below it by the time this
          // prints — a control with nothing left to switch on paper.
          className="flex-wrap justify-start print:hidden"
          aria-label="Quarter"
        >
          <ToggleGroupItem value="all">All quarters</ToggleGroupItem>
          {report.quarters.map((q, index) => (
            <ToggleGroupItem key={q.label} value={String(index)}>
              {q.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <HeroHairline />
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
                refund ? STAT_TONES.success : STAT_TONES.primary,
              )}
              aria-hidden
            >
              <Landmark />
            </span>
            <h2 className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {refund ? `Expected ${tax} refund` : `Expected ${tax} payment`}
              <InfoTip
                text={`${tax} on sales less ${tax} on purchases, from what's been recorded in Sole. Each period is measured in full, even when the range only touches part of it.`}
              />
            </h2>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <p className="text-3xl font-semibold leading-none tracking-tight tabular">
              <CountUp value={totals.net} format={reportMoney} />
            </p>
            <Badge variant={refund ? "success" : "outline"}>
              {refund ? "Refund" : "Payable"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground tabular">{scopeLabel}</p>
        </div>
      </section>

      <dl className="grid gap-4 sm:grid-cols-3">
        <ReportStatCard
          icon={ArrowUpRight}
          tone="primary"
          label={`${tax} on sales`}
          tip={`The ${tax} included in what you sold.`}
          value={totals.taxOnSales}
        />
        <ReportStatCard
          icon={ArrowDownLeft}
          tone="accent"
          label={`${tax} on purchases`}
          tip={`The ${tax} included in what you bought for the business. This is what you claim back.`}
          value={totals.taxOnPurchases}
        />
        <ReportStatCard
          icon={Calculator}
          tone={refund ? "success" : "warning"}
          label={refund ? "Net refund" : "Net payable"}
          tip={`${tax} on sales less ${tax} on purchases. Positive is paid${authority ? ` to the ${authority}` : ""}; negative comes back to you.`}
          value={totals.net}
        />
      </dl>

      {shown.length === 1 ? (
        <QuarterTable quarter={shown[0]} title={worksheetTitle} tax={tax} />
      ) : (
        <QuarterTable
          quarter={combine(shown, report.rangeLabel)}
          title={worksheetTitle}
          tax={tax}
        />
      )}
    </div>
  );
}

/** Several quarters added label by label, for the "All quarters" view. */
function combine(quarters: BasQuarter[], rangeLabel: string): BasQuarter {
  /*
   * Added box by box, taking the shape from the first period. Every period of
   * one report comes from the same country's template, so they have the same
   * sections in the same order — matching on the box code rather than the row
   * position means a row the backend ever reorders still adds up correctly.
   */
  const sections = (quarters[0]?.sections ?? []).map((section, index) => ({
    title: section.title,
    rows: section.rows.map((row) => ({
      ...row,
      amount: quarters.reduce(
        (sum, quarter) =>
          sum +
          (quarter.sections[index]?.rows.find((other) => other.code === row.code)?.amount ?? 0),
        0,
      ),
    })),
  }));

  const totals = basTotals(quarters);
  return {
    label: "All periods",
    from: quarters[0]?.from ?? "",
    to: quarters[quarters.length - 1]?.to ?? "",
    rangeLabel,
    sections,
    taxOnSales: totals.taxOnSales,
    taxOnPurchases: totals.taxOnPurchases,
    net: totals.net,
    outcome: totals.outcome,
  };
}

function QuarterTable({ quarter, title, tax }: { quarter: BasQuarter; title: string; tax: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4 sm:px-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground tabular">
          {quarter.label} · {quarter.rangeLabel}
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={cn(HEAD_TINT, "px-4")}>Label</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "w-24 px-4")}>Code</TableHead>
            <TableHead className={cn(HEAD_TINT, RULE, "w-44 px-4 text-right")}>
              Amount
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Whatever sections this country's form has, in its own order —
              two on a BAS and a GST101A, two differently named on a VAT201. */}
          {quarter.sections.map((section) => (
            <SectionRows key={section.title} title={section.title} lines={section.rows} />
          ))}
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2} className={cn(CELL, RESULT_TINT, "font-semibold")}>
              Expected {tax} {quarter.outcome === "refund" ? "refund" : "payment"}
            </TableCell>
            <TableCell
              className={cn(CELL, RESULT_TINT, RULE, "text-right font-semibold tabular")}
            >
              {reportMoney(quarter.net)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({quarter.outcome === "refund" ? "Refund" : "Payable"})
              </span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>
  );
}

function SectionRows({ title, lines }: { title: string; lines: BasLine[] }) {
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={3}
          className={cn(CELL, ROW_TONE.subtotal, "text-xs font-semibold text-muted-foreground")}
        >
          {title}
        </TableCell>
      </TableRow>
      {lines.map((line) => {
        // The GST line itself closes each section, so it reads as that
        // section's answer rather than one more input.
        const key = ALT_BOX_LABEL[line.code];
        return (
          <TableRow key={line.code}>
            <TableCell className={cn(CELL, key && "font-medium")}>{line.label}</TableCell>
            <TableCell className={cn(CELL, RULE)}>
              <span className="font-mono text-xs">{line.code}</span>
              {key && (
                <span className="ml-1.5 text-xs text-muted-foreground">({key})</span>
              )}
            </TableCell>
            <TableCell className={cn(CELL, RULE, "text-right tabular", key && "font-medium")}>
              {reportMoney(line.amount)}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
