"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { BookingCalendar, BookingMonthHeader } from "@/components/booking-links/booking-calendar";
import {
  BookingDetailsDialog,
  CancelBookingDialog,
} from "@/components/booking-links/booking-details-dialog";
import { BookingLinkDialog } from "@/components/booking-links/booking-link-dialog";
import { BookingLinksEmpty, BookingLinksList } from "@/components/booking-links/booking-links-list";
import { BookingSettingsDialog } from "@/components/booking-links/booking-settings-dialog";
import { RescheduleBookingDialog } from "@/components/booking-links/reschedule-booking-dialog";
import {
  useBookingCalendarsQuery,
  useBookingLinksQuery,
  useBookingSettingsQuery,
  useInvalidateBookingLinks,
  useMonthBookingsQuery,
  useTimezonesQuery,
} from "@/hooks/use-booking-links-query";
import { apiErrorMessage } from "@/lib/api-error";
import { moveBooking } from "@/lib/booking-links-api";
import {
  bookingsInMonth,
  browserTimezone,
  movedBooking,
  type BookingEvent,
  type RawBookingEvent,
} from "@/lib/booking-links";
import { cn } from "@/lib/utils";

type Tab = "view" | "mine";

const TABS: { id: Tab; label: string }[] = [
  { id: "view", label: "Booking view" },
  { id: "mine", label: "My bookings" },
];

