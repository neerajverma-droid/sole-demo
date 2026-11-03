import type { Metadata } from "next";

import { KmTripEditor } from "@/components/km-tracker/km-trip-editor";

export const metadata: Metadata = {
  title: "New trip · Sole",
};

export default async function NewKmTripPage({
  searchParams,
}: {
  /** `?duplicate=<id>` — the list's Duplicate action. */
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { duplicate } = await searchParams;
  return <KmTripEditor duplicateId={duplicate} />;
}
