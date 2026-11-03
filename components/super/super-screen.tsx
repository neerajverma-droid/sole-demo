"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom } from "jotai";
import { CircleCheck, Clock, PiggyBank, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteContributionDialog } from "@/components/super/delete-contribution-dialog";
import { MatchDialog } from "@/components/super/match-dialog";
import { SuperTable } from "@/components/super/super-table";
import { superPeriodAtom, superQueryAtom } from "@/lib/atoms";
import { toIsoDate } from "@/lib/invoices";
import { type PageInfo } from "@/lib/products";
import {
  SUPER_PERIODS,
  mapContributionMatrix,
  superStats,
  type SuperPeriod,
} from "@/lib/super";
import { useContributionsQuery } from "@/hooks/use-super-contributions-query";
import { useSuperMatrixQuery } from "@/hooks/use-super-matrix-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const SUPER_ROOT = "/expenses/super-contributions";

const DEFAULT_PAGE_SIZE = 25;

const TITLE_TIP =
  "What you've paid into super in the selected period, and how much of it has been matched to the money that actually left your bank account. Personal contributions you intend to claim can be flagged as a tax deduction.";

export function SuperScreen() {
  const [search] = useAtom(superQueryAtom);
  // Waits for typing to pause before it hits the API — the search box reads
  // the same atom directly, so it keeps updating instantly either way.
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  // Back to page one whenever the search underneath changes shape — an old
  // page number surviving a new search would risk landing past its last page.
  const previousSearch = React.useRef(debouncedSearch);
  React.useEffect(() => {
    if (previousSearch.current === debouncedSearch) return;
    previousSearch.current = debouncedSearch;
    setPage(1);
  }, [debouncedSearch]);

  const contributionsQuery = useContributionsQuery(page, pageSize, debouncedSearch);
  const [period, setPeriod] = useAtom(superPeriodAtom);

  const contributions = contributionsQuery.data?.contributions ?? [];
  const total = contributionsQuery.data?.total ?? 0;
  /**
   * No contributions at all. From the response's own total, not this page's
   * row count — a stale page number landing on an empty page shouldn't read
   * as "no contributions" — and only for an unsearched answer: search is the
   * one thing that narrows this list (period scopes the cards alone), so a
   * search that matches nothing keeps the tabs, cards and "New contribution".
   * Not placeholder data either, which is still the previous search's total,
   * and never a failed request, which isn't an empty account.
   */
  const isEmpty =
    !search.trim() &&
    !debouncedSearch.trim() &&
    contributionsQuery.isSuccess &&
    !contributionsQuery.isPlaceholderData &&
    total === 0;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  const today = toIsoDate(new Date());
  // Tax-deductible has no server equivalent, and is scoped to this page only
  // — same approximation the other three cards had before the matrix
  // endpoint replaced them.
  const localFigures = superStats(contributions, period, today);

  const matrixQuery = useSuperMatrixQuery(
    period === "This month" ? "month" : "year",
  );
  const matrixFigures = matrixQuery.data
    ? mapContributionMatrix(matrixQuery.data, period)
    : null;

  /*
   * Covers both halves of "applying a filter": debounce, then the request
   * for the page it asks for. Not `isFetching`, which is also true of a
   * background refresh of the page already on screen.
   */
  const isFiltering =
    search !== debouncedSearch || contributionsQuery.isPlaceholderData;

  const cards: StatCard[] = [
    {
      key: "total",
      label: "Total contributions",
      value: matrixFigures?.total.value ?? localFigures.total.value,
      meta: matrixFigures?.total.delta ?? localFigures.total.delta,
      icon: PiggyBank,
    },
    {
      key: "matched",
      tone: "success",
      label: "Matched contributions",
      value: matrixFigures?.matched.value ?? localFigures.matched.value,
      meta: matrixFigures?.matched.delta ?? localFigures.matched.delta,
      icon: CircleCheck,
    },
    {
      key: "pending",
      tone: "warning",
      label: "Pending contributions",
      value: matrixFigures?.pending.value ?? localFigures.pending.value,
      meta: matrixFigures?.pending.delta ?? localFigures.pending.delta,
      icon: Clock,
    },
  ];

  if (contributionsQuery.isLoading) {
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
        icon={PiggyBank}
        title="Super contributions"
        titleTip={TITLE_TIP}
        description="Track what you've paid into super and match each payment to your bank feed."
      >
        {/* No "New fund" here: a fund is only ever created from the
            contribution form's combobox, in the context that needs it. */}
        {!isEmpty && (
          <Button asChild>
            <Link href={`${SUPER_ROOT}/new`}>
              <Plus />
              New contribution
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* Scopes the cards only — the list isn't filtered by period, same as
          sole-webapp's own analytics toggle. */}
      {!isEmpty && (
        <Tabs
          value={period}
          onValueChange={(next) => setPeriod(next as SuperPeriod)}
        >
          <TabsList aria-label="Summary period">
            {SUPER_PERIODS.map((option) => (
              <TabsTrigger key={option} value={option}>
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Gone with no contributions at all — zeroes over an empty table say
          nothing the empty state doesn't. */}
      {!isEmpty && <StatCards stats={cards} loading={matrixQuery.isPending} />}

      <SuperTable
        contributions={contributions}
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

      <MatchDialog />
      <DeleteContributionDialog />
    </div>
  );
}
