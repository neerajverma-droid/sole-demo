"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { Copy, ExternalLink, FileText, Loader2, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Shimmer } from "@/components/ui/shimmer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard, type PreviewTab } from "@/components/proposals/proposal-document";
import { ProposalStatusBadge } from "@/components/proposals/proposal-status-badge";
import {
  useProposalDetailQuery,
  useSendProposalMutation,
} from "@/hooks/use-proposals-query";
import { viewProposalIdAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  contractLengthLabel,
  contractStartLabel,
  formatProposalDate,
  formatProposalMoney,
  normaliseProposalStatus,
  previewFromProposal,
  proposalClientName,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

const TABS = [
  "Details",
  "Cover",
  "Introduction",
  "Services",
  "Pricing",
  "Terms",
  "Add. Docs.",
  "Thank You",
] as const;

type Tab = (typeof TABS)[number];

/** A proposal at a glance — and each section exactly as the client sees it */
export function ProposalDetailsSheet() {
  const [viewId, setViewId] = useAtom(viewProposalIdAtom);
  const [tab, setTab] = React.useState<Tab>("Details");
  const query = useProposalDetailQuery(viewId);
  const resend = useSendProposalMutation();
  const proposal = query.data;

  React.useEffect(() => {
    if (viewId) setTab("Details");
  }, [viewId]);

  const preview = React.useMemo(() => (proposal ? previewFromProposal(proposal) : null), [proposal]);
  const status = normaliseProposalStatus(proposal?.status);
  const general = proposal?.general_data ?? {};
  const clientName = proposal ? proposalClientName(proposal) : "";
  const currency = proposal?.currency_code || "AUD";
  const documents = preview?.documents ?? [];

  // The public client link can't be rebuilt (only its hash is stored), so
  // this points at the internal full preview.
  const link =
    proposal?.id && typeof window !== "undefined"
      ? `${window.location.origin}/proposals/${proposal.id}/preview`
      : "";

  const copyLink = () => {
    if (!link) return;
    navigator.clipboard
      ?.writeText(link)
      .then(() => toast.success("Link copied to clipboard"))
      .catch(() => toast.error("Failed to copy link"));
  };

  // A fresh client link, emailed — any previously shared one stops working.
  const handleResend = async () => {
    if (!proposal?.id) return;
    try {
      const result = await resend.mutateAsync(String(proposal.id));
      if (result.responseUrl) navigator.clipboard?.writeText(result.responseUrl).catch(() => {});
      toast.success(
        result.outcome === "emailed"
          ? "Proposal re-sent to your client — link copied to clipboard"
          : "Proposal marked as sent — link copied to clipboard",
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to resend proposal"));
    }
  };

  return (
    <Sheet open={viewId !== null} onOpenChange={(open) => !open && setViewId(null)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[760px]">
        {query.isLoading ? (
          <div className="space-y-[15px] p-[15px]">
            <SheetTitle className="sr-only">Loading proposal</SheetTitle>
            <Shimmer className="h-7 w-64" />
            <Shimmer className="h-36 w-full rounded-lg" />
            <Shimmer className="h-64 w-full rounded-lg" />
          </div>
        ) : query.isError || !proposal || !preview ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-[15px] p-[15px] text-center">
            <TriangleAlert className="size-6 text-muted-foreground" aria-hidden />
            <SheetTitle className="text-base">Couldn&apos;t load this proposal</SheetTitle>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <SheetHeader className="block space-y-0 border-b border-border p-[15px] text-left">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <SheetTitle>{proposal.title || "Untitled Proposal"}</SheetTitle>
                <ProposalStatusBadge status={status} />
              </div>
              <SheetDescription className={cn(!proposal.proposal_number && "sr-only")}>
                {proposal.proposal_number || "Proposal details"}
              </SheetDescription>

              <div className="!mt-[15px] space-y-[15px] rounded-lg border border-border bg-card p-[15px] shadow-sm">
                <div className="flex items-center justify-between gap-[15px]">
                  <div className="flex min-w-0 items-center gap-[15px]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-base font-semibold text-white">
                      {clientName.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate font-medium">{clientName}</span>
                  </div>
                  {status !== "accepted" && (
                    <Button size="sm" disabled={resend.isPending} onClick={handleResend}>
                      {resend.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                      {resend.isPending ? "Sending..." : "Resend"}
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-[15px]">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-medium">Proposal link</p>
                    <div className="flex">
                      <Input readOnly value={link} className="rounded-r-none bg-muted/50 text-xs" aria-label="Proposal link" />
                      <Button variant="outline" className="rounded-l-none border-l-0" onClick={copyLink}>
                        <Copy />
                        Copy
                      </Button>
                    </div>
                  </div>
                  <Button variant="outline" asChild>
                    <a href={link || "#"} target="_blank" rel="noopener noreferrer">
                      Client view
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
              </div>

              {/* Scrolls sideways rather than squeezing eight sections into one row. */}
              <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)} className="!mt-[15px]">
                <div className="-mx-1 overflow-x-auto px-1">
                  <TabsList aria-label="Proposal sections" className="w-max justify-start">
                    {TABS.map((entry) => (
                      <TabsTrigger key={entry} value={entry}>
                        {entry}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </Tabs>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto bg-muted/30 p-[15px]">
              {tab === "Details" ? (
                <div className="rounded-lg border border-border bg-card p-[15px]">
                  <h3 className="mb-[15px] border-b border-border pb-[15px] font-semibold">Proposal details</h3>
                  <dl>
                    <DetailRow label="Client">{clientName}</DetailRow>
                    <DetailRow label="Start">{contractStartLabel(general)}</DetailRow>
                    <DetailRow label="Status">
                      <ProposalStatusBadge status={status} />
                    </DetailRow>
                    <DetailRow label="Contract length">{contractLengthLabel(general)}</DetailRow>
                    <DetailRow label="Minimum value">
                      {formatProposalMoney(Number(proposal.service_total ?? 0), currency)}
                    </DetailRow>
                    <DetailRow label="Created">{formatProposalDate(proposal.created_at, true)}</DetailRow>
                    <DetailRow label="Last updated">{formatProposalDate(proposal.updated_at, true)}</DetailRow>
                    {proposal.sent_at && <DetailRow label="Sent">{formatProposalDate(proposal.sent_at, true)}</DetailRow>}
                    {proposal.accepted_at && (
                      <DetailRow label="Accepted">
                        {formatProposalDate(proposal.accepted_at, true)}
                        {proposal.signature_name ? ` · signed by ${proposal.signature_name}` : ""}
                      </DetailRow>
                    )}
                    {proposal.signed_pdf_url && (
                      <DetailRow label="Signed document">
                        <a
                          href={proposal.signed_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                        >
                          <FileText className="size-3.5" />
                          View signed proposal
                        </a>
                      </DetailRow>
                    )}
                  </dl>
                </div>
              ) : tab === "Add. Docs." ? (
                documents.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No additional documents attached.</p>
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border bg-card">
                    {documents.map((document, index) => (
                      <div key={document.id || index} className="flex items-center gap-[15px] p-[15px]">
                        <FileText className="size-4 shrink-0 text-red-400" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{document.name}</span>
                        {document.file_url && (
                          <a
                            href={document.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-xs font-medium text-primary hover:underline"
                          >
                            View
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="rounded-lg bg-primary/10 p-[15px]">
                  <SectionCard section={tab as PreviewTab} preview={preview} onNavigate={(next) => setTab(next as Tab)} />
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-border/60 py-2.5 text-sm last:border-b-0">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
