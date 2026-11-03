import { Suspense } from "react";
import type { Metadata } from "next";

import { ProjectDetailScreen } from "@/components/projects/project-detail-screen";

export const metadata: Metadata = {
  title: "Project · Sole",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Suspense because the screen reads its tab from `?tab=`.
  return (
    <Suspense fallback={null}>
      <ProjectDetailScreen projectId={id} />
    </Suspense>
  );
}
