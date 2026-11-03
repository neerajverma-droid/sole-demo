"use client";

/** One figure in the strip. */
export type Stat = { label: string; value: string; hint?: string };

/**
 * A compact row of figures above a table — a top edge for the page and something
 * to read before the rows. Deliberately not four large cards: this is context,
 * not the point of the screen.
 *
 * Introduced by the Products catalogues and shared from here, since Client
 * refunds wants the same strip and shouldn't import from the sales screens.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="flex flex-wrap items-stretch divide-y divide-border rounded-lg border border-border bg-card shadow-sm sm:divide-x sm:divide-y-0">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 flex-1 px-5 py-3.5">
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold leading-none tracking-tight tabular">
              {stat.value}
            </span>
            {stat.hint && (
              <span className="text-xs text-muted-foreground">{stat.hint}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
