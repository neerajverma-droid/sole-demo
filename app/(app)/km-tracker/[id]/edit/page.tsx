import type { Metadata } from "next";

import { KmTripEditor } from "@/components/km-tracker/km-trip-editor";

export const metadata: Metadata = {
  title: "Edit trip · Sole",
};

export default async function EditKmTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KmTripEditor tripId={id} />;
}
