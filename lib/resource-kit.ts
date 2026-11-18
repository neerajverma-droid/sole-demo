import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves one of the standalone HTML resource kits that live next to their
 * route under app/(public)/resource/<kit>/. They are full documents with
 * their own styles and scripts, so they're returned as-is, not wrapped in the
 * app layout.
 */
export async function serveResourceKit(kit: string, file: string) {
  const html = await readFile(
    path.join(process.cwd(), "app", "(public)", "resource", kit, file),
    "utf-8"
  );
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
