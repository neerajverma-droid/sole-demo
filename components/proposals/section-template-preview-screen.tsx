"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/proposals/proposal-document";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { apiErrorMessage } from "@/lib/api-error";
import {
  SECTION_PREVIEW_TAB,
  TEMPLATE_KIND_META,
  duplicateTemplateApi,
  previewFromSectionTemplate,
  templateEditorUrl,
  templatesListUrl,
  type SectionKind,
} from "@/lib/proposal-templates";
import { emailCategoryLabel, type ProposalTemplate } from "@/lib/proposals";

/**
 * An introduction, terms, thank-you or email template full-page, as the
 * client receives it: the proposal page (or the email) it fills, drawn by
 * the same components as the client portal, with sample client details.
 */
export function SectionTemplatePreviewScreen({ template }: { template: ProposalTemplate }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const [duplicating, setDuplicating] = React.useState(false);
  const kind = template.type as SectionKind;
  const meta = TEMPLATE_KIND_META[kind];

  const preview = React.useMemo(
    () =>
      previewFromSectionTemplate(template, {
        name: business?.name || "",
        logo: business?.logo || "",
        bank: business?.bank
          ? {
              account_holder: business.bank.accountHolder,
              bsb: business.bank.bsb,
              account_number: business.bank.accountNumber,
            }
          : null,
      }),
    [template, business],
  );

  // Back to the tab it came from; to that tab's list on a direct visit.
  const close = () => {
    if (window.history.length > 1) router.back();
    else router.push(templatesListUrl(kind));
  };

  // System templates are read-only: edit a copy.
  const duplicateAndEdit = async () => {
    setDuplicating(true);
    try {
      const id = await duplicateTemplateApi(template.id);
      await queryClient.invalidateQueries({ queryKey: ["proposal-templates", kind] });
      toast.success(`Created your own editable copy of “${template.name}”.`);
      router.push(templateEditorUrl(kind, id));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Unable to duplicate this template."));
      setDuplicating(false);
    }
  };

  const details = [
    `${meta.singular} template`,
    template.emailCategory ? emailCategoryLabel(template.emailCategory) : "",
    template.isSystem ? "System" : "",
  ].filter(Boolean);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" className="size-8" aria-label="Back to templates" onClick={close}>
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{template.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {template.isSystem ? (
            <Button size="sm" disabled={duplicating} onClick={duplicateAndEdit}>
              {duplicating ? <Loader2 className="animate-spin" /> : <Copy />}
              {duplicating ? "Duplicating…" : "Duplicate & edit"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => router.push(templateEditorUrl(kind, template.id))}>
              <PencilLine />
              Edit template
            </Button>
          )}
        </div>
      </header>

      <div className="shrink-0 border-b border-primary/30 bg-primary/10 px-5 py-2 text-sm">
        <span className="font-medium">Template Preview</span> —{" "}
        {kind === "EMAIL"
          ? "this is the email your client receives."
          : "this is the page your client sees in a proposal using this template."}{" "}
        Sample details are shown in place of the client&apos;s and your firm&apos;s.
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-primary/10 p-4 sm:p-8">
        <SectionCard section={SECTION_PREVIEW_TAB[kind]} preview={preview} />
      </div>
    </div>
  );
}
