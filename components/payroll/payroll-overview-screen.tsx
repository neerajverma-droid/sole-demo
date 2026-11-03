"use client";

import * as React from "react";
import Link from "next/link";
import {
  Banknote,
  Calculator,
  CircleAlert,
  PlugZap,
  Plus,
  RefreshCw,
  TriangleAlert,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { PageHeader } from "@/components/layout/page-header";
import { AddSeatsDialog } from "@/components/payroll/add-seats-dialog";
import { MicrokeeperConnectDialog } from "@/components/payroll/microkeeper-connect-dialog";
import {
  PAYROLL_BILLING_HREF,
  PayrollSeatsNotice,
} from "@/components/payroll/payroll-banners";
import {
  usePayrollOverviewQuery,
  usePayrollSeatsQuery,
} from "@/hooks/use-payroll-query";
import {
  PAYROLL_ROOT,
  PAYROLL_STATUS_LABEL,
  payPeriodLabel,
  payrollDate,
  payrollDateRange,
  payrollDateTime,
  payrollEnabled,
  payrollMoney,
  payrollMoneyWhole,
  payrollStatusVariant,
  payrunStatusLabel,
  payrunStatusVariant,
  plural,
  seatIntervalSuffix,
  seatRecurringTotal,
  seatUnitPrice,
  type PayrollOverview,
  type PayrollSeats,
} from "@/lib/payroll";

const TITLE_TIP =
  "Payroll runs in Microkeeper. This page shows who's on it, whether the connection is healthy, how many employee seats you've paid for, and the most recent pay run.";

export function PayrollOverviewScreen() {
  const overviewQuery = usePayrollOverviewQuery();
  const seatsQuery = usePayrollSeatsQuery();
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [addSeatsOpen, setAddSeatsOpen] = React.useState(false);

  const overview = overviewQuery.data;
  const seats = seatsQuery.data;
  const connected = overview?.connection.connected ?? false;
  const refreshing = overviewQuery.isFetching || seatsQuery.isFetching;

  const refresh = () => {
    void overviewQuery.refetch();
    void seatsQuery.refetch();
  };

  const header = (
    <>
      <PageHeader
        icon={UsersRound}
        title="Payroll"
        titleTip={TITLE_TIP}
        description={
          overview
            ? `Headcount, payroll readiness and activity for ${overview.businessName}.`
            : "Headcount, payroll readiness and activity."
        }
      >
        <Button
          variant="outline"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh"
        >
          <RefreshCw className={refreshing ? "motion-safe:animate-spin" : undefined} />
          Refresh
        </Button>
        {overview && (
          <Button variant={connected ? "outline" : "default"} onClick={() => setConnectOpen(true)}>
            <PlugZap />
            {connected ? "Manage Microkeeper" : "Connect Microkeeper"}
          </Button>
        )}
      </PageHeader>
    </>
  );

  if (overviewQuery.isPending || seatsQuery.isPending) {
    return (
      <div className="space-y-[15px]">
        {header}
        <div className="space-y-6" aria-hidden>
          <StatCards stats={placeholderCards()} loading />
          <div className="grid gap-6 lg:grid-cols-2">
            <Shimmer className="h-64 w-full rounded-lg border border-border" />
            <Shimmer className="h-64 w-full rounded-lg border border-border" />
          </div>
          <Shimmer className="h-48 w-full rounded-lg border border-border" />
        </div>
      </div>
    );
  }

  if (overviewQuery.isError || seatsQuery.isError || !overview || !seats) {
    return (
      <div className="space-y-[15px]">
        {header}
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t load payroll</EmptyTitle>
            <EmptyDescription>
              Something went wrong reaching the server. Try again.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={refresh}>
              Try again
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-[15px]">
      {header}

      <PayrollSeatsNotice seats={seats} />

      <div data-usertour="payroll-overview-stats">
        <StatCards stats={overviewCards(overview)} loading={overviewQuery.isFetching} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WorkforceCard overview={overview} />
        <ConnectionCard overview={overview} onManage={() => setConnectOpen(true)} />
      </div>

      <SeatsCard seats={seats} onAddSeats={() => setAddSeatsOpen(true)} />

      <LatestPayrunCard overview={overview} canRun={payrollEnabled(seats) && connected} />

      <MicrokeeperConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        connection={overview.connection}
        businessName={overview.businessName}
      />
      <AddSeatsDialog
        open={addSeatsOpen}
        onOpenChange={setAddSeatsOpen}
        seats={seats}
        onAdded={() => setAddSeatsOpen(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

function overviewCards(overview: PayrollOverview): StatCard[] {
  const { stats } = overview;
  return [
    {
      key: "active",
      label: "Active staff",
      value: stats.activeEmployees.toLocaleString("en-AU"),
      meta: `${plural(stats.totalEmployees, "employee")} in total`,
      icon: UserRoundCheck,
    },
    {
      key: "incomplete",
      label: "Profile incomplete",
      tip: "Employees missing details Microkeeper needs before they can be paid — a pay run won't include them until they're filled in.",
      value: stats.profileIncomplete.toLocaleString("en-AU"),
      meta: stats.profileIncomplete > 0 ? "Need details before a pay run" : "Every profile is complete",
      icon: CircleAlert,
      tone: stats.profileIncomplete > 0 ? "warning" : "success",
    },
    {
      key: "payruns",
      label: "Pay runs",
      value: stats.totalPayruns.toLocaleString("en-AU"),
      meta: `${stats.completedPayruns.toLocaleString("en-AU")} completed`,
      icon: Calculator,
    },
    {
      key: "payments",
      label: "Total payments",
      value: payrollMoneyWhole(stats.totalPaymentAmount),
      meta: "Gross paid across every run",
      icon: Banknote,
      tone: "accent",
    },
  ];
}

/** Same labels and icons, for the first-load shimmer. */
function placeholderCards(): StatCard[] {
  return [
    { key: "active", label: "Active staff", value: "", icon: UserRoundCheck },
    { key: "incomplete", label: "Profile incomplete", value: "", icon: CircleAlert },
    { key: "payruns", label: "Pay runs", value: "", icon: Calculator },
    { key: "payments", label: "Total payments", value: "", icon: Banknote, tone: "accent" },
  ];
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

function WorkforceCard({ overview }: { overview: PayrollOverview }) {
  const { stats } = overview;
  const rows: { label: string; value: number }[] = [
    { label: "Full time", value: stats.fullTime },
    { label: "Part time", value: stats.partTime },
    { label: "Casual", value: stats.casual },
    { label: "Sub-contractors", value: stats.subContractor },
  ];
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.value, 0));

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Workforce</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${PAYROLL_ROOT}/employees`}>View employees</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pb-5">
        {rows.map((row) => (
          <div key={row.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular">{row.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(row.value / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/40 px-6 py-4 text-xs text-muted-foreground tabular">
        <span>
          <span className="font-medium text-success">{stats.synced}</span> synced
        </span>
        <span>
          <span className="font-medium text-warning">{stats.pendingSync}</span> pending
        </span>
        <span>
          <span className="font-medium text-destructive">{stats.failedSync}</span> need attention
        </span>
      </div>
    </Card>
  );
}

function ConnectionCard({
  overview,
  onManage,
}: {
  overview: PayrollOverview;
  onManage: () => void;
}) {
  const { connection } = overview;

  return (
    <Card className="flex h-full flex-col" data-usertour="payroll-overview-microkeeper">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Microkeeper</CardTitle>
        <Badge
          variant={
            !connection.connected
              ? "secondary"
              : connection.status === "ERROR"
                ? "danger"
                : "success"
          }
        >
          {!connection.connected
            ? "Not connected"
            : connection.status === "ERROR"
              ? "Error"
              : "Connected"}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 pb-5">
        {connection.connected ? (
          <div className="space-y-3">
            <dl className="divide-y rounded-md border border-border text-sm">
              <InfoRow label="Business">
                {connection.businessName || overview.businessName}
              </InfoRow>
              <InfoRow label="Last verified">{payrollDateTime(connection.lastVerifiedAt)}</InfoRow>
              <InfoRow label="Last sync">{payrollDateTime(connection.lastSyncAt)}</InfoRow>
            </dl>
            {connection.lastError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {connection.lastError}
              </p>
            )}
          </div>
        ) : (
          <Empty className="border-0 bg-transparent px-0 py-6 shadow-none">
            <EmptyMedia>
              <PlugZap aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Not connected yet</EmptyTitle>
              <EmptyDescription>
                Connect Microkeeper to sync employees, run pay and report STP.
              </EmptyDescription>
            </div>
          </Empty>
        )}
      </CardContent>
      <div className="mt-auto border-t bg-muted/40 px-6 py-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onManage}>
          {connection.connected ? "Manage connection" : "Connect Microkeeper"}
        </Button>
      </div>
    </Card>
  );
}

function SeatsCard({
  seats,
  onAddSeats,
}: {
  seats: PayrollSeats;
  onAddSeats: () => void;
}) {
  const enabled = payrollEnabled(seats);
  const suffix = seatIntervalSuffix(seats.billingInterval);
  const used = seats.employeeLimit > 0 ? (seats.activeEmployees / seats.employeeLimit) * 100 : 0;

  return (
    <Card data-usertour="payroll-overview-seats">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Employee seats</CardTitle>
          <Badge variant={payrollStatusVariant(seats.status)}>
            {PAYROLL_STATUS_LABEL[seats.status]}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabled && (
            <Button size="sm" onClick={onAddSeats}>
              <Plus />
              Add seats
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={PAYROLL_BILLING_HREF}>
              {enabled ? "Manage in settings" : "Enable payroll"}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">Seats in use</dt>
            <dd className="text-xl font-semibold tabular">
              {seats.activeEmployees}
              <span className="text-sm font-normal text-muted-foreground">
                /{seats.employeeLimit}
              </span>
            </dd>
            <div className="h-1.5 rounded-full bg-muted" aria-hidden>
              <div
                className={used >= 100 ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-primary"}
                style={{ width: `${Math.min(100, used)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground tabular">
              {plural(Math.max(0, seats.availableSeats), "seat")} available
            </p>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">Price per seat</dt>
            <dd className="text-xl font-semibold tabular">
              {payrollMoney(seatUnitPrice(seats.billingInterval))}
              <span className="text-sm font-normal text-muted-foreground">{suffix}</span>
            </dd>
            <p className="text-xs text-muted-foreground">
              Prepaid, per employee. No free seats.
            </p>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">Recurring total</dt>
            <dd className="text-xl font-semibold tabular">
              {payrollMoney(enabled ? seatRecurringTotal(seats) : 0)}
              <span className="text-sm font-normal text-muted-foreground">{suffix}</span>
            </dd>
            <p className="text-xs text-muted-foreground">
              {enabled && seats.currentPeriodEnd
                ? `Renews ${payrollDate(seats.currentPeriodEnd)}`
                : "Billed with your Sole subscription"}
            </p>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function LatestPayrunCard({
  overview,
  canRun,
}: {
  overview: PayrollOverview;
  canRun: boolean;
}) {
  const run = overview.latestPayrun;

  if (!run) {
    return (
      <Empty className="gap-2.5 py-9" data-usertour="payroll-overview-latest-payrun">
        <EmptyMedia>
          <Calculator aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No pay runs yet</EmptyTitle>
          <EmptyDescription>
            {canRun
              ? "Run your first pay cycle once your employees have synced."
              : "Enable payroll and connect Microkeeper, then run your first pay cycle."}
          </EmptyDescription>
        </div>
        {canRun && <EmptyCue label="Start here" />}
        {canRun && (
          <EmptyActions>
            <Button size="sm" asChild>
              <Link href={`${PAYROLL_ROOT}/payruns/new`}>Create first pay run</Link>
            </Button>
          </EmptyActions>
        )}
      </Empty>
    );
  }

  const detailHref = `${PAYROLL_ROOT}/payruns/${run.mkRunId}?year=${run.mkYear}`;

  return (
    <Card data-usertour="payroll-overview-latest-payrun">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Latest pay run</CardTitle>
            <Badge variant={payrunStatusVariant(run.status)}>
              {payrunStatusLabel(run.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground tabular">
            Run {run.mkYear}/{run.mkRunId} · {payrollDateRange(run.startDate, run.endDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`${PAYROLL_ROOT}/payruns`}>All pay runs</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={detailHref}>View details</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-5">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile icon={Calculator} label="Period" value={payPeriodLabel(run.period)} />
          <Tile icon={Banknote} label="Payment date" value={payrollDate(run.paymentDate)} />
          <Tile icon={Banknote} label="Gross payment" value={payrollMoney(run.paymentTotal)} />
          <Tile
            icon={Banknote}
            label="Expenses & deductions"
            value={payrollMoney(run.expenseTotal + run.deductionTotal)}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-3">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4"
        aria-hidden
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm font-semibold tabular">{value}</dd>
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{children}</dd>
    </div>
  );
}
