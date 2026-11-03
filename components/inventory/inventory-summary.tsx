"use client";

import { Boxes, CircleCheck, CircleX, TriangleAlert } from "lucide-react";

import { HeroHairline } from "@/components/layout/page-header";
import { inventorySummary, type InventoryItem } from "@/lib/inventory";
import { CountUp } from "@/components/ui/count-up";
import { Shimmer } from "@/components/ui/shimmer";
import { STAT_TONES, type StatTone } from "@/components/ui/stat-cards";
import { cn } from "@/lib/utils";

/** The screen's hero. Stock states carry semantic colour; the total is brand. */
export function InventorySummary({
  items,
  loading,
}: {
  items: InventoryItem[];
  /** The list hasn't landed yet — shown in place of stale-looking zeroes. */
  loading?: boolean;
}) {
  const summary = inventorySummary(items);

  if (loading) {
    return (
      <Shimmer
        className="h-[148px] w-full rounded-lg border border-border"
        aria-hidden
      />
    );
  }

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-usertour="inventory-summary"
    >
      <HeroHairline />
      <dl className="grid divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <Stat
          icon={<Boxes aria-hidden />}
          label="Total items"
          value={summary.total}
          meta="Products & services"
        />
        <Stat
          icon={<CircleCheck aria-hidden />}
          label="In stock"
        tone="success"
          value={summary.inStock}
          meta="Healthy levels"
          iconTone="text-success"
        />
        <Stat
          icon={<TriangleAlert aria-hidden />}
          label="Low stock"
        tone="warning"
          value={summary.lowStock}
          meta="Reorder soon"
          iconTone="text-warning"
        />
        <Stat
          icon={<CircleX aria-hidden />}
          label="Out of stock"
        tone="danger"
          value={summary.outOfStock}
          meta="Needs restock"
          iconTone="text-destructive"
        />
      </dl>
    </section>
  );
}

function Stat({
  icon,
  tone = "primary",
  label,
  value,
  meta,
  iconTone,
}: {
  icon: React.ReactNode;
  /** What the figure means — see STAT_TONES. */
  tone?: StatTone;
  label: string;
  value: number;
  meta: string;
  iconTone?: string;
}) {
  return (
    <div className="min-w-0 p-5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
            STAT_TONES[tone],
            iconTone,
          )}
          aria-hidden
        >
          {icon}
        </span>
        <dt className="text-sm text-muted-foreground">{label}</dt>
      </div>
      <dd className="mt-3 text-2xl font-semibold leading-none tracking-tight tabular">
        <CountUp value={value} />
      </dd>
      <p className="mt-1.5 text-xs text-muted-foreground">{meta}</p>
    </div>
  );
}
