"use client";

import * as React from "react";
import { Download, Loader2, Receipt, Scale, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import {
  ModuleCard,
  ModuleEmpty,
  Loadable,
  usePropertyMoney,
} from "@/components/investment-property/module-shared";
import {
  useAccountantExportMutation,
  useCgtBreakdownQuery,
  useCgtTaxImpactQuery,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatPropertyDate, type Property } from "@/lib/investment-property";
import { accountantExportFileName, type CgtBreakdown } from "@/lib/investment-property-cgt";
import { cn } from "@/lib/utils";

function Line({
  label,
  value,
  strong,
  negative,
}: {
  label: string;
  value: string;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-t border-border py-2.5 first:border-t-0",
        strong && "font-semibold",
      )}
    >
      <dt className={cn("text-sm", !strong && "text-muted-foreground")}>{label}</dt>
      <dd className={cn("text-sm tabular", negative && "text-destructive")}>{value}</dd>
    </div>
  );
}

function downloadJson(payload: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function TaxImpactCard({ propertyId, cgt }: { propertyId: string; cgt: CgtBreakdown }) {
  const money = usePropertyMoney();
  const query = useCgtTaxImpactQuery(propertyId, !cgt.calculationLimited);

  if (cgt.calculationLimited) {
    return (
      <ModuleCard title="Estimated tax impact" description="Not available for this property's tax treatment.">
        <p className="text-sm text-muted-foreground">
          Sole doesn&apos;t estimate tax for main-residence or mixed-use properties yet. Ask your accountant to
          review the use history and the figures above.
        </p>
      </ModuleCard>
    );
  }

  return (
    <ModuleCard
      title="Estimated tax impact"
      description="The taxable gain multiplied by your latest tax rate in Sole."
    >
      {query.isLoading ? (
        <Shimmer className="h-20 w-full rounded-md" />
      ) : query.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <span className="text-destructive">
            {apiErrorMessage(query.error, "Couldn't estimate the tax impact.")}
          </span>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.data ? (
        <div className="space-y-3">
          {query.data.available && query.data.estimatedTax !== null ? (
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estimated tax
              </p>
              <p className="mt-1 text-2xl font-semibold tabular">
                {money(query.data.estimatedTax)}
              </p>
              {query.data.ratePercentage !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  At a {query.data.ratePercentage}% tax rate
                </p>
              )}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">{query.data.message}</p>
        </div>
      ) : null}
    </ModuleCard>
  );
}

export function CgtTab({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const disposed = property.status === "disposed";
  const query = useCgtBreakdownQuery(property.id, disposed);
  const exportQuery = useAccountantExportMutation(property.id);

  if (!disposed) {
    return (
      <ModuleCard title="Capital gains tax" description="Your CGT estimate appears once the property is sold.">
        <ModuleEmpty
          icon={<Scale aria-hidden />}
          title="No sale recorded"
          description="Record the sale to see the capital gain, any CGT discount and an estimate of the tax."
        />
      </ModuleCard>
    );
  }

  const onExport = () =>
    exportQuery.mutate(undefined, {
      onSuccess: (payload) => {
        downloadJson(payload, accountantExportFileName(property.name));
        toast.success("Accountant export downloaded");
      },
      onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't prepare the export.")),
    });

  return (
    <Loadable query={query} skeletonClassName="h-80">
      {(cgt) => {
        const loss = cgt.grossLoss > 0;
        const stats: StatCard[] = [
          {
            key: "gain",
            label: loss ? "Capital loss" : "Capital gain",
            value: money(loss ? cgt.grossLoss : cgt.grossGain),
            meta: "Before any CGT discount",
            icon: Scale,
            tone: loss ? "danger" : "success",
          },
          {
            key: "discount",
            label: "CGT discount",
            value: cgt.discountEligible ? `${cgt.discountPercentage}%` : "None",
            meta: cgt.discountEligible ? money(cgt.discountAmount) : "Not applied",
            icon: Receipt,
            tone: "primary",
          },
          {
            key: "taxable",
            label: "Estimated taxable gain",
            value: cgt.taxableGain === null ? "Not calculated" : money(cgt.taxableGain),
            meta: "After discount",
            icon: Scale,
            tone: "warning",
          },
        ];

        return (
          <div className="space-y-4">
            {(cgt.reviewRequired || cgt.warnings.length > 0) && (
              <Alert>
                <TriangleAlert className="size-4" aria-hidden />
                <AlertTitle>Review this estimate with your accountant</AlertTitle>
                <AlertDescription className="space-y-2">
                  {cgt.warnings.length > 0 ? (
                    cgt.warnings.map((message) => <p key={message}>{message}</p>)
                  ) : (
                    <p>Your use history needs a review before relying on this estimate.</p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <StatCards stats={stats} />

            <div className="grid gap-4 lg:grid-cols-2">
              <ModuleCard title="Sale">
                <dl>
                  <Line label="Sale date" value={formatPropertyDate(cgt.disposalDate)} />
                  <Line label="Sale price" value={money(cgt.salePrice)} />
                  <Line label="Selling costs" value={money(cgt.sellingCosts)} />
                  <Line label="Net sale proceeds" value={money(cgt.netProceeds)} strong />
                </dl>
              </ModuleCard>

              <ModuleCard title="Cost base">
                <dl>
                  <Line label="Purchase price" value={money(cgt.purchasePrice)} />
                  <Line label="Stamp duty" value={money(cgt.stampDuty)} />
                  <Line label="Legal / settlement" value={money(cgt.legalCosts)} />
                  <Line label="Buyer agent / acquisition" value={money(cgt.buyerAgentCosts)} />
                  <Line label="Capital improvements" value={money(cgt.capitalImprovements)} />
                  <Line label="Total cost base" value={money(cgt.totalCostBase)} strong />
                </dl>
              </ModuleCard>
            </div>

            <ModuleCard
              title="CGT discount"
              description="Whether a discount applies depends on how long the property was held and who owns it."
              action={
                <Badge variant={cgt.discountEligible ? "success" : "secondary"}>
                  {cgt.discountEligible ? "Eligible" : "Not applied"}
                </Badge>
              }
            >
              <dl>
                <Line label="Held for more than 12 months" value={cgt.heldOverTwelveMonths ? "Yes" : "No"} />
                <Line label="Ownership entity eligible" value={cgt.entityEligible ? "Yes" : "No"} />
                <Line
                  label="Discount amount"
                  value={money(cgt.discountAmount)}
                />
              </dl>
              {cgt.discountReason && <p className="text-sm text-muted-foreground">{cgt.discountReason}</p>}
            </ModuleCard>

            <TaxImpactCard propertyId={property.id} cgt={cgt} />

            <ModuleCard
              title="Accountant export"
              description="Download the property, sale, cost base, use history and CGT estimate as one file to hand to your accountant."
              action={
                <Button size="sm" variant="outline" onClick={onExport} disabled={exportQuery.isPending}>
                  {exportQuery.isPending ? <Loader2 className="animate-spin" /> : <Download />}
                  Download export
                </Button>
              }
            >
              {cgt.disclaimer && <p className="text-xs leading-relaxed text-muted-foreground">{cgt.disclaimer}</p>}
            </ModuleCard>
          </div>
        );
      }}
    </Loadable>
  );
}
