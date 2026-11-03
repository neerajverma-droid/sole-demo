"use client";

import * as React from "react";
import { LayoutGrid, Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CapitalSnapshotSection,
  ComparisonSection,
  ExpenseBreakdownSection,
  IncomeExpenseSection,
  KeyActionsSection,
  RentCollectionSection,
  SummarySection,
} from "@/components/investment-property/portfolio-sections";
import { InvestmentNav } from "@/components/investment-property/investment-nav";
import { usePropertyComparisonQuery } from "@/hooks/use-investment-property-query";
import { PropertyFormDialog } from "@/components/investment-property/property-form-dialog";
import {
  currentFinancialYearStart,
  earliestPurchaseDate,
  financialYearLabel,
  financialYearOptions,
  parseFinancialYearOption,
  type PortfolioFilters,
  type PropertyStatusFilter,
} from "@/lib/investment-property";

const STATUS_LABELS = ["All properties", "Active", "Disposed"] as const;
type StatusLabel = (typeof STATUS_LABELS)[number];

const LABEL_STATUS: Record<StatusLabel, PropertyStatusFilter> = {
  "All properties": "all",
  Active: "active",
  Disposed: "disposed",
};

const STATUS_LABEL: Record<PropertyStatusFilter, StatusLabel> = {
  all: "All properties",
  active: "Active",
  disposed: "Disposed",
};

const ALL_TIME_ALL_STATUS: PortfolioFilters = { financialYearStart: null, status: "all" };

export function PortfolioScreen() {
  const allTime = usePropertyComparisonQuery(ALL_TIME_ALL_STATUS);
  const fyOptions = React.useMemo(
    () => financialYearOptions(earliestPurchaseDate(allTime.data?.rows ?? [])),
    [allTime.data],
  );
  const [fy, setFy] = React.useState(() => String(currentFinancialYearStart()));
  const [status, setStatus] = React.useState<PropertyStatusFilter>("all");
  const [createOpen, setCreateOpen] = React.useState(false);

  const financialYearStart = parseFinancialYearOption(fy);
  const filters = React.useMemo<PortfolioFilters>(
    () => ({ financialYearStart, status }),
    [financialYearStart, status],
  );
  const fyLabel = financialYearStart === null ? "All time" : financialYearLabel(financialYearStart);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutGrid}
        title="Investment property"
        description="Portfolio-level dashboard for your investment properties."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Create property
        </Button>
      </PageHeader>

      <InvestmentNav />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Financial year
          </p>
          <Select value={fy} onValueChange={setFy}>
            <SelectTrigger aria-label="Financial year" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </p>
          <FilterPills
            label="Property status"
            options={STATUS_LABELS}
            value={STATUS_LABEL[status]}
            onChange={(next) => setStatus(LABEL_STATUS[next])}
          />
        </div>
      </div>

      <SummarySection filters={filters} fyLabel={fyLabel} />

      <div className="grid gap-6 xl:grid-cols-2">
        <ExpenseBreakdownSection filters={filters} />
        <IncomeExpenseSection filters={filters} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RentCollectionSection filters={filters} />
        <KeyActionsSection filters={filters} />
      </div>

      <CapitalSnapshotSection filters={filters} />

      <ComparisonSection filters={filters} />

      <PropertyFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
