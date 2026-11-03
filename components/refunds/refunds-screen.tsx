"use client";

import { Undo2 } from "lucide-react";

import { PageHeader, WARM_TILE } from "@/components/layout/page-header";
import { Shimmer } from "@/components/ui/shimmer";
import { StatStrip } from "@/components/ui/stat-strip";
import { RefundDetailsDialog } from "@/components/refunds/refund-details-dialog";
import { RefundsTable } from "@/components/refunds/refunds-table";
import { useClientRefundsQuery } from "@/hooks/use-client-refunds-query";
import { refundStats } from "@/lib/refunds";
import { useRefundsStore } from "@/stores/refunds";

export function RefundsScreen() {
  const refundsQuery = useClientRefundsQuery();
  const refunds = useRefundsStore((state) => state.refunds);
  const hydrated = useRefundsStore((state) => state.hydrated);
  /**
   * True only until the very first fetch lands — never again after, since
   * `hydrated` only ever flips one way. A background refetch (switching back
   * to this tab, the window regaining focus) leaves the page showing what it
   * already has instead of blanking it out a second time.
   */
  const loading = !hydrated && refundsQuery.isLoading;
  /*
   * The account has no refunds at all — not a search or status filter coming
   * up short, since those narrow `refunds` inside the table rather than the
   * fetch. Only once the fetch has answered: a pending or failed one isn't
   * "no refunds", so it keeps the screen as it was.
   */
  const isEmpty = refundsQuery.isSuccess && refunds.length === 0;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Undo2}
        // Money leaving the business, so the tile carries the warm accent.
        iconTone={WARM_TILE}
        title="Client refunds"
        description="Refunds and credit notes issued to your clients — returned goods, overpayments and billing adjustments."
      />

      {/* Gone once the account turns out to have no refunds at all — three
          zeroes over an empty table say nothing the empty state doesn't. */}
      {!isEmpty && (
        <div data-usertour="refund-stats">
          {loading ? (
            <StatStripSkeleton />
          ) : (
            <StatStrip stats={refundStats(refunds)} />
          )}
        </div>
      )}

      <RefundsTable refunds={refunds} loading={loading} isEmpty={isEmpty} />

      <RefundDetailsDialog />
    </div>
  );
}

/** The strip's own shape, three tiles of a label and a figure, while the real numbers are still loading. */
function StatStripSkeleton() {
  return (
    <div
      className="flex flex-wrap items-stretch divide-y divide-border rounded-lg border border-border bg-card shadow-sm sm:divide-x sm:divide-y-0"
      aria-hidden
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="min-w-0 flex-1 space-y-2 px-5 py-3.5">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}
