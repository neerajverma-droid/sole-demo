"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FilePlus2,
  HeartHandshake,
  LayoutTemplate,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterPills } from "@/components/ui/filter-pills";
import { QuoteTemplateCard } from "@/components/quotes/quote-template-card";
import { TemplatePreviewDialog } from "@/components/invoices/template-preview-dialog";
import {
  isNdisBusinessProfile,
  useActiveBusiness,
} from "@/hooks/use-active-business";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/api-error";
import { toggleInvoiceDefaultFavouriteApi } from "@/lib/invoice-templates";
import {
  fetchQuoteTemplates,
  quoteTemplateHref,
  quoteTemplatePreviewTarget,
  type QuoteTemplate,
} from "@/lib/quotes";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";
import { EVENTS } from "@/lib/analytics-events";
import { useTrackOnce } from "@/hooks/use-track-once";

/** The gallery's tabs: every template, the account's own, and the starred ones. */
const TEMPLATE_TABS = ["All", "Created by you", "Favourites"] as const;
type TemplateTab = (typeof TEMPLATE_TABS)[number];

/**
 * Same two-tier chooser as Create invoice: the quick paths as action cards,
 * then templates as a browsable second tier. An inline page, never a modal.
 */
export function CreateQuoteChooser() {
  useTrackOnce(EVENTS.QUOTE_CREATION_INITIATED);
  const { country } = useCountryContext();
  const [previewing, setPreviewing] = React.useState<QuoteTemplate | null>(
    null,
  );
  const [tab, setTab] = React.useState<TemplateTab>("All");
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

  const queryClient = useQueryClient();
  const templatesKey = ["quote-templates", industryId] as const;

  const templatesQuery = useQuery({
    queryKey: templatesKey,
    queryFn: () => fetchQuoteTemplates(industryId),
    // Waits for the business list to settle either way, so the industry filter
    // sent to the server is the real one rather than always-null.
    enabled: ready || error,
  });
  const templates = templatesQuery.data ?? [];
  const loadingTemplates = templatesQuery.isLoading;

  /*
   * The star flips straight away, then the server's answer settles it — the
   * same optimistic toggle the invoice gallery uses. The per-user endpoint is
   * shared with invoices (it looks the template up by id).
   */
  const setFavourite = (id: string, favourite: boolean) =>
    queryClient.setQueryData<QuoteTemplate[]>(templatesKey, (old) =>
      old?.map((template) =>
        template.id === id ? { ...template, favourite } : template,
      ),
    );
  const toggleFavourite = useMutation({
    mutationFn: (template: QuoteTemplate) =>
      toggleInvoiceDefaultFavouriteApi(template.id),
    onMutate: (template) => setFavourite(template.id, !template.favourite),
    onSuccess: (isFavourite, template) => setFavourite(template.id, isFavourite),
    onError: (error, template) => {
      setFavourite(template.id, !!template.favourite);
      toast.error(apiErrorMessage(error, "Couldn't update your favourites."));
    },
  });

  const inTab = (template: QuoteTemplate, name: TemplateTab) =>
    name === "All"
      ? true
      : name === "Created by you"
        ? !template.standard
        : !!template.favourite;
  const shown = templates.filter((template) => inTab(template, tab));
  const tabCounts = Object.fromEntries(
    TEMPLATE_TABS.map((name) => [
      name,
      templates.filter((template) => inTab(template, name)).length,
    ]),
  ) as Record<TemplateTab, number>;

  return (
    <div className="mx-auto max-w-full space-y-[15px]">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild className="-ml-2">
          <Link href="/quotes" aria-label="Back">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-sm font-medium">Create quote</h1>
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
        ) : templatesQuery.isError ? (
          /* A failed load isn't "no templates" — say so, and offer the retry. */
          <Empty>
            <EmptyMedia>
              <LayoutTemplate aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Couldn&apos;t load templates</EmptyTitle>
              <EmptyDescription>
                Something went wrong fetching them. You can still create a
                quote from scratch above.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button
                variant="outline"
                size="sm"
                onClick={() => templatesQuery.refetch()}
              >
                Try again
              </Button>
            </EmptyActions>
          </Empty>
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
          <>
            <FilterPills
              label="Template type"
              options={TEMPLATE_TABS}
              value={tab}
              onChange={setTab}
              counts={tabCounts}
            />

            {shown.length === 0 ? (
              <Empty>
                <EmptyMedia>
                  <LayoutTemplate aria-hidden />
                </EmptyMedia>
                <div className="space-y-1">
                  <EmptyTitle>
                    {tab === "All"
                      ? "No templates yet"
                      : tab === "Created by you"
                        ? "No templates created yet"
                        : "No favourites yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {tab === "All"
                      ? "There are no templates for your business yet."
                      : tab === "Created by you"
                        ? "Templates you save while building a quote show up here."
                        : "Star a template and it shows up here."}
                  </EmptyDescription>
                </div>
              </Empty>
            ) : (
              <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((template) => (
                  <QuoteTemplateCard
                    key={template.id}
                    template={template}
                    onPreview={setPreviewing}
                    onToggleFavourite={(entry) => toggleFavourite.mutate(entry)}
                  />
                ))}
              </div>
            )}
          </>
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
