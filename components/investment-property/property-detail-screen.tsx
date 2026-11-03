"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Home,
  Landmark,
  Layers,
  Pencil,
  Scale,
  SearchX,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import {
  DeletePropertyDialog,
  DisposePropertyDialog,
  type PropertyTarget,
} from "@/components/investment-property/property-dialogs";
import { PropertyFormDialog } from "@/components/investment-property/property-form-dialog";
import { PropertyStatusBadge, usePropertyMoney } from "@/components/investment-property/module-shared";
import { CgtTab } from "@/components/investment-property/tabs/cgt-tab";
import { CostBaseTab } from "@/components/investment-property/tabs/cost-base-tab";
import { DocumentsTab } from "@/components/investment-property/tabs/documents-tab";
import { ExpensesTab } from "@/components/investment-property/tabs/expenses-tab";
import { IncomeTab } from "@/components/investment-property/tabs/income-tab";
import { OverviewTab } from "@/components/investment-property/tabs/overview-tab";
import { LoanTab } from "@/components/investment-property/tabs/loan-tab";
import { MaintenanceTab } from "@/components/investment-property/tabs/maintenance-tab";
import { RentalScheduleTab } from "@/components/investment-property/tabs/rental-schedule-tab";
import { UseHistoryTab } from "@/components/investment-property/tabs/use-history-tab";
import { PROPERTIES_ROOT, PropertyTabs, parseTab } from "@/components/investment-property/investment-nav";
import {
  usePropertyQuery,
  usePropertySummaryQuery,
} from "@/hooks/use-investment-property-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  propertyCostBase,
} from "@/lib/investment-property";

export function PropertyDetailScreen({ propertyId }: { propertyId: string }) {
  const money = usePropertyMoney();
  const router = useRouter();
  const tab = parseTab(useSearchParams()?.get("tab"));
  const propertyQuery = usePropertyQuery(propertyId);
  const property = propertyQuery.data;
  const summaryQuery = usePropertySummaryQuery(propertyId, new Date().getFullYear());

  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PropertyTarget | null>(null);
  const [disposeTarget, setDisposeTarget] = React.useState<PropertyTarget | null>(null);

  if (propertyQuery.isLoading) {
    return (
      <div className="space-y-6" aria-busy>
        <Shimmer className="h-9 w-40" />
        <Shimmer className="h-24 w-full" />
        <Shimmer className="h-72 w-full" />
      </div>
    );
  }

  if (!property) {
    const notFound = /not found/i.test(apiErrorMessage(propertyQuery.error, ""));
    return (
      <Empty>
        <EmptyMedia>{notFound ? <SearchX aria-hidden /> : <TriangleAlert aria-hidden />}</EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>{notFound ? "Property not found" : "Couldn't load this property"}</EmptyTitle>
          <EmptyDescription>
            {notFound
              ? "It may have been deleted, or belongs to another business."
              : apiErrorMessage(propertyQuery.error, "Something went wrong reaching the server.")}
          </EmptyDescription>
        </div>
        <EmptyActions>
          {notFound ? (
            <Button asChild size="sm" variant="outline">
              <Link href={PROPERTIES_ROOT}>Back to properties</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => propertyQuery.refetch()}>
              Try again
            </Button>
          )}
        </EmptyActions>
      </Empty>
    );
  }

  const disposed = property.status === "disposed";
  const target: PropertyTarget = {
    id: property.id,
    name: property.name,
    purchaseDate: property.purchaseDate,
  };
  const costBase = summaryQuery.data?.costBase ?? propertyCostBase(property);
  const statsLoading = summaryQuery.isLoading;

  const valueKnown = property.hasCurrentValue;
  const stats: StatCard[] = [
    {
      key: "value",
      label: "Current value",
      value: valueKnown ? money(property.currentValue) : "Not set",
      meta: valueKnown ? undefined : "Add an estimated value in Edit",
      icon: Home,
      tone: "success",
    },
    {
      key: "loan",
      label: "Loan balance",
      value: money(property.loanBalance),
      icon: Landmark,
      tone: "warning",
    },
    {
      key: "equity",
      label: "Estimated equity",
      value: valueKnown ? money(property.equity) : "—",
      meta: valueKnown ? undefined : "Needs a current value",
      icon: Layers,
    },
    {
      key: "cost-base",
      label: "Cost base",
      value: money(costBase),
      meta: summaryQuery.data ? "Includes capital improvements" : undefined,
      icon: Scale,
    },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={PROPERTIES_ROOT}>
          <ArrowLeft />
          Properties
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{property.name}</h1>
              <PropertyStatusBadge status={property.status} />
            </div>
            {property.address && (
              <p className="truncate text-sm text-muted-foreground">{property.address}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)} disabled={disposed}>
            <Pencil />
            Edit
          </Button>
          {!disposed && (
            <Button variant="outline" onClick={() => setDisposeTarget(target)}>
              <Tag />
              Record sale
            </Button>
          )}
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteTarget(target)}
            disabled={disposed}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>

      <StatCards stats={stats} loading={statsLoading} />

      <PropertyTabs propertyId={property.id} active={tab} />

      {tab === "overview" && <OverviewTab property={property} />}
      {tab === "income" && <IncomeTab property={property} />}
      {tab === "expenses" && <ExpensesTab property={property} />}
      {tab === "loan" && <LoanTab property={property} />}
      {tab === "maintenance" && <MaintenanceTab property={property} />}
      {tab === "rental-schedule" && <RentalScheduleTab property={property} />}
      {tab === "cost-base" && <CostBaseTab property={property} />}
      {tab === "documents" && <DocumentsTab property={property} />}
      {tab === "use-history" && <UseHistoryTab property={property} />}
      {tab === "cgt" && <CgtTab property={property} />}

      <PropertyFormDialog
        open={editOpen}
        propertyId={property.id}
        onOpenChange={setEditOpen}
      />
      <DisposePropertyDialog
        property={disposeTarget}
        onOpenChange={(open) => !open && setDisposeTarget(null)}
      />
      <DeletePropertyDialog
        property={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={() => router.push(PROPERTIES_ROOT)}
      />
    </div>
  );
}
