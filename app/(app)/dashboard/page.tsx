import { Suspense } from "react";
import { AttentionCard } from "@/components/dashboard/attention-card";
import { BusinessSnapshot } from "@/components/dashboard/business-snapshot";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { ConnectedAccountsCard } from "@/components/dashboard/connected-accounts-card";
import { CustomerAreasCard } from "@/components/dashboard/customer-areas-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { InvoiceSummaryCard } from "@/components/dashboard/invoice-summary-card";
import { MoneyPosition } from "@/components/dashboard/money-position";
import { RevenueGoalCard } from "@/components/dashboard/revenue-goal-card";
import { TopExpensesCard, TopIncomeCard} from "@/components/dashboard/top-movers";
import { DashboardDataBootstrap } from "@/components/dashboard/dashboard-data-bootstrap";

export default function DashboardPage() {
  return (
    <div className="space-y-[15px]">
      <DashboardDataBootstrap />
      <DashboardHeader />
      <MoneyPosition />
      <RevenueGoalCard />

      {/* The year in four figures, under the goal they're tracking against —
          the goal card asks "am I on pace", these say what the pace is. */}
      <BusinessSnapshot />

      {/* What to do about it, under the figures that say it needs doing — and
          beside the accounts those figures are drawn from. */}
      <div className="grid items-stretch gap-[15px] lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttentionCard />
        </div>
        <ConnectedAccountsCard />
      </div>
      <CashFlowChart />
      <CustomerAreasCard />
      <div
        data-usertour="dashboard-top-movers"
        className="grid gap-[15px] lg:grid-cols-2"
      >
        <TopIncomeCard />
        <TopExpensesCard />
      </div>

      {/* Last, and the full width: it's three bands deep, and the only thing on
          the page that ends in a table you can act from. */}
      <InvoiceSummaryCard />
    </div>
  );
}
