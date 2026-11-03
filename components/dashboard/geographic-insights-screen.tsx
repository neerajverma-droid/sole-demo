"use client";

import * as React from "react";
import Link from "next/link";
import { useAtomValue } from "jotai";
import {
  AlertCircle,
  BadgeDollarSign,
  ChevronRight,
  CircleCheck,
  FileText,
  Info,
  MapPin,
  Percent,
  ReceiptText,
  Sparkles,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { STAT_TONES } from "@/components/ui/stat-cards";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerAreaDetailSheet } from "@/components/dashboard/customer-area-detail";
import { AreaLevelSelect } from "@/components/dashboard/area-level-select";
import { accountStageAtom, areaLevelAtom } from "@/lib/atoms";
import type { CustomerAreaDetail } from "@/lib/customer-areas";
import { money } from "@/lib/dashboard-data";
import {
  ALL_INDUSTRIES,
  DEFAULT_METRIC,
  areaInvoicesHref,
  areaOverdueHref,
  areaQuotesHref,
  GEO_METRICS,
  geoLeaders,
  geographicInsights,
  metricMeta,
  metricValue,
  type GeoArea,
  type GeoInsights,
  type GeoMetric,
} from "@/lib/geographic-insights";
import { cn } from "@/lib/utils";
import { useAllClientContactsQuery } from "@/hooks/use-contacts-query";
import { useContactsStore } from "@/stores/contacts";
import { useInvoicesStore } from "@/stores/invoices";
import { useQuotesStore } from "@/stores/quotes";

/**
 * The full view behind the dashboard's "Where your customers are" card.
 *
 * The card answers one question — which areas are worth most — in four rows.
 * This answers the rest: what each area is owed, what it has out on quote, how
 * much of it is actually mapped, and what to do first. Same figures, same
 * drill-in panel; only the width is different.
 */
