"use client";

import * as React from "react";
import { CalendarX2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cancelPublicBooking, type PublicBookingDetail } from "@/lib/public-booking";

/**
 * Cancelling a booking from a guest's link — the old CancelPanel and the
 * standalone cancel page share this. The host gets an email, and the
 * calendar event goes too.
 */
export function CancelStep({
  bookingId,
  detail,
  loading,
  error,
  onBack,
  backLabel,
  doneAction,
}: {
  bookingId: string;
  detail: PublicBookingDetail | undefined;
  loading: boolean;
  error: string | null;
  onBack?: () => void;
  backLabel: string;
  /** What to offer once it's cancelled — book again, or nothing. */
  doneAction?: React.ReactNode;
}) {
  const [reason, setReason] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelled, setCancelled] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const cancel = async () => {
    setCancelling(true);
    setFailure(null);
    try {
      await cancelPublicBooking(bookingId, reason);
      setCancelled(true);
      toast.success("Booking cancelled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't cancel this booking.";
      setFailure(message);
      toast.error(message);
    } finally {
      setCancelling(false);
    }
  };

  if (cancelled) {
    return (
      <div className="mx-auto max-w-md py-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success">
          <Check className="size-7" strokeWidth={2.6} />
        </span>
        <h2 className="mt-4 text-xl font-semibold">Booking cancelled</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          It&apos;s been removed from the calendar, and the host has been told.
        </p>
        {doneAction && <div className="mt-6 flex justify-center">{doneAction}</div>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-6 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
        <CalendarX2 className="size-6" />
      </span>
      <h2 className="mt-4 text-xl font-semibold">Cancel this booking?</h2>

      {loading ? (
        <div className="mx-auto mt-3 max-w-xs space-y-2">
          <Skeleton className="mx-auto h-4 w-48" />
          <Skeleton className="mx-auto h-4 w-36" />
        </div>
      ) : error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {detail?.name ? (
            <>
              The booking for <span className="font-medium text-foreground">{detail.name}</span>
              {detail.email && <> ({detail.email})</>} will be cancelled.
            </>
          ) : (
            "This booking will be cancelled."
          )}{" "}
          If you just need a different time, reschedule it instead.
        </p>
      )}

      {!error && (
        <div className="mt-5 space-y-1.5 text-left">
          <Label htmlFor="cancel-reason">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Let the host know why…"
          />
        </div>
      )}

      {failure && <p className="mt-3 text-sm text-destructive">{failure}</p>}

      <div className="mt-6 flex justify-center gap-2">
        {onBack && (
          <Button variant="outline" onClick={onBack} disabled={cancelling}>
            {backLabel}
          </Button>
        )}
        {!error && (
          <Button
            variant="destructive"
            onClick={() => void cancel()}
            disabled={cancelling || loading}
          >
            {cancelling && <Loader2 className="animate-spin" />}
            Yes, cancel booking
          </Button>
        )}
      </div>
    </div>
  );
}
