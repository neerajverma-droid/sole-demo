"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Clock,
  DollarSign,
  FileWarning,
  Hammer,
  Home,
  Landmark,
  Layers,
  Receipt,
  Scale,
  Search,
  Tag,
  TrendingUp,
  Wrench,
  ArrowLeftRight,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { STAT_TONES, StatCards, type StatCard } from "@/components/ui/stat-cards";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loadable, PropertyStatusBadge, usePropertyMoney } from "@/components/investment-property/module-shared";
import { PROPERTIES_ROOT } from "@/components/investment-property/investment-nav";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useCapitalSnapshotQuery,
  useExpenseBreakdownQuery,
  useIncomeExpenseQuery,
  useKeyActionsQuery,
  usePortfolioSummaryQuery,
  usePropertyComparisonQuery,
  useRentCollectionQuery,
} from "@/hooks/use-investment-property-query";
import {
  collectionRateLabel,
  formatPropertyDate,
  type ExpenseBreakdownKey,
  type KeyActionKey,
  type PortfolioFilters,
} from "@/lib/investment-property";
import { cn } from "@/lib/utils";

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ScopeBar({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      <span>Properties in scope</span>
      <b className="text-base font-semibold text-foreground tabular">{count}</b>
    </div>
  );
}

function CompactStat({ stat }: { stat: StatCard }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4",
            STAT_TONES[stat.tone ?? "primary"],
          )}
          aria-hidden
        >
          <stat.icon />
        </span>
        <span className="text-sm text-muted-foreground">{stat.label}</span>
      </div>
      <p className="mt-3 text-xl font-semibold tabular">{stat.value}</p>
      {stat.meta && <p className="mt-1 text-xs text-muted-foreground">{stat.meta}</p>}
    </div>
  );
}

function SectionEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-border p-6 text-center">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function periodLabel(filters: PortfolioFilters, fyLabel: string): string {
  return filters.financialYearStart === null ? "All time" : fyLabel;
}

export function SummarySection({
  filters,
  fyLabel,
}: {
  filters: PortfolioFilters;
  fyLabel: string;
}) {
  const money = usePropertyMoney();
  const query = usePortfolioSummaryQuery(filters);
  const period = periodLabel(filters, fyLabel);

  return (
    <Section
      title="Portfolio summary"
      description="Headline portfolio metrics for all properties in the selected scope."
    >
      <Loadable query={query} skeletonClassName="h-64">
        {(summary) => {
          const stats: StatCard[] = [
            {
              key: "properties",
              label: "Properties",
              value: String(summary.totalProperties),
              meta: filters.status === "all" ? "All properties" : filters.status,
              icon: Building2,
            },
            {
              key: "value",
              label: "Total portfolio value",
              value: money(summary.totalValue),
              icon: Home,
              tone: "success",
            },
            {
              key: "loan",
              label: "Total loan balance",
              value: money(summary.totalLoan),
              icon: Landmark,
              tone: "warning",
            },
            {
              key: "equity",
              label: "Estimated equity",
              value: money(summary.totalEquity),
              icon: Layers,
            },
            {
              key: "rent",
              label: "Rent received",
              value: money(summary.rentReceived),
              meta: period,
              icon: DollarSign,
            },
            {
              key: "expenses",
              label: "Property expenses",
              value: money(summary.propertyExpenses),
              meta: period,
              icon: Receipt,
              tone: "danger",
            },
            {
              key: "net",
              label: "Net rental result",
              value: money(summary.netRentalResult),
              meta: "Rent received − property expenses",
              icon: TrendingUp,
              tone: "success",
            },
            {
              key: "cash-flow",
              label: "Estimated cash flow",
              value: money(summary.estimatedCashFlow),
              meta:
                filters.financialYearStart === null
                  ? "Pick a financial year to include loan repayments"
                  : "Rent − cash expenses − loan repayments",
              icon: ArrowLeftRight,
            },
            {
              key: "cost-base",
              label: "Total cost base",
              value: money(summary.totalCostBase),
              icon: Scale,
              tone: "warning",
            },
            {
              key: "status-mix",
              label: "Active / disposed",
              value: `${summary.activeProperties} / ${summary.disposedProperties}`,
              meta: "Property status mix",
              icon: Layers,
              tone: "accent",
            },
          ];
          return <StatCards stats={stats} />;
        }}
      </Loadable>
    </Section>
  );
}

const BREAKDOWN_STYLE: Record<ExpenseBreakdownKey, string> = {
  property_expenses: "bg-destructive",
  capital_improvements: "bg-warning",
  selling_costs: "bg-primary",
};

const BREAKDOWN_LABEL: Record<ExpenseBreakdownKey, string> = {
  property_expenses: "Property expenses",
  capital_improvements: "Capital improvements",
  selling_costs: "Selling costs",
};

