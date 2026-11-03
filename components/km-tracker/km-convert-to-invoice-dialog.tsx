"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraftInvoicesDialog } from "@/components/shared/draft-invoices-dialog";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { useKmFormat, useLinkKmTripsMutation } from "@/hooks/use-km-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import { documentTax, taxWord } from "@/lib/country-context";
import {
  draftInvoicesQueryKey,
  fetchDraftInvoices,
  type DraftInvoiceSummary,
} from "@/lib/invoice-drafts";
import type { InvoiceSeed } from "@/lib/invoices";
import {
  kmInvoiceLines,
  kmInvoiceTotal,
  type KmTrip,
} from "@/lib/km-tracker";

type Choice = { mode: "new" } | { mode: "draft"; draft: DraftInvoiceSummary };

/**
 * Billable trips onto an invoice, over the list rather than away from it —
 * sole-webapp's TripTable flow, run with this app's own pieces: the shared
 * draft chooser scoped to the trips' client, then `InvoiceEditor` embedded
 * with the trips as its lines. Once the invoice saves, each trip is linked to
 * it so it stops offering to be invoiced again.
 *
 * The lines carry no tax, as they always have. A business that charges tax
 * can tick it on for these lines here (re-billed travel is usually a taxable
 * supply) — off by default, and only offered when the business charges it.
 */
export function KmConvertToInvoiceDialog({
  trips,
  billableRatePerKm,
  onClose,
}: {
  /** The trips being invoiced, or null when closed. All share one client. */
  trips: KmTrip[] | null;
  billableRatePerKm: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const linkTrips = useLinkKmTripsMutation();
  const kmFormat = useKmFormat();
  const [choice, setChoice] = React.useState<Choice | null>(null);
  const [chargeTax, setChargeTax] = React.useState(false);
  const tax = documentTax(kmFormat.country, format(new Date(), "yyyy-MM-dd"));

  const open = trips !== null && trips.length > 0;
  const first = trips?.[0];
  const clientId = first?.clientId ?? null;

  const draftsQuery = useQuery({
    queryKey: draftInvoicesQueryKey(clientId),
    queryFn: () => fetchDraftInvoices(clientId),
    // Without a client there's no "this client's drafts" to offer — straight
    // to a new invoice, where the client gets picked.
    enabled: open && clientId !== null,
    staleTime: 0,
  });

  const close = React.useCallback(() => {
    setChoice(null);
    setChargeTax(false);
    onClose();
  }, [onClose]);

  const seed = React.useMemo<InvoiceSeed | null>(() => {
    if (!trips || trips.length === 0) return null;
    return {
      description:
        trips.length === 1 ? "Business travel" : `Business travel — ${trips.length} trips`,
      items: kmInvoiceLines(trips, billableRatePerKm, tax.offered && chargeTax),
      clientId: trips[0].clientId,
      clientName: trips[0].clientName,
    };
  }, [trips, billableRatePerKm, tax.offered, chargeTax]);

  const drafts = draftsQuery.data ?? [];
  const checking = open && clientId !== null && draftsQuery.isLoading;
  const choosing = open && !checking && choice === null && drafts.length > 0;
  const editing = open && !checking && !choosing;
  const targetDraft = choice?.mode === "draft" ? choice.draft : null;

  const totalKm = (trips ?? []).reduce((sum, trip) => sum + trip.deductibleKm, 0);
  const amount = seed ? kmInvoiceTotal(seed.items) : 0;
  const summary = trips
    ? `${trips.length} ${trips.length === 1 ? "trip" : "trips"} · ${kmFormat.km(totalKm)} KM · ${kmFormat.money(amount)}${first?.clientName ? ` · ${first.clientName}` : ""}`
    : "";

  const handleSaved = async (saved: { id: string; number: string }) => {
    if (!trips) return;
    try {
      await linkTrips.mutateAsync({
        tripIds: trips.map((trip) => trip.id),
        invoice: saved,
      });
      toast.success(`${saved.number} saved`, {
        description: `${trips.length === 1 ? "The trip is" : `All ${trips.length} trips are`} now linked to it.`,
      });
    } catch (error) {
      // The invoice itself is fine — say exactly what didn't happen.
      toast.error(
        apiErrorMessage(
          error,
          `${saved.number} was created, but couldn't be linked back to these trips.`,
        ),
      );
    }
    queryClient.invalidateQueries({ queryKey: draftInvoicesQueryKey(clientId) });
    close();
  };

  return (
    <>
      <Dialog open={checking} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Convert to invoice</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <p className="text-sm">Checking for draft invoices…</p>
          </div>
        </DialogContent>
      </Dialog>

      <DraftInvoicesDialog
        open={choosing}
        onOpenChange={(next) => !next && close()}
        clientId={clientId}
        clientName={first?.clientName}
        onUseInvoice={(draft) => setChoice({ mode: "draft", draft })}
        onCreateNew={() => setChoice({ mode: "new" })}
      />

      <Dialog open={editing} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex max-h-[92svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>
              {targetDraft ? `Add to ${targetDraft.number}` : "Convert to invoice"}
            </DialogTitle>
            <DialogDescription>
              {targetDraft ? `${summary} — added as new lines on this draft.` : summary}
              {seed && seed.items.length === 0 && (
                <span className="mt-1 block text-warning">
                  These logbook trips have no costs to bill, so the invoice opens
                  with a blank line for you to fill in.
                </span>
              )}
            </DialogDescription>
            {tax.offered && seed && seed.items.length > 0 && (
              <label className="mt-2 flex w-fit items-center gap-2 text-sm">
                <Checkbox
                  checked={chargeTax}
                  onCheckedChange={(checked) => setChargeTax(checked === true)}
                />
                Charge {taxWord(kmFormat.country)} on these lines
                <span className="text-xs text-muted-foreground">(rebuilds the lines)</span>
              </label>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {editing && seed && (
              <InvoiceEditor
                key={`${(trips ?? []).map((trip) => trip.id).join("-")}:${targetDraft?.id ?? "new"}:${chargeTax ? "tax" : "no-tax"}`}
                seed={seed}
                invoiceId={targetDraft?.id}
                embedded
                onClose={close}
                onSaved={handleSaved}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
