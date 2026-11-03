"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  ProportionBar,
  segmentHighlight,
  type ProportionSegment,
} from "@/components/dashboard/proportion-bar";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { money } from "@/lib/dashboard-data";
import {
  currentFinancialYear,
  formatInvoiceDate,
  invoiceAmount,
  invoiceOverview,
  percentShares,
  statusVariant,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useInvoicesStore } from "@/stores/invoices";

/** How many of the latest invoices the table shows. */
const RECENT_COUNT = 5;

/**
 * One width for all five columns, worn by the header cell and the body cell.
 *
 * A fifth each, rather than the hug-and-share the list screens use: this is a
 * five-row summary of a table, and an even grid is what makes it read as a
 * shape rather than as a cramped copy of the page it links to.
 *
 * Declared once because a column is as wide as its widest member — a `w-1/5`
 * on the header and nothing on the cells is a header that lines up with
 * nothing. Under `table-fixed` only the first row is measured, so the pair has
 * to agree there or the whole column is wrong.
 */
const COLUMN = "w-1/5";

/**
 * A status's colour in the distribution bar and its legend.
 *
 * The three that are also badge variants wear the badge's colour, so a row
 * marked Overdue in the table and the red slice in the bar are the same red.
 * Draft is the neutral — it isn't a status with a warning in it, it's work that
 * hasn't started — and partially paid takes the palette's teal, which is the
 * one remaining colour that isn't already spoken for by a state.
 */
const DISTRIBUTION_TONE: Record<InvoiceStatus, string> = {
  Draft: "bg-muted-foreground/40",
  Outstanding: "bg-warning",
  Overdue: "bg-destructive",
  "Partially paid": "bg-teal-600",
  Paid: "bg-success",
};

/**
 * A figure that carries no status.
 *
 * The design system's ink, paired with the token in dark mode where a
 * near-black number on a dark card would be the one unreadable thing in the
 * row. Amounts stay neutral throughout this card: indigo is for the things you
 * can press.
 */
const NEUTRAL_FIGURE = "text-[#0F1117] dark:text-foreground";

const invoiceWord = (count: number) =>
  `${count} ${count === 1 ? "invoice" : "invoices"}`;

/**
 * The invoice book, on the Dashboard.
 *
 * Three bands, widening as they go down: what the book is worth by bucket, how
 * it's spread across the statuses, and the last few invoices as rows. That
 * order is deliberate — the figures answer "how am I going", the bar answers
 * "why", and the table is the way in to doing something about it.
 *
 * Reads the store the invoices screen reads, and derives everything through
 * `invoiceOverview`. No summary is held anywhere: an invoice marked paid on the
 * list has to move these figures on the next render, and the only way that is
 * guaranteed is for them not to exist until they're drawn.
 */
