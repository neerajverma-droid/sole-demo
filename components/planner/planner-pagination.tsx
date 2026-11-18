"use client";

import * as React from "react";

import { NumberedPagination } from "@/components/ui/numbered-pagination";
import type { PlannerPage } from "@/lib/planner-api";

/** Rows per page on a planner table until the person picks another. */
export const PLANNER_PAGE_SIZE = 10;

/**
 * What a planner table needs to page: where it is, how big a page is, and how
 * to move. Built by the screen, which owns the state because the table
 * unmounts every time its tab is left.
 */
export type PlannerPaging = {
  page: PlannerPage<unknown>;
  pageSize: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
};

/** Where one tab's table is: its page, and how many rows a page holds. */
export function usePlannerPageState() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSizeState] = React.useState<number>(PLANNER_PAGE_SIZE);

  // A new page size starts over from the first page, as Invoices does — the
  // old page number means something different at the new size.
  const setPageSize = React.useCallback((next: number) => {
    setPageSizeState(next);
    setPage(1);
  }, []);

  return { page, pageSize, setPage, setPageSize };
}

/**
 * The pagination bar's props for a table, from its page state and the page the
 * server returned — and the step back off a page that no longer exists.
 *
 * Deleting the last row on the last page leaves that page empty; the server
 * answers it with no rows and the real total, and this moves to the page that
 * does exist rather than leaving "No goals yet" over a list that has goals.
 */
export function usePlannerPaging(
  state: ReturnType<typeof usePlannerPageState>,
  data: PlannerPage<unknown> | undefined,
): PlannerPaging | undefined {
  const { setPage } = state;

  React.useEffect(() => {
    if (data && data.rows.length === 0 && data.total > 0 && data.page > 1) {
      setPage(data.pageCount);
    }
  }, [data, setPage]);

  if (!data) return undefined;
  return {
    page: data,
    pageSize: state.pageSize,
    onPageChange: state.setPage,
    onPageSizeChange: state.setPageSize,
  };
}

/**
 * How many shimmer rows a table shows while its page loads: as many as the
 * page will have, so the page keeps its height — a shorter stand-in shortens
 * the document under a reader who has scrolled down to the pager. The last
 * page is shorter than the rest, so it counts what's left.
 */
export function skeletonRowCount(
  paging: PlannerPaging | undefined,
  fallback: number,
): number {
  if (!paging) return fallback;
  const { page, total } = paging.page;
  if (total <= 0) return fallback;
  return Math.max(
    1,
    Math.min(paging.pageSize, total - (page - 1) * paging.pageSize),
  );
}

/** The bar under a planner table — the same one Invoices uses. */
export function PlannerListPagination({
  paging,
  itemLabel,
  navLabel,
  disabled,
}: {
  paging: PlannerPaging;
  itemLabel: string;
  navLabel: string;
  /** While a page is loading, so a second click can't queue behind the first. */
  disabled?: boolean;
}) {
  return (
    <NumberedPagination
      page={paging.page}
      pageSize={paging.pageSize}
      onPageChange={paging.onPageChange}
      onPageSizeChange={paging.onPageSizeChange}
      itemLabel={itemLabel}
      navLabel={navLabel}
      disabled={disabled}
    />
  );
}
