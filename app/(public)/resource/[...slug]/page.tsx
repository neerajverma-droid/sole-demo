import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResourceFolder } from "@/components/resources/resource-folder";
import { fetchPublicResourceFolder } from "@/lib/resources";

type Props = { params: Promise<{ slug: string[] }> };

export const dynamic = "force-dynamic";

const slugPathOf = (slug: string[] = []) => slug.join("/");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const folder = await fetchPublicResourceFolder(slugPathOf(slug));
  return { title: folder ? `${folder.name} | Resources | Sole` : "Resources | Sole" };
}

export default async function ResourceFolderPage({ params }: Props) {
  const { slug } = await params;
  const slugPath = slugPathOf(slug);
  const folder = await fetchPublicResourceFolder(slugPath);
  if (!folder) notFound();
  return <ResourceFolder folder={folder} slugPath={slugPath} />;
}
