"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useKmFormat } from "@/hooks/use-km-tracker-query";
import {
  formatKmDateTime,
  formatKmDuration,
  kmReasonLabel,
  kmTripTypeLabel,
  type KmTrip,
} from "@/lib/km-tracker";
import { cn } from "@/lib/utils";

/**
 * A trip read back in full — sole-webapp's `TripDetailsDialog`, grouped into
 * the journey, the money and the paperwork so it scans in that order. Opened
 * from the list's own row, which already carries every field the detail
 * endpoint returns (both come from sole-ocr's `formatTripResponse`).
 */
export function KmTripDetailsDialog({
  trip,
  onOpenChange,
}: {
  trip: KmTrip | null;
  onOpenChange: (open: boolean) => void;
}) {
  const format = useKmFormat();
  const expenses = trip
    ? (
        [
          ["Toll", trip.tollAmount],
          ["Parking", trip.parkingAmount],
          ["Fuel", trip.fuelCost],
          ["Other", trip.otherExpenses],
        ] as const
      ).filter(([, amount]) => amount > 0)
    : [];

  return (
    <Dialog open={trip !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trip details</DialogTitle>
          <DialogDescription>
            {trip ? formatKmDateTime(trip.startTime) : ""}
          </DialogDescription>
        </DialogHeader>

        {trip && (
          <div className="space-y-5 text-sm">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Stop tone="start" label="From" place={trip.startLocation} />
              <Stop tone="end" label="To" place={trip.endLocation} />
            </div>

            <Rows
              rows={[
                ["Ended", formatKmDateTime(trip.endTime)],
                ["Duration", formatKmDuration(trip.durationMinutes, trip.startTime, trip.endTime)],
                ["Vehicle", trip.vehicle || "—"],
                ["Purpose", kmReasonLabel(trip.reason)],
                ["Trip type", kmTripTypeLabel(trip.tripType)],
                ["Method", format.method(trip.calculationMethod)],
                ["Distance", `${format.km(trip.distanceKm)} KM`],
                ...(trip.odometerStart !== null || trip.odometerEnd !== null
                  ? ([
                      [
                        "Odometer",
                        `${trip.odometerStart ?? "—"} → ${trip.odometerEnd ?? "—"}`,
                      ],
                    ] as [string, string][])
                  : []),
              ]}
            />

            {trip.tripType === "split" && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 font-medium">Split allocation</p>
                <Rows
                  rows={[
                    [
                      "Business",
                      `${format.percent(trip.businessPercentage)} · ${format.km(trip.deductibleKm)} KM`,
                    ],
                    [
                      "Personal",
                      `${format.percent(trip.personalPercentage)} · ${format.km(Math.max(0, trip.distanceKm - trip.deductibleKm))} KM`,
                    ],
                  ]}
                />
              </div>
            )}

            <Rows
              rows={[
                ...expenses.map(
                  ([label, amount]) => [label, format.money(amount)] as [string, string],
                ),
                ["Total amount", format.money(trip.totalAmount)],
                ...(trip.calculationMethod === "kilometre_rate" && trip.rateYear
                  ? ([
                      [
                        "Rates",
                        `${trip.rateYear}${trip.rateProvisional ? " (provisional)" : ""}`,
                      ],
                    ] as [string, string][])
                  : []),
                ["Estimated deduction", format.money(trip.estimatedDeduction)],
              ]}
              emphasiseLast
            />

            <Rows
              rows={[
                ["Billable", trip.isBillable ? "Yes" : "No"],
                ["Client", trip.clientName || "—"],
                ...(trip.projectName
                  ? ([["Project", trip.projectName]] as [string, string][])
                  : []),
                ...(trip.jobName ? ([["Job", trip.jobName]] as [string, string][]) : []),
                ...(trip.invoiceNo
                  ? ([["Invoice", trip.invoiceNo]] as [string, string][])
                  : []),
              ]}
            />

            {trip.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {trip.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {trip.notes && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap">{trip.notes}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {trip && (
            <Button asChild>
              <Link href={`/km-tracker/${trip.id}/edit`}>
                <Pencil />
                Edit trip
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stop({
  tone,
  label,
  place,
}: {
  tone: "start" | "end";
  label: string;
  place: string;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          tone === "start" ? "bg-success" : "bg-primary",
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words">{place || "—"}</p>
      </div>
    </div>
  );
}

function Rows({
  rows,
  emphasiseLast,
}: {
  rows: [string, string][];
  emphasiseLast?: boolean;
}) {
  return (
    <dl className="divide-y divide-border">
      {rows.map(([label, value], index) => (
        <div
          key={label}
          className={cn(
            "flex items-start justify-between gap-4 py-1.5",
            emphasiseLast && index === rows.length - 1 && "font-semibold",
          )}
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
