"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import {
  Eye,
  FileSignature,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPill } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight } from "@/components/contacts/highlight";
import {
  ProposalPaidBadge,
  ProposalStatusBadge,
} from "@/components/proposals/proposal-status-badge";
import {
  deleteProposalAtom,
  proposalTemplatePickerOpenAtom,
  proposalsPageAtom,
  proposalsPageSizeAtom,
  proposalsQueryAtom,
  proposalsStatusAtom,
  viewProposalIdAtom,
} from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  PROPOSAL_STATUSES,
  formatProposalDate,
  formatProposalMoney,
  proposalLocks,
  proposalStatusLabel,
  type ProposalRow,
  type ProposalStatus,
} from "@/lib/proposals";
import type { PageInfo } from "@/lib/products";
import { cn } from "@/lib/utils";
import {
  useMarkProposalPaidMutation,
  useProposalsQuery,
} from "@/hooks/use-proposals-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const STATUS_FILTERS: (ProposalStatus | "all")[] = ["all", ...PROPOSAL_STATUSES];

export function ProposalsTable() {
  const router = useRouter();
  const [query, setQuery] = useAtom(proposalsQueryAtom);
  const [status, setStatus] = useAtom(proposalsStatusAtom);
  const [page, setPage] = useAtom(proposalsPageAtom);
  const [pageSize, setPageSize] = useAtom(proposalsPageSizeAtom);
  const setViewId = useSetAtom(viewProposalIdAtom);
  const setDeleteRow = useSetAtom(deleteProposalAtom);
  const setPickerOpen = useSetAtom(proposalTemplatePickerOpenAtom);
  const markPaid = useMarkProposalPaidMutation();
  const [markingId, setMarkingId] = React.useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(query);

  // Back to page one whenever the filter underneath changes shape.
  const previousFilter = React.useRef(`${debouncedQuery}|${status}`);
  React.useEffect(() => {
    const next = `${debouncedQuery}|${status}`;
    if (previousFilter.current === next) return;
    previousFilter.current = next;
    setPage(1);
  }, [debouncedQuery, status, setPage]);

  const proposalsQuery = useProposalsQuery(page, pageSize, debouncedQuery, status);
  const rows = proposalsQuery.data?.proposals ?? [];
  const total = proposalsQuery.data?.total ?? 0;
  const filtering = query.trim().length > 0 || status !== "all";

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  const loading = query !== debouncedQuery || proposalsQuery.isPlaceholderData;

  // Manual payments have no automatic confirmation — this is the owner
  // asserting they've been paid outside the app.
  const handleMarkPaid = async (row: ProposalRow, paid: boolean) => {
    setMarkingId(row.id);
    try {
      await markPaid.mutateAsync({ id: row.id, paid });
      toast.success(paid ? "Marked as paid" : "Marked as unpaid");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to update payment status"));
    } finally {
      setMarkingId(null);
    }
  };

  const filters = (
    <Filters
      query={query}
      onQueryChange={setQuery}
      status={status}
      onStatusChange={setStatus}
    />
  );

  if (proposalsQuery.isLoading) {
    return (
      <div className="space-y-4">
        {filters}
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (total === 0 && !loading) {
    const failed = proposalsQuery.isError;
    return (
      <div className="space-y-4">
        {(filtering || failed) && filters}
        <Empty>
          <EmptyMedia>
            {failed ? (
              <TriangleAlert aria-hidden />
            ) : filtering ? (
              <SearchX aria-hidden />
            ) : (
              <FileSignature aria-hidden />
            )}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {failed
                ? "Couldn't load proposals"
                : filtering
                  ? "No proposals match"
                  : "No proposals yet"}
            </EmptyTitle>
            <EmptyDescription>
              {failed
                ? "Something went wrong reaching the server. Try again."
                : filtering
                  ? "Try a different name or status, or clear the filters."
                  : "Build a proposal with your services, pricing, terms and an e-signature — then send it as one link."}
            </EmptyDescription>
          </div>
          {!failed && !filtering && <EmptyCue label="Start here" />}
          <EmptyActions>
            {failed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => proposalsQuery.refetch()}
              >
                Try again
              </Button>
            ) : filtering ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                New proposal
              </Button>
            )}
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filters}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client / Proposal</TableHead>
              <TableHead className={cn(HUG_COLUMN, "text-center")}>Status</TableHead>
              <TableHead className={cn(HUG_COLUMN, "text-center")}>Amount</TableHead>
              <TableHead className={cn(HUG_COLUMN, "text-center")}>Paid</TableHead>
              <TableHead className={cn(HUG_COLUMN, "text-center")}>Created</TableHead>
              <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody aria-busy={loading}>
            {loading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell>
                      <Shimmer className="h-4 w-48" />
                      <Shimmer className="mt-2 h-3 w-28" />
                    </TableCell>
                    <TableCell>
                      <Shimmer className="mx-auto h-5 w-16 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Shimmer className="mx-auto h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Shimmer className="mx-auto h-5 w-16 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Shimmer className="mx-auto h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Shimmer className="ml-auto size-8 rounded-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((row) => (
                  <ProposalTableRow
                    key={row.id}
                    row={row}
                    query={query}
                    marking={markingId === row.id}
                    onView={() => setViewId(row.id)}
                    onEdit={() => router.push(`/proposals/${row.id}`)}
                    onDelete={() => setDeleteRow(row)}
                    onMarkPaid={(paid) => handleMarkPaid(row, paid)}
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
          setPageSize(next as typeof pageSize);
          setPage(1);
        }}
        itemLabel="proposal"
        navLabel="Proposals pages"
      />
    </div>
  );
}

