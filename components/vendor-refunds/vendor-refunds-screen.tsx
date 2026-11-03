"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { Undo2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Shimmer } from "@/components/ui/shimmer";
import { StatStrip } from "@/components/ui/stat-strip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VendorRefundDetailsDialog } from "@/components/vendor-refunds/vendor-refund-details-dialog";
import { VendorRefundsTable } from "@/components/vendor-refunds/vendor-refunds-table";
import {
  vendorRefundPeriodAtom,
  vendorRefundStatusFilterAtom,
  vendorRefundsQueryAtom,
} from "@/lib/atoms";
import type { PageInfo } from "@/lib/products";
import {
  VENDOR_REFUND_PERIODS,
  vendorRefundStats,
  type VendorRefundPeriod,
} from "@/lib/vendor-refunds";
import { useVendorRefundsStore } from "@/stores/vendor-refunds";
import {
  useVendorRefundsCountQuery,
  useVendorRefundsQuery,
  useVendorRefundsSummaryQuery,
} from "@/hooks/use-vendor-refunds-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const VENDOR_REFUNDS_ROOT = "/expenses/vendor-refunds";

const DEFAULT_PAGE_SIZE = 25;

const TITLE_TIP =
  "The total value of refunds and credit notes you've received from suppliers in the selected period — for returned stock, supplier overpayments and billing adjustments.";

export function VendorRefundsScreen() {
  const [status] = useAtom(vendorRefundStatusFilterAtom);
  const [search] = useAtom(vendorRefundsQueryAtom);
  const [period, setPeriod] = useAtom(vendorRefundPeriodAtom);
  // Waits for typing to pause before it hits the API — same box updates the
  // input instantly either way, since that atom is read directly there too.
  const debouncedSearch = useDebouncedValue(search);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  // Back to page one whenever a filter underneath changes shape — an old page
  // number surviving a new status/search/period would risk landing past its
  // last page.
  const filterKey = `${status}|${debouncedSearch}|${period}`;
  const previousFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    previousFilterKey.current = filterKey;
    setPage(1);
  }, [filterKey]);

  const refundsQuery = useVendorRefundsQuery(
    page,
    pageSize,
    status,
    debouncedSearch,
    period,
  );
  const summaryQuery = useVendorRefundsSummaryQuery(
    status,
    debouncedSearch,
    period,
  );
  const countQuery = useVendorRefundsCountQuery();

  const stored = useVendorRefundsStore((state) => state.vendorRefunds);
  const hydrated = useVendorRefundsStore((state) => state.hydrated);

  const total = refundsQuery.data?.total ?? 0;
  /**
   * No vendor refunds at all, in any period — from the unfiltered count, not
   * `total`: that one is already scoped to a status, a search and a period,
   * so an empty month would otherwise hide the very tabs that switch back to
   * the year. Never while either request has failed, either: an error isn't
   * an empty account.
   */
  const isEmpty =
    !refundsQuery.isError && countQuery.isSuccess && countQuery.data === 0;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  /**
   * Covers both halves of "applying a filter": the debounce waiting for
   * typing to settle, then the request itself (status/period changes skip
   * straight to the second half, since there's nothing to debounce).
   */
  const isFiltering =
    search !== debouncedSearch || refundsQuery.isPlaceholderData;

  /*
   * The first load, and — when this period came back empty — the count that
   * says whether the account is too. Without waiting on that, a new account
   * would paint the tabs and strip first and then drop them a beat later.
   */
  const firstLoad =
    (!hydrated && refundsQuery.isLoading) ||
    (refundsQuery.isSuccess && total === 0 && countQuery.isLoading);

  if (firstLoad) {
    return (
      <div className="space-y-[15px]" aria-hidden>
        <Shimmer className="h-9 w-64 rounded-md" />
        <Shimmer className="h-24 w-full rounded-lg border border-border" />
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Undo2}
        /* No warm tile here, unlike Client refunds. The warm accent marks money
           leaving the business; a vendor refund is money coming back in, so
           this takes the default indigo. */
        title="Vendor refunds"
        titleTip={TITLE_TIP}
        description="Refunds and credit notes received from your suppliers — returned stock, overpayments and billing adjustments."
      />

      {/* Scopes the strip and the table together — which is what makes the
          title's "in the selected period" accurate. */}
      {!isEmpty && (
        <Tabs
          value={period}
          onValueChange={(next) => setPeriod(next as VendorRefundPeriod)}
        >
          <TabsList aria-label="Summary period">
            {VENDOR_REFUND_PERIODS.map((option) => (
              <TabsTrigger key={option} value={option}>
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Gone with no refunds at all — zeroes over an empty table say nothing
          the empty state doesn't. An empty period keeps it. */}
      {!isEmpty && (
        <StatStrip stats={vendorRefundStats(summaryQuery.data ?? [])} />
      )}

      <VendorRefundsTable
        refunds={stored}
        loading={isFiltering}
        isEmpty={isEmpty}
        pageInfo={pageInfo}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          // Row 30 is on a different page at 10 a page than at 50, so the
          // honest thing after a resize is the top of the list rather than
          // whichever page number happens to still be in range.
          setPage(1);
        }}
      />

      <VendorRefundDetailsDialog />
    </div>
  );
}
