import type { Metadata } from "next";

import { PublicCancelScreen } from "@/components/public-booking/public-cancel-screen";

export const metadata: Metadata = {
  title: "Cancel booking · Sole",
  description: "Cancel your booking.",
  robots: { index: false, follow: false },
};

/**
 * The cancel link sole-ocr emails with every booking
 * (`${FRONTEND_URL}/booking/cancel?id=<booking>`). The static `cancel`
 * segment takes precedence over `booking/[slug]`.
 */
export default async function PublicCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const { id } = await searchParams;
  return <PublicCancelScreen bookingId={Array.isArray(id) ? id[0] : id} />;
}
