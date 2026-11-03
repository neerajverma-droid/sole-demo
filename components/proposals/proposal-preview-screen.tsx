"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  PREVIEW_TABS,
  ProposalDocumentPages,
  SectionCard,
} from "@/components/proposals/proposal-document";
import { useProposalDetailQuery } from "@/hooks/use-proposals-query";
import { apiErrorMessage } from "@/lib/api-error";
import { generateProposalPdf } from "@/lib/proposal-pdf";
import { previewFromProposal } from "@/lib/proposals";
import { cn } from "@/lib/utils";

/**
 * The proposal as the client will step through it, opened in its own tab —
 * numbered sections with Back / Next, and the whole thing as a PDF.
 */
export function ProposalPreviewScreen({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const query = useProposalDetailQuery(proposalId);
  const [index, setIndex] = React.useState(0);
  const [downloading, setDownloading] = React.useState(false);
  const pdfRef = React.useRef<HTMLDivElement>(null);

  const preview = React.useMemo(
    () => (query.data ? previewFromProposal(query.data) : null),
    [query.data],
  );

  const close = () => {
    if (window.opener) window.close();
    else router.push("/proposals");
  };

  const goTo = (next: number) => setIndex(Math.min(Math.max(next, 0), PREVIEW_TABS.length - 1));

  if (query.isLoading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">Loading proposal preview…</p>
      </div>
    );
  }

  if (query.isError || !preview) {
    return (
      <div className="grid h-dvh place-items-center p-4">
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>This proposal could not be found</EmptyTitle>
            <EmptyDescription>{apiErrorMessage(query.error, "Failed to load this proposal")}</EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={() => router.push("/proposals")}>
              Back to proposals
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  const name = preview.general.proposal_name || "Proposal";
  const section = PREVIEW_TABS[index];

  const download = async () => {
    setDownloading(true);
    try {
      await generateProposalPdf(pdfRef.current, name);
    } catch {
      toast.error("Couldn't generate the PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:px-5">
        <span className="min-w-0 truncate text-sm font-semibold">{name}</span>

        <nav className="hidden items-center md:flex" aria-label="Proposal sections">
          {PREVIEW_TABS.map((tab, at) => (
            <button
              key={tab}
              type="button"
              onClick={() => goTo(at)}
              aria-current={at === index ? "step" : undefined}
              className={cn(
                "flex items-center text-sm",
                at === index ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full border text-[10px]",
                    at === index ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                  )}
                >
                  {at + 1}
                </span>
                {tab}
              </span>
              {at !== PREVIEW_TABS.length - 1 && <ChevronRight className="mx-3 size-3.5 text-muted-foreground" />}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" disabled={downloading} onClick={download}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            {downloading ? "Generating…" : "Download PDF"}
          </Button>
          <Button variant="outline" size="icon" className="size-8" aria-label="Close preview" onClick={close}>
            <X />
          </Button>
        </div>
      </header>

      <div className="shrink-0 border-b border-primary/30 bg-primary/10 px-5 py-2 text-sm">
        <span className="font-medium">Proposal Preview</span> — this is what your client will see once this
        proposal is sent.
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-primary/10 p-4 sm:p-8">
        <SectionCard
          section={section}
          preview={preview}
          onNavigate={(tab) => goTo(PREVIEW_TABS.indexOf(tab as (typeof PREVIEW_TABS)[number]))}
        />
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-border bg-background px-5 py-3">
        <Button variant="outline" disabled={index === 0} onClick={() => goTo(index - 1)}>
          <ChevronLeft />
          Back
        </Button>
        <Button disabled={index === PREVIEW_TABS.length - 1} onClick={() => goTo(index + 1)}>
          Next
          <ChevronRight />
        </Button>
      </footer>

      {/* Every page, off-screen, for the PDF capture. */}
      <div aria-hidden className="pointer-events-none fixed -left-[10000px] top-0 w-[820px]">
        <div ref={pdfRef}>
          <ProposalDocumentPages preview={preview} />
        </div>
      </div>
    </div>
  );
}
