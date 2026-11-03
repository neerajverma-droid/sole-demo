"use client";

import * as React from "react";
import { AlignLeft, Clock, Globe, Link2, Loader2, MapPin, User, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DetailRow, GoogleMeetMark, StatusBadge } from "@/components/booking-links/booking-ui";
import { apiErrorMessage } from "@/lib/api-error";
import { cancelBooking } from "@/lib/booking-links-api";
import {
  bookingStatus,
  bookingWhen,
  isGoogleMeetLink,
  type BookingEvent,
} from "@/lib/booking-links";

/**
 * Cancel a booking: the guest gets a cancellation email with the reason, and
 * the Google event goes too. Shared by the details dialog and the list's
 * own Cancel button.
 */
export function CancelBookingDialog({
  booking,
  onOpenChange,
  onCancelled,
}: {
  booking: BookingEvent | null;
  onOpenChange: (open: boolean) => void;
  onCancelled: (booking: BookingEvent) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);

  React.useEffect(() => {
    if (booking) setReason("");
  }, [booking]);

  const confirm = async () => {
    if (!booking?.bookingId) return;
    setCancelling(true);
    try {
      await cancelBooking(booking.bookingId, reason);
      toast.success("Booking cancelled");
      onCancelled(booking);
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to cancel booking"));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AlertDialog open={Boolean(booking)} onOpenChange={(open) => !cancelling && onOpenChange(open)}>
      <AlertDialogContent className="sm:max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel booking?</AlertDialogTitle>
          <AlertDialogDescription>
            The booking with{" "}
            <span className="font-medium text-foreground">{booking?.guestName}</span> will be
            cancelled and they&apos;ll get a cancellation email. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="cancel-reason" className="text-sm font-medium">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. I have a conflict at this time…"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>Keep booking</AlertDialogCancel>
          <Button variant="destructive" onClick={() => void confirm()} disabled={cancelling}>
            {cancelling && <Loader2 className="animate-spin" />}
            Cancel booking
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BookingDetailsDialog({
  booking,
  onClose,
  onReschedule,
  onCancel,
}: {
  booking: BookingEvent | null;
  onClose: () => void;
  onReschedule: (booking: BookingEvent) => void;
  onCancel: (booking: BookingEvent) => void;
}) {
  // Keep the last booking on screen while the dialog animates out.
  const [shown, setShown] = React.useState<BookingEvent | null>(booking);
  React.useEffect(() => {
    if (booking) setShown(booking);
  }, [booking]);

  const status = shown ? bookingStatus(shown) : "past";
  const when = shown ? bookingWhen(shown) : null;
  const actionable = Boolean(shown?.bookingId) && status === "upcoming";

  return (
    <Dialog open={Boolean(booking)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 sm:max-w-[480px]">
        {shown && when && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2.5 pr-8">
              <DialogTitle className="min-w-0 flex-1 text-lg font-semibold">
                {shown.guestName}
              </DialogTitle>
              <StatusBadge status={shown.pending ? "pending" : status} />
            </div>
            <DialogDescription className="sr-only">Booking details</DialogDescription>

            <div>
              <DetailRow icon={Link2} label="Booking link">
                {shown.linkTitle}
              </DetailRow>
              <DetailRow icon={Clock} label="When">
                {when.long}
              </DetailRow>
              <DetailRow icon={User} label="Guest">
                {shown.guestEmail ? (
                  <a href={`mailto:${shown.guestEmail}`} className="hover:underline">
                    {shown.guestEmail}
                  </a>
                ) : (
                  shown.guestName
                )}
              </DetailRow>
              {shown.meetingLink && (
                <DetailRow
                  icon={Video}
                  label={isGoogleMeetLink(shown.meetingLink) ? "Google Meet" : "Meeting"}
                >
                  <a
                    href={shown.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[13px] font-medium hover:bg-accent"
                  >
                    {isGoogleMeetLink(shown.meetingLink) && <GoogleMeetMark className="size-4" />}
                    {isGoogleMeetLink(shown.meetingLink) ? "Join with Google Meet" : "Join meeting"}
                  </a>
                  <p className="mt-1 break-all text-xs font-normal text-muted-foreground">
                    {shown.meetingLink}
                  </p>
                </DetailRow>
              )}
              {shown.location && (
                <DetailRow icon={MapPin} label="Location">
                  {shown.location}
                </DetailRow>
              )}
              {shown.timeZone && (
                <DetailRow icon={Globe} label="Guest timezone">
                  {shown.timeZone}
                </DetailRow>
              )}
              {shown.description && (
                <DetailRow icon={AlignLeft} label="Notes">
                  <span className="whitespace-pre-wrap font-normal">{shown.description}</span>
                </DetailRow>
              )}
            </div>

            <div className="-mx-6 mt-5 flex justify-end gap-2 border-t border-border px-6 pt-4">
              {actionable ? (
                <>
                  <Button
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onCancel(shown)}
                  >
                    Cancel booking
                  </Button>
                  <Button onClick={() => onReschedule(shown)}>Reschedule</Button>
                </>
              ) : (
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
