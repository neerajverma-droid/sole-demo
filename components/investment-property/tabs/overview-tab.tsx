"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { Loadable, ModuleCard, usePropertyMoney } from "@/components/investment-property/module-shared";
import { usePropertySummaryQuery } from "@/hooks/use-investment-property-query";
import {
  formatPropertyDate,
  isValueStale,
  ownershipLabel,
  propertyTypeLabel,
  propertyYearOptions,
  taxTreatmentLabel,
  type Property,
} from "@/lib/investment-property";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium tabular">{value}</dd>
    </div>
  );
}

function PerformanceCard({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const years = React.useMemo(
    () => propertyYearOptions(property.purchaseDate, property.disposalDate),
    [property.purchaseDate, property.disposalDate],
  );
  const [year, setYear] = React.useState(years[0]);
  const query = usePropertySummaryQuery(property.id, year);

  return (
    <ModuleCard
      title="Performance"
      description="Rent received and expenses for the calendar year selected."
      action={
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger aria-label="Calendar year" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <Loadable query={query} skeletonClassName="h-28">
        {(summary) => {
          const stats: StatCard[] = [
            {
              key: "income",
              label: "Rental income",
              value: money(summary.ytdRentalIncome),
              icon: TrendingUp,
              tone: "success",
            },
            {
              key: "expenses",
              label: "Expenses",
              value: money(summary.ytdExpenses),
              icon: TrendingUp,
              tone: "danger",
            },
            {
              key: "net",
              label: "Net return",
              value: money(summary.ytdNetReturn),
              meta: "Income less expenses",
              icon: TrendingUp,
            },
          ];
          return <StatCards stats={stats} />;
        }}
      </Loadable>
    </ModuleCard>
  );
}

export function OverviewTab({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const stale = property.status === "active" && isValueStale(property);

  return (
    <div className="space-y-4">
      <ModuleCard title="Key details">
        <dl className="grid gap-x-10 sm:grid-cols-2">
          <Row label="Property type" value={propertyTypeLabel(property.type)} />
          <Row label="Ownership entity" value={ownershipLabel(property.ownershipEntity)} />
          <Row label="Tax treatment" value={taxTreatmentLabel(property.taxTreatment)} />
          <Row label="Address" value={property.address || "—"} />
          <Row label="Purchase date" value={formatPropertyDate(property.purchaseDate)} />
          <Row label="Purchase price" value={money(property.purchasePrice)} />
          <Row label="Stamp duty" value={money(property.stampDuty)} />
          <Row label="Legal / settlement" value={money(property.legalCosts)} />
          <Row label="Buyer agent / acquisition" value={money(property.buyerAgentCosts)} />
          <Row
            label="Current estimated value"
            value={property.hasCurrentValue ? money(property.currentValue) : "Not set"}
          />
          <Row
            label="Value last updated"
            value={
              <span className="inline-flex items-center gap-2">
                {property.valueUpdatedAt ? formatPropertyDate(property.valueUpdatedAt) : "Never"}
                {stale && <Badge variant="warning">Update needed</Badge>}
              </span>
            }
          />
        </dl>
        {property.notes && (
          <div className="border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{property.notes}</p>
          </div>
        )}
      </ModuleCard>

      <PerformanceCard key={property.id} property={property} />

      {property.status === "disposed" && (
        <ModuleCard title="Sale">
          <dl className="grid gap-x-10 sm:grid-cols-2">
            <Row label="Sale date" value={formatPropertyDate(property.disposalDate)} />
            <Row label="Sale price" value={money(property.disposalSalePrice ?? 0)} />
            <Row label="Selling costs" value={money(property.disposalSellingCosts ?? 0)} />
          </dl>
        </ModuleCard>
      )}
    </div>
  );
}
