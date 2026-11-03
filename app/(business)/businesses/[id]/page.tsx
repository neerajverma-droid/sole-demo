import type { Metadata } from "next";

import { EditBusinessScreen } from "@/components/businesses/edit-business-screen";

export const metadata: Metadata = {
  title: "Edit business profile · Sole",
};

export default async function EditBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditBusinessScreen businessId={id} />;
}
