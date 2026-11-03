"use client";

import * as React from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAvailableSlots,
  fetchBookingDetail,
  fetchBookingLinkForm,
  fetchBookingLinks,
  fetchBookingSettings,
  fetchMonthBookings,
  fetchTimezones,
} from "@/lib/booking-links-api";
import { fetchLinkedCalendars } from "@/lib/calendar-api";
import { monthRange, normalizeBookingEvents } from "@/lib/booking-links";

/** Everything here lives under one key, so a write refreshes it all at once. */
const ROOT = "booking-links";

/** `/schedule/booking-list`, ten at a time — the "My bookings" tab. */
export function useBookingLinksQuery(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [ROOT, "links"],
    enabled,
    queryFn: ({ pageParam }) => fetchBookingLinks(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
}

export function useMonthBookingsQuery(month: Date) {
  const { start_date } = monthRange(month);
  return useQuery({
    queryKey: [ROOT, "bookings", "month", start_date],
    queryFn: () => fetchMonthBookings(month),
    select: normalizeBookingEvents,
  });
}

export function useBookingSettingsQuery() {
  return useQuery({
    queryKey: [ROOT, "settings"],
    queryFn: fetchBookingSettings,
  });
}

export function useTimezonesQuery() {
  return useQuery({
    queryKey: [ROOT, "timezones"],
    queryFn: fetchTimezones,
    staleTime: Infinity,
  });
}

/** The same linked calendars the Calendar screen lists — a Google Meet link needs one. */
export function useBookingCalendarsQuery() {
  return useQuery({
    queryKey: ["calendar", "linked"],
    queryFn: fetchLinkedCalendars,
  });
}

export function useBookingLinkFormQuery(id: string | number | null, fallbackTimezone: string) {
  return useQuery({
    queryKey: [ROOT, "link", id],
    queryFn: () => fetchBookingLinkForm(id as string | number, fallbackTimezone),
    enabled: id !== null && id !== "",
    staleTime: 0,
    gcTime: 0,
  });
}

export function useBookingDetailQuery(bookingId: string | null) {
  return useQuery({
    queryKey: [ROOT, "booking", bookingId],
    queryFn: () => fetchBookingDetail(bookingId as string),
    enabled: Boolean(bookingId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useAvailableSlotsQuery(slug: string, date: string, timezone: string) {
  return useQuery({
    queryKey: [ROOT, "slots", slug, date, timezone],
    queryFn: () => fetchAvailableSlots(slug, date, timezone),
    enabled: Boolean(slug && date && timezone),
    staleTime: 0,
  });
}

export function useInvalidateBookingLinks() {
  const queryClient = useQueryClient();
  return React.useCallback(
    (part?: "links" | "bookings" | "settings") =>
      queryClient.invalidateQueries({ queryKey: part ? [ROOT, part] : [ROOT] }),
    [queryClient],
  );
}
