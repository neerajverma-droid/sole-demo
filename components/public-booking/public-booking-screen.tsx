"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  BookingCard,
  BookingPage,
  BookingPageSkeleton,
  BookingProblem,
  HostPanel,
  ThemedButton,
  type HostTheme,
} from "@/components/public-booking/booking-shell";
import { CancelStep } from "@/components/public-booking/cancel-step";
import { ConfirmedStep } from "@/components/public-booking/confirmed-step";
import { DateTimeStep } from "@/components/public-booking/date-time-step";
import { GuestDetailsStep } from "@/components/public-booking/guest-details-step";
import {
  DEFAULT_TEXT,
  DEFAULT_THEME,
  buildJoinPayload,
  durationLabel,
  fetchPublicBookingDetail,
  fetchPublicBookingLink,
  fetchPublicSlots,
  guestTimezone,
  joinBooking,
  localDateKey,
  safeHex,
  type GuestDetails,
  type PublicSlot,
} from "@/lib/public-booking";

type Step = "pick" | "details" | "done";

/**
 * `/booking/:slug` — a guest books a time with the host: pick a day and an
 * open slot, give their details, and it's confirmed (with the Meet link the
 * backend generates). `?reschedule=<id>` moves an existing booking and
 * `?cancel=<id>` cancels one — the links in the confirmation email.
 */
export function PublicBookingScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? `/booking/${slug}`;
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const rescheduleId = searchParams?.get("reschedule") || null;
  const cancelId = searchParams?.get("cancel") || null;

  const [timezone] = React.useState(guestTimezone);
  const [step, setStep] = React.useState<Step>("pick");
  const [month, setMonth] = React.useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [day, setDay] = React.useState<Date | null>(null);
  const [slot, setSlot] = React.useState<PublicSlot | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState<{
    id: string;
    email: string;
    meetingLink: string | null;
    rescheduled: boolean;
  } | null>(null);

  const linkQuery = useQuery({
    queryKey: ["public-booking", slug],
    queryFn: () => fetchPublicBookingLink(slug),
    retry: false,
    staleTime: 60_000,
  });

  const slotsQuery = useQuery({
    queryKey: ["public-booking", slug, "slots", day ? localDateKey(day) : null, timezone],
    queryFn: () => fetchPublicSlots(slug, day as Date, timezone),
    enabled: Boolean(day) && linkQuery.isSuccess,
    retry: false,
    staleTime: 0,
  });

  const rescheduleQuery = useQuery({
    queryKey: ["public-booking", "booking", rescheduleId],
    queryFn: () => fetchPublicBookingDetail(rescheduleId as string),
    enabled: Boolean(rescheduleId),
    retry: false,
  });

  const cancelQuery = useQuery({
    queryKey: ["public-booking", "booking", cancelId],
    queryFn: () => fetchPublicBookingDetail(cancelId as string),
    enabled: Boolean(cancelId),
    retry: false,
  });

  // Rescheduling starts again from the calendar.
  React.useEffect(() => {
    if (!rescheduleId) return;
    setStep("pick");
    setDay(null);
    setSlot(null);
  }, [rescheduleId]);

  const initialDetails = React.useMemo<GuestDetails | null>(() => {
    const detail = rescheduleQuery.data;
    if (!detail) return null;
    return {
      name: detail.name || "",
      email: detail.email || "",
      message: detail.message || "",
      guests: Array.isArray(detail.guests) ? detail.guests : [],
    };
  }, [rescheduleQuery.data]);

  const goTo = (query: string) =>
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

  if (linkQuery.isPending) return <BookingPageSkeleton />;
  if (linkQuery.isError || !linkQuery.data) {
    return (
      <BookingProblem
        title="Booking link not found"
        message="This booking link doesn't exist or is no longer taking bookings. Check the link with the person who sent it."
      />
    );
  }

  const link = linkQuery.data;
  const theme: HostTheme = {
    color: safeHex(link.theme_color, DEFAULT_THEME),
    text: safeHex(link.text_color, DEFAULT_TEXT),
  };

  const submit = async (details: GuestDetails) => {
    if (!slot) return;
    setSubmitting(true);
    try {
      const { booking, message } = await joinBooking(
        buildJoinPayload(link, slot, details, timezone, rescheduleId),
      );
      toast.success(message);
      setConfirmed({
        id: String(booking.id),
        email: details.email.trim(),
        meetingLink: booking.meeting_link || null,
        rescheduled: Boolean(rescheduleId),
      });
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: ["public-booking", slug, "slots"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't book that time.");
      // The time may have just gone — show the day's times afresh.
      void slotsQuery.refetch();
    } finally {
      setSubmitting(false);
    }
  };

  let body: React.ReactNode;
  if (cancelId) {
    body = (
      <CancelStep
        key={cancelId}
        bookingId={cancelId}
        detail={cancelQuery.data}
        loading={cancelQuery.isPending}
        error={
          cancelQuery.isError
            ? "This booking couldn't be found, or it's already been cancelled."
            : null
        }
        backLabel="Keep booking"
        onBack={() => goTo("")}
        doneAction={
          <ThemedButton
            theme={theme}
            onClick={() => {
              setStep("pick");
              setConfirmed(null);
              setDay(null);
              setSlot(null);
              goTo("");
            }}
          >
            Book another time
          </ThemedButton>
        }
      />
    );
  } else if (step === "done" && confirmed && slot) {
    body = (
      <ConfirmedStep
        link={link}
        slot={slot}
        email={confirmed.email}
        meetingLink={confirmed.meetingLink}
        rescheduled={confirmed.rescheduled}
        theme={theme}
        onReschedule={() => {
          setStep("pick");
          setDay(null);
          setSlot(null);
          goTo(`reschedule=${encodeURIComponent(confirmed.id)}`);
        }}
        onCancel={() => goTo(`cancel=${encodeURIComponent(confirmed.id)}`)}
      />
    );
  } else if (step === "details" && slot) {
    body = (
      <GuestDetailsStep
        slot={slot}
        timezone={timezone}
        durationLabel={durationLabel(link)}
        initial={initialDetails}
        submitting={submitting}
        rescheduling={Boolean(rescheduleId)}
        theme={theme}
        onBack={() => setStep("pick")}
        onSubmit={(details) => void submit(details)}
      />
    );
  } else {
    body = (
      <DateTimeStep
        link={link}
        theme={theme}
        month={month}
        onMonthChange={setMonth}
        day={day}
        onDayChange={(next) => {
          setDay(next);
          setSlot(null);
        }}
        slots={slotsQuery.data ?? []}
        slotsLoading={slotsQuery.isFetching && !slotsQuery.data}
        slotsError={slotsQuery.isError ? "Couldn't load the open times for this day." : null}
        slot={slot}
        onSlotChange={setSlot}
        onContinue={() => setStep("details")}
        rescheduling={Boolean(rescheduleId)}
      />
    );
  }

  return (
    <BookingPage>
      <BookingCard side={<HostPanel link={link} theme={theme} timezone={timezone} />}>
        {body}
      </BookingCard>
    </BookingPage>
  );
}