export function BookingLinksScreen() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateBookingLinks();

  const [tab, setTab] = React.useState<Tab>("view");
  const [month, setMonth] = React.useState(() => new Date());

  const [linkDialog, setLinkDialog] = React.useState<{ id: string | number | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<BookingEvent | null>(null);
  const [rescheduling, setRescheduling] = React.useState<BookingEvent | null>(null);
  const [cancelling, setCancelling] = React.useState<BookingEvent | null>(null);

  // Fetched on both tabs, not just "My bookings": whether there's a single link
  // decides whether the tabs are shown at all.
  const linksQuery = useBookingLinksQuery(true);
  const monthQuery = useMonthBookingsQuery(month);
  const settingsQuery = useBookingSettingsQuery();
  const timezonesQuery = useTimezonesQuery();
  const calendarsQuery = useBookingCalendarsQuery();

  const links = React.useMemo(
    () => linksQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [linksQuery.data],
  );
  const monthBookings = React.useMemo(() => monthQuery.data ?? [], [monthQuery.data]);
  const monthCount = monthQuery.isPending ? null : bookingsInMonth(monthBookings, month).length;

  React.useEffect(() => {
    // Only where the links are on show — the calendar doesn't need them.
    if (linksQuery.isError && tab === "mine") {
      toast.error(apiErrorMessage(linksQuery.error, "Couldn't load your booking links."));
    }
  }, [linksQuery.isError, linksQuery.error, tab]);
  React.useEffect(() => {
    if (monthQuery.isError) {
      toast.error(apiErrorMessage(monthQuery.error, "Couldn't load your bookings."));
    }
  }, [monthQuery.isError, monthQuery.error]);

  const openCreate = () => setLinkDialog({ id: null });

  // As the old screen did: opening "My bookings" starts the list again from
  // page one, so it's never a stale or half-scrolled copy.
  const selectTab = (next: Tab) => {
    if (next === tab) return;
    if (next === "mine") queryClient.removeQueries({ queryKey: ["booking-links", "links"] });
    setTab(next);
  };

  const openSettings = () => {
    setLinkDialog(null);
    // Let the wizard close before the settings open over the same spot.
    window.setTimeout(() => setSettingsOpen(true), 150);
  };

  // Dropped on another day: moved straight away, saved in the background,
  // and put straight back if the backend refuses — as the old calendar did.
  const handleMove = React.useCallback(
    (booking: BookingEvent, day: Date) => {
      if (!booking.bookingId) return;
      const range = movedBooking(booking, day);
      if (range.start_date === booking.start) return;
      const snapshot = queryClient.getQueriesData<RawBookingEvent[]>({
        queryKey: ["booking-links", "bookings"],
      });
      queryClient.setQueriesData<RawBookingEvent[]>(
        { queryKey: ["booking-links", "bookings"] },
        (rows) =>
          rows?.map((row) =>
            String(row.id) === booking.key
              ? { ...row, startDate: range.start_date, endDate: range.end_date }
              : row,
          ),
      );
      void moveBooking(booking.bookingId, range)
        .then(() => {
          toast.success("Booking rescheduled");
          return invalidate("bookings");
        })
        .catch((error) => {
          snapshot.forEach(([key, rows]) => queryClient.setQueryData(key, rows));
          toast.error(apiErrorMessage(error, "Failed to reschedule booking"));
        });
    },
    [invalidate, queryClient],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = linksQuery;
  const loadMoreLinks = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const settings = settingsQuery.data;

  // Nothing to book from yet: the header and one empty card, no tabs or
  // calendar. Held back while either list is still out or failed, while the
  // calendar is on any month but this one (the month header is how you get
  // back), and while this month still has bookings, say from a link since
  // removed — those are worth the calendar.
  const now = new Date();
  const onThisMonth =
    month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const noLinks =
    linksQuery.isSuccess &&
    links.length === 0 &&
    !linksQuery.hasNextPage &&
    onThisMonth &&
    monthQuery.isSuccess &&
    monthBookings.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Link2}
        title="Booking Links"
        titleTip="Share a link, and clients book themselves into the times you've opened. Bookings land here and on your connected calendar."
        description="Let clients self-book into your open slots, and see what's on the books."
      >
        <Button
          variant="outline"
          onClick={() => setSettingsOpen(true)}
          data-usertour="scheduling-booking-settings-button"
        >
          <SlidersHorizontal />
          Settings
        </Button>
        <Button onClick={openCreate} data-usertour="scheduling-booking-create-button">
          <Plus />
          Create booking link
        </Button>
      </PageHeader>

      {noLinks ? (
        <BookingLinksEmpty onCreate={openCreate} />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Booking links"
            className="flex border-b border-border"
            data-usertour="scheduling-booking-tabs"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => selectTab(item.id)}
                className={cn(
                  "-mb-px mr-6 border-b-2 border-transparent px-0.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  tab === item.id && "border-primary text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "view" ? (
            <div className="space-y-5">
              <BookingMonthHeader month={month} onMonthChange={setMonth} count={monthCount} />
              <BookingCalendar
                month={month}
                bookings={monthBookings}
                loading={monthQuery.isPending}
                onOpen={setDetail}
                onMove={handleMove}
              />
            </div>
          ) : (
            <BookingLinksList
              links={links}
              loading={linksQuery.isPending}
              hasMore={Boolean(linksQuery.hasNextPage)}
              loadingMore={linksQuery.isFetchingNextPage}
              onLoadMore={loadMoreLinks}
              onEdit={(link) => setLinkDialog({ id: link.id })}
              onCreate={openCreate}
              onDeleted={() => void invalidate("links")}
            />
          )}
        </>
      )}

      <BookingLinkDialog
        open={linkDialog !== null}
        onOpenChange={(open) => !open && setLinkDialog(null)}
        linkId={linkDialog?.id ?? null}
        settings={settings}
        timezones={timezonesQuery.data ?? []}
        calendars={calendarsQuery.data ?? []}
        onSaved={() => void invalidate()}
        onEditSettings={openSettings}
      />

      <BookingSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        loading={settingsQuery.isPending}
        timezones={timezonesQuery.data ?? []}
        onSaved={() => void invalidate("settings")}
      />

      <BookingDetailsDialog
        booking={detail}
        onClose={() => setDetail(null)}
        onReschedule={(booking) => {
          setDetail(null);
          setRescheduling(booking);
        }}
        onCancel={(booking) => {
          setDetail(null);
          setCancelling(booking);
        }}
      />

      <RescheduleBookingDialog
        booking={rescheduling}
        timezone={settings?.timezone || browserTimezone()}
        onOpenChange={(open) => !open && setRescheduling(null)}
        onRescheduled={() => {
          void invalidate("bookings");
          void invalidate("links");
        }}
      />

      <CancelBookingDialog
        booking={cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        onCancelled={() => {
          void invalidate("bookings");
          void invalidate("links");
        }}
      />
    </div>
  );
}
