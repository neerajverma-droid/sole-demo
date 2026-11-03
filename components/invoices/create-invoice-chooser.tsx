"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock,
  FileText,
  HeartHandshake,
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
import { extractInvoiceApi, invoiceCaptureEditor } from "@/lib/ocr-capture";
import { cn } from "@/lib/utils";
import { useCaptureStore } from "@/stores/capture";
import { useInvoicesStore } from "@/stores/invoices";

/**
 * The canonical chooser pattern from the design: an inline page, never a modal.
 * Two tiers — the quick paths as action cards, then templates as a gallery.
 */
export function CreateInvoiceChooser() {
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
  const filters = filtersForTemplates(templates);
  // A pill can vanish under you when the industry changes — fall back to All
  // rather than showing an empty grid for a category this set doesn't have.
  const active = filters.includes(filter) ? filter : "All";

  const results = filterTemplates(templates, active, query, favourites);
  const recent = templates.filter((template) => template.recentlyUsed);
  // Recently used is a landing affordance; once you filter or search, the one
  // filtered grid is the answer and repeating those cards above it is noise.
  const showRecent = active === "All" && !query.trim();

  return (
    <div className="mx-auto max-w-full space-y-[15px]">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-3">
          <Link href="/invoices">
            <ArrowLeft />
            Create invoice
          </Link>
        </Button>
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
            <span className="text-sm text-muted-foreground tabular">
              {templates.length} templates
            </span>
          </div>
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
        </div>

        {loadingTemplates ? (
          <TemplateGrid>
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
            <Skeleton className="h-48 w-full rounded-lg" aria-hidden />
          </TemplateGrid>
        ) : (
          <>
            <FilterPills
              label="Filter templates"
              options={filters}
              value={active}
              onChange={setFilter}
            />

            {showRecent && recent.length > 0 && (
              <div className="space-y-3">
                <SubHeading icon={<Clock className="size-4" aria-hidden />}>
                  Recently used
                </SubHeading>
                <TemplateGrid>
                  {recent.map((template) => (
                    <InvoiceTemplateCard
                      key={template.id}
                      template={template}
                      onPreview={setPreviewing}
                    />
                  ))}
                </TemplateGrid>
              </div>
            )}

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
                    <EmptyTitle>No templates match</EmptyTitle>
                    <EmptyDescription>
                      Try a different search or clear the filters to see all{" "}
                      {templates.length} templates.
                    </EmptyDescription>
                  </div>
                  <EmptyActions>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuery("");
                        setFilter("All");
                      }}
                    >
                      Clear filters
                    </Button>
                  </EmptyActions>
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
 * them — so a two-card subsection like Recently used neither leaves an empty
 * cell nor stretches its cards to fill one.
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

function SubHeading({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground tabular">
      {icon}
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
