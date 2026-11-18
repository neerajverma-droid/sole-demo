import apiRoutes from "@/config/api-routes";
import api from "@/utils/axiosInstance";

/**
 * Marketing resources, for the super-admin Resources manager.
 *
 * Backed by sole-ocr's `/api/super/resources` (src/controllers/resources.js),
 * gated by the `resources` grant. Folders nest; files live in S3 and are
 * uploaded one per request so each gets its own progress bar. Anything
 * published shows on the public /resource page.
 */

/* -------------------------------------------------------------------------- *
 * Types
 * -------------------------------------------------------------------------- */

export type AdminResourceFile = {
  id: number;
  folderId: number;
  name: string;
  extension: string | null;
  mimeType: string | null;
  size: number;
  sortOrder: number;
  isPublished: boolean;
  url: string;
  createdAt: string | null;
};

export type AdminResourceFolder = {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isPublished: boolean;
  files: AdminResourceFile[];
  children: AdminResourceFolder[];
};

/** What's being dragged: a folder (with its current parent) or a file (with its folder). */
export type DragItem =
  | { type: "folder"; id: number; parentId: number | null }
  | { type: "file"; id: number; folderId: number };

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

/* -------------------------------------------------------------------------- *
 * API
 * -------------------------------------------------------------------------- */

const routes = apiRoutes.resources;

/** The body's data, or a thrown Error carrying the server's message on `success: false`. */
function unwrap<T>(body: ApiEnvelope<T> | undefined): T {
  if (body?.success === false) throw new Error(body.message || "Request failed");
  return body?.data as T;
}

export async function fetchResourceTree(): Promise<AdminResourceFolder[]> {
  const { data } = await api.get<ApiEnvelope<AdminResourceFolder[]>>(routes.adminTree);
  return normaliseTree(unwrap(data) ?? []);
}

export async function createResourceFolder(input: {
  name: string;
  parentId: number | null;
}): Promise<AdminResourceFolder> {
  const { data } = await api.post<ApiEnvelope<AdminResourceFolder>>(routes.adminFolders, input);
  return unwrap(data);
}

export async function updateResourceFolder(
  id: number,
  input: Partial<{ name: string; isPublished: boolean; parentId: number | null; description: string | null }>,
): Promise<void> {
  const { data } = await api.patch<ApiEnvelope<unknown>>(routes.adminFolder(id), input);
  unwrap(data);
}

export async function deleteResourceFolder(id: number): Promise<void> {
  const { data } = await api.delete<ApiEnvelope<unknown>>(routes.adminFolder(id));
  unwrap(data);
}

/** Move many files into one folder in a single request. All-or-nothing on the server. */
export async function moveResourceFiles(fileIds: number[], folderId: number): Promise<number> {
  const { data } = await api.patch<ApiEnvelope<{ moved: number }>>(routes.adminFilesMove, { fileIds, folderId });
  return unwrap(data)?.moved ?? fileIds.length;
}

export async function uploadResourceFile(
  folderId: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const form = new FormData();
  form.append("files", file);
  const { data } = await api.post<ApiEnvelope<unknown>>(routes.adminFolderFiles(folderId), form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 5 * 60 * 1000,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  unwrap(data);
}

export async function updateResourceFile(
  id: number,
  input: Partial<{ name: string; isPublished: boolean; folderId: number }>,
): Promise<void> {
  const { data } = await api.patch<ApiEnvelope<unknown>>(routes.adminFile(id), input);
  unwrap(data);
}

export async function deleteResourceFile(id: number): Promise<void> {
  const { data } = await api.delete<ApiEnvelope<unknown>>(routes.adminFile(id));
  unwrap(data);
}

/* -------------------------------------------------------------------------- *
 * Tree helpers
 * -------------------------------------------------------------------------- */

/** Fill in missing arrays so the rest of the code can walk the tree without guards. */
export function normaliseTree(nodes: AdminResourceFolder[]): AdminResourceFolder[] {
  return nodes.map((node) => ({
    ...node,
    files: node.files ?? [],
    children: normaliseTree(node.children ?? []),
  }));
}

export function findFolder(nodes: AdminResourceFolder[], id: number): AdminResourceFolder | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findFolder(node.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Root-to-folder list, or [] when the id isn't in the tree. */
export function findFolderPath(
  nodes: AdminResourceFolder[],
  id: number,
  trail: AdminResourceFolder[] = [],
): AdminResourceFolder[] {
  for (const node of nodes) {
    const here = [...trail, node];
    if (node.id === id) return here;
    const hit = findFolderPath(node.children, id, here);
    if (hit.length) return hit;
  }
  return [];
}

export function countFolderFiles(node: AdminResourceFolder): number {
  return node.files.length + node.children.reduce((n, c) => n + countFolderFiles(c), 0);
}

export function folderSize(node: AdminResourceFolder): number {
  return (
    node.files.reduce((n, f) => n + (f.size || 0), 0) +
    node.children.reduce((n, c) => n + folderSize(c), 0)
  );
}

export function collectFolderIds(nodes: AdminResourceFolder[], out: number[] = []): number[] {
  for (const node of nodes) {
    out.push(node.id);
    collectFolderIds(node.children, out);
  }
  return out;
}

export type FolderOption = { id: number; name: string; depth: number; /** "Parent / Child", for search. */ path: string };

/** Every folder in tree order with its depth and full path, for a destination picker. */
export function flattenFolders(
  nodes: AdminResourceFolder[],
  depth = 0,
  trail: string[] = [],
  out: FolderOption[] = [],
): FolderOption[] {
  for (const node of nodes) {
    const here = [...trail, node.name];
    out.push({ id: node.id, name: node.name, depth, path: here.join(" / ") });
    flattenFolders(node.children, depth + 1, here, out);
  }
  return out;
}

/** The picker's search: case-insensitive, trimmed, matched against the whole path. */
export function filterFolderOptions(options: FolderOption[], term: string): FolderOption[] {
  const needle = term.trim().toLowerCase();
  return needle ? options.filter((o) => o.path.toLowerCase().includes(needle)) : options;
}

/** Is `maybeChildId` somewhere underneath `folderId`? */
export function isDescendant(nodes: AdminResourceFolder[], folderId: number, maybeChildId: number): boolean {
  const folder = findFolder(nodes, folderId);
  return folder ? Boolean(findFolder(folder.children, maybeChildId)) : false;
}

/**
 * Can `item` be dropped on `targetId`? `null` is the top level, which only
 * takes folders — files always live in a folder. Dropping where it already is,
 * or a folder into itself or its own subtree, is refused.
 */
export function canDropOn(nodes: AdminResourceFolder[], item: DragItem, targetId: number | null): boolean {
  if (item.type === "file") return targetId !== null && targetId !== item.folderId;
  if (targetId === item.id || targetId === item.parentId) return false;
  return !(targetId !== null && isDescendant(nodes, item.id, targetId));
}

/* -------------------------------------------------------------------------- *
 * Formatting
 * -------------------------------------------------------------------------- */

export function formatResourceSize(bytes: number | null | undefined): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(bytes / 1024, 0.1).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Same limits the backend enforces — shown under the drop zone. */
export const UPLOAD_HINT = "PDF, Office, CSV, images and zip · 20MB per file";
