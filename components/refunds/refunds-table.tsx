"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom, useSetAtom } from "jotai";
import { Eye, Search, SearchX, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight } from "@/components/contacts/highlight";
import {
  refundStatusFilterAtom,
  refundsQueryAtom,
  viewRefundIdAtom,
} from "@/lib/atoms";
import { useCountryContext } from "@/hooks/use-country-context";
import { contactDisplayName } from "@/lib/contacts";
import { taxWord } from "@/lib/country-context";
import { paginate } from "@/lib/products";
import {
  REFUND_STATUS_FILTERS,
  filterRefunds,
  formatRefundAmount,
  formatRefundDate,
  formatRefundGst,
  refundBankLabel,
  refundReasonLabel,
  refundStatusVariant,
  refundsNarrowed,
  type Refund,
  type RefundStatusFilter,
} from "@/lib/refunds";
import { useContactsStore } from "@/stores/contacts";

const DEFAULT_PAGE_SIZE = 25;

export function RefundsTable({
  refunds,
  loading,
  isEmpty,
}: {
  refunds: Refund[];
  /** The first fetch is still in flight — nothing in `refunds` is real yet. */
  loading: boolean;
  /** The account has no refunds at all — just "No refunds yet", without a
   *  search and status filter over nothing. */
  isEmpty?: boolean;
}) {
  const contacts = useContactsStore((state) => state.contacts);
  const { country } = useCountryContext();
  const tax = taxWord(country);
  const [query, setQuery] = useAtom(refundsQueryAtom);
  const [status, setStatus] = useAtom(refundStatusFilterAtom);
  const setViewId = useSetAtom(viewRefundIdAtom);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  // The name comes from Contacts while the contact exists; the refund's own
  // snapshot is the fallback.
  const clientName = (refund: Refund) => {
    const contact = contacts.find((entry) => entry.id === refund.clientId);
    return contact ? contactDisplayName(contact) : refund.clientName;
  };

  const rows = filterRefunds(refunds, { query, status });
  const narrowed = refundsNarrowed({ query, status });

  // Back to page one whenever a filter underneath changes shape — an old
  // page number surviving a new search/status would risk landing past
  // its last page.
  const filterKey = `${query}|${status}`;
  const previousFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    previousFilterKey.current = filterKey;
    setPage(1);
  }, [filterKey]);

  const pageInfo = paginate(rows, page, pageSize);

  const clearFilters = () => {
    setQuery("");
    setStatus("All status");
  };

  if (isEmpty) {
    return (
      <Empty>
        <EmptyMedia>
          <Undo2 aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No refunds yet</EmptyTitle>
          <EmptyDescription>
            Issue a refund or credit note when a client returns goods,
            overpays, or you adjust their bill.
          </EmptyDescription>
        </div>
        <EmptyCue label="Start here" />
        <EmptyActions>
          <Button size="sm" asChild data-usertour="refund-issue">
            <Link href="/sales/client-refunds/new">Issue client refund</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-2"
        data-usertour="refund-filters"
      >
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search refunds"
            aria-label="Search refunds"
            className="pl-9"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as RefundStatusFilter)}
        >
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label="Filter by status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFUND_STATUS_FILTERS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reference no</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">{tax} amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bank info</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody aria-hidden>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell>
                    <Shimmer className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="h-4 w-24" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Shimmer className="ml-auto h-4 w-16" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Shimmer className="ml-auto h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="ml-auto h-8 w-8 rounded-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyMedia>
            {narrowed ? <SearchX aria-hidden /> : <Undo2 aria-hidden />}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {narrowed ? "No refunds match your filters" : "No refunds yet"}
            </EmptyTitle>
            <EmptyDescription>
              {narrowed
                ? "Try a different search, or clear the filters to see everything."
                : "Issue a refund or credit note when a client returns goods, overpays, or you adjust their bill."}
            </EmptyDescription>
          </div>
          {!narrowed && <EmptyCue label="Start here" />}
          <EmptyActions>
            {narrowed ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button size="sm" asChild data-usertour="refund-issue">
                <Link href="/sales/client-refunds/new">Issue client refund</Link>
              </Button>
            )}
          </EmptyActions>
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference no</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">{tax} amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bank info</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageInfo.rows.map((refund) => (
                  <RefundRow
                    key={refund.id}
                    refund={refund}
                    client={clientName(refund)}
                    query={query}
                    onView={() => setViewId(refund.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <NumberedPagination
            page={pageInfo}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              // Row 30 is on a different page at 10 a page than at 50, so the
              // honest thing after a resize is the top of the list rather
              // than whichever page number happens to still be in range.
              setPage(1);
            }}
            itemLabel="refund"
            navLabel="Client refunds pages"
          />
        </>
      )}
    </div>
  );
}

function RefundRow({
  refund,
  client,
  query,
  onView,
}: {
  refund: Refund;
  client: string;
  query: string;
  onView: () => void;
}) {
  const bank = refundBankLabel(refund);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Highlight text={client || "—"} query={query} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground tabular">
        {formatRefundDate(refund.date)}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular">
        <Highlight text={refund.reference} query={query} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        <Highlight text={refund.type} query={query} />
      </TableCell>
      {/* Figures stay neutral, as in Expenses — the warm accent lives on the
          screen's icon tile, not on the numbers. */}
      <TableCell className="whitespace-nowrap text-right font-medium tabular">
        {formatRefundAmount(refund)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular text-muted-foreground">
        {formatRefundGst(refund)}
      </TableCell>
      <TableCell className="max-w-[220px]">
        <span className="block truncate">
          <Highlight text={refundReasonLabel(refund)} query={query} />
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={refundStatusVariant(refund.status)}>
          {refund.status}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[200px] text-muted-foreground">
        {bank ? (
          <span className="block truncate tabular">{bank}</span>
        ) : (
          // A credit note isn't paid out, so there's no account to show.
          <span className="text-xs">Not paid out</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`View ${refund.reference}`}
            onClick={onView}
          >
            <Eye className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