export function InvoiceSummaryCard() {
  const invoices = useInvoicesStore((state) => state.invoices);
  const hydrated = useInvoicesStore((state) => state.hydrated);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const fiscalYearStart = useFiscalYearStart();

  const overview = invoiceOverview(invoices);

  const stats: StatCard[] = [
    {
      key: "draft",
      label: "Draft",
      value: money(overview.draft.amount),
      meta: invoiceWord(overview.draft.count),
      icon: FileText,
      tone: "primary",
    },
    {
      key: "outstanding",
      label: "Outstanding",
      value: money(overview.outstanding.amount),
      meta: invoiceWord(overview.outstanding.count),
      icon: FileText,
      tone: "warning",
    },
    {
      key: "partially-paid",
      label: "Partially paid",
      value: money(overview.partiallyPaid.amount),
      meta: invoiceWord(overview.partiallyPaid.count),
      icon: FileText,
      tone: "accent",
    },
    {
      key: "paid",
      label: "Paid",
      value: money(overview.paid.amount),
      meta: invoiceWord(overview.paid.count),
      icon: FileText,
      tone: "success",
    },
  ];

  /*
   * Percentages off the shared rounding, so the five slices sum to 100 rather
   * than to 101. Statuses with nothing in them are dropped afterwards: they
   * come back as 0%, and a zero-width slice is an invisible thing that still
   * takes a tab stop and a tooltip.
   */
  const shares = percentShares(overview.distribution.map((row) => row.count));
  const segments: ProportionSegment[] = overview.distribution
    .map((row, index) => ({
      key: row.status,
      label: row.status,
      percent: shares[index],
      valueLabel: invoiceWord(row.count),
      className: DISTRIBUTION_TONE[row.status],
    }))
    .filter((segment) => segment.percent > 0);

  /*
   * Newest first, by the date on the invoice rather than the order the store
   * holds them in — "recent" is a fact about the document, not about when it
   * was typed.
   */
  const recent = [...invoices]
    .sort((a, b) => b.issued.localeCompare(a.issued))
    .slice(0, RECENT_COUNT);

  return (
    <Card data-usertour="dashboard-invoice-summary">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base">Invoice summary</CardTitle>
          {/* The shared label, so this card names the year the same way the
              revenue goal and the snapshot strip do. */}
          <p className="text-xs text-muted-foreground tabular">
            {currentFinancialYear(new Date(), fiscalYearStart).label}
          </p>
        </div>
        {/*
          Both ways on with the figures rather than under them: the bands below
          are three different shapes, and an action parked at the foot of the
          last one would read as belonging to the table instead of to the card.
          One solid button on the card, and this is it.
        */}
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/invoices">
              View all
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/invoices/new">Create invoice</Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!hydrated ? (
          <div className="space-y-6">
            <Shimmer className="h-24 w-full" />
            <Shimmer className="h-16 w-full" />
            <Shimmer className="h-40 w-full" />
          </div>
        ) : (
          <>
        {/* Band one: the buckets, and the whole book beneath them. */}
        <div className="space-y-4">
          <StatCards stats={stats} />

          {/*
            The one figure that isn't a bucket, so it gets the tinted strip
            rather than a fifth tile — four tiles and a total in the same row
            would read as five things of the same kind, and this one is the sum
            of the others' neighbours.
          */}
          <div className="flex items-center justify-between gap-4 rounded-[9px] bg-primary/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Overall total</p>
              <p
                className={cn(
                  "text-xl font-semibold tracking-tight tabular",
                  NEUTRAL_FIGURE,
                )}
              >
                {money(overview.total.amount)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium text-primary tabular">
              {invoiceWord(overview.total.count)}
            </p>
          </div>
        </div>

        {/* Band two: how the book is spread. */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Invoice status distribution
            </p>
            <p className="shrink-0 text-xs text-muted-foreground tabular">
              {overview.total.count} total
            </p>
          </div>

          <ProportionBar
            label="Invoices by status"
            segments={segments}
            hovered={hovered}
            onHoverChange={setHovered}
            empty={segments.length === 0}
          />

          {/* The legend is the bar's labels, and hovering either one lifts the
              other — same `hovered` key, which is the status itself. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {overview.distribution.map((row) => (
              <li
                key={row.status}
                onMouseEnter={() => setHovered(row.status)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  segmentHighlight(hovered, row.status),
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-sm",
                    DISTRIBUTION_TONE[row.status],
                  )}
                  aria-hidden
                />
                <span className="text-muted-foreground">{row.status}</span>
                <span className="font-medium tabular">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Band three: the last few, as a way in. */}
        {recent.length === 0 ? (
          <Empty className="border-0 bg-transparent px-0 py-6 shadow-none">
            <EmptyMedia>
              <FileText aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No invoices yet</EmptyTitle>
              <EmptyDescription>
                Raise your first one and it will show up here with what
                it&apos;s worth and when it&apos;s due.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button variant="outline" size="sm" asChild>
                <Link href="/invoices/new">Create invoice</Link>
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Recent invoices</p>
            {/* `table-fixed` is the half that makes `w-1/5` mean anything: an
                `auto` table treats a width as a suggestion and re-measures it
                against the content, which is how one long client name ends up
                owning half the row. */}
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className={COLUMN}>Client</TableHead>
                  <TableHead className={COLUMN}>Status</TableHead>
                  <TableHead className={cn(COLUMN, "text-right")}>
                    Amount
                  </TableHead>
                  <TableHead className={COLUMN}>Due date</TableHead>
                  <TableHead className={cn(COLUMN, "text-right")}>
                    Invoice #
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((invoice) => (
                  <RecentRow key={invoice.id} invoice={invoice} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One invoice, and the whole row as the way to it.
 *
 * A single link stretched over the row by its own `::after` rather than a link
 * per cell: a row is one destination, and five links to the same place is five
 * tab stops saying the same thing. The row is the positioned ancestor that
 * gives the pseudo-element its bounds.
 */
function RecentRow({ invoice }: { invoice: Invoice }) {
  return (
    <TableRow className="relative">
      <TableCell className={COLUMN}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs font-medium text-muted-foreground">
              {invoice.clientName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {/* `min-w-0` is what lets `truncate` bite: a flex item's default
              minimum width is its content, so without it the name pushes the
              cell wider instead of cutting itself off. The title attribute is
              how the whole name is still available once it's cut. */}
          <Link
            href={`/invoices/${invoice.id}`}
            title={invoice.clientName}
            className="min-w-0 truncate rounded-sm font-medium outline-none after:absolute after:inset-0 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            {invoice.clientName}
          </Link>
        </div>
      </TableCell>
      <TableCell className={COLUMN}>
        <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
      </TableCell>
      <TableCell
        className={cn(
          COLUMN,
          "text-right font-semibold tabular",
          NEUTRAL_FIGURE,
        )}
      >
        {money(invoiceAmount(invoice))}
      </TableCell>
      <TableCell className={cn(COLUMN, "text-muted-foreground tabular")}>
        {formatInvoiceDate(invoice.due)}
      </TableCell>
      <TableCell
        className={cn(COLUMN, "text-right text-muted-foreground tabular")}
      >
        {invoice.number}
      </TableCell>
    </TableRow>
  );
}
