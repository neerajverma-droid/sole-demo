import type { Metadata } from "next";

import { BookingLinksScreen } from "@/components/booking-links/booking-links-screen";

export const metadata: Metadata = {
  title: "Booking links · Sole",
};

export default function BookingLinksPage() {
  return <BookingLinksScreen />;
}
