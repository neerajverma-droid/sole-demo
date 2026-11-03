"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FilePlus2,
  HeartHandshake,
  LayoutTemplate,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteTemplateCard } from "@/components/quotes/quote-template-card";
import { TemplatePreviewDialog } from "@/components/invoices/template-preview-dialog";
import {
  isNdisBusinessProfile,
  useActiveBusiness,
} from "@/hooks/use-active-business";
import {
  fetchQuoteTemplates,
  quoteTemplateHref,
  quoteTemplatePreviewTarget,
  type QuoteTemplate,
} from "@/lib/quotes";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";

/**
 * Same two-tier chooser as Create invoice: the quick paths as action cards,
 * then templates as a browsable second tier. An inline page, never a modal.
 */
export function CreateQuoteChooser() {
  const { country } = useCountryContext();
  const [previewing, setPreviewing] = React.useState<QuoteTemplate | null>(
    null,
  );
  /**
   * The business's industry narrows the template set, exactly as it does on
   * Create invoice — the two galleries are the same endpoint.
   */
  const { business, ready, error } = useActiveBusiness();
  const industryId = business?.industryId ?? null;

  /** The same gate the NDIS quote route uses, so the two can't disagree. */
  const ndisReady = isNdisBusinessProfile(business);
  /** Shown once a provider is set up bar their own registration number. */
  const providerNumberMissing = ndisReady && !business?.ndisNumber;

  const templatesQuery = useQuery({
    queryKey: ["quote-templates", industryId],
    queryFn: () => fetchQuoteTemplates(industryId),
    // Waits for the business list to settle either way, so the industry filter
    // sent to the server is the real one rather than always-null.
    enabled: ready || error,
  });
  const templates = templatesQuery.data ?? [];
  const loadingTemplates = templatesQuery.isLoading;

  return (
    <div className="mx-auto max-w-full space-y-[15px]">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-3">
          <Link href="/quotes">
            <ArrowLeft />
            Create quote
          </Link>
        </Button>
      </div>

      {/* Tier 1 — the quick paths. NDIS sits beside the general one when it's
          available; otherwise there is only the one way to start. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-[15px]",
          ndisReady && "md:grid-cols-2",
        )}
        data-usertour="quote-create-methods"
      >
        <MethodCard
          href="/quotes/new/manual"
          title="Create manually"
          // Neutral once NDIS is available: for a provider who can raise an
          // NDIS quote, the general one is the fallback rather than the
          // recommended path — the same call Create invoice makes.
          tag={ndisReady ? undefined : "Fastest"}
          body={`Start from a blank, ${taxWord(country)}-ready quote and customise everything from scratch.`}
          recommended={!ndisReady}
          icon={
            <FilePlus2
              className={cn(
                "size-5",
                ndisReady ? "text-muted-foreground" : "text-primary-foreground",
              )}
            />
          }
        />
        {ndisReady && (
          <MethodCard
            href="/quotes/new/ndis"
            title="NDIS Quote"
            tag="Recommended"
            body="Quote NDIS-compliant supports, with support item numbers and claim types."
            recommended
            icon={<HeartHandshake className="size-5 text-primary-foreground" />}
          />
        )}
      </div>

      {/* A provider who hasn't recorded their own registration number yet —
          quotes still work, they just print without it. */}
      {providerNumberMissing && (
        <p className="text-sm text-muted-foreground">
          Your 9-digit provider number is missing, so it won&apos;t print on
          your quotes.{" "}
          <Link
            href="/settings?section=business"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Add it in Business details
          </Link>
          .
        </p>
      )}

      {/* Tier 2 — template gallery */}
      <section className="space-y-[15px]" data-usertour="quote-template-gallery">
        {/* The tour points at this row, not the gallery: a page of template
            cards is taller than any screen. */}
        <div
          className="flex flex-wrap items-baseline justify-between gap-2"
          data-usertour="quote-template-heading"
        >
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Start from a template
            </h2>
            <span className="text-sm text-muted-foreground tabular">
              {loadingTemplates
                ? "Loading…"
                : `${templates.length} ${templates.length === 1 ? "template" : "templates"}`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Reuse a saved layout so recurring quotes take seconds, not minutes.
          </p>
        </div>

        {loadingTemplates ? (
          <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
          </div>
        ) : templates.length === 0 ? (
          /* Said plainly rather than papered over with sample cards: a
             template that isn't saved on the account can't be started from. */
          <Empty>
            <EmptyMedia>
              <LayoutTemplate aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No saved templates yet</EmptyTitle>
              <EmptyDescription>
                Templates you save while building a quote show up here. Create
                one manually to get started.
              </EmptyDescription>
            </div>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <QuoteTemplateCard
                key={template.id}
                template={template}
                onPreview={setPreviewing}
              />
            ))}
          </div>
        )}
      </section>

      <TemplatePreviewDialog
        kind="quote"
        template={
          previewing
            ? { ...quoteTemplatePreviewTarget(previewing), name: previewing.name }
            : null
        }
        href={previewing ? quoteTemplateHref(previewing) : "#"}
        onOpenChange={(open) => !open && setPreviewing(null)}
      />
    </div>
  );
}

function MethodCard({
  href,
  title,
  tag,
  body,
  icon,
  recommended,
  onClick,
}: {
  href?: string;
  title: string;
  tag?: string;
  body: string;
  icon: React.ReactNode;
  recommended?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "flex h-full cursor-pointer items-start gap-4 rounded-lg border p-5 text-left",
    "shadow-sm outline-none transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md",
    "focus-visible:ring-2 focus-visible:ring-ring",
    recommended
      ? "border-primary/30 bg-primary/[0.02]"
      : "border-border bg-card",
  );

  const content = (
    <>
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-xl",
          recommended ? "bg-primary" : "bg-muted",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {tag && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {tag}
            </span>
          )}
        </span>
        <span className="block text-sm leading-relaxed text-muted-foreground">
          {body}
        </span>
      </span>
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
