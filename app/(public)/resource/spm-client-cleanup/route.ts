import { serveResourceKit } from "@/lib/resource-kit";

// Built once at build time; the kit is a static HTML file.
export const dynamic = "force-static";

export function GET() {
  return serveResourceKit("spm-client-cleanup", "client-file-health-check.html");
}
