import type { Metadata } from "next";

import { EquityEditor } from "@/components/equity/equity-editor";

export const metadata: Metadata = {
  title: "Edit equity · Sole",
};

export default async function EditEquityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EquityEditor equityId={id} />;
}
