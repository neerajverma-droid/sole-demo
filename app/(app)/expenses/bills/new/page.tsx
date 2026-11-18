import type { Metadata } from "next";

import { CreateBillChooser } from "@/components/bills/create-bill-chooser";

export const metadata: Metadata = {
  title: "New bill · Sole",
};

export default function CreateBillPage() {
  return <CreateBillChooser />;
}
