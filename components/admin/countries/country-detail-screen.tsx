"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Globe2, Send, Settings2, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { CountryStatusDialog } from "@/components/admin/countries/country-status-dialog";
import { FeaturesTab } from "@/components/admin/countries/features-tab";
import { HistoryTab } from "@/components/admin/countries/history-tab";
import { OverviewTab } from "@/components/admin/countries/overview-tab";
import { PublishDialog } from "@/components/admin/countries/publish-dialog";
import { TaxRatesTab } from "@/components/admin/countries/tax-rates-tab";
import { ThresholdsTab } from "@/components/admin/countries/thresholds-tab";
import {
  useAdminCountryQuery,
  useDiscardCountryDraftMutation,
} from "@/hooks/use-admin-countries-query";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCount } from "@/lib/admin/format";
import { countryStatusPill } from "@/lib/admin/countries";

/**
 * One country: everything a business there is priced and worded from.
 *
 * The banner at the top is the point of the screen. Staged changes are
 * invisible to every business until someone publishes, which is the safe
 * default — and also the way a change gets forgotten halfway. So an unpublished
 * draft is stated at the top of every tab, with the two ways out of it.
 */
export function CountryDetailScreen({ iso2 }: { iso2: string }) {
  const { isSuperAdmin } = useAdminAccess();
  const query = useAdminCountryQuery(iso2);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);

  const detail = query.data;

  if (query.isError) {
    return (
      <Empty>
        <EmptyMedia>
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load {iso2}</EmptyTitle>
        <EmptyDescription>
          {apiErrorMessage(query.error, "The country request didn't complete.")}
        </EmptyDescription>
        <EmptyActions>
          <Button onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Trying again…" : "Try again"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/countries">Back to countries</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-[15px]">
        <Shimmer className="h-16 w-full max-w-md" />
        <Shimmer className="h-10 w-full max-w-lg" />
        <Shimmer className="h-64 w-full" />
      </div>
    );
  }

  const status = countryStatusPill(detail.effective.status);
  const name = detail.effective.name;

  return (
    <div className="space-y-[15px]">
      <Link
        href="/admin/countries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Countries
      </Link>

      <PageHeader
        icon={Globe2}
        title={name}
        description={`${detail.effective.tax_type} · ${detail.effective.tax_authority} · ${formatCount(detail.impact.businesses)} ${detail.impact.businesses === 1 ? "business" : "businesses"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={status.label} tone={status.tone} />
          <Button variant="outline" onClick={() => setStatusOpen(true)}>
            <Settings2 />
            Status
          </Button>
          <Button onClick={() => setPublishOpen(true)}>
            <Send />
            Publish
          </Button>
        </div>
      </PageHeader>

      {detail.hasDraft || detail.taxRates.some((rate) => rate.state === "staged") || detail.thresholds.some((threshold) => threshold.state === "staged") ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="flex items-start gap-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              <span className="font-medium">{name} has unpublished changes.</span>{" "}
              <span className="text-muted-foreground">
                No business sees them until you publish. Review what they are, and who they reach,
                in the publish dialog.
              </span>
            </span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDiscardOpen(true)}>
              <Undo2 />
              Discard
            </Button>
            <Button size="sm" onClick={() => setPublishOpen(true)}>
              Review and publish
            </Button>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rates">Tax rates</TabsTrigger>
          <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <OverviewTab
            iso2={iso2}
            config={detail.config}
            effective={detail.effective}
            hasDraft={detail.hasDraft}
            rates={detail.taxRates}
          />
        </TabsContent>

        <TabsContent value="rates" className="pt-4">
          <TaxRatesTab
            iso2={iso2}
            country={name}
            taxType={detail.effective.tax_type}
            rates={detail.taxRates}
            isSuperAdmin={isSuperAdmin}
          />
        </TabsContent>

        <TabsContent value="thresholds" className="pt-4">
          <ThresholdsTab
            iso2={iso2}
            country={name}
            currency={detail.effective.currency}
            thresholds={detail.thresholds}
            isSuperAdmin={isSuperAdmin}
          />
        </TabsContent>

        <TabsContent value="features" className="pt-4">
          <FeaturesTab iso2={iso2} config={detail.config} effective={detail.effective} />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <HistoryTab
            iso2={iso2}
            country={name}
            versions={detail.versions}
            isSuperAdmin={isSuperAdmin}
          />
        </TabsContent>
      </Tabs>

      <PublishDialog iso2={iso2} country={name} open={publishOpen} onOpenChange={setPublishOpen} />
      <CountryStatusDialog
        iso2={iso2}
        country={name}
        current={detail.effective.status}
        businesses={detail.impact.businesses}
        open={statusOpen}
        onOpenChange={setStatusOpen}
      />
      <DiscardDraftDialog
        iso2={iso2}
        country={name}
        open={discardOpen}
        onOpenChange={setDiscardOpen}
      />
    </div>
  );
}

function DiscardDraftDialog({
  iso2,
  country,
  open,
  onOpenChange,
}: {
  iso2: string;
  country: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const discard = useDiscardCountryDraftMutation(iso2);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !discard.isPending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard the changes staged for {country}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every staged rate, threshold and settings change is thrown away. Nothing published is
            touched, and no business is affected either way — but the staged work can&apos;t be
            recovered.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={discard.isPending}>Keep them</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={discard.isPending}
            onClick={(event) => {
              event.preventDefault();
              discard.mutate(undefined, {
                onSuccess: () => {
                  toast.success(`Staged changes for ${country} discarded`);
                  onOpenChange(false);
                },
                onError: (error) =>
                  toast.error(apiErrorMessage(error, "The draft couldn't be discarded.")),
              });
            }}
          >
            {discard.isPending ? "Discarding…" : "Discard changes"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
