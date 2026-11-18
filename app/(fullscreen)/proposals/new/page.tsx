import type { Metadata } from "next";

import { ProposalBuilder } from "@/components/proposals/proposal-builder";

export const metadata: Metadata = {
  title: "New proposal · Sole",
};

const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

/**
 * A new proposal — or, with `?mode=template`, a whole-proposal template
 * (`&template_id=` edits one of your own), as sole-pm's builder does it.
 */
export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[]; template_id?: string | string[] }>;
}) {
  const params = await searchParams;
  if (first(params.mode) === "template") {
    const templateId = first(params.template_id) ?? null;
    // Keyed: a different template (or a new one) is a fresh builder.
    return <ProposalBuilder key={`template:${templateId ?? "new"}`} template={{ id: templateId }} />;
  }
  return <ProposalBuilder />;
}
