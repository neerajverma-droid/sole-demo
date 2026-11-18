import type { Metadata } from "next";

import { CreateQuoteChooser } from "@/components/quotes/create-quote-chooser";

export const metadata: Metadata = {
  title: "New quote · Sole",
};

export default function CreateQuotePage() {
  return <CreateQuoteChooser />;
}