export function GeographicInsightsScreen() {
  useAllClientContactsQuery();
  const stage = useAtomValue(accountStageAtom);
  const invoices = useInvoicesStore((state) => state.invoices);
  const quotes = useQuotesStore((state) => state.quotes);
  const contacts = useContactsStore((state) => state.contacts);

  const [metric, setMetric] = React.useState<GeoMetric>(DEFAULT_METRIC);
  const [industry, setIndustry] = React.useState(ALL_INDUSTRIES);
  // Stored and shared with the dashboard card, so the page and its summary
  // group the same way without either having to tell the other.
  const level = useAtomValue(areaLevelAtom);
  const [selected, setSelected] = React.useState<string | null>(null);

  /*
   * Regrouping retires whatever was open. Without this the sheet would stay up
   * showing the last area it held, since the key it was opened under stops
   * matching anything in the regrouped list.
   */
  const lastLevel = React.useRef(level);
  if (lastLevel.current !== level) {
    lastLevel.current = level;
    if (selected !== null) setSelected(null);
  }

  // The dashboard's demo toggle reaches here too, so the empty state a
  // stakeholder is shown on the card is the one they're shown on the page.
  const isActive = stage === "active";

  const insights = React.useMemo(
    () =>
      geographicInsights({
        invoices: isActive ? invoices : [],
        quotes: isActive ? quotes : [],
        contacts: isActive ? contacts : [],
        industry,
        level,
      }),
    [isActive, invoices, quotes, contacts, industry, level],
  );

  const leaders = React.useMemo(
    () => geoLeaders(insights.areas),
    [insights.areas],
  );

  // Ranked by whatever the toggle selected; the bars scale to the leader of
  // that same metric, so the longest bar is always the top row.
  const ranked = React.useMemo(
    () =>
      [...insights.areas].sort(
        (a, b) => metricValue(b, metric) - metricValue(a, metric),
      ),
    [insights.areas, metric],
  );

  const detail = React.useMemo(
    () =>
      selected
        ? (insights.areas.find((area) => area.key === selected) ?? null)
        : null,
    [selected, insights.areas],
  );

  // Held past the close so the panel keeps its contents while it slides out.
  const shown = React.useRef<CustomerAreaDetail | null>(null);
  if (detail) shown.current = detail;

  const scope = insights.leadingState ?? "Australia";

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={MapPin}
        title="Geographic insights"
        description={`Where your customers and invoices are — across ${scope}.`}
      >
        <Badge variant="secondary" className="tabular">
          {insights.totals.customers}{" "}
          {insights.totals.customers === 1 ? "customer" : "customers"}
        </Badge>
      </PageHeader>

      <RecommendedAction leaders={leaders} scope={scope} />

      <GeoStats totals={insights.totals} />

      <ControlRow
        metric={metric}
        onMetricChange={setMetric}
        industry={industry}
        onIndustryChange={setIndustry}
        industries={insights.industries}
      />

      <AreaTable
        areas={ranked}
        totals={insights.totals}
        metric={metric}
        scope={scope}
        filtered={industry !== ALL_INDUSTRIES}
        onSelect={setSelected}
      />

      <SuggestedActions leaders={leaders} scope={scope} />

      <AddressValidation addresses={insights.addresses} />

      <CustomerAreaDetailSheet
        detail={detail ?? shown.current}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        metricLabel={metricMeta(metric).noun}
        isTopArea={leaders.value?.key === selected}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Recommended action
 * ------------------------------------------------------------------ */

/**
 * The page's one instruction, before any of the figures it was drawn from.
 * Both halves name a real area and a real amount — where the money is, and
 * where the money owed is — so it can't read as generic advice.
 */
function RecommendedAction({
  leaders,
  scope,
}: {
  leaders: ReturnType<typeof geoLeaders>;
  scope: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold tracking-tight">
            Recommended action
          </p>
          <p className="text-sm text-muted-foreground tabular">
            {leaders.value ? (
              <>
                <span className="font-medium text-foreground">
                  {leaders.value.displayName}
                </span>{" "}
                is your highest-value area at {money(leaders.value.invoiced)}{" "}
                invoiced.{" "}
              </>
            ) : (
              <>
                Nothing has been invoiced yet, so there&apos;s no area to
                back.{" "}
              </>
            )}
            {leaders.collect ? (
              <>
                Prioritise{" "}
                <span className="font-medium text-foreground">
                  {leaders.collect.displayName}
                </span>{" "}
                for collections — {money(leaders.collect.overdue)} is overdue
                there.
              </>
            ) : (
              <>Nothing is overdue anywhere, so collections can wait.</>
            )}
          </p>
        </div>
      </div>

      <Badge
        variant="outline"
        className="shrink-0 border-teal-600/20 bg-teal-600/10 text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-400"
      >
        {scope}-localised view
      </Badge>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */

/**
 * The drill-in panel's six figures, totalled across every area — same order and
 * same captions, so moving between the page and one area is a change of scope
 * rather than a change of subject. Colour only where a figure carries a
 * verdict: paid is good news, overdue is not.
 */
function GeoStats({ totals }: { totals: GeoInsights["totals"] }) {
  const stats: {
    key: string;
    label: string;
    value: string;
    caption: string;
    icon: LucideIcon;
    tone?: string;
    tile?: string;
  }[] = [
    {
      key: "customers",
      label: "Customers",
      value: String(totals.customers),
      caption: "Across every area",
      icon: Users,
    },
    {
      key: "invoiced",
      label: "Invoiced",
      value: money(totals.invoiced),
      caption: "Excludes drafts",
      icon: ReceiptText,
    },
    {
      key: "paid",
      label: "Paid",
      value: money(totals.paid),
      caption:
        totals.invoiced > 0
          ? `${Math.round((totals.paid / totals.invoiced) * 100)}% of invoiced`
          : "Nothing invoiced yet",
      icon: BadgeDollarSign,
      tone: "text-success",
      tile: STAT_TONES.success,
    },
    {
      key: "overdue",
      label: "Overdue",
      value: money(totals.overdue),
      caption: totals.overdue > 0 ? "Chase these first" : "Nothing overdue",
      icon: AlertCircle,
      tone: totals.overdue > 0 ? "text-warning" : undefined,
      tile: totals.overdue > 0 ? STAT_TONES.warning : undefined,
    },
    {
      key: "pipeline",
      label: "Quote pipeline",
      value: money(totals.quotePipeline),
      caption: `${totals.openQuoteCount} open ${
        totals.openQuoteCount === 1 ? "quote" : "quotes"
      }`,
      icon: FileText,
    },
    {
      key: "conversion",
      label: "Quote conversion",
      value: totals.conversion === null ? "—" : `${totals.conversion}%`,
      caption: "Accepted vs quoted value",
      icon: Percent,
    },
  ];

  return (
    // Six across at full width; two and three on the way down, because six
    // columns on a phone is six columns of truncation.
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <div
          key={stat.key}
          className="min-w-0 rounded-lg border border-border bg-card p-3.5 shadow-sm"
        >
          {/* Tighter than the shared StatCards row, which is built for five at
              most: at six across, a size-9 tile and a text-sm label leave
              "Quote conversion" no room to be itself. */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl [&_svg]:size-3.5",
                stat.tile ?? STAT_TONES.primary,
              )}
              aria-hidden
            >
              <stat.icon />
            </span>
            <dt className="min-w-0 truncate text-xs text-muted-foreground">
              {stat.label}
            </dt>
          </div>
          <dd className="mt-3 space-y-1.5">
            <p
              className={cn(
                "text-xl font-semibold leading-none tracking-tight tabular",
                stat.tone,
              )}
            >
              {stat.value}
            </p>
            {/* Wraps rather than truncates — a caption cut to "Accepted vs
                quoted va…" costs more than the second line it saves. */}
            <p className="text-xs leading-snug text-muted-foreground tabular">
              {stat.caption}
            </p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

/**
 * What the map is coloured and sized by, and which slice of the book it's
 * drawn from. One selection drives the legend, the ranking and the panel's
 * caption together.
 */
function ControlRow({
  metric,
  onMetricChange,
  industry,
  onIndustryChange,
  industries,
}: {
  metric: GeoMetric;
  onMetricChange: (next: GeoMetric) => void;
  industry: string;
  onIndustryChange: (next: string) => void;
  industries: string[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Colour &amp; size by
        </span>
        <Tabs
          value={metric}
          onValueChange={(next) => onMetricChange(next as GeoMetric)}
        >
          <TabsList aria-label="Colour and size by">
            {GEO_METRICS.map((entry) => (
              <TabsTrigger
                key={entry.key}
                value={entry.key}
                // The selected segment carries the brand rather than the
                // default raised-white treatment: this control decides what
                // the whole page below it is about.
                className="font-normal data-[state=active]:bg-primary data-[state=active]:font-medium data-[state=active]:text-primary-foreground"
              >
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Group by
        </span>
        <AreaLevelSelect className="h-9 w-[10.5rem] text-sm" />

        <Select value={industry} onValueChange={onIndustryChange}>
          <SelectTrigger aria-label="Filter by industry" className="w-[13rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_INDUSTRIES}>{ALL_INDUSTRIES}</SelectItem>
            {industries.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Areas
 * ------------------------------------------------------------------ */

const NUMERIC_CELL = "text-right tabular";

/**
 * The figure columns, in the order they're read.
 *
 * Declared once and used for the header, the rows and the totals, so the
 * column the toggle fills, the column its heading marks and the column the
 * figures land in are the same column by construction rather than by three
 * matching conditionals.
 */
type AreaColumn = {
  key: GeoMetric;
  label: string;
  /** Overdue is the one figure that carries bad news, so it fills warm. */
  warm?: boolean;
  cell: (area: GeoArea) => React.ReactNode;
  tone?: (area: GeoArea) => string | undefined;
  total: (totals: GeoInsights["totals"]) => React.ReactNode;
  totalTone?: (totals: GeoInsights["totals"]) => string | undefined;
};

const COLUMNS: AreaColumn[] = [
  {
    key: "customers",
    label: "Customers",
    cell: (area) => area.customerCount,
    total: (totals) => totals.customers,
  },
  {
    key: "invoiced",
    label: "Invoiced",
    cell: (area) => money(area.invoiced),
    total: (totals) => money(totals.invoiced),
  },
  {
    key: "paid",
    label: "Paid",
    cell: (area) => money(area.paid),
    tone: () => "text-success",
    total: (totals) => money(totals.paid),
    totalTone: () => "text-success",
  },
  {
    key: "overdue",
    label: "Overdue",
    warm: true,
    cell: (area) => (area.overdue > 0 ? money(area.overdue) : "—"),
    tone: (area) =>
      area.overdue > 0 ? "text-warning" : "text-muted-foreground",
    total: (totals) => (totals.overdue > 0 ? money(totals.overdue) : "—"),
    totalTone: (totals) => (totals.overdue > 0 ? "text-warning" : undefined),
  },
  {
    key: "quotes",
    label: "Open quotes",
    cell: (area) => money(area.quotePipeline),
    total: (totals) => money(totals.quotePipeline),
  },
];

/**
 * Every area, whole.
 *
 * This replaced a map placeholder beside a four-row ranking: two panels where
 * the ranking was the only one doing any work, and the figures it left out —
 * paid, overdue, what's still out on quote — were a drill-in away for each area
 * one at a time. A table has room to say all of it at once, and comparing areas
 * is the entire question, so it also happens to be the right shape.
 *
 * The row is the way in, exactly as the ranked rows were: selecting one opens
 * the same breakdown panel the dashboard card opens.
 */
function AreaTable({
  areas,
  totals,
  metric,
  scope,
  filtered,
  onSelect,
}: {
  areas: GeoArea[];
  totals: GeoInsights["totals"];
  metric: GeoMetric;
  scope: string;
  /** Whether an industry is narrowing the rows, which changes the empty copy. */
  filtered: boolean;
  onSelect: (key: string) => void;
}) {
  const leading = areas.length > 0 ? metricValue(areas[0], metric) : 0;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Customers by area</CardTitle>
        <p className="text-xs text-muted-foreground">
          {scope} · ranked by {metricMeta(metric).label.toLowerCase()}
        </p>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {/* The header sticks against this box rather than the page, so it needs
            a height to stick inside — see Table's containerClassName. */}
        <Table containerClassName="max-h-[32rem]">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted/50 [&_th]:backdrop-blur">
            <TableRow>
              <TableHead className="pl-6">Area</TableHead>
              {COLUMNS.map((column) => {
                const active = column.key === metric;
                return (
                  <TableHead
                    key={column.key}
                    // The table is ranked on this column, which is exactly what
                    // aria-sort is for — the dot says it to everyone else.
                    aria-sort={active ? "descending" : undefined}
                    className={cn(
                      "text-right last:pr-6",
                      active && "font-semibold text-foreground",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {column.label}
                      {active && (
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            column.warm ? "bg-warning" : "bg-primary",
                          )}
                          aria-hidden
                        />
                      )}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {areas.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={COLUMNS.length + 1}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {filtered
                    ? "No areas match this industry."
                    : "No customer areas yet — add a client with an address, or send an invoice."}
                </TableCell>
              </TableRow>
            ) : (
              areas.map((area) => (
                <AreaRow
                  key={area.key}
                  area={area}
                  metric={metric}
                  leading={leading}
                  onSelect={onSelect}
                />
              ))
            )}
          </TableBody>

          {areas.length > 0 && (
            // Straight off the same totals the KPI cards read, rather than a
            // second sum that could drift from them. No fill: a total isn't a
            // row in the ranking, and a full-width bar under it would read as
            // one.
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-6 font-medium">All areas</TableCell>
                {COLUMNS.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      NUMERIC_CELL,
                      "last:pr-6",
                      column.totalTone?.(totals),
                    )}
                  >
                    {column.total(totals)}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * One area. The whole row is the target rather than a link in the first cell —
 * the figures are as much the reason to open it as the name is — so it carries
 * the role, the label and the keyboard handling a button would have.
 *
 * The ranking bar lives inside the active column's cell rather than in a column
 * of its own. A bar parked at the end of the row could only ever be labelled
 * "the metric", which is what a legend is for; drawn behind the figure it
 * measures, it needs no explaining — and it moves with the toggle, so the
 * column being ranked is the column that looks ranked.
 */
function AreaRow({
  area,
  metric,
  leading,
  onSelect,
}: {
  area: GeoArea;
  metric: GeoMetric;
  /** The selected metric's largest value, which the fills are scaled against. */
  leading: number;
  onSelect: (key: string) => void;
}) {
  const value = metricValue(area, metric);
  // Scaled to the leader rather than to the total: the question a ranking
  // answers is how the areas compare with each other, so the top row fills its
  // cell and everything else is read against it.
  const percent = leading > 0 ? Math.round((value / leading) * 100) : 0;

  return (
    <TableRow
      role="button"
      tabIndex={0}
      aria-label={`View ${area.key} breakdown`}
      onClick={() => onSelect(area.key)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        // Space scrolls the page by default, which would drag the table out
        // from under the row being opened.
        event.preventDefault();
        onSelect(area.key);
      }}
      className="cursor-pointer outline-none focus-visible:bg-primary/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <TableCell className="pl-6 font-medium">{area.displayName}</TableCell>
      {COLUMNS.map((column, index) => {
        const active = column.key === metric;
        const last = index === COLUMNS.length - 1;

        return (
          <TableCell
            key={column.key}
            className={cn(
              NUMERIC_CELL,
              last && "pr-6",
              active && "relative",
              column.tone?.(area),
            )}
          >
            {active && value > 0 && (
              // Two layers, because a percentage width resolves against the
              // cell's padding box: this outer one is inset to the cell's own
              // padding, so 100% is exactly the width the figures are aligned
              // in — without it a full bar in the last column, which pads wider,
              // ran out past its own number to the table's edge.
              <span
                className={cn(
                  "pointer-events-none absolute inset-y-1 left-2",
                  last ? "right-6" : "right-2",
                )}
                aria-hidden
              >
                <span
                  // Anchored to the right, the edge the figures already share,
                  // so the fill sits under its own number instead of trailing
                  // away from it. Kept faint: this is a weight behind a figure,
                  // not a chart the figure is sitting on.
                  className={cn(
                    "absolute inset-y-0 right-0 rounded-sm",
                    column.warm
                      ? "bg-warning/[0.12] dark:bg-warning/20"
                      : "bg-primary/[0.12] dark:bg-primary/20",
                  )}
                  // A hair of width for the smallest non-zero row, which would
                  // otherwise be indistinguishable from nothing at all.
                  style={{ width: `${Math.max(percent, 3)}%` }}
                />
              </span>
            )}
            <span className="relative">{column.cell(area)}</span>
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/* ------------------------------------------------------------------ *
 * Suggested actions
 * ------------------------------------------------------------------ */

/**
 * What the areas are asking for, one card per question, each naming the area it
 * means and going to the list that proves it.
 *
 * A card only appears where there's a figure behind it — a suggestion to chase
 * nothing is noise — and the links carry the same area key the figures were
 * summed under, so the list that opens holds exactly the documents the card
 * counted.
 */
function SuggestedActions({
  leaders,
  scope,
}: {
  leaders: ReturnType<typeof geoLeaders>;
  /** Named in the all-clear, where there's no leading area left to name. */
  scope: string;
}) {
  const cards = [
    leaders.pipeline && {
      key: "quotes",
      icon: FileText,
      title: "Follow up quotes",
      area: leaders.pipeline.displayName,
      body: `${money(leaders.pipeline.quotePipeline)} across ${
        leaders.pipeline.openQuoteCount
      } open ${
        leaders.pipeline.openQuoteCount === 1 ? "quote" : "quotes"
      } waiting on a decision.`,
      href: areaQuotesHref(leaders.pipeline.key),
    },
    leaders.value && {
      key: "pricing",
      icon: Tag,
      title: "Review pricing",
      area: leaders.value.displayName,
      body: `${money(
        leaders.value.invoiced,
      )} invoiced — your strongest area, and the one where rates matter most.`,
      href: areaInvoicesHref(leaders.value.key),
    },
    leaders.collect && {
      key: "overdue",
      icon: AlertCircle,
      title: "Collect overdue",
      area: leaders.collect.displayName,
      body: `${money(leaders.collect.overdue)} overdue across ${
        leaders.collect.overdueCount
      } ${leaders.collect.overdueCount === 1 ? "customer" : "customers"}.`,
      href: areaOverdueHref(leaders.collect.key),
      tone: true,
    },
  ].filter(Boolean) as {
    key: string;
    icon: LucideIcon;
    title: string;
    area: string;
    body: string;
    href: string;
    tone?: boolean;
  }[];

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Suggested actions</CardTitle>
      </CardHeader>

      {cards.length === 0 ? (
        // Nothing outstanding anywhere. Said once, rather than as three cards
        // each reporting a zero.
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 p-4">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/10 text-success"
              aria-hidden
            >
              <CircleCheck className="size-4" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">
                You&apos;re on top of things in {scope}
              </p>
              <p className="text-xs text-muted-foreground">
                No quotes waiting, nothing overdue, and nothing invoiced that
                needs a second look.
              </p>
            </div>
          </div>
        </CardContent>
      ) : (
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              // Names the action and the place, because "Follow up quotes"
              // three times over tells a screen reader nothing about which.
              aria-label={`${card.title} in ${card.area}`}
              className="group flex min-w-0 gap-3 rounded-lg border border-border p-3 outline-none transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-xl [&_svg]:size-4",
                  card.tone
                    ? "bg-warning/10 text-warning"
                    : "bg-primary/10 text-primary",
                )}
                aria-hidden
              >
                <card.icon />
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-sm">
                  {card.title} in{" "}
                  <span className="font-semibold">{card.area}</span>
                </span>
                <span className="block text-xs text-muted-foreground tabular">
                  {card.body}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 self-center text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Address validation
 * ------------------------------------------------------------------ */

/**
 * How much to trust the map once it lands. An address that only resolves to a
 * suburb is placed at its centroid, so a marker's position is worth what this
 * bar says it is — said plainly rather than left for someone to discover.
 */
function AddressValidation({
  addresses,
}: {
  addresses: { verified: number; total: number };
}) {
  const percent =
    addresses.total > 0
      ? Math.round((addresses.verified / addresses.total) * 100)
      : 0;
  const atCentroid = addresses.total - addresses.verified;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/10 text-success"
            aria-hidden
          >
            <CircleCheck className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold tracking-tight">
              Address validation
            </p>
            <p className="text-sm text-muted-foreground tabular">
              {addresses.total === 0 ? (
                <>
                  No customer addresses on file yet — add one and its area is
                  mapped to street level.
                </>
              ) : (
                <>
                  {addresses.verified} of {addresses.total} customer{" "}
                  {addresses.total === 1 ? "address" : "addresses"} verified to
                  street level via Google Maps.
                  {/* Only where there is a rest. "The rest" of nothing reads as
                      a bug in the sentence. */}
                  {atCentroid > 0 && " The rest are placed at suburb centroid."}
                </>
              )}
            </p>
          </div>
        </div>

        <Progress
          value={percent}
          aria-label={`${percent}% of addresses verified to street level`}
          className="h-1.5 bg-success/20 [&>div]:bg-success"
        />

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {/* Was "click a marker or cluster" — the markers went with the map
              placeholder, and a row is what there is to click now. */}
          Select an area above to drill into its customers, invoices and quotes.
        </p>
      </CardContent>
    </Card>
  );
}
