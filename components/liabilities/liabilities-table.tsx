"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import {
  Check,
  Eye,
  Link2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Scale,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { AiMatchButton } from "@/components/ui/ai-match-button";
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
  attachLiabilityIdAtom,
  deleteLiabilityIdAtom,
  liabilitiesPageAtom,
  liabilitiesPageSizeAtom,
  liabilitiesQueryAtom,
  matchLiabilityIdAtom,
  unmatchLiabilityIdAtom,
  viewLiabilityIdAtom,
} from "@/lib/atoms";
import {
  formatLiabilityAmount,
  formatLiabilityDate,
  formatLiabilityRemaining,
  liabilityCanUndoMatch,
  type Liability,
} from "@/lib/liabilities";
import type { PageInfo } from "@/lib/products";
import { activeCountryContext, taxWord } from "@/lib/country-context";
import { cn } from "@/lib/utils";
import { useLiabilitiesQuery } from "@/hooks/use-liabilities-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function LiabilitiesTable() {
  const [query, setQuery] = useAtom(liabilitiesQueryAtom);
  const [page, setPage] = useAtom(liabilitiesPageAtom);
  const [pageSize, setPageSize] = useAtom(liabilitiesPageSizeAtom);
  const setViewId = useSetAtom(viewLiabilityIdAtom);
  const setAttachId = useSetAtom(attachLiabilityIdAtom);
  const setDeleteId = useSetAtom(deleteLiabilityIdAtom);
  const setMatchId = useSetAtom(matchLiabilityIdAtom);
  const router = useRouter();
  const setUnmatchId = useSetAtom(unmatchLiabilityIdAtom);

  // Waits for typing to pause before it hits the API — the search box reads
  // the atom directly, so it keeps updating instantly either way.
  const debouncedQuery = useDebouncedValue(query);

  // Back to page one whenever the search underneath changes shape — an old
  // page number surviving a new search would risk landing past its last page.
  const previousQuery = React.useRef(debouncedQuery);
  React.useEffect(() => {
    if (previousQuery.current === debouncedQuery) return;
    previousQuery.current = debouncedQuery;
    setPage(1);
  }, [debouncedQuery, setPage]);

  const liabilitiesQuery = useLiabilitiesQuery(page, pageSize, debouncedQuery);
  const rows = liabilitiesQuery.data?.liabilities ?? [];
  const total = liabilitiesQuery.data?.total ?? 0;
  /** From the response's own total, not this page's row count — a stale page
   *  number landing on an empty page shouldn't read as "no liabilities". */
  const isEmpty = total === 0;
  const searching = query.trim().length > 0;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  /*
   * Covers both halves of "applying a filter": the debounce waiting for
   * typing to settle, then the request for the page it asks for.
   * Deliberately *not* `isFetching` — that is also true of a background
   * refresh of the page already on screen, and swapping a table the user is
   * reading for a shimmer is exactly what made the list look like it kept
   * reloading itself.
   */
  const loading =
    query !== debouncedQuery || liabilitiesQuery.isPlaceholderData;

  if (liabilitiesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SearchRow query={query} onChange={setQuery} />
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (isEmpty && !loading) {
    // A failed fetch also leaves `total` at 0 — that's a different problem
    // from an honestly empty list, and saying so plainly beats a cheerful
    // "no liabilities yet" over a request that never actually landed.
    const failed = liabilitiesQuery.isError;

    return (
      <div className="space-y-4">
        {/* Only while it's the search that came up empty, or the request
            failed — with no liabilities at all there's nothing to search, and the
            empty state is the whole page. */}
        {(searching || failed) && (
          <SearchRow query={query} onChange={setQuery} />
        )}
        <Empty>
          <EmptyMedia>
            {failed ? (
              <TriangleAlert aria-hidden />
            ) : searching ? (
              <SearchX aria-hidden />
            ) : (
              <Scale aria-hidden />
            )}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {failed
                ? "Couldn't load liabilities"
                : searching
                  ? "No liabilities match your search"
                  : "No liabilities yet"}
            </EmptyTitle>
            <EmptyDescription>
              {failed
                ? "Something went wrong reaching the server. Try again."
                : searching
                  ? "Try a different name or supplier, or clear the search."
                  : "Record what the business owes that isn't a supplier bill — accrued wages, a loan, a bond you're holding."}
            </EmptyDescription>
          </div>
          {!failed && !searching && <EmptyCue label="Start here" />}
          <EmptyActions>
            {failed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => liabilitiesQuery.refetch()}
              >
                Try again
              </Button>
            ) : searching ? (
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/liabilities/new">New liability</Link>
              </Button>
            )}
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SearchRow query={query} onChange={setQuery} />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <LiabilitiesHeaderRow />
            </TableHeader>
            <TableBody aria-hidden>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell>
                    <Shimmer className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="mx-auto h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="mx-auto h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="mx-auto h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="mx-auto h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="mx-auto h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Shimmer className="mx-auto h-8 w-24" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Shimmer className="ml-auto h-8 w-8 rounded-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <LiabilitiesHeaderRow />
            </TableHeader>
            <TableBody>
              {rows.map((liability) => (
                <LiabilityRow
                  key={liability.id}
                  liability={liability}
                  query={query}
                  onView={() => setViewId(liability.id)}
                  onAttach={() => setAttachId(liability.id)}
                  onEdit={() =>
                    router.push(`/liabilities/${liability.id}/edit`)
                  }
                  onDelete={() => setDeleteId(liability.id)}
                  onMatch={() => setMatchId(liability.id)}
                  onUnmatch={() => setUnmatchId(liability.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NumberedPagination
        page={pageInfo}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next as typeof pageSize);
          // Row 30 is on a different page at 10 a page than at 50, so the
          // honest thing after a resize is the top of the list rather than
          // whichever page number happens to still be in range.
          setPage(1);
        }}
        itemLabel="liability"
        navLabel="Liabilities pages"
      />
    </div>
  );
}

function LiabilitiesHeaderRow() {
  return (
    <TableRow>
      {/* Category, name and supplier take the spare width; the two
          figures, the date, the match cell and the menu hug. Only the first
          and last columns keep their natural edge alignment — everything
          between reads as a center-aligned block. */}
      <TableHead>Category</TableHead>
      <TableHead className="text-center">Liability name</TableHead>
      <TableHead className="text-center">Supplier name</TableHead>
      <TableHead className={cn(HUG_COLUMN, "text-center")}>
        Liability value
      </TableHead>
      <TableHead className={cn(HUG_COLUMN, "text-center")}>
        Remaining amount
      </TableHead>
      <TableHead className={cn(HUG_COLUMN, "text-center")}>Date</TableHead>
      <TableHead className={cn(HUG_COLUMN, "text-center")}>
        Match transaction
      </TableHead>
      <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
    </TableRow>
  );
}

function SearchRow({
  query,
  onChange,
}: {
  query: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search liabilities"
        aria-label="Search liabilities"
        className="pl-9"
      />
    </div>
  );
}

function LiabilityRow({
  liability,
  query,
  onView,
  onAttach,
  onEdit,
  onDelete,
  onMatch,
  onUnmatch,
}: {
  liability: Liability;
  query: string;
  onView: () => void;
  onAttach: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMatch: () => void;
  onUnmatch: () => void;
}) {
  const matched = liability.status === "Matched";
  const canUndo = liabilityCanUndoMatch(liability);

  return (
    <TableRow>
      <TableCell className="max-w-[180px] text-muted-foreground">
        <span className="block truncate">
          <Highlight text={liability.category} query={query} />
        </span>
      </TableCell>
      <TableCell className="max-w-[220px] text-center">
        <span className="block truncate font-medium">
          <Highlight text={liability.name} query={query} />
        </span>
      </TableCell>
      <TableCell className="max-w-[200px] text-center">
        <span className="block truncate">
          <Highlight text={liability.supplierName || "—"} query={query} />
        </span>
        {liability.supplierEmail && (
          <span className="block truncate text-xs text-muted-foreground">
            {liability.supplierEmail}
          </span>
        )}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center font-medium tabular")}>
        {formatLiabilityAmount(liability)}
        {liability.gst && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            inc {taxWord(activeCountryContext())}
          </span>
        )}
      </TableCell>
      <TableCell
        className={cn(HUG_COLUMN, "text-center tabular text-muted-foreground")}
      >
        {formatLiabilityRemaining(liability)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center text-muted-foreground tabular")}>
        {formatLiabilityDate(liability.date)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <MatchCell
          matched={matched}
          reference={liability.transactionRef}
          suggestions={liability.possibleMatch}
          onOpen={onMatch}
        />
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        {/* Everything in the overflow, as Expenses and Invoices do — a row of
            loose icons is how an actions column stops being scannable. */}
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${liability.name}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction icon={<Eye />} label="View" onSelect={onView} />
              {/* Absent rather than disabled where there's no match to undo —
                  sole-webapp's own `canUndoLiabilityMatch`, wider than the
                  Matched badge alone. */}
              {canUndo && (
                <MenuAction
                  icon={<Undo2 />}
                  label="Unmatch"
                  onSelect={onUnmatch}
                />
              )}
              <MenuAction
                icon={<Paperclip />}
                label={
                  liability.attachment ? "Replace attachment" : "Add attachment"
                }
                onSelect={onAttach}
              />
              {/* sole-webapp hides both once reconciled — a matched liability
                  is read-only from here on. */}
              {!matched && (
                <MenuAction icon={<Pencil />} label="Edit" onSelect={onEdit} />
              )}
              {!matched && (
                <>
                  <DropdownMenuSeparator />
                  <MenuAction
                    icon={<Trash2 />}
                    label="Delete"
                    onSelect={onDelete}
                    destructive
                  />
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Where the liability stands against the bank feed — the same three states the
 * Invoices table uses, so a reconciliation control means one thing platform-wide.
 */
function MatchCell({
  matched,
  reference,
  suggestions,
  onOpen,
}: {
  matched: boolean;
  reference: string | null;
  suggestions: number;
  onOpen: () => void;
}) {
  if (matched) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
        <Check className="size-3.5 text-success" aria-hidden />
        {reference ? `Matched · ${reference}` : "Matched"}
      </span>
    );
  }

  if (suggestions > 0) {
    return <AiMatchButton suggestions={suggestions} onOpen={onOpen} />;
  }

  return (
    <Button variant="outline" size="sm" onClick={onOpen}>
      <Link2 />
      Match
    </Button>
  );
}
