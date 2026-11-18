import type { Metadata } from "next";

import { ResourceHome } from "@/components/resources/resource-home";
import { fetchPublicResourceTree } from "@/lib/resources";

export const metadata: Metadata = {
  title: "Resources | Sole",
  description:
    "Helpful tools and checklists for small businesses, accountants, and bookkeepers.",
};

// Folders change whenever a super admin publishes one, so read them per request.
export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const folders = await fetchPublicResourceTree();
  return <ResourceHome folders={folders} />;
}
