"use client";

import * as React from "react";
import { format, parseISO, startOfToday } from "date-fns";
import { CalendarX2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/documents/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, GradientHeader } from "@/components/booking-links/booking-ui";
import { useAvailableSlotsQuery, useBookingDetailQuery } from "@/hooks/use-booking-links-query";
import { apiErrorMessage } from "@/lib/api-error";
import { rescheduleBooking } from "@/lib/booking-links-api";
import { formatDuration, type AvailableSlot, type BookingEvent } from "@/lib/booking-links";
import { cn } from "@/lib/utils";

/**
 * Move a booking to another open slot on its own link. The backend only
 * accepts a time that's one of the link's slots, so the times offered are
 * exactly those — and the guests, notes and timezone go back unchanged.
 */
export function RescheduleBookingDialog({
  booking,
  timezone,
  onOpenChange,
  onRescheduled,
}: {
  booking: BookingEvent | null;
  /** The organiser's timezone — the day the slots are generated for. */
  timezone: string;
  onOpenChange: (open: boolean) => void;
  onRescheduled: () => void;
}) {
  const open = Boolean(booking);
  const detailQuery = useBookingDetailQuery(open ? (booking?.bookingId ?? null) : null);
  const [date, setDate] = React.useState("");
  const [picked, setPicked] = React.useState<AvailableSlot | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!booking) return;
    setDate(format(parseISO(booking.start), "yyyy-MM-dd"));
    setPicked(null);
  }, [booking]);

  React.useEffect(() => {
    if (open && detailQuery.isError) {
      toast.error(apiErrorMessage(detailQuery.error, "Failed to load booking details"));
      onOpenChange(false);
    }
  }, [open, detailQuery.isError, detailQuery.error, onOpenChange]);

  const slug = detailQuery.data?.booking_link?.slug || "";
  const slotsQuery = useAvailableSlotsQuery(open ? slug : "", date, timezone);
  const slots = slotsQuery.data ?? [];

  const save = async () => {
    if (!detailQuery.data || !picked) return;
    setSaving(true);
    try {
      await rescheduleBooking(detailQuery.data, picked);
      toast.success("Booking rescheduled");
      onRescheduled();
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to reschedule booking"));
    } finally {
      setSaving(false);
    }
  };

  const duration = detailQuery.data?.booking_link?.duration ?? booking?.durationMin;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent
        hideClose
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-6 sm:max-w-[460px]"
      >
        <GradientHeader
          title="Reschedule booking"
          description={booking ? `${booking.guestName} · ${booking.linkTitle}` : undefined}
        />

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="rs-date">
              <DatePicker
                id="rs-date"
                label="Date"
                value={date}
                fromDate={startOfToday()}
                onChange={(iso) => {
                  setDate(iso);
                  setPicked(null);
                }}
              />
            </Field>
            <Field label="Duration">
              <Input value={formatDuration(duration)} disabled readOnly className="bg-muted/40" />
            </Field>
          </div>

          <Field label="Time" className="mt-4">
            {detailQuery.isPending || (slug && slotsQuery.isPending) ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="h-9 animate-pulse rounded-md bg-muted/60" />
                ))}
              </div>
            ) : slotsQuery.isError ? (
              <p className="text-sm text-destructive">
                {apiErrorMessage(slotsQuery.error, "Couldn't load the open times for that day.")}
              </p>
            ) : slots.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                <CalendarX2 className="size-4 shrink-0" />
                No open times on this day — try another date.
              </div>
            ) : (
              <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1">
                {slots.map((slot) => {
                  const selected = picked?.start_utc === slot.start_utc;
                  const current =
                    booking &&
                    parseISO(slot.start_utc).getTime() === parseISO(booking.start).getTime();
                  return (
                    <button
                      key={slot.start_utc}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPicked(slot)}
                      className={cn(
                        "h-9 rounded-md border text-sm tabular-nums transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent",
                        current && !selected && "border-primary/40",
                      )}
                    >
                      {format(parseISO(slot.start_utc), "h:mm a")}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </div>

        <div className="-mx-6 mt-4 flex shrink-0 justify-end gap-2 border-t border-border px-6 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !picked}>
            {saving && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
