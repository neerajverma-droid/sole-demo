"use client";

import { Globe, Truck, Users } from "lucide-react";

import { STAT_TONES } from "@/components/ui/stat-cards";
import { HeroHairline, WARM_TILE } from "@/components/layout/page-header";
import { Shimmer } from "@/components/ui/shimmer";
import { CountUp } from "@/components/ui/count-up";
import { useContactTabCountsQuery } from "@/hooks/use-contacts-query";
import { cn } from "@/lib/utils";

/**
 * Compact summary strip above the table — the screen's hero, hence the
 * gradient hairline. The tiles follow the palette's rule: clients are money
 * in (indigo), suppliers are money out (orange). The third tile used to be
 * a locally-computed "Added this month", which stopped being answerable
 * once the table became server-paginated (a page is no longer "all
 * contacts"); it's the account-wide Default count instead, sourced the same
 * way as the other two.
 */
export function ContactsSummary({
  loading,
}: {
  /** The screen's own hydration gate hasn't cleared yet — shown in place of stale-looking zeroes. */
  loading?: boolean;
}) {
  const countsQuery = useContactTabCountsQuery();

  if (loading) {
    return (
      <Shimmer
        className="h-40 w-full rounded-lg border border-border"
        aria-hidden
      />
    );
  }

  const counts = countsQuery.data;
  const countsLoading = countsQuery.isLoading;

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-usertour="contact-summary"
    >
      <HeroHairline />
      <dl className="flex flex-wrap divide-y divide-border sm:divide-x sm:divide-y-0">
        <Figure
          icon={<Users aria-hidden />}
          label="Clients"
          value={counts?.clients ?? 0}
          loading={countsLoading}
        />
        <Figure
          icon={<Truck aria-hidden />}
          label="Suppliers"
          value={counts?.suppliers ?? 0}
          tone={WARM_TILE}
          loading={countsLoading}
        />
        <Figure
          icon={<Globe aria-hidden />}
          label="Default"
          value={counts?.default ?? 0}
          tone={STAT_TONES.accent}
          loading={countsLoading}
        />
      </dl>
    </section>
  );
}

function Figure({
  icon,
  label,
  value,
  tone = "bg-primary/10 text-primary",
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  /** Indigo by default; the warm tile marks the money-out side of a pair. */
  tone?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-5 py-4">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
          tone,
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-2xl font-semibold leading-none tracking-tight tabular">
          {loading ? (
            <Shimmer className="h-6 w-10" aria-hidden />
          ) : (
            <CountUp value={value} />
          )}
        </dd>
      </div>
    </div>
  );
}
