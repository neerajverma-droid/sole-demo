"use client";

import * as React from "react";
import Link from "next/link";
import { useAtomValue } from "jotai";
import {
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  Map as MapIcon,
  Plus,
  Settings2,
} from "lucide-react";
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
import { Shimmer } from "@/components/ui/shimmer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/page-header";
import { InvoicePdfDialog } from "@/components/shared/invoice-pdf-dialog";
import { KmConvertToInvoiceDialog } from "@/components/km-tracker/km-convert-to-invoice-dialog";
import { KmStatsBand } from "@/components/km-tracker/km-stats-band";
import { KmTripDetailsDialog } from "@/components/km-tracker/km-trip-details-dialog";
import { KmTripTable } from "@/components/km-tracker/km-trip-table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useDeleteKmTripMutation,
  useKmFormat,
  useKmSettingsQuery,
  useKmStatsQuery,
  useKmTripsQuery,
} from "@/hooks/use-km-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import { kmFiltersAtom } from "@/lib/atoms";
import {
  activeKmFilterCount,
  DEFAULT_KM_FILTERS,
  formatKmDate,
  KM_PAGE_SIZE,
  type KmTrip,
} from "@/lib/km-tracker";

export const KM_ROOT = "/km-tracker";

/**
 * KM Tracker: the trip log and the claim it adds up to.
 *
 * Laid out as the design has it — header with Reports and New trip, the two
 * methods' totals in one band, then the filterable log. Settings sit beside
 * Reports in the header rather than only in the nav, because until a vehicle
 * is saved there's nothing else on this page anyone can do.
 */
export function KmTrackerScreen() {
  const settingsQuery = useKmSettingsQuery();
  const settings = settingsQuery.data;
  const setupComplete = !!settings?.isSetupComplete;

  const filters = useAtomValue(kmFiltersAtom);
  const debouncedSearch = useDebouncedValue(filters.search);
  const statsQuery = useKmStatsQuery({ ...filters, search: debouncedSearch });

  /*
   * No trips logged at all — the unfiltered first page, under the table's own
   * key, so it's the request the table makes (or already made) rather than
   * another. Filters that match nothing aren't this: the bar stays so they
   * can be reset. Nor is a load still in flight, or one that failed.
   */
  const unfilteredQuery = useKmTripsQuery(DEFAULT_KM_FILTERS, 1, KM_PAGE_SIZE);
  const isEmpty =
    activeKmFilterCount(filters) === 0 &&
    unfilteredQuery.isSuccess &&
    !unfilteredQuery.isPlaceholderData &&
    unfilteredQuery.data.total === 0;

  const [viewing, setViewing] = React.useState<KmTrip | null>(null);
  const [deleting, setDeleting] = React.useState<KmTrip | null>(null);
  const [converting, setConverting] = React.useState<KmTrip[] | null>(null);
  const [previewing, setPreviewing] = React.useState<KmTrip | null>(null);
  const deleteTrip = useDeleteKmTripMutation();
  const format = useKmFormat();

  const confirmDelete = () => {
    if (!deleting) return;
    const trip = deleting;
    deleteTrip.mutate(trip.id, {
      onSuccess: () => {
        toast.success("Trip deleted", {
          description: `${formatKmDate(trip.startTime)} · ${format.km(trip.distanceKm)} KM`,
        });
        setDeleting(null);
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, "Couldn't delete this trip.")),
    });
  };

  const newTripButton = (
    <Button
      asChild={setupComplete}
      disabled={!setupComplete}
      data-usertour="km-new-trip-button"
    >
      {setupComplete ? (
        <Link href={`${KM_ROOT}/new`}>
          <Plus />
          New trip
        </Link>
      ) : (
        <>
          <Plus />
          New trip
        </>
      )}
    </Button>
  );

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={MapIcon}
        title="KM Tracker"
        description="Track your business travel kilometres and convert them into billable entries."
      >
        <Button variant="outline" asChild data-usertour="km-settings-button">
          <Link href={`${KM_ROOT}/settings`}>
            <Settings2 />
            Settings
          </Link>
        </Button>
        <Button variant="outline" asChild data-usertour="km-reports-button">
          <Link href={`${KM_ROOT}/reports`}>
            <FileSpreadsheet />
            Reports
          </Link>
        </Button>
        {setupComplete ? (
          newTripButton
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button swallows hover — the span carries the tip. */}
              <span tabIndex={0}>{newTripButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              {settingsQuery.isLoading
                ? "Loading your KM settings…"
                : "Add a vehicle in settings before logging a trip"}
            </TooltipContent>
          </Tooltip>
        )}
      </PageHeader>

      {settingsQuery.isLoading ? (
        <Shimmer className="h-[88px] w-full rounded-lg border border-border" />
      ) : settingsQuery.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Couldn&apos;t load your KM settings, so new trips are paused.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => settingsQuery.refetch()}
            disabled={settingsQuery.isFetching}
          >
            {settingsQuery.isFetching && <Loader2 className="animate-spin" />}
            Try again
          </Button>
        </div>
      ) : !setupComplete ? (
        <section className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
              aria-hidden
            >
              <Settings2 className="size-5" />
            </span>
            <div className="space-y-1">
              <h2 className="font-semibold">Set up KM Tracker first</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Choose your calculation method and add at least one vehicle.
                New trips stay switched off until a vehicle is saved — the
                odometer and the annual claim cap are both tracked per vehicle.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0">
            <Link href={`${KM_ROOT}/settings`}>
              Go to settings
              <ArrowRight />
            </Link>
          </Button>
        </section>
      ) : null}

      {/* The setup card above stays — it's the way to the first trip — but
          two methods' worth of zeroes add nothing to "No trips yet". */}
      {!isEmpty && (
        <KmStatsBand
          stats={statsQuery.data}
          loading={statsQuery.isLoading || statsQuery.isPlaceholderData}
          error={statsQuery.isError}
          onRetry={() => statsQuery.refetch()}
        />
      )}

      <KmTripTable
        empty={isEmpty}
        canCreate={setupComplete}
        onView={setViewing}
        onDelete={setDeleting}
        onConvert={setConverting}
        onPreviewInvoice={setPreviewing}
      />

      <KmTripDetailsDialog
        trip={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !deleteTrip.isPending && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${formatKmDate(deleting.startTime)} · ${deleting.startLocation || "—"} to ${deleting.endLocation || "—"}. `
                : ""}
              It comes out of your trip log, totals and reports. This can&apos;t
              be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTrip.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTrip.isPending}
              onClick={(event) => {
                // Stay open until the request lands, so a failure is seen here.
                event.preventDefault();
                confirmDelete();
              }}
            >
              {deleteTrip.isPending && <Loader2 className="animate-spin" />}
              Delete trip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KmConvertToInvoiceDialog
        trips={converting}
        billableRatePerKm={settings?.billableRatePerKm ?? 0}
        onClose={() => setConverting(null)}
      />

      <InvoicePdfDialog
        open={previewing !== null}
        onOpenChange={(open) => !open && setPreviewing(null)}
        invoice={
          previewing?.invoiceId
            ? {
                id: previewing.invoiceId,
                number: previewing.invoiceNo,
                templateId: previewing.invoiceTemplateId ?? "1",
                status: previewing.invoiceStatus === "paid" ? "Paid" : "Outstanding",
              }
            : undefined
        }
      />
    </div>
  );
}
