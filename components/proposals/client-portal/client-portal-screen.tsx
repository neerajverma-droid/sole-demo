"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  FileCheck2,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import BrandSplashLoader from "@/components/layout/brand-splash-loader";
import { useCelebrationConfetti } from "@/components/onboarding/use-celebration-confetti";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Textarea } from "@/components/ui/textarea";
import { EngagementLetter } from "@/components/proposals/client-portal/engagement-letter";
import { SignatureDialog } from "@/components/proposals/client-portal/signature-dialog";
import {
  PREVIEW_TABS,
  ProposalDocumentPages,
  SectionCard,
  type PortalActions,
} from "@/components/proposals/proposal-document";
import { generateProposalPdf } from "@/lib/proposal-pdf";
import {
  DECLINE_REASONS,
  PORTAL_MESSAGES,
  declineIssue,
  fetchProposalStripeCheckout,
  fetchPublicProposal,
  portalViewState,
  postPublicProposalEvent,
  uploadSignedProposalPdf,
  type PortalViewState,
} from "@/lib/proposal-portal";
import { previewFromProposal, type ApiProposal } from "@/lib/proposals";
import { cn } from "@/lib/utils";

const STATE_META: Record<PortalViewState, { label: string; className: string }> = {
  pending: { label: "Awaiting your response", className: "border-primary/20 bg-primary/10 text-primary" },
  accepted: { label: "Proposal accepted", className: "border-success/20 bg-success/10 text-success" },
  rejected: { label: "Proposal declined", className: "border-destructive/20 bg-destructive/10 text-destructive" },
  expired: { label: "Link expired", className: "border-warning/20 bg-warning/10 text-warning" },
};

const portalQueryKey = (token: string) => ["proposal-portal", token] as const;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * What a client sees from the proposal email — sole-webapp's client portal.
 * Review each section, download it, pay by Stripe, then accept (sign the
 * engagement letter, whose PDF is saved before the accept is recorded) or
 * decline with a reason. No sign-in; the token is the key.
 */
