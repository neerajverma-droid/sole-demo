"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  HeartHandshake,
  LayoutTemplate,
  Search,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterPills } from "@/components/ui/filter-pills";
import {
  DocumentCapture,
  type DocumentCaptureHandle,
} from "@/components/shared/document-capture";
import { InvoiceTemplateCard } from "@/components/invoices/invoice-template-card";
import { TemplatePreviewDialog } from "@/components/invoices/template-preview-dialog";
import {
  fetchInvoiceDefaults,
  filterTemplates,
  templateHref,
  filtersForTemplates,
  type InvoiceTemplate,
  type TemplateFilter,
} from "@/lib/invoice-templates";
import {
  isNdisBusinessProfile,
  useActiveBusiness,
} from "@/hooks/use-active-business";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import { useBulkImportCountry } from "@/hooks/use-bulk-import-country";
import { extractInvoiceApi, invoiceCaptureEditor } from "@/lib/ocr-capture";
import { cn } from "@/lib/utils";
import { useCaptureStore } from "@/stores/capture";
import { useInvoicesStore } from "@/stores/invoices";
import { EVENTS } from "@/lib/analytics-events";
import { useTrackOnce } from "@/hooks/use-track-once";

/**
 * The canonical chooser pattern from the design: an inline page, never a modal.
 * Two tiers — the quick paths as action cards, then templates as a gallery.
 */
