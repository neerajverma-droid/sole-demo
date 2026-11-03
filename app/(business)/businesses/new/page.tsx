import { Suspense } from "react";
import type { Metadata } from "next";

import { NewBusinessScreen } from "@/components/businesses/new-business-screen";

export const metadata: Metadata = {
  title: "Add business profile · Sole",
};

export default function NewBusinessPage() {
  return (
    <Suspense fallback={null}>
      <NewBusinessScreen />
    </Suspense>
  );
}
