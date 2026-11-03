"use client";

import * as React from "react";
import { Moon_Dance } from "next/font/google";
import {
  Check,
  ChevronRight,
  Loader2,
  PenLine,
  CornerUpRight,
  CreditCard,
  FileText,
  MoreHorizontal,
  Reply,
  Search,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatProposalDate,
  formatProposalMoney,
  hasBlockContent,
  isBlankHtml,
  paymentMethodLabel,
  proxiedImage,
  proxyHtmlImages,
  serviceTotals,
  splitIntoPages,
  videoEmbedUrl,
  type IntroBlock,
  type PreviewData,
  type ProposalDocument,
  type SignatureSize,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

/**
 * The proposal as the client reads it — a paper document, so it keeps its own
 * warm paper palette in both themes. Accents follow the brand's `primary`.
 */

const signatureFont = Moon_Dance({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

/** The signature sign-off's typeface. */
export const SIGNATURE_FONT_CLASS = signatureFont.className;


/**
 * What the client portal adds to the document: the live Accept & Sign and
 * Pay by Stripe buttons, and the signature once signed. Absent everywhere
 * else, where those stay as inert previews.
 */
export type PortalActions = {
  onAcceptSign?: () => void;
  signed?: boolean;
  signatureName?: string;
  signedAt?: string | null;
  onPayStripe?: () => void;
  payingStripe?: boolean;
};

export const PREVIEW_TABS = [
  "Cover",
  "Introduction",
  "Services",
  "Pricing",
  "Terms",
  "Thank You",
] as const;

export type PreviewTab = (typeof PREVIEW_TABS)[number] | "Email";

export const SIGNATURE_SIZES: Record<SignatureSize, string> = {
  small: "text-[26px]",
  medium: "text-[38px]",
  large: "text-[52px]",
};

/** The paper sheet every section (but the introduction and email) sits on. */
export const PAPER_PAGE =
  "proposal-document-page mx-auto w-full max-w-[760px] rounded-3xl bg-card px-6 py-10 text-center text-foreground shadow-lg sm:px-14 sm:py-14";

function DotDivider() {
  return (
    <div className="mb-4 mt-3 flex items-center gap-2">
      <span className="h-px w-8 bg-border" />
      <span className="size-[5px] rounded-full bg-primary" />
      <span className="h-px w-8 bg-border" />
    </div>
  );
}


function RichHtml({ html, className }: { html: string; className?: string }) {
  const proxied = React.useMemo(() => proxyHtmlImages(html), [html]);
  return (
    <div
      className={cn("proposal-rich-html", className)}
      dangerouslySetInnerHTML={{ __html: proxied }}
    />
  );
}

function IntroBlockView({ block }: { block: IntroBlock }) {
  if (block.type === "text") {
    if (!hasBlockContent(block)) return null;
    return (
      <RichHtml
        html={block.editorHtml ?? ""}
        className="text-[14px] leading-relaxed text-foreground"
      />
    );
  }
  if (block.type === "image" && block.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxiedImage(block.imageUrl)}
        alt={block.imageName || "Introduction image"}
        className="w-full rounded-xl"
      />
    );
  }
  if (block.type === "video" && block.videoUrl) {
    return (
      <div className="overflow-hidden rounded-xl">
        <iframe
          title="Introduction video"
          src={videoEmbedUrl(block.videoUrl) ?? block.videoUrl}
          className="h-64 w-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }
  return null;
}

/**
 * The introduction, one card per page (split at each page break) — a real
 * multi-page document rather than one long scroll.
 */
export function IntroductionPages({ preview }: { preview: PreviewData }) {
  const { introduction, business } = preview;
  const businessName = business.name || "Your Business";
  const signature = introduction.signature;
  const hasAny = introduction.blocks.some(hasBlockContent);
  const pages = hasAny ? splitIntoPages(introduction.blocks) : [[]];
  const total = pages.length;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      {pages.map((blocks, index) => {
        const first = index === 0;
        const last = index === total - 1;
        return (
          <div
            key={index}
            className="proposal-document-page w-full overflow-hidden rounded-2xl bg-card text-left text-foreground shadow-[0px_4px_20px_-4px_rgba(0,0,0,0.08)]"
          >
            <div className="px-6 pb-6 pt-7 sm:px-10">
              {first ? (
                <>
                  <p className="text-[13px] text-primary">
                    A note from {introduction.message_from || businessName}
                  </p>
                  <div className="mt-4">
                    <DotDivider />
                  </div>
                  <h1 className="text-[32px] font-semibold leading-tight text-foreground">
                    A Message for You
                  </h1>
                  <p className="mb-1 mt-2 text-[13px] text-muted-foreground">
                    Read on to learn what we have prepared.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <p className="whitespace-nowrap text-[11px] text-primary">
                      Introduction · Page {index + 1} of {total}
                    </p>
                    <span className="h-px flex-1 bg-border" />
                    <span className="size-[5px] shrink-0 rounded-full bg-primary" />
                  </div>
                  <h1 className="mt-4 text-[26px] font-semibold leading-tight text-foreground">
                    Continued
                  </h1>
                </>
              )}

              <div className="mx-auto mt-6 max-w-xl space-y-4">
                {blocks.length > 0 ? (
                  blocks.map((block, blockIndex) => (
                    <IntroBlockView key={block.id || blockIndex} block={block} />
                  ))
                ) : (
                  <p className="text-[14px] leading-relaxed text-foreground">
                    Your introduction content will appear here once it is added.
                  </p>
                )}
              </div>

              {last && signature.showing && signature.name && (
                <div className="mx-auto mt-6 max-w-xl border-t border-border pt-5">
                  <p
                    className={cn(
                      SIGNATURE_FONT_CLASS,
                      "leading-tight text-foreground",
                      SIGNATURE_SIZES[signature.size] ?? SIGNATURE_SIZES.medium,
                    )}
                  >
                    {signature.name}
                  </p>
                  <p className="mt-[3px] text-[11px] text-muted-foreground">
                    Your dedicated advisor · {businessName}
                  </p>
                </div>
              )}
            </div>

            {first && (
              <div className="flex items-center justify-between border-t border-border px-6 py-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {businessName.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{businessName}</span>
                </div>
                {total > 1 && (
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    Introduction · 1/{total}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocumentPreviewDialog({
  document,
  onClose,
}: {
  document: ProposalDocument | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={document != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="truncate text-sm">{document?.name}</DialogTitle>
        </DialogHeader>
        {document && (
          <iframe
            src={document.file_url}
            title={document.name}
            className="w-full flex-1 bg-muted"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One client-facing section, in the paper style shared by every surface. */
export function ProposalSection({
  section,
  preview,
  onNavigate,
  portal,
}: {
  section: PreviewTab;
  preview: PreviewData;
  onNavigate?: (tab: PreviewTab) => void;
  portal?: PortalActions;
}) {
  const [viewing, setViewing] = React.useState<ProposalDocument | null>(null);
  const { general, business, services, payment, introduction, documents, terms, thankYou, notification, client } =
    preview;
  const clientName = client?.name || "Your client";
  const proposalName = general.proposal_name || "Untitled Proposal";
  const currency = general.currency_code || "AUD";
  const businessName = business.name || "Your Business";
  const totals = serviceTotals(services);
  const total = services.reduce((sum, service) => sum + Number(service.amount || 0), 0);
  const subtotal = services.reduce(
    (sum, service) => sum + Number(service.quantity || 0) * Number(service.price || 0),
    0,
  );

  if (section === "Cover") {
    return (
      <>
        {business.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxiedImage(business.logo)}
            alt={businessName}
            className="mx-auto size-24 rounded-full border border-border object-cover shadow-sm"
          />
        ) : (
          <div className="mx-auto grid size-24 place-items-center rounded-full border border-border bg-primary/10 shadow-sm">
            <span className="text-3xl text-primary">
              {businessName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <p className="mt-3 text-[13px] font-semibold tracking-wide text-foreground">
          {businessName}
        </p>
        <p className="mt-10 text-[14px] text-primary">
          A proposal prepared for
        </p>
        <h1 className="mt-1 break-words text-[40px] font-normal leading-tight text-foreground sm:text-[48px]">
          {clientName}
        </h1>
        <p className="mt-4 text-[16px] text-foreground">{proposalName}</p>
        <button
          type="button"
          onClick={() => onNavigate?.("Introduction")}
          className="mx-auto mt-8 flex h-11 min-w-[220px] items-center justify-center gap-2 rounded-full border border-primary px-8 text-[13px] text-primary"
        >
          Read your proposal
          <ChevronRight className="size-4" />
        </button>
        <p className="mt-4 text-[12px] text-muted-foreground">
          Curated with care by {introduction.message_from || businessName}
        </p>
        <div className="mt-16 border-t border-border pt-6">
          <p className="text-[14px] text-primary">{businessName}</p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Issued {formatProposalDate(general.issued_at ?? new Date().toISOString())} - Validity{" "}
            {general.is_auto_expire ? `${general.expire_in_days || 30} days` : "Open-ended"}
          </p>
        </div>
      </>
    );
  }

  if (section === "Introduction") {
    return <IntroductionPages preview={preview} />;
  }

  if (section === "Services") {
    return (
      <div className="mx-auto max-w-xl text-left">
        <p className="text-lg text-primary">
          Services prepared for {clientName}
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-foreground">Services</h1>
        <DotDivider />
        <p className="text-[13px] text-muted-foreground">
          What&apos;s included in this proposal.
        </p>
        <div className="mt-6 space-y-4">
          {services.length > 0 ? (
            services.map((service, index) => (
              <div
                key={`${service.description}-${index}`}
                className="overflow-hidden rounded-2xl border border-border bg-primary/5"
              >
                <div className="relative h-14 overflow-hidden">
                  <svg
                    viewBox="0 0 300 56"
                    preserveAspectRatio="none"
                    className="absolute inset-0 size-full"
                    aria-hidden
                  >
                    <path
                      d="M0,0 H300 V36 Q255,56 200,40 Q148,24 100,48 Q52,64 0,38 Z"
                      className="fill-primary"
                      fillOpacity="0.12"
                    />
                  </svg>
                  <h2 className="relative px-5 pb-2 pt-4 text-[16px] font-semibold text-foreground">
                    {service.description}
                  </h2>
                </div>
                <div className="flex items-start justify-between gap-6 px-5 pb-4 pt-1">
                  <p className="text-sm text-muted-foreground">
                    Qty {service.quantity || 0} x {formatProposalMoney(Number(service.price), currency)}
                    {(Number(service.discount_percent) > 0 || Number(service.gst_percent) > 0) && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {[
                          Number(service.discount_percent) > 0 &&
                            `${service.discount_percent}% discount`,
                          Number(service.gst_percent) > 0 && `${service.gst_percent}% GST`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </p>
                  <span className="font-semibold text-foreground">
                    {formatProposalMoney(service.amount, currency)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
              No services added yet.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (section === "Pricing") {
    const rate = Number(preview.exchange.exchange_rate);
    const showAud =
      preview.exchange.is_multicurrency && rate > 0 && currency.toUpperCase() !== "AUD";
    const audTotal = showAud ? total / rate : null;
    const bank = business.bank;

    return (
      <div className="mx-auto max-w-lg text-left">
        <p className="text-lg text-primary">Pricing summary</p>
        <h1 className="mt-3 text-4xl font-semibold text-foreground">
          {formatProposalMoney(total, currency)}
        </h1>
        {showAud && audTotal != null && (
          <p className="mt-1 text-[14px] text-muted-foreground">
            ≈ {formatProposalMoney(audTotal, "AUD")} AUD
          </p>
        )}
        <DotDivider />
        <p className="text-[13px] text-muted-foreground">
          Here&apos;s how the total breaks down.
        </p>

        <div className="mt-6 space-y-3 rounded-2xl border border-border bg-primary/5 p-6 text-base">
          <PriceRow label="Subtotal" value={formatProposalMoney(subtotal, currency)} />
          {totals.discount > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-muted-foreground">Discount</span>
              <span className="rounded-full border border-destructive/40 px-3 text-[12px] text-destructive">
                -{formatProposalMoney(totals.discount, currency)}
              </span>
            </div>
          )}
          <PriceRow label="GST" value={formatProposalMoney(totals.gst, currency)} divided />
          {showAud && audTotal != null && (
            <div className="flex justify-between border-t border-border pt-3">
              <span className="text-muted-foreground">Total in AUD</span>
              <span className="text-right">
                <span className="font-semibold text-foreground">
                  {formatProposalMoney(audTotal, "AUD")}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  1 AUD = {rate.toFixed(2)} {currency}
                </span>
              </span>
            </div>
          )}
          <PriceRow
            label="Payment"
            divided
            value={
              payment.payment_required
                ? `Required via ${paymentMethodLabel(payment.pay_method) || "method pending"}`
                : "Not required"
            }
          />
        </div>

        {payment.payment_required && payment.pay_method === "manual" && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            {payment.is_paid && <PaidStamp />}
            <p className="text-[15px] font-bold text-foreground">Payment Details</p>
            <dl className="mt-2 space-y-1.5 text-[14px]">
              <BankRow label="Acc Name" value={bank?.account_holder} />
              <BankRow label="BSB" value={bank?.bsb} />
              <BankRow label="Acc No" value={bank?.account_number} />
            </dl>
          </div>
        )}

        {payment.payment_required && payment.pay_method === "stripe" && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4 text-center">
            {payment.is_paid ? (
              <div className="flex flex-col items-center gap-2">
                <PaidStamp />
                <p className="text-[12px] text-muted-foreground">
                  Paid via {paymentMethodLabel(payment.paid_method)}
                  {payment.paid_at && ` on ${formatProposalDate(payment.paid_at)}`}
                </p>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-muted-foreground">
                  Pay securely online — your card details never touch our servers.
                </p>
                <button
                  type="button"
                  onClick={portal?.onPayStripe}
                  disabled={!portal?.onPayStripe || portal.payingStripe}
                  className="mx-auto mt-3 flex h-11 w-fit items-center justify-center gap-2 rounded-full bg-primary px-8 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {portal?.payingStripe ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CreditCard className="size-4" />
                  )}
                  {portal?.payingStripe ? "Redirecting to Stripe…" : "Pay by Stripe"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  if (section === "Terms") {
    return (
      <div className="mx-auto max-w-xl text-left">
        <p className="text-lg text-primary">Terms &amp; conditions</p>
        <h1 className="mt-3 text-4xl font-semibold text-foreground">
          {terms.title || "Terms & Conditions"}
        </h1>
        <DotDivider />
        <p className="text-[13px] text-muted-foreground">
          Please read the following terms carefully before signing.
        </p>
        {!isBlankHtml(terms.body) ? (
          <RichHtml
            html={terms.body}
            className="mt-7 text-[14px] leading-relaxed text-foreground"
          />
        ) : (
          <p className="mt-7 text-[14px] leading-relaxed text-foreground">
            Terms and signature content will appear here once it is added.
          </p>
        )}

        {documents.length > 0 && (
          <div className="mt-10 rounded-2xl border border-border bg-primary/5 p-5">
            <h2 className="text-base font-semibold text-foreground">Additional documents</h2>
            <div className="mt-4 space-y-3">
              {documents.map((document, index) => (
                <div
                  key={`${document.name}-${index}`}
                  className="flex items-center gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0"
                >
                  <FileText className="size-4 shrink-0 text-red-400" aria-hidden />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {document.name || `Document ${index + 1}`}
                  </span>
                  {document.file_url ? (
                    <button
                      type="button"
                      onClick={() => setViewing(document)}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      View
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Pending upload</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {terms.require_signature && (
          <div className="mt-12 flex items-center justify-between gap-4 rounded-xl border border-dashed border-border px-6 py-5 text-left">
            <div className="min-w-0 flex-1">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Signed by
              </p>
              {portal?.signed && portal.signatureName ? (
                <p className={cn(SIGNATURE_FONT_CLASS, "mb-1 text-[32px] leading-none text-foreground")}>
                  {portal.signatureName}
                </p>
              ) : (
                <div className="mb-3 h-px w-10 bg-foreground/60" />
              )}
              <p className="text-[12px] text-muted-foreground">
                {portal?.signed
                  ? `${portal.signatureName || terms.signer_label || "Client signature"} · ${formatProposalDate(portal.signedAt)}`
                  : terms.signer_label || "Client signature"}
              </p>
            </div>
            {portal?.signed ? (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-[12px] font-medium text-success">
                <Check className="size-3.5" />
                Signed
              </span>
            ) : (
              portal?.onAcceptSign && (
                <button
                  type="button"
                  onClick={portal.onAcceptSign}
                  className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <PenLine className="size-3.5" />
                  Accept &amp; Sign
                </button>
              )
            )}
          </div>
        )}

        <DocumentPreviewDialog document={viewing} onClose={() => setViewing(null)} />
      </div>
    );
  }

  if (section === "Thank You") {
    return (
      <div className="mx-auto flex min-h-[520px] max-w-lg flex-col items-center justify-center text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="h-px w-14 bg-primary/30" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Engagement Confirmed
          </span>
          <span className="h-px w-14 bg-primary/30" />
        </div>
        <div className="relative mb-2 grid place-items-center">
          <div className="absolute size-20 rounded-full bg-primary/30 opacity-30" />
          <div className="relative grid size-14 place-items-center rounded-full bg-primary/15">
            <Check className="size-[22px] text-primary" strokeWidth={2.5} />
          </div>
        </div>
        <h1 className="mt-4 text-5xl font-semibold text-foreground">
          {thankYou.title || "Thank you"}
        </h1>
        <p className="mx-auto mt-5 max-w-[420px] whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
          {thankYou.message || "Thanks for accepting this proposal."}
        </p>
        {thankYou.button_label && (
          <span className="mt-9 rounded-full border-2 border-primary px-8 py-3 text-lg text-primary">
            {thankYou.button_label}
          </span>
        )}
        <div className="mb-8 mt-10 h-px w-full bg-primary/20" />
        <p className={cn(SIGNATURE_FONT_CLASS, "text-[38px] leading-tight text-primary")}>
          {businessName}
        </p>
        <p className="mb-3 mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Your dedicated advisor · {businessName}
        </p>
        <p className="text-[14px] text-muted-foreground">Welcome aboard.</p>
      </div>
    );
  }

  // Email — internal-only: what goes out when Send is clicked.
  const enabled = notification.send_notification !== false;
  const cc = notification.cc_emails ?? [];
  const recipient = client?.email
    ? cc.length
      ? `${client.email} and ${cc.length} other${cc.length > 1 ? "s" : ""}`
      : client.email
    : null;
  const initial = businessName.charAt(0).toUpperCase();

  if (!enabled) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-muted-foreground">
        Email notification is disabled for this proposal — nothing will be sent
        when you click Send.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card text-left text-foreground shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <span className="ml-2 text-[12px] text-muted-foreground">Inbox</span>
        </div>
        <Search className="size-3.5 text-muted-foreground" aria-hidden />
      </div>
      <div className="px-6 pb-6 pt-5">
        <h2 className="mb-3 text-[20px] font-bold leading-tight text-foreground">
          Proposal from {notification.message_from || businessName}
        </h2>
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded bg-primary/10 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Inbox
          </span>
          <span className="rounded bg-warning/10 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-warning">
            Proposal
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
              {initial}
            </div>
            <div>
              <span className="text-[13px] font-semibold text-foreground">{businessName}</span>
              <p className="mt-[2px] text-[12px] text-muted-foreground">
                to{" "}
                {recipient ? (
                  <span className="text-foreground">{recipient}</span>
                ) : (
                  <span className="text-warning">No client email on file</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
            <span className="text-[11px] text-muted-foreground">
              {formatProposalDate(new Date().toISOString(), true)}
            </span>
            <Reply className="size-3.5" aria-hidden />
            <MoreHorizontal className="size-3.5" aria-hidden />
          </div>
        </div>
        <div className="my-4 h-px bg-muted" />
        {!isBlankHtml(notification.email_body) ? (
          <RichHtml
            html={notification.email_body}
            className="mb-5 text-[13px] leading-relaxed text-foreground"
          />
        ) : (
          <p className="mb-5 text-[13px] text-muted-foreground">
            No custom message added — the client will just receive the standard
            proposal email with a link to view and respond.
          </p>
        )}
        <div className="mb-4 h-px bg-muted" />
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-border p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-border text-[13px] font-semibold text-muted-foreground">
            {initial}
          </div>
          <p className="text-[13px] font-semibold text-foreground">{businessName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-[12px] font-medium">
            <Reply className="size-3.5" aria-hidden /> Reply
          </span>
          <span className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-[12px] font-medium">
            <CornerUpRight className="size-3.5" aria-hidden /> Forward
          </span>
        </div>
      </div>
    </div>
  );
}

function PriceRow({
  label,
  value,
  divided,
}: {
  label: string;
  value: string;
  divided?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-4", divided && "border-t border-border pt-3")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}

function BankRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-1">
      <dt className="font-bold text-foreground">{label}:</dt>
      <dd className="font-medium text-foreground">{value || "Not provided"}</dd>
    </div>
  );
}

function PaidStamp() {
  return (
    <span className="mb-3 inline-flex items-center gap-2 rounded-full border-2 border-emerald-600 px-4 py-1.5 text-[13px] font-bold uppercase tracking-wide text-emerald-600">
      <Check className="size-4" strokeWidth={3} />
      Paid
    </span>
  );
}

/** A section on its sheet — the introduction and email bring their own. */
export function SectionCard({
  section,
  preview,
  onNavigate,
  portal,
}: {
  section: PreviewTab;
  preview: PreviewData;
  onNavigate?: (tab: PreviewTab) => void;
  portal?: PortalActions;
}) {
  if (section === "Introduction") return <IntroductionPages preview={preview} />;
  if (section === "Email") {
    return (
      <div className="mx-auto max-w-[760px]">
        <ProposalSection section={section} preview={preview} onNavigate={onNavigate} />
      </div>
    );
  }
  return (
    <div className={PAPER_PAGE}>
      <ProposalSection section={section} preview={preview} onNavigate={onNavigate} portal={portal} />
    </div>
  );
}

/** Every client-facing section stacked as its own page — for the PDF. */
export function ProposalDocumentPages({
  preview,
  portal,
}: {
  preview: PreviewData;
  portal?: Pick<PortalActions, "signed" | "signatureName" | "signedAt">;
}) {
  return (
    <div className="space-y-6 bg-primary/10 p-4 sm:p-6">
      {PREVIEW_TABS.map((tab) => (
        <SectionCard key={tab} section={tab} preview={preview} portal={portal} />
      ))}
    </div>
  );
}