export function CreateInvoiceChooser() {
  useTrackOnce(EVENTS.INVOICE_CREATION_INITIATED);
  const router = useRouter();
  const captureRef = React.useRef<DocumentCaptureHandle>(null);
  const setCapturedInvoice = useCaptureStore((state) => state.setInvoice);
  const favourites = useInvoicesStore((state) => state.favouriteTemplates);
  const setFavourites = useInvoicesStore(
    (state) => state.setFavouriteTemplates,
  );
  const [filter, setFilter] = React.useState<TemplateFilter>("All");
  const [query, setQuery] = React.useState("");
  const [previewing, setPreviewing] = React.useState<InvoiceTemplate | null>(
    null,
  );

  /*
   * The open business's own profile, read from the store rather than fetched:
   * the businesses list already carries the full record, so its industry is
   * in hand without a second request. Its industry decides both which
   * template collection is loaded and whether the NDIS card appears.
   */
  const {
    business,
    ready: businessReady,
    error: businessError,
  } = useActiveBusiness();
  // The business's own word for its tax ("GST", "VAT"), for the read GST row.
  const country = useBulkImportCountry();
  const industryId = business?.industryId ?? null;

  const ndisReady = isNdisBusinessProfile(business);
  /** Shown once a provider is set up bar their own registration number. */
  const providerNumberMissing = ndisReady && !business?.ndisNumber;

  const templatesQuery = useQuery({
    queryKey: ["invoice-defaults", industryId],
    queryFn: () => fetchInvoiceDefaults(industryId),
    // Waits for the business list to settle either way, so the industry
    // filter sent to the server is the real one rather than always-null.
    enabled: businessReady || businessError,
  });
  const loadingTemplates = templatesQuery.isLoading;

  React.useEffect(() => {
    if (templatesQuery.data) setFavourites(templatesQuery.data.favouriteIds);
  }, [templatesQuery.data, setFavourites]);

  const templates = templatesQuery.data?.templates ?? [];
  const filters = filtersForTemplates();
  // A pill can vanish under you when the industry changes — fall back to
  // All rather than showing an empty grid for a view this set doesn't have.
  const active = filters.includes(filter) ? filter : "All";

  const results = filterTemplates(templates, active, query, favourites);

  return (
    <div className="mx-auto max-w-full space-y-[15px]">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild className="-ml-2">
          <Link href="/invoices" aria-label="Back">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-sm font-medium">Create invoice</h1>
      </div>

      {/* Tier 1 — the quick paths. NDIS sits in the middle when it's on. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-[15px]",
          ndisReady ? "md:grid-cols-3" : "md:grid-cols-2",
        )}
        data-usertour="invoice-create-methods"
      >
        <MethodCard
          href="/invoices/new/general"
          title="Create General Invoice"
          body="Create a standard invoice for general business purposes"
          // Neutral now: for a provider who can raise an NDIS claim, the
          // general invoice is the fallback rather than the recommended path.
          icon={<FileText className="size-5 text-muted-foreground" />}
        />
        {ndisReady && (
          <MethodCard
            href="/invoices/new/ndis"
            title="NDIS Invoice"
            tag="Recommended"
            body="Create an NDIS-compliant invoice for disability services"
            // The one card carrying the brand treatment — indigo tile, its
            // icon knocked out white, and the highlighted border.
            recommended
            icon={<HeartHandshake className="size-5 text-primary-foreground" />}
          />
        )}
        <MethodCard
          title="Upload Invoice"
          body="Drag and drop your invoice file here, or click to browse — supports PDF, PNG, JPG, JPEG, max 10MB"
          icon={<Upload className="size-5 text-muted-foreground" />}
          // The copy invites a drop, so catch it — the browser's default is to
          // navigate away and open the file, which loses the page.
          onDrop={(files) => captureRef.current?.take(files[0])}
          onClick={() => captureRef.current?.open()}
        />
      </div>

      {/* Appears once a file is chosen: upload, read, then hand the reading to
          the general invoice form. */}
      <DocumentCapture
        handleRef={captureRef}
        noun="invoice"
        folder="invoice-uploads"
        extract={extractInvoiceApi}
        editor={invoiceCaptureEditor}
        fields={({ fields }) => [
          { label: "Invoice number", value: fields.number },
          { label: "Client name", value: fields.clientName },
          {
            label: "Invoice date",
            value: fields.issued ? formatInvoiceDate(fields.issued) : "",
          },
          {
            label: "Due date",
            value: fields.due ? formatInvoiceDate(fields.due) : "",
          },
          // The tax apart from what it was charged on, and only when the
          // document charges any — no GST row for one that doesn't.
          ...(fields.tax
            ? [
                {
                  label: "Subtotal",
                  value: fields.subtotal
                    ? invoiceMoney(Number(fields.subtotal))
                    : "",
                },
                {
                  label: country.taxWord,
                  value: invoiceMoney(Number(fields.tax)),
                },
              ]
            : []),
          {
            label: "Total amount",
            value: fields.total ? invoiceMoney(Number(fields.total)) : "",
          },
          { label: "Description", value: fields.description },
          {
            label: "Items",
            value: fields.items.some((item) => item.price)
              ? String(fields.items.length)
              : "",
          },
        ]}
        onUse={({ fields, confidence }) => {
          setCapturedInvoice({ fields, confidence });
          router.push("/invoices/new/general?capture=1");
        }}
      />

      {/* A provider who hasn't recorded their own registration number yet —
          claims still work, they just print without it. */}
      {providerNumberMissing && (
        <p className="text-sm text-muted-foreground">
          Your 9-digit provider number is missing, so it won&apos;t print on
          your claims.{" "}
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
      <section className="space-y-[15px]" data-usertour="invoice-template-gallery">
        {/* The tour points at this row, not the gallery: dozens of cards
            are taller than any screen. */}
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          data-usertour="invoice-template-search"
        >
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Start from a template
            </h2>
            {templates.length > 0 && (
              <span className="text-sm text-muted-foreground tabular">
                {templates.length} templates
              </span>
            )}
          </div>
          {/* Nothing to search until there's something to find. */}
          {templates.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search templates"
                aria-label="Search templates"
                className="pl-9"
              />
            </div>
          )}
        </div>

        {loadingTemplates ? (
          <TemplateGrid>
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
          </TemplateGrid>
        ) : templatesQuery.isError ? (
          /* A failed load isn't "no templates" — say so, and offer the retry. */
          <Empty>
            <EmptyMedia>
              <LayoutTemplate aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Couldn&apos;t load templates</EmptyTitle>
              <EmptyDescription>
                Something went wrong fetching them. You can still create an
                invoice from scratch above.
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
          /* Nothing exists, so there's nothing to filter or clear. */
          <Empty>
            <EmptyMedia>
              <LayoutTemplate aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No templates yet</EmptyTitle>
              <EmptyDescription>
                Templates you save while building an invoice show up here.
                Create one manually to get started.
              </EmptyDescription>
            </div>
          </Empty>
        ) : (
          <>
            <FilterPills
              label="Filter templates"
              options={filters}
              value={active}
              onChange={setFilter}
            />

            <div className="space-y-3">
              <SubHeading>
                {results.length}{" "}
                {results.length === 1 ? "template" : "templates"}
              </SubHeading>

              {results.length === 0 ? (
                <Empty>
                  <EmptyMedia>
                    <Search aria-hidden />
                  </EmptyMedia>
                  <div className="space-y-1">
                    <EmptyTitle>
                      {active === "Created by you" && !query.trim()
                        ? "No templates created yet"
                        : "No templates match"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {active === "Created by you" && !query.trim()
                        ? "Templates you save while building an invoice show up here."
                        : "Try a different search, or go back to all templates."}
                    </EmptyDescription>
                  </div>
                  {(active !== "All" || query.trim()) && (
                    <EmptyActions>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setQuery("");
                          setFilter("All");
                        }}
                      >
                        Show all templates
                      </Button>
                    </EmptyActions>
                  )}
                </Empty>
              ) : (
                <TemplateGrid>
                  {results.map((template) => (
                    <InvoiceTemplateCard
                      key={template.id}
                      template={template}
                      onPreview={setPreviewing}
                    />
                  ))}
                </TemplateGrid>
              )}
            </div>
          </>
        )}
      </section>

      <TemplatePreviewDialog
        template={previewing}
        href={previewing ? templateHref(previewing) : "#"}
        onOpenChange={(open) => !open && setPreviewing(null)}
      />
    </div>
  );
}

