import type { Metadata } from "next";

import { NexxtapDocumentsScreen } from "@/components/payments/nexxtap/documents-screen";

export const metadata: Metadata = {
  title: "NextTap onboarding · Sole",
};

export default function Page() {
  return <NexxtapDocumentsScreen />;
}
