"use client";

import { useQuery } from "@tanstack/react-query";

import {
  BookingCard,
  BookingPage,
  BookingProblem,
} from "@/components/public-booking/booking-shell";
import { CancelStep } from "@/components/public-booking/cancel-step";
import { fetchPublicBookingDetail } from "@/lib/public-booking";

/**
 * `/booking/cancel?id=<booking>` — the cancel link in the confirmation
 * email. The old page's own screen: no host panel, just the booking and the
 * choice.
 */
export function PublicCancelScreen({ bookingId }: { bookingId: string | undefined }) {
  const detailQuery = useQuery({
    queryKey: ["public-booking", "booking", bookingId],
    queryFn: () => fetchPublicBookingDetail(bookingId as string),
    enabled: Boolean(bookingId),
    retry: false,
  });

  if (!bookingId) {
    return (
      <BookingProblem
        title="Nothing to cancel"
        message="This cancel link is missing its booking. Use the link from your confirmation email."
      />
    );
  }

  return (
    <BookingPage>
      <div className="mx-auto max-w-xl">
        <BookingCard>
          <CancelStep
            bookingId={bookingId}
            detail={detailQuery.data}
            loading={detailQuery.isPending}
            error={
              detailQuery.isError
                ? "This booking couldn't be found, or it's already been cancelled."
                : null
            }
            backLabel="Keep booking"
          />
        </BookingCard>
      </div>
    </BookingPage>
  );
}