export function ClientPortalScreen({
  token: rawToken,
  checkout,
}: {
  token?: string;
  checkout?: string;
}) {
  const token = (rawToken ?? "").trim();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: portalQueryKey(token),
    queryFn: () => fetchPublicProposal(token),
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });
  const proposal = query.data;

  const [index, setIndex] = React.useState(0);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [signingView, setSigningView] = React.useState(false);
  const [signatureOpen, setSignatureOpen] = React.useState(false);
  const [signatureName, setSignatureName] = React.useState("");
  const [finishing, setFinishing] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [payingStripe, setPayingStripe] = React.useState(false);
  const [celebration, setCelebration] = React.useState(0);
  const pagesRef = React.useRef<HTMLDivElement>(null);
  const letterRef = React.useRef<HTMLDivElement>(null);

  const preview = React.useMemo(() => (proposal ? previewFromProposal(proposal) : null), [proposal]);
  const viewState = portalViewState(proposal?.status);
  const proposalName = preview?.general.proposal_name || "Proposal";
  const businessName = preview?.business.name || "";

  const setProposal = (next: ApiProposal) => queryClient.setQueryData(portalQueryKey(token), next);

  // The first open of a sent proposal marks it viewed — best effort.
  const viewedSent = React.useRef(false);
  React.useEffect(() => {
    if (viewedSent.current || String(proposal?.status ?? "").toLowerCase() !== "sent") return;
    viewedSent.current = true;
    postPublicProposalEvent(token, "viewed").catch(() => {});
  }, [proposal?.status, token]);

  // Stripe sends the client back with ?checkout=success|cancel; say how it
  // went once, then drop the param so a refresh doesn't repeat it.
  const checkoutHandled = React.useRef(false);
  React.useEffect(() => {
    const status = String(checkout ?? "").toLowerCase();
    if (!status || checkoutHandled.current) return;
    checkoutHandled.current = true;
    if (status === "success") toast.success("Payment successful — thank you!");
    else if (status === "cancel") {
      toast.error("Stripe checkout was cancelled — no payment was taken. You can try again.");
    }
    const params = new URLSearchParams(window.location.search);
    params.delete("checkout");
    router.replace(`/client-portal?${params.toString()}`, { scroll: false });
  }, [checkout, router]);

  React.useEffect(() => {
    if (proposalName) document.title = businessName ? `${proposalName} · ${businessName}` : proposalName;
  }, [proposalName, businessName]);

  if (!token) return <FatalState message={PORTAL_MESSAGES.invalidLink} />;
  if (query.isPending) return <LoadingState />;
  if (!proposal || !preview) {
    return <FatalState message={errorMessage(query.error, PORTAL_MESSAGES.loadFailed)} />;
  }

  const goTo = (next: number) => setIndex(Math.min(Math.max(next, 0), PREVIEW_TABS.length - 1));
  const section = PREVIEW_TABS[index];

  const payStripe = async () => {
    setPayingStripe(true);
    try {
      window.location.href = await fetchProposalStripeCheckout(token);
    } catch (error) {
      setPayingStripe(false);
      toast.error(errorMessage(error, PORTAL_MESSAGES.stripeFailed));
    }
  };

  const downloadProposal = async () => {
    setDownloading(true);
    try {
      await generateProposalPdf(pagesRef.current, proposalName);
    } catch {
      toast.error("Couldn't generate the PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const downloadLetter = async () => {
    setDownloading(true);
    try {
      await generateProposalPdf(letterRef.current, `${proposalName} - Engagement Letter`);
    } catch {
      toast.error("Failed to download the engagement letter. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  // The signed PDF is saved first and the accept recorded after, so an
  // accepted proposal always has its signed copy.
  const finishSigning = async () => {
    if (!signatureName) return;
    setFinishing(true);
    try {
      const blob = await generateProposalPdf(letterRef.current, proposalName, { mode: "blob" });
      if (!blob) throw new Error(PORTAL_MESSAGES.pdfFailed);
      const signedPdfUrl = await uploadSignedProposalPdf(token, blob, proposalName);
      const updated = await postPublicProposalEvent(
        token,
        "accepted",
        {},
        { signature_name: signatureName, signed_pdf_url: signedPdfUrl },
      );
      setProposal(updated);
      setSigningView(false);
      setCelebration((count) => count + 1);
      toast.success("Proposal signed and accepted successfully.");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to accept this proposal."));
    } finally {
      setFinishing(false);
    }
  };

  const portal: PortalActions = {
    onAcceptSign: viewState === "pending" ? () => setSigningView(true) : undefined,
    signed: viewState === "accepted",
    signatureName: proposal.signature_name || "",
    signedAt: proposal.accepted_at,
    onPayStripe: payStripe,
    payingStripe,
  };

  if (signingView) {
    return (
      <>
        <EngagementLetter
          preview={preview}
          documentRef={letterRef}
          signatureName={signatureName}
          onSign={() => setSignatureOpen(true)}
          onDownload={downloadLetter}
          downloading={downloading}
          onExit={() => !finishing && setSigningView(false)}
          onDecline={() => {
            if (finishing) return;
            setSigningView(false);
            setDeclineOpen(true);
          }}
          onFinish={finishSigning}
          finishing={finishing}
        />
        <SignatureDialog
          open={signatureOpen}
          onOpenChange={setSignatureOpen}
          onConfirm={(name) => {
            setSignatureName(name);
            setSignatureOpen(false);
          }}
        />
        {finishing && (
          <BrandSplashLoader text={"Processing your signature…\nPlease don't close this page until it's complete."} />
        )}
      </>
    );
  }

  const stateMeta = STATE_META[viewState];

  return (
    <div className="flex min-h-dvh flex-col">
      {celebration > 0 && <AcceptConfetti key={celebration} />}

      {/* Header */}
      <header className="shrink-0 border-b border-border bg-background px-4 py-[15px] md:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-[15px]">
          <div className="min-w-0">
            {businessName && (
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{businessName}</p>
            )}
            <h1 className="mt-1 break-words text-2xl font-semibold">{proposalName}</h1>
            {preview.client?.name && (
              <p className="mt-1 text-sm text-muted-foreground">prepared for {preview.client.name}</p>
            )}
            <span
              className={cn(
                "mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                stateMeta.className,
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {stateMeta.label}
            </span>
          </div>
          <Button variant="outline" size="sm" disabled={downloading} onClick={downloadProposal}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            {downloading ? "Generating..." : "Download PDF"}
          </Button>
        </div>
      </header>

      {/* Section navigator */}
      <nav
        className="shrink-0 overflow-x-auto border-b border-border bg-background px-4 py-3 md:px-6"
        aria-label="Proposal sections"
      >
        <div className="mx-auto flex max-w-5xl items-center">
          {PREVIEW_TABS.map((tab, at) => (
            <button
              key={tab}
              type="button"
              onClick={() => goTo(at)}
              aria-current={at === index ? "step" : undefined}
              className={cn(
                "flex shrink-0 items-center text-sm",
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
        </div>
      </nav>

      {/* Section */}
      <main className="flex-1 bg-primary/10 p-4 sm:p-8">
        <SectionCard
          section={section}
          preview={preview}
          portal={portal}
          onNavigate={(tab) => goTo(PREVIEW_TABS.indexOf(tab as (typeof PREVIEW_TABS)[number]))}
        />
      </main>

      {/* Response + navigation */}
      <footer className="shrink-0 border-t border-border bg-background px-4 py-[15px] md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-[15px]">
          {viewState !== "pending" && <ResponseSummary viewState={viewState} signedPdfUrl={proposal.signed_pdf_url} />}

          <div className="flex items-center justify-between gap-[15px]">
            <Button variant="outline" disabled={index === 0} onClick={() => goTo(index - 1)}>
              <ChevronLeft />
              Back
            </Button>
            <div className="flex items-center gap-2">
              {viewState === "pending" && (
                <>
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeclineOpen(true)}
                  >
                    <X />
                    Decline
                  </Button>
                  <Button onClick={() => setSigningView(true)}>Accept proposal</Button>
                </>
              )}
              <Button
                variant="outline"
                disabled={index === PREVIEW_TABS.length - 1}
                onClick={() => goTo(index + 1)}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
        {businessName && (
          <p className="mt-[15px] text-center text-xs text-muted-foreground">
            Secured and personalised by {businessName}.
          </p>
        )}
      </footer>

      <DeclineDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        onDecline={async (reason, note) => {
          const updated = await postPublicProposalEvent(token, "rejected", {
            reason_category: reason,
            reason_text: note.trim(),
          });
          setProposal(updated);
          toast.success("Response recorded");
        }}
      />

      {/* Every page, off-screen, for the PDF download. */}
      <div aria-hidden className="pointer-events-none fixed -left-[10000px] top-0 w-[820px]">
        <div ref={pagesRef}>
          <ProposalDocumentPages
            preview={preview}
            portal={{ signed: portal.signed, signatureName: portal.signatureName, signedAt: portal.signedAt }}
          />
        </div>
      </div>
    </div>
  );
}

function ResponseSummary({
  viewState,
  signedPdfUrl,
}: {
  viewState: Exclude<PortalViewState, "pending">;
  signedPdfUrl?: string | null;
}) {
  const copy = {
    accepted: ["You've accepted this proposal — thank you!", "We'll be in touch soon to get things moving."],
    rejected: [
      "You've declined this proposal.",
      "Thanks for letting us know — feel free to reach out if anything changes.",
    ],
    expired: ["This proposal link has expired.", "Please contact us if you'd like a new link."],
  }[viewState];

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-[15px]">
      <p className="text-sm font-medium">{copy[0]}</p>
      <p className="mt-1 text-sm text-muted-foreground">{copy[1]}</p>
      {viewState === "accepted" && signedPdfUrl && (
        <a
          href={signedPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <FileCheck2 className="size-3.5" />
          View signed proposal
        </a>
      )}
    </div>
  );
}

function DeclineDialog({
  open,
  onOpenChange,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecline: (reason: string, note: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    const issue = declineIssue(reason, note);
    if (issue) {
      setError(issue);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onDecline(reason, note);
      onOpenChange(false);
    } catch (submitError) {
      setError(errorMessage(submitError, "Failed to decline this proposal."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline this proposal</DialogTitle>
          <DialogDescription>Let us know why so we can follow up appropriately.</DialogDescription>
        </DialogHeader>

        <div className="space-y-[15px]">
          <div className="space-y-2">
            <Label htmlFor="decline-reason">Reason</Label>
            <Select
              value={reason}
              onValueChange={(value) => {
                setReason(value);
                setError("");
              }}
            >
              <SelectTrigger id="decline-reason" className="w-full">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {DECLINE_REASONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="decline-note">
              Additional note{reason === "Other" ? "" : " (optional)"}
            </Label>
            <Textarea
              id="decline-note"
              rows={3}
              value={note}
              placeholder="Add more details if you'd like..."
              onChange={(event) => {
                setNote(event.target.value);
                setError("");
              }}
            />
          </div>
          {error && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={submitting} onClick={submit}>
            {submitting && <Loader2 className="animate-spin" />}
            {submitting ? "Please wait..." : "Confirm decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your proposal…</span>
      <div className="border-b border-border px-4 py-[15px] md:px-6">
        <div className="mx-auto max-w-5xl space-y-3">
          <Shimmer className="h-3 w-28" />
          <Shimmer className="h-7 w-64" />
          <Shimmer className="h-4 w-40" />
          <Shimmer className="h-6 w-40 rounded-full" />
        </div>
      </div>
      <div className="border-b border-border px-4 py-3 md:px-6">
        <Shimmer className="mx-auto h-5 max-w-5xl" />
      </div>
      <div className="flex-1 bg-primary/10 p-4 sm:p-8">
        <Shimmer className="mx-auto h-[520px] max-w-[760px] rounded-3xl bg-card" />
      </div>
    </div>
  );
}

function FatalState({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
      <Empty className="w-full max-w-lg">
        <EmptyMedia className="bg-destructive/10 text-destructive">
          <CircleAlert aria-hidden />
        </EmptyMedia>
        <EmptyTitle>Proposal response</EmptyTitle>
        <EmptyDescription className="text-destructive" role="alert">
          {message}
        </EmptyDescription>
      </Empty>
    </div>
  );
}

function AcceptConfetti() {
  useCelebrationConfetti();
  return null;
}
