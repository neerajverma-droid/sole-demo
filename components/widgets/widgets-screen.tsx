"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, ExternalLink, LibraryBig, Star } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { TaxEstimatorCover } from "@/components/widgets/tax-estimator-cover";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { paginate } from "@/lib/products";
import {
  HERO_WIDGET,
  gridWidgets,
  isExternal,
  type Widget,
} from "@/lib/widgets";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [10, 20, 50] as const;

/**
 * Widgets & Resources.
 *
 * The Tax Estimator leads; everything else is a card with its cover photo,
 * paged. Fitness-only guides are shown only to fitness businesses, matching
 * the old /widget page.
 */
export function WidgetsScreen() {
  const { business } = useActiveBusiness();
  const widgets = useMemo(
    () => gridWidgets(business?.industryId),
    [business?.industryId],
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const paged = paginate(widgets, page, pageSize);

  return (
    <div className="space-y-8">
      <PageHeader
        icon={LibraryBig}
        title="Widgets & Resources"
        description="Explore our collection of tools and guides to help your business succeed"
      />

      <FeaturedTool />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            More Resources &amp; Guides
          </h2>
          <p className="text-sm text-muted-foreground">
            Additional tools and educational resources to support your business
            journey
          </p>
        </div>

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {paged.rows.map((widget) => (
            <li key={widget.id}>
              <WidgetCard widget={widget} />
            </li>
          ))}
        </ul>

        {widgets.length > PAGE_SIZES[0] && (
          <NumberedPagination
            page={paged}
            pageSize={pageSize}
            pageSizes={PAGE_SIZES}
            onPageChange={(next) => {
              setPage(next);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
            itemLabel="resource"
            navLabel="Resources pages"
          />
        )}
      </section>
    </div>
  );
}

/** The hero: white on the brand indigo, cover down one side. */
function FeaturedTool() {
  return (
    <div className="overflow-hidden rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 shadow-sm">
      <div className="grid lg:grid-cols-3">
        <div className="relative h-40 lg:h-auto">
          <TaxEstimatorCover className="absolute inset-0" />
        </div>

        <div className="flex flex-col items-start gap-4 p-6 lg:col-span-2 lg:p-8">
          <Badge
            variant="outline"
            className="gap-1.5 rounded-full border-transparent bg-amber-300 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-950"
          >
            <Star className="size-3 fill-current" aria-hidden />
            Featured tool
          </Badge>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {HERO_WIDGET.title}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-white/85">
              {HERO_WIDGET.description}
            </p>
          </div>

          <Button
            asChild
            className="mt-auto bg-white text-primary shadow-sm hover:bg-white/90"
          >
            <Link href={HERO_WIDGET.href}>
              Launch Tax Estimator
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One guide, calculator or template.
 *
 * The whole card is the link, laid over the content under the button, so a
 * card with one action doesn't make anyone aim. External guides open in a new
 * tab.
 */
function WidgetCard({ widget }: { widget: Widget }) {
  const external = isExternal(widget.href);

  return (
    <Card
      className={cn(
        "group relative flex h-full flex-col overflow-hidden p-0",
        "motion-safe:transition-all motion-safe:duration-200",
        "hover:border-primary/30 hover:shadow-md",
      )}
    >
      <div className="relative h-[168px] w-full shrink-0 bg-muted">
        {/* Marketing-site photos at assorted sizes; a plain img keeps them out
            of the image optimiser's remote-host allowlist. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={widget.image}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
        {widget.featured && (
          <Badge
            variant="outline"
            className="absolute right-3 top-3 rounded-full border-transparent bg-white/90 px-2 py-0 text-[10px] font-semibold uppercase tracking-wider text-primary shadow-sm"
          >
            Featured
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight">
          {widget.title}
        </h3>
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {widget.description}
        </p>

        <div className="relative z-10 mt-auto pt-3">
          <Button asChild className="w-full">
            {external ? (
              <a href={widget.href} target="_blank" rel="noopener noreferrer">
                Open Widget
                <ExternalLink aria-hidden />
              </a>
            ) : (
              <Link href={widget.href}>Open Widget</Link>
            )}
          </Button>
        </div>
      </div>

      {external ? (
        <a
          href={widget.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${widget.title}`}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <Link
          href={widget.href}
          aria-label={`Open ${widget.title}`}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </Card>
  );
}
