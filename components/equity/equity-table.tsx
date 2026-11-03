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
  PiggyBank,
  Search,
  SearchX,
  Sparkles,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight } from "@/components/contacts/highlight";
import {
  attachEquityIdAtom,
  deleteEquityIdAtom,
  equityPageAtom,
  equityPageSizeAtom,
  equityQueryAtom,
  matchEquityIdAtom,
  unmatchEquityIdAtom,
  viewEquityIdAtom,
} from "@/lib/atoms";
import {
  formatEquityAmount,
  formatEquityDate,
  formatEquityRemaining,
  type Equity,
} from "@/lib/equity";
import type { PageInfo } from "@/lib/products";
import { useEquityQuery } from "@/hooks/use-equity-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function EquityTable() {
  const [query, setQuery] = useAtom(equityQueryAtom);
  const [page, setPage] = useAtom(equityPageAtom);
  const [pageSize, setPageSize] = useAtom(equityPageSizeAtom);
  const setViewId = useSetAtom(viewEquityIdAtom);
  const setAttachId = useSetAtom(attachEquityIdAtom);
  const setDeleteId = useSetAtom(deleteEquityIdAtom);
  const setMatchId = useSetAtom(matchEquityIdAtom);
  const setUnmatchId = useSetAtom(unmatchEquityIdAtom);
  const router = useRouter();

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

  const equityQuery = useEquityQuery(page, pageSize, debouncedQuery);
  const rows = equityQuery.data?.equity ?? [];
  const total = equityQuery.data?.total ?? 0;
  /** From the response's own total, not this page's row count — a stale page
   *  number landing on an empty page shouldn't read as "no equity". */
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
   * typing to settle, then the request for the page it asks for. Not
   * `isFetching` — that is true of a background refresh of the page already
   * on screen too, and replacing rows the user is reading with a shimmer is
   * what made the table look like it kept reloading itself.
   */
  const loading = query !== debouncedQuery || equityQuery.isPlaceholderData;

  if (equityQuery.isLoading) {
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
    // "no equity yet" over a request that never actually landed.
    const failed = equityQuery.isError;

    return (
      <div className="space-y-4">
        {/* Only while it's the search that came up empty, or the request
            failed — with no equity at all there's nothing to search, and the
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
              <PiggyBank aria-hidden />
            )}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {failed
                ? "Couldn't load equity"
                : searching
                  ? "No equity matches your search"
                  : "No equity yet"}
            </EmptyTitle>
            <EmptyDescription>
              {failed
                ? "Something went wrong reaching the server. Try again."
                : searching
                  ? "Try a different name or category, or clear the search."
                  : "Record your own money moving through the business — capital you put in, or drawings you take back out."}
            </EmptyDescription>
          </div>
          {!failed && !searching && <EmptyCue label="Start here" />}
          <EmptyActions>
            {failed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => equityQuery.refetch()}
              >
                Try again
              </Button>
            ) : searching ? (
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/equity/new">New equity</Link>
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
              <EquityHeaderRow />
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
              <EquityHeaderRow />
            </TableHeader>
            <TableBody>
              {rows.map((equity) => (
                <EquityRow
                  key={equity.id}
                  equity={equity}
                  query={query}
                  onView={() => setViewId(equity.id)}
                  onAttach={() => setAttachId(equity.id)}
                  onEdit={() => router.push(`/equity/${equity.id}/edit`)}
                  onDelete={() => setDeleteId(equity.id)}
                  onMatch={() => setMatchId(equity.id)}
                  onUnmatch={() => setUnmatchId(equity.id)}
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
        itemLabel="entry"
        navLabel="Equity pages"
      />
    </div>
  );
}

function EquityHeaderRow() {
  return (
    <TableRow>
      {/* Only the first and last columns keep their natural edge alignment
          — everything between reads as a center-aligned block. */}
      <TableHead>Category</TableHead>
      <TableHead className="text-center">Equity name</TableHead>
      <TableHead className="text-center">Value</TableHead>
      <TableHead className="text-center">Remaining amount</TableHead>
      <TableHead className="text-center">Date</TableHead>
      <TableHead className="text-center">Match transaction</TableHead>
      <TableHead className="w-[60px] text-right">Actions</TableHead>
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
        placeholder="Search equity"
        aria-label="Search equity"
        className="pl-9"
      />
    </div>
  );
}

function EquityRow({
  equity,
  query,
  onView,
  onAttach,
  onEdit,
  onDelete,
  onMatch,
  onUnmatch,
}: {
  equity: Equity;
  query: string;
  onView: () => void;
  onAttach: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMatch: () => void;
  onUnmatch: () => void;
}) {
  const matched = equity.status === "Matched";

  return (
    <TableRow>
      <TableCell className="max-w-[180px] text-muted-foreground">
        <span className="block truncate">
          <Highlight text={equity.category} query={query} />
        </span>
      </TableCell>
      <TableCell className="max-w-[260px] text-center">
        <span className="block truncate font-medium">
          <Highlight text={equity.name} query={query} />
        </span>
        {equity.paidWithCash && (
          <span className="block truncate text-xs text-muted-foreground">
            Paid with cash
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center font-medium tabular">
        {formatEquityAmount(equity)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular text-muted-foreground">
        {formatEquityRemaining(equity)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center text-muted-foreground tabular">
        {formatEquityDate(equity.date)}
      </TableCell>
      <TableCell className="text-center">
        <MatchCell
          matched={matched}
          reference={equity.transactionRef}
          suggestions={equity.possibleMatch}
          onOpen={onMatch}
        />
      </TableCell>
      <TableCell>
        {/* Everything in the overflow, as Expenses, Invoices and Liabilities do
            — a row of loose icons is how an actions column stops being
            scannable. */}
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${equity.name}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction icon={<Eye />} label="View" onSelect={onView} />
              {/* Absent rather than disabled where there's no match to undo —
                  sole-webapp's own rule for equity is exactly `is_reconciled`,
                  no wider check the way a liability's has. */}
              {matched && (
                <MenuAction
                  icon={<Undo2 />}
                  label="Unmatch"
                  onSelect={onUnmatch}
                />
              )}
              <MenuAction
                icon={<Paperclip />}
                label="Add attachment"
                onSelect={onAttach}
              />
              {/* sole-webapp hides both once reconciled — a matched entry is
                  read-only from here on. */}
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
 * Where the entry stands against the bank feed — the same three states the
 * Invoices and Liabilities tables use, so a reconciliation control means one
 * thing platform-wide.
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
    return (
      <span className="group relative inline-flex">
        <span
          className="pointer-events-none absolute -inset-1 rounded-lg bg-primary/40 opacity-60 blur-md transition-colors motion-safe:animate-ai-glow group-hover:bg-primary/60"
          aria-hidden
        />
        <Button
          size="sm"
          onClick={onOpen}
          className={
            "relative bg-[linear-gradient(110deg,hsl(var(--primary)),#8B7CFF,hsl(var(--primary)))] bg-[length:200%_100%] transition-[filter] motion-safe:animate-ai-shift group-hover:brightness-110 motion-safe:group-hover:[animation-duration:1.6s]"
          }
        >
          <Sparkles className="motion-safe:animate-ai-twinkle motion-safe:group-hover:animate-ai-turn" />
          AI Match
        </Button>
        <span
          className="absolute -right-1 -top-1 z-10 size-2.5 rounded-full bg-success ring-2 ring-card"
          aria-hidden
        />
        <span className="sr-only">
          {suggestions === 1
            ? "1 suggested transaction"
            : `${suggestions} suggested transactions`}
        </span>
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onOpen}>
      <Link2 />
      Match
    </Button>
  );
}
