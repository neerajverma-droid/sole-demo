import type { Metadata } from "next";

import { EquityEditor } from "@/components/equity/equity-editor";

export const metadata: Metadata = {
  title: "New equity · Sole",
};

export default function NewEquityPage() {
  return <EquityEditor />;
}
