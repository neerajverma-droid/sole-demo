"use client";

import { useAtom, useSetAtom } from "jotai";
import { Eye, Search, SearchX, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
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
  vendorRefundStatusFilterAtom,
  vendorRefundsQueryAtom,
  viewVendorRefundIdAtom,
} from "@/lib/atoms";
import { useCountryContext } from "@/hooks/use-country-context";
import { contactDisplayName } from "@/lib/contacts";
import { taxWord } from "@/lib/country-context";
import type { PageInfo } from "@/lib/products";
import {
  VENDOR_REFUND_STATUS_FILTERS,
  formatVendorRefundAmount,
  formatVendorRefundDate,
  formatVendorRefundGst,
  vendorRefundBankLabel,
  vendorRefundReasonLabel,
  vendorRefundStatusVariant,
  vendorRefundsNarrowed,
  type VendorRefund,
  type VendorRefundStatusFilter,
} from "@/lib/vendor-refunds";
import { useContactsStore } from "@/stores/contacts";

export function VendorRefundsTable({
  refunds,
  loading,
  pageInfo,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isEmpty,
}: {
  /** Already this page's rows — search, status and paging all happen server-side. */
  refunds: VendorRefund[];
  /** A status, search or page change is in flight against the server. */
  loading: boolean;
  /** No vendor refunds in any period — just "No refunds yet", without a
   *  search, status filter and pagination over nothing. */
  isEmpty?: boolean;
  pageInfo: PageInfo;
  pageSize: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}) {
  const contacts = useContactsStore((state) => state.contacts);
  const { country } = useCountryContext();
  const tax = taxWord(country);
  const [query, setQuery] = useAtom(vendorRefundsQueryAtom);
  const [status, setStatus] = useAtom(vendorRefundStatusFilterAtom);
  const setViewId = useSetAtom(viewVendorRefundIdAtom);

  // The name comes from Contacts while the contact exists; the refund's own
  // snapshot is the fallback.
  const supplierName = (refund: VendorRefund) => {
    const contact = contacts.find((entry) => entry.id === refund.supplierId);
    return contact ? contactDisplayName(contact) : refund.supplierName;
  };

  const rows = refunds;
  const narrowed = vendorRefundsNarrowed({ query, status });

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
            Record a refund or credit note when a supplier takes back stock,
            refunds an overpayment, or adjusts a bill.
          </EmptyDescription>
        </div>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search refunds"
            aria-label="Search vendor refunds"
            className="pl-9"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(value as VendorRefundStatusFilter)
          }
        >
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label="Filter by status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VENDOR_REFUND_STATUS_FILTERS.map((option) => (
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
                <TableHead>Supplier</TableHead>
                <TableHead className="text-center">Date</TableHead>
                <TableHead className="text-center">Reference no</TableHead>
                <TableHead className="text-center">Type</TableHead>
                <TableHead className="text-center">Amount</TableHead>
                <TableHead className="text-center">{tax} amount</TableHead>
                <TableHead className="text-center">Reason</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Bank info</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody aria-hidden>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell>
                    <Shimmer className="h-4 w-28" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-4 w-20" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-4 w-24" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-5 w-24 rounded-full" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-4 w-16" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-4 w-16" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-4 w-32" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-4 w-24" />
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
                : "Record a refund or credit note when a supplier takes back stock, refunds an overpayment, or adjusts a bill."}
            </EmptyDescription>
          </div>
          {narrowed && (
            <EmptyActions>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </EmptyActions>
          )}
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-center">Date</TableHead>
                  <TableHead className="text-center">Reference no</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="text-center">{tax} amount</TableHead>
                  <TableHead className="text-center">Reason</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Bank info</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((refund) => (
                  <VendorRefundRow
                    key={refund.id}
                    refund={refund}
                    supplier={supplierName(refund)}
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
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            itemLabel="refund"
            navLabel="Vendor refunds pages"
          />
        </>
      )}
    </div>
  );
}

function VendorRefundRow({
  refund,
  supplier,
  query,
  onView,
}: {
  refund: VendorRefund;
  supplier: string;
  query: string;
  onView: () => void;
}) {
  const bank = vendorRefundBankLabel(refund);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Highlight text={supplier || "—"} query={query} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-center text-muted-foreground tabular">
        {formatVendorRefundDate(refund.date)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular">
        <Highlight text={refund.reference} query={query} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-center text-muted-foreground">
        <Highlight text={refund.type} query={query} />
      </TableCell>
      {/* Figures stay neutral, as on every other list screen — no colour on a
          number. */}
      <TableCell className="whitespace-nowrap text-center font-medium tabular">
        {formatVendorRefundAmount(refund)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular text-muted-foreground">
        {formatVendorRefundGst(refund)}
      </TableCell>
      <TableCell className="max-w-[220px] text-center">
        <span className="block truncate">
          <Highlight text={vendorRefundReasonLabel(refund)} query={query} />
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={vendorRefundStatusVariant(refund.status)}>
          {refund.status}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[200px] text-center text-muted-foreground">
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
