"use client";

import { Shimmer } from "@/components/ui/shimmer";
import { tenantMix, type AdminAnalytics } from "@/lib/admin/dashboard";
import { formatCount, formatShare } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

/** The bar's fill per segment — the same tokens the status pills use. */
const SEGMENT_FILL = {
  success: "bg-success",
  info: "bg-primary",
  danger: "bg-destructive",
  warning: "bg-warning",
  neutral: "bg-muted-foreground/40",
} as const;

/**
 * How the tenant base splits by status: one stacked bar and its legend.
 *
 * One bar rather than a donut: four statuses read better as lengths against a
 * shared baseline than as angles, and the legend beneath carries the exact
 * counts the bar only suggests.
 */
export function TenantMixCard({
  tenants,
  loading,
}: {
  tenants: AdminAnalytics["tenants"] | undefined;
  loading: boolean;
}) {
  const segments = tenants ? tenantMix(tenants) : [];

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Tenant mix</h2>
        <p className="text-sm text-muted-foreground">
          Every tenant that hasn&apos;t been deleted, by status.
        </p>
      </div>

      {loading || !tenants ? (
        <div className="space-y-4" aria-hidden>
          <Shimmer className="h-3 w-full rounded-full" />
          {Array.from({ length: 3 }, (_, index) => (
            <Shimmer key={index} className="h-4 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <>
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={segments
              .map((segment) => `${segment.label} ${formatCount(segment.value)}`)
              .join(", ")}
          >
            {segments.map((segment) =>
              segment.value > 0 ? (
                <span
                  key={segment.key}
                  className={cn("h-full", SEGMENT_FILL[segment.tone])}
                  style={{ width: `${segment.percent}%` }}
                />
              ) : null,
            )}
          </div>

          <ul className="divide-y divide-border">
            {segments.map((segment) => (
              <li
                key={segment.key}
                className="flex items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <span
                  className={cn("size-2.5 shrink-0 rounded-full", SEGMENT_FILL[segment.tone])}
                  aria-hidden
                />
                <span className="flex-1 text-muted-foreground">{segment.label}</span>
                <span className="font-medium tabular">{formatCount(segment.value)}</span>
                <span className="w-10 text-right text-xs text-muted-foreground tabular">
                  {formatShare(segment.value, tenants.total)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
