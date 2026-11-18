import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TemplateEditorScreen } from "@/components/proposals/template-editor-screen";
import { kindFromSlug, templatesListUrl } from "@/lib/proposal-templates";

export const metadata: Metadata = {
  title: "Template editor · Sole",
};

const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

/**
 * /proposals/templates/editor?type=<introduction | terms | thank-you>[&id=…]
 * Whole-proposal templates are built in the proposal builder, so they have no editor here.
 * In the app shell, with the sidebar; the proposal-template builder stays full-screen.
 */
export default async function TemplateEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[]; id?: string | string[] }>;
}) {
  const params = await searchParams;
  const kind = kindFromSlug(first(params.type));
  if (kind === "PROPOSAL") redirect(templatesListUrl("PROPOSAL"));
  const id = first(params.id) ?? null;
  return <TemplateEditorScreen key={`${kind}:${id ?? "new"}`} kind={kind} templateId={id} />;
}
