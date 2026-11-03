import type { Metadata } from "next";

import { LiabilityEditor } from "@/components/liabilities/liability-editor";

export const metadata: Metadata = {
  title: "New liability · Sole",
};

export default function NewLiabilityPage() {
  return <LiabilityEditor />;
}
