import { Suspense } from "react";
import type { Metadata } from "next";

import { BookingPageSkeleton } from "@/components/public-booking/booking-shell";
import { PublicBookingScreen } from "@/components/public-booking/public-booking-screen";

export const metadata: Metadata = {
  title: "Book a meeting · Sole",
  description: "Pick a time that suits you.",
  // One host's personal booking page — not for search engines.
  robots: { index: false, follow: false },
};

/**
 * The link a host shares (`/booking/<slug>`), and the reschedule and cancel
 * links sole-ocr emails with every booking (`?reschedule=<id>`,
 * `?cancel=<id>`). Public — outside the app shell and its auth guard.
 *
 * Suspense because the screen reads `?reschedule=` / `?cancel=` from the URL.
 */
export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense fallback={<BookingPageSkeleton />}>
      <PublicBookingScreen slug={decodeURIComponent(slug)} />
    </Suspense>
  );
}
