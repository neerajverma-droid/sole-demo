import apiRoutes from "@/config/api-routes";

/**
 * Public marketing resources shown on /resource. Folders and files are managed
 * by super admins and read here through the no-auth endpoints.
 */

export type ResourceFile = {
  id: string | number;
  name: string;
  url: string;
  extension?: string;
  size?: number;
};

export type ResourceFolderNode = {
  id: string | number;
  name: string;
  slug: string;
  description?: string | null;
  files: ResourceFile[];
  children: ResourceFolderNode[];
};

export type ResourceFolderDetail = ResourceFolderNode & {
  breadcrumbs: { name: string; slug: string }[];
};

export type SearchableFile = ResourceFile & { folderName: string };

const routes = apiRoutes.resources;

// Never throws: the page still renders the built-in resources if the API is down.
export async function fetchPublicResourceTree(): Promise<ResourceFolderNode[]> {
  try {
    const res = await fetch(routes.publicTree, { cache: "no-store" });
    if (!res.ok) return [];
    const body = await res.json();
    return body?.data || [];
  } catch {
    return [];
  }
}

export async function fetchPublicResourceFolder(
  path: string
): Promise<ResourceFolderDetail | null> {
  try {
    const res = await fetch(
      `${routes.publicFolder}?path=${encodeURIComponent(path)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data || null;
  } catch {
    return null;
  }
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function countFiles(node: ResourceFolderNode): number {
  return (
    (node.files?.length ?? 0) +
    (node.children ?? []).reduce((n, c) => n + countFiles(c), 0)
  );
}

// Every file in the tree, tagged with the folder path it lives in (for search).
export function flattenFiles(
  nodes: ResourceFolderNode[],
  trail: string[] = []
): SearchableFile[] {
  return nodes.flatMap((node) => [
    ...(node.files ?? []).map((file) => ({
      ...file,
      folderName: [...trail, node.name].join(" / "),
    })),
    ...flattenFiles(node.children ?? [], [...trail, node.name]),
  ]);
}

export function matchesName(name: string, term: string): boolean {
  return name.toLowerCase().includes(term.trim().toLowerCase());
}
