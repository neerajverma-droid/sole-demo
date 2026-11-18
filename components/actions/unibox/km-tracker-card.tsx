"use client";

import * as React from "react";
import { Map as MapIcon } from "lucide-react";
import { toast } from "sonner";

import {
  CardAddButton,
  CardFigure,
  CardRow,
  CardRows,
  RowAction,
  UniboxCard,
} from "@/components/actions/unibox/unibox-ui";
import { KmConvertToInvoiceDialog } from "@/components/km-tracker/km-convert-to-invoice-dialog";
import { KmTripDetailsDialog } from "@/components/km-tracker/km-trip-details-dialog";
import { useKmSettingsQuery } from "@/hooks/use-km-tracker-query";
import { useRefreshUnibox, useUniboxQuery } from "@/hooks/use-unibox-query";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchKmTrip, type KmTrip } from "@/lib/km-tracker";
import { toNumber, type UniboxTrip } from "@/lib/unibox";
import { isDemoRow, showSampleNotice } from "@/lib/unibox-demo";
import {
  fullTripTitle,
  isTripReadyToInvoice,
  kmRows,
  kmTripFor,
  totalKm as kmTotal,
  tripId,
  tripSub,
  tripTitle,
} from "@/lib/unibox-rules";

/** KmTrackerCard.js: three trips, ready-to-invoice first; Invoice them or View them. */
export function KmTrackerCard() {
  const refresh = useRefreshUnibox();
  const query = useUniboxQuery("kmTracker");
  const settings = useKmSettingsQuery();
  const [invoicing, setInvoicing] = React.useState<KmTrip[] | null>(null);
  const [viewing, setViewing] = React.useState<KmTrip | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const trips = React.useMemo(() => kmRows(query.data ?? []), [query.data]);
  const totalKm = kmTotal(trips);

  const view = async (trip: UniboxTrip) => {
    const id = tripId(trip);
    setBusy(id);
    try {
      setViewing(await fetchKmTrip(id));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't open that trip."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <UniboxCard
      icon={MapIcon}
      title="KM tracker"
      tourId="quick-actions-km"
      sample={query.isDemo}
      count={trips.length}
      loading={query.isLoading}
      action={<CardAddButton label="Log trip" href="/km-tracker/new" />}
    >
      {!query.isLoading && trips.length > 0 ? (
        <CardFigure value={`${totalKm.toFixed(1)} km`} label="logged" />
      ) : null}
      <CardRows loading={query.isLoading} empty={trips.length === 0} emptyText="No trips to classify">
        {trips.map((trip, index) => {
          const id = tripId(trip);
          const ready = isTripReadyToInvoice(trip);
          return (
            <CardRow
              key={id}
              tourId={index === 0 ? "quick-actions-km-row" : undefined}
              icon={MapIcon}
              title={tripTitle(trip)}
              titleTitle={fullTripTitle(trip)}
              sub={tripSub(trip)}
              action={
                <RowAction
                  label={ready ? "Invoice" : "View"}
                  busy={busy === id}
                  onClick={() => {
                    if (isDemoRow(trip)) {
                      showSampleNotice();
                      return;
                    }
                    if (ready) setInvoicing([kmTripFor(trip)]);
                    else void view(trip);
                  }}
                />
              }
            />
          );
        })}
      </CardRows>

      <KmConvertToInvoiceDialog
        trips={invoicing}
        billableRatePerKm={toNumber(settings.data?.billableRatePerKm)}
        onClose={() => {
          setInvoicing(null);
          void refresh("kmTracker");
        }}
      />
      <KmTripDetailsDialog trip={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </UniboxCard>
  );
}
