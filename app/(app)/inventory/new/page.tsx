import type { Metadata } from "next";

import { ItemForm } from "@/components/inventory/item-form";

export const metadata: Metadata = {
  title: "New inventory item · Sole",
};

export default function NewItemPage() {
  return <ItemForm />;
}
