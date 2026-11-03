import { ItemForm } from "@/components/inventory/item-form";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ItemForm itemId={id} />;
}