export function ExpenseBreakdownSection({ filters }: { filters: PortfolioFilters }) {
  const money = usePropertyMoney();
  const query = useExpenseBreakdownQuery(filters);

  return (
    <Section
      title="Expenses & capital cost breakdown"
      description="Split of property expenses, capital improvements and selling costs."
    >
      <Loadable query={query} skeletonClassName="h-56">
        {(data) => {
          const hasData = data.total > 0;
          return (
            <div className="space-y-4">
              {hasData ? (
                <div
                  className="flex h-3.5 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label="Share of expenses by type"
                >
                  {data.segments.map((segment) => (
                    <span
                      key={segment.key}
                      className={BREAKDOWN_STYLE[segment.key]}
                      style={{ width: `${(segment.amount / data.total) * 100}%` }}
                    />
                  ))}
                </div>
              ) : (
                <SectionEmpty
                  title="No breakdown data for this selection"
                  description="Try another financial year or status to see expense and capital cost activity."
                />
              )}

              <div className="rounded-md border border-border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total amount
                </p>
                <p className="mt-1 text-2xl font-semibold tabular">
                  {money(data.total)}
                </p>
              </div>

              <ul className="space-y-2">
                {(data.segments.length
                  ? data.segments
                  : (Object.keys(BREAKDOWN_LABEL) as ExpenseBreakdownKey[]).map((key) => ({
                      key,
                      label: BREAKDOWN_LABEL[key],
                      amount: 0,
                    }))
                ).map((segment) => (
                  <li
                    key={segment.key}
                    className="flex items-center gap-3 rounded-md border border-border px-3.5 py-3"
                  >
                    <span
                      className={cn("size-2.5 shrink-0 rounded-full", BREAKDOWN_STYLE[segment.key])}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{segment.label}</p>
                      <p className="text-xs text-muted-foreground tabular">
                        {data.total > 0 ? ((segment.amount / data.total) * 100).toFixed(1) : "0.0"}%
                        of total
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular">
                      {money(segment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }}
      </Loadable>
    </Section>
  );
}

function ProportionBar({
  label,
  amount,
  max,
  barClassName,
}: {
  label: string;
  amount: number;
  max: number;
  barClassName: string;
}) {
  const money = usePropertyMoney();
  const width = max > 0 ? Math.min(100, (Math.max(amount, 0) / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular">{money(amount)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", barClassName)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function IncomeExpenseSection({ filters }: { filters: PortfolioFilters }) {
  const money = usePropertyMoney();
  const query = useIncomeExpenseQuery(filters);

  return (
    <Section
      title="Income vs expenses"
      description="Rental income, property expenses and net result."
    >
      <Loadable query={query} skeletonClassName="h-56">
        {(data) => {
          if (data.rentalIncome === 0 && data.propertyExpenses === 0) {
            return (
              <SectionEmpty
                title="No income or expense activity for this selection"
                description="Try another financial year or status to compare rental income and property expenses."
              />
            );
          }
          const max = Math.max(data.rentalIncome, data.propertyExpenses);
          return (
            <div className="space-y-4 py-1">
              <ProportionBar
                label="Rental income"
                amount={data.rentalIncome}
                max={max}
                barClassName="bg-success"
              />
              <ProportionBar
                label="Property expenses"
                amount={data.propertyExpenses}
                max={max}
                barClassName="bg-destructive"
              />
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span>Net result</span>
                <b
                  className={cn(
                    "text-base tabular",
                    data.netResult >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {money(data.netResult)}
                </b>
              </div>
            </div>
          );
        }}
      </Loadable>
    </Section>
  );
}

export function RentCollectionSection({ filters }: { filters: PortfolioFilters }) {
  const money = usePropertyMoney();
  const query = useRentCollectionQuery(filters);

  return (
    <Section
      title="Rent collection"
      description="Received, outstanding, overdue and upcoming rent."
    >
      <Loadable query={query} skeletonClassName="h-64">
        {(data) => {
          const stats: StatCard[] = [
            {
              key: "received",
              label: "Received rent",
              value: money(data.received),
              meta: "Matched / reconciled",
              icon: CircleCheck,
              tone: "success",
            },
            {
              key: "outstanding",
              label: "Outstanding rent",
              value: money(data.outstanding),
              meta: "Waiting to be matched",
              icon: Clock,
              tone: "warning",
            },
            {
              key: "overdue",
              label: "Overdue rent",
              value: money(data.overdue),
              meta: "Past due date",
              icon: CircleAlert,
              tone: "danger",
            },
            {
              key: "upcoming",
              label: "Upcoming rent",
              value: money(data.upcoming),
              meta: "Scheduled, not due",
              icon: CalendarClock,
            },
          ];
          return (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Collection rate</p>
                    <p className="text-2xl font-semibold tabular">
                      {collectionRateLabel(data.collectionRate)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground tabular">
                    {money(data.received)} received out of{" "}
                    {money(data.scheduled)} scheduled
                  </p>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Rent collection rate"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(data.collectionRate)}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${data.collectionRate}%` }}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.map((stat) => (
                  <CompactStat key={stat.key} stat={stat} />
                ))}
              </div>
            </div>
          );
        }}
      </Loadable>
    </Section>
  );
}

const ACTION_ICON: Record<KeyActionKey, StatCard["icon"]> = {
  property_value_review_due: TrendingUp,
  interest_only_ending_soon: Landmark,
  maintenance_awaiting_action: Wrench,
  expenses_missing_attachment: FileWarning,
  recent_disposals: Tag,
};

const ACTION_TONE: Record<KeyActionKey, StatCard["tone"]> = {
  property_value_review_due: "primary",
  interest_only_ending_soon: "warning",
  maintenance_awaiting_action: "success",
  expenses_missing_attachment: "danger",
  recent_disposals: "primary",
};

export function KeyActionsSection({ filters }: { filters: PortfolioFilters }) {
  const query = useKeyActionsQuery(filters);

  return (
    <Section
      title="Key actions"
      description="Things to review for the properties in scope."
    >
      <Loadable query={query} skeletonClassName="h-64">
        {(data) => {
          return (
            <div className="space-y-4">
              <ScopeBar count={data.propertiesInScope} />
              <ul className="space-y-2">
                {data.actions.map((action) => {
                  const Icon = ACTION_ICON[action.key];
                  return (
                    <li
                      key={action.key}
                      className="flex items-center gap-3 rounded-md border border-border px-3.5 py-3"
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4",
                          STAT_TONES[ACTION_TONE[action.key] ?? "primary"],
                        )}
                        aria-hidden
                      >
                        <Icon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{action.label}</p>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                      <span className="text-lg font-semibold tabular">{action.count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }}
      </Loadable>
    </Section>
  );
}

export function CapitalSnapshotSection({ filters }: { filters: PortfolioFilters }) {
  const money = usePropertyMoney();
  const query = useCapitalSnapshotQuery(filters);

  return (
    <Section
      title="Sale & cost snapshot"
      description="Sale-related costs and property cost base for the properties in scope."
    >
      <Loadable query={query} skeletonClassName="h-48">
        {(data) => {
          const stats: StatCard[] = [
            {
              key: "cost-base",
              label: "Tax cost base",
              value: money(data.totalCostBase),
              meta: "Buying costs + upgrades",
              icon: Scale,
            },
            {
              key: "improvements",
              label: "Major upgrades",
              value: money(data.capitalImprovements),
              meta: "Long-term upgrades",
              icon: Hammer,
              tone: "warning",
            },
            {
              key: "selling",
              label: "Selling costs",
              value: money(data.sellingCosts),
              meta: "Costs from selling",
              icon: Receipt,
              tone: "danger",
            },
            {
              key: "proceeds",
              label: "Sale proceeds",
              value: money(data.saleProceeds),
              meta: "Sale value received",
              icon: DollarSign,
              tone: "success",
            },
            {
              key: "sold",
              label: "Sold properties",
              value: String(data.disposedProperties),
              meta: "Count of properties sold",
              icon: Tag,
            },
          ];
          return (
            <div className="space-y-4">
              <ScopeBar count={data.propertiesInScope} />
              <StatCards stats={stats} />
            </div>
          );
        }}
      </Loadable>
    </Section>
  );
}

export function ComparisonSection({ filters }: { filters: PortfolioFilters }) {
  const money = usePropertyMoney();
  const [search, setSearch] = React.useState("");
  const debounced = useDebouncedValue(search);
  const query = usePropertyComparisonQuery({ ...filters, name: debounced });
  const settling = search !== debounced || query.isPlaceholderData;

  return (
    <Section
      title="Property comparison"
      description="Compare property performance for the properties in scope."
      action={
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by property name or address"
            aria-label="Search property comparison"
            className="pl-9"
          />
        </div>
      }
    >
      <Loadable query={query} skeletonClassName="h-48">
        {(data) => (
          <div className="space-y-4">
            <ScopeBar count={data.propertiesInScope} />
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead className={HUG_COLUMN}>Status</TableHead>
                    <TableHead className={HUG_COLUMN}>Purchase date</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Value</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Loan</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Equity</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Income</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Expenses</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Net result</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Cost base</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={cn(settling && "opacity-60 transition-opacity")}>
                  {data.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                        No properties match this view.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-[220px]">
                          <Link
                            href={`${PROPERTIES_ROOT}/${row.id}`}
                            className="block truncate font-medium outline-none hover:text-primary hover:underline focus-visible:underline"
                          >
                            {row.name}
                          </Link>
                        </TableCell>
                        <TableCell className={HUG_COLUMN}>
                          <PropertyStatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                          {formatPropertyDate(row.purchaseDate)}
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                          {money(row.currentValue)}
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                          {money(row.loanBalance)}
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                          {money(row.equity)}
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                          {money(row.rentalIncome)}
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                          {money(row.propertyExpenses)}
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right font-medium tabular")}>
                          {money(row.netRentalResult)}
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                          {money(row.costBase)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Loadable>
    </Section>
  );
}