function Filters({
  query,
  onQueryChange,
  status,
  onStatusChange,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  status: ProposalStatus | "all";
  onStatusChange: (next: ProposalStatus | "all") => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((option) => (
          <FilterPill
            key={option}
            active={status === option}
            onSelect={() => onStatusChange(option)}
          >
            {option === "all" ? "All" : proposalStatusLabel(option)}
          </FilterPill>
        ))}
      </div>
      <div className="relative w-full lg:w-72">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search proposals"
          aria-label="Search proposals"
          className="pl-9"
        />
      </div>
    </div>
  );
}

function ProposalTableRow({
  row,
  query,
  marking,
  onView,
  onEdit,
  onDelete,
  onMarkPaid,
}: {
  row: ProposalRow;
  query: string;
  marking: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMarkPaid: (paid: boolean) => void;
}) {
  const locks = proposalLocks(row);
  const manual = row.payment.required && row.payment.method === "manual";

  return (
    <TableRow className="cursor-pointer" onClick={onView}>
      <TableCell className="max-w-[320px]">
        <span className="block truncate font-medium">
          <Highlight text={row.title} query={query} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          for {row.clientName}
        </span>
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <ProposalStatusBadge status={row.status} />
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center tabular")}>
        <span className="font-medium">
          {formatProposalMoney(row.amount, row.currency)}
        </span>
        {row.multicurrency && row.amountAud != null && (
          <span className="block text-xs text-muted-foreground">
            {formatProposalMoney(row.amountAud, "AUD")} AUD
          </span>
        )}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <div className="flex flex-col items-center gap-1">
          <ProposalPaidBadge payment={row.payment} />
          {manual && (
            <button
              type="button"
              disabled={marking}
              onClick={(event) => {
                event.stopPropagation();
                onMarkPaid(!row.payment.paid);
              }}
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50",
                row.payment.paid ? "text-muted-foreground" : "text-primary",
              )}
            >
              {marking && <Loader2 className="size-3 animate-spin" aria-hidden />}
              {row.payment.paid ? "Unmark" : "Mark paid"}
            </button>
          )}
        </div>
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center tabular text-muted-foreground")}>
        {formatProposalDate(row.createdAt)}
      </TableCell>
      <TableCell className={HUG_COLUMN} onClick={(event) => event.stopPropagation()}>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${row.title}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction icon={<Eye />} label="View" onSelect={onView} />
              <MenuAction
                icon={<Pencil />}
                label="Edit"
                onSelect={onEdit}
                disabledReason={locks.editReason ?? undefined}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Delete"
                onSelect={onDelete}
                disabledReason={locks.deleteReason ?? undefined}
                destructive
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
