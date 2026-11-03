import type { Metadata } from "next";

import { WidgetsScreen } from "@/components/widgets/widgets-screen";

export const metadata: Metadata = {
  title: "Widgets & Resources · Sole",
};

export default function WidgetPage() {
  return <WidgetsScreen />;
}
