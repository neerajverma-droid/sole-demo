"use client";

import Link from "next/link";
import { useAtom, useSetAtom } from "jotai";
import {
  Copy,
  Link2,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Search,
  SearchX,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { SUPER_ROOT } from "@/components/super/super-screen";
import {
  deleteContributionIdAtom,
  matchContributionIdAtom,
  superQueryAtom,
} from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import type { PageInfo } from "@/lib/products";
import {
  EMPTY_CELL,
  contributionAmount,
  contributionRemaining,
  contributionStatus,
  contributionStatusVariant,
  formatContributionDate,
  type Contribution,
} from "@/lib/super";

export function SuperTable({
  contributions,
  loading,
  pageInfo,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isEmpty,
}: {
  /** Already this page's rows — search and paging both happen server-side. */
  contributions: Contribution[];
  /** A search or page change is in flight against the server. */
  loading: boolean;
  /** No contributions at all, unsearched — just "No contributions yet",
   *  without a search box and pagination over nothing. */
  isEmpty?: boolean;
  pageInfo: PageInfo;
  pageSize: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}) {
  const [query, setQuery] = useAtom(superQueryAtom);
  const setMatchId = useSetAtom(matchContributionIdAtom);
  const setDeleteId = useSetAtom(deleteContributionIdAtom);

  const rows = contributions;
  const searching = !!query.trim();

  if (isEmpty) {
    return (
      <Empty className="gap-2.5 py-9">
        <EmptyMedia>
          <PiggyBank aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No contributions yet</EmptyTitle>
          <EmptyDescription>
            Record what you pay into super, then match each payment to the
            money that left your account.
          </EmptyDescription>
        </div>
        <EmptyCue label="Start here" />
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href={`${SUPER_ROOT}/new`}>New contribution</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-72">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search contributions"
          aria-label="Search contributions"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow>
                <TableHead>Fund name</TableHead>
                <TableHead className="text-center">Date</TableHead>
                <TableHead className="text-center">Amount</TableHead>
                <TableHead className="text-center">Remaining amount</TableHead>
                <TableHead className="text-center">Match transaction</TableHead>
                <TableHead className="text-center">Status</TableHead>
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
                    <Shimmer className="mx-auto h-4 w-16" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-4 w-16" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-4 w-24" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Shimmer className="mx-auto h-5 w-20 rounded-full" />
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
        // py-14 leaves a stretch of nothing under the button on a card this
        // short; the empty state here is four short lines and an action.
        <Empty className="gap-2.5 py-9">
          <EmptyMedia>
            {searching ? <SearchX aria-hidden /> : <PiggyBank aria-hidden />}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {searching
                ? "No contributions match your search"
                : "No contributions yet"}
            </EmptyTitle>
            <EmptyDescription>
              {searching
                ? "Try a different search, or clear it to see everything."
                : "Record what you pay into super, then match each payment to the money that left your account."}
            </EmptyDescription>
          </div>
          {/* The nudge belongs to the true empty state only — a search that
              matched nothing wants clearing, not encouraging. */}
          {!searching && <EmptyCue label="Start here" />}
          <EmptyActions>
            {searching ? (
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href={`${SUPER_ROOT}/new`}>New contribution</Link>
              </Button>
            )}
          </EmptyActions>
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Fund name</TableHead>
                  <TableHead className="text-center">Date</TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="text-center">Remaining amount</TableHead>
                  <TableHead className="text-center">Match transaction</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((contribution) => (
                  <ContributionRow
                    key={contribution.id}
                    contribution={contribution}
                    query={query}
                    onMatch={() => setMatchId(contribution.id)}
                    onDelete={() => setDeleteId(contribution.id)}
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
            itemLabel="contribution"
            navLabel="Super contributions pages"
          />
        </>
      )}
    </div>
  );
}

function ContributionRow({
  contribution,
  query,
  onMatch,
  onDelete,
}: {
  contribution: Contribution;
  query: string;
  onMatch: () => void;
  onDelete: () => void;
}) {
  const remaining = contributionRemaining(contribution);
  const status = contributionStatus(contribution);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Highlight text={contribution.fundName} query={query} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-center text-muted-foreground tabular">
        {formatContributionDate(contribution.date)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center font-medium tabular">
        {invoiceMoney(contributionAmount(contribution))}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular text-muted-foreground">
        {invoiceMoney(remaining)}
      </TableCell>
      <TableCell className="max-w-[200px] text-center">
        {/* Fully matched has nothing further to do here — the reference this
            would otherwise show is a synthetic placeholder (the API doesn't
            return which real bank transaction it was), so a dash reads
            honestly where a clickable label wouldn't. */}
        {status === "Matched" ? (
          <span className="text-sm text-muted-foreground">{EMPTY_CELL}</span>
        ) : contribution.possibleMatch > 0 ? (
          <AiMatchButton
            suggestions={contribution.possibleMatch}
            onOpen={onMatch}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={onMatch}>
            <Link2 />
            Match
          </Button>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={contributionStatusVariant(status)}>{status}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${contribution.fundName} on ${formatContributionDate(contribution.date)}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Fully matched is read-only from here on — the server itself
                  rejects deleting a reconciled contribution, and editing one
                  whose bank transaction is already reconciled isn't offered
                  either, same as sole-webapp's own list. Duplicate still
                  makes sense: it's a new, unmatched record either way. */}
              {status !== "Matched" && (
                <MenuAction
                  icon={<Pencil />}
                  label="Edit"
                  href={`${SUPER_ROOT}/${contribution.id}`}
                />
              )}
              {/* Same flow as editing: the new-contribution form fetches this
                  record's real detail and prefills from it, then saves as a
                  new record rather than updating this one. */}
              <MenuAction
                icon={<Copy />}
                label="Duplicate"
                href={`${SUPER_ROOT}/new?copy=${contribution.id}`}
              />
              {status !== "Matched" && (
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
 * The match button, for rows the feed already has a candidate for — same
 * treatment as the invoices list's own AI Match button, since it's the same
 * signal (sole-webapp's `possible_match` count) driving the same idea: don't
 * make someone hunt for a match that's already sitting there.
 *
 * Filled and carrying a dot, because there's something waiting that the
 * person can't otherwise see from here. Where the feed has nothing, there's
 * just a plain outline Match button instead.
 */
function AiMatchButton({
  suggestions,
  onOpen,
}: {
  suggestions: number;
  onOpen: () => void;
}) {
  return (
    <span className="group relative inline-flex">
      {/* The glow, behind the button rather than on it — see invoices'
          identical treatment for why. */}
      <span
        className="pointer-events-none absolute -inset-1 rounded-lg bg-primary/40 opacity-60 blur-md transition-colors motion-safe:animate-ai-glow group-hover:bg-primary/60"
        aria-hidden
      />
      <Button
        size="sm"
        onClick={onOpen}
        className="relative bg-[linear-gradient(110deg,hsl(var(--primary)),#8B7CFF,hsl(var(--primary)))] bg-[length:200%_100%] transition-[filter] motion-safe:animate-ai-shift group-hover:brightness-110 motion-safe:group-hover:[animation-duration:1.6s]"
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