/**
 * Three across once there are three to show. Below that it lays out as a flex
 * row instead, with the cards held at the width a grid column would have given
 * them — so a short list neither leaves an empty cell nor stretches its cards
 * to fill one.
 */
function TemplateGrid({ children }: { children: React.ReactNode }) {
  if (React.Children.count(children) >= 3) {
    return (
      <div className="grid grid-cols-1 gap-[15px] sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    );
  }

  // Widths match the grid's columns exactly: gap is 15px, so a third is
  // 33.333% − 10px and a half is 50% − 7.5px.
  return (
    <div className="flex flex-wrap gap-[15px] [&>*]:w-full sm:[&>*]:w-[calc(50%-7.5px)] lg:[&>*]:w-[calc(33.333%-10px)]">
      {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground tabular">
      {children}
    </h3>
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
  onDrop,
}: {
  href?: string;
  title: string;
  tag?: string;
  body: string;
  icon: React.ReactNode;
  recommended?: boolean;
  onClick?: () => void;
  /** Only for the upload card, whose copy invites a dropped file. */
  onDrop?: (files: FileList) => void;
}) {
  const className = cn(
    "flex h-full cursor-pointer items-start gap-4 rounded-lg border p-5 text-left",
    "shadow-sm outline-none transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md",
    "focus-visible:ring-2 focus-visible:ring-ring",
    recommended
      ? "border-primary/30 bg-primary/[0.02]"
      : "border-border bg-card",
  );

  const body_ = (
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
      {body_}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDrop ? (event) => event.preventDefault() : undefined}
      onDrop={
        onDrop
          ? (event) => {
              event.preventDefault();
              onDrop(event.dataTransfer.files);
            }
          : undefined
      }
      className={className}
    >
      {body_}
    </button>
  );
}
