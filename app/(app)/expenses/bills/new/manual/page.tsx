import type { Metadata } from "next";

import { BillForm } from "@/components/bills/bill-form";

export const metadata: Metadata = {
  title: "New bill · Sole",
};

/** `?capture=1` arrives from Add bill → Scan bill; the reading itself waits in the capture store. */
export default function NewBillPage() {
  return <BillForm />;
}
