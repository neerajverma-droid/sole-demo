import { Suspense } from "react";
import type { Metadata } from "next";

import { ProjectsScreen } from "@/components/projects/projects-screen";

export const metadata: Metadata = {
  title: "Projects · Sole",
};

/** Suspense because the screen reads its tab, search and page from the URL. */
export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsScreen />
    </Suspense>
  );
}
