import type { Metadata } from "next";

import { ItemForm } from "@/components/inventory/item-form";

export const metadata: Metadata = {
  title: "Inventory item · Sole",
};

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ItemForm itemId={id} />;
}
