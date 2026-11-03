import type { Metadata } from "next";

import { LiabilityEditor } from "@/components/liabilities/liability-editor";

export const metadata: Metadata = {
  title: "Edit liability · Sole",
};

export default async function EditLiabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiabilityEditor liabilityId={id} />;
}
