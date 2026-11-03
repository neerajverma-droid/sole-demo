"use client";

import * as React from "react";
import { Download, Loader2, PenLine, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SIGNATURE_FONT_CLASS } from "@/components/proposals/proposal-document";
import type { PreviewData } from "@/lib/proposals";
import { cn } from "@/lib/utils";

/**
 * The full-page "sign the engagement letter" view that replaces the tabbed
 * proposal while signing — sole-webapp's EngagementLetterView. The clauses
 * read live business, client and proposal data. `documentRef` wraps the
 * `.proposal-document-page` so the PDF capture can find it.
 */
export function EngagementLetter({
  preview,
  documentRef,
  signatureName,
  onSign,
  onDownload,
  downloading,
  onExit,
  onDecline,
  onFinish,
  finishing,
}: {
  preview: PreviewData;
  documentRef: React.RefObject<HTMLDivElement | null>;
  signatureName: string;
  onSign: () => void;
  onDownload: () => void;
  downloading: boolean;
  onExit: () => void;
  onDecline: () => void;
  onFinish: () => void;
  finishing: boolean;
}) {
  const businessName = preview.business.name || "the Service Provider";
  const clientName = preview.client?.name || "the Client";
  const proposalName = preview.general.proposal_name || "this proposal";
  const signed = Boolean(signatureName);

  return (
    <div className="flex h-dvh flex-col bg-muted/30">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-[15px] border-b border-border bg-background px-4 py-3 md:px-6">
        <h1 className="text-base font-semibold">Proposal acceptance</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading || finishing}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            {downloading ? "Generating..." : "Download PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={onExit} disabled={finishing}>
            <X />
            Exit signing
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-primary/10 p-4 sm:p-8">
        <div ref={documentRef}>
          <article className="proposal-document-page mx-auto max-w-[800px] rounded-2xl bg-card p-6 text-sm text-foreground shadow-sm sm:p-12">
            <h2 className="text-center text-lg font-bold uppercase tracking-wide">Engagement Letter</h2>
            <p className="mt-6 text-muted-foreground">
              This Engagement Letter (&quot;Agreement&quot;) is made between:
            </p>
            <div className="mt-4 grid gap-4 border-b border-border pb-4 sm:grid-cols-2">
              <p>
                <span className="font-semibold">Service Provider:</span> {businessName}
              </p>
              <p>
                <span className="font-semibold">Client:</span> {clientName}
              </p>
            </div>

            <Clause title="1. Purpose of Engagement">
              <p>
                {businessName} (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is engaged by {clientName}{" "}
                (&quot;you&quot;, &quot;your&quot;, &quot;client&quot;) to provide professional advisory and
                consulting services as outlined in the accepted proposal titled {proposalName}.
              </p>
            </Clause>

            <Clause title="2. Scope of Services">
              <p>The services to be provided include, but are not limited to:</p>
              {preview.services.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {preview.services.map((service, index) => (
                    <li key={`${service.description}-${index}`}>
                      {service.description || `Service ${index + 1}`}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2">
                The detailed scope, deliverables, and timelines are described in the Proposal Summary, which forms
                part of this Agreement.
              </p>
            </Clause>

            <Clause title="3. Commencement and Term">
              <p>This engagement commences on the date of acceptance of this Engagement Letter.</p>
              <ul className="mt-1 list-disc pl-5">
                <li>
                  Remains valid{" "}
                  {preview.general.is_auto_expire
                    ? `for ${preview.general.expire_in_days || 30} days`
                    : "until terminated"}
                  , unless terminated earlier.
                </li>
              </ul>
              <p className="mt-2">We will not act on any matters prior to acceptance unless agreed in writing.</p>
            </Clause>

            <Clause title="4. Fees and Payment">
              <p>Fees will be charged in accordance with the pricing outlined in the accepted proposal.</p>
              <p className="mt-1">Invoices will be issued as agreed and are payable within the stated payment terms.</p>
            </Clause>

            <div className="mt-10 flex justify-end">
              <button
                type="button"
                onClick={onSign}
                disabled={signed || finishing}
                className={cn(
                  "w-64 rounded-xl border-2 p-4 text-left transition-colors",
                  signed
                    ? "cursor-default border-success/40 bg-success/10"
                    : "border-warning/60 bg-warning/10 hover:bg-warning/15",
                )}
              >
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    signed ? "text-success" : "text-warning",
                  )}
                >
                  Signature
                </p>
                {signed ? (
                  <p className={cn(SIGNATURE_FONT_CLASS, "mt-1 text-[32px] leading-tight")}>{signatureName}</p>
                ) : (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-warning">
                    <PenLine className="size-3.5" />
                    Sign here
                  </p>
                )}
              </button>
            </div>
          </article>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-[15px] border-t border-border bg-background px-4 py-3 md:px-6">
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDecline}
          disabled={finishing}
        >
          <X />
          Decline &amp; exit
        </Button>
        <Button onClick={onFinish} disabled={!signed || finishing}>
          {finishing && <Loader2 className="animate-spin" />}
          {finishing ? "Finishing..." : "Finish signing"}
        </Button>
      </footer>
    </div>
  );
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-2 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
