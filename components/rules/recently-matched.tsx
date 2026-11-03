"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Sparkles, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import {
  signedSyncAmount,
  type RecentlyMatchedTransaction,
} from "@/lib/rules";
import { cn } from "@/lib/utils";

/**
 * What the rules have caught lately.
 *
 * The point of a rules page is trust: you can't tell whether a condition is
 * doing the right thing from the condition itself, only from what it has
 * actually matched. The backend's sync-stats endpoint doesn't attribute a
 * match back to the rule that made it (or carry a date/reference) — only the
 * transaction, its category and its client — so that's what's shown here,
 * newest first.
 *
 * Five rows then scroll — enough to see a pattern, not so many that the rules
 * themselves are pushed off the screen.
 */
export function RecentlyMatched({
  matches,
  loading,
}: {
  matches: RecentlyMatchedTransaction[];
  /** The first fetch hasn't landed yet. */
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-md bg-success/10 text-success"
            aria-hidden
          >
            <Zap className="size-3.5" />
          </span>
          <CardTitle className="text-base">Recently matched</CardTitle>
          {!loading && matches.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular">
              {matches.length}{" "}
              {matches.length === 1 ? "transaction" : "transactions"}
            </span>
          )}
        </div>
        <Link
          href="/transactions?status=matched"
          className="flex shrink-0 items-center gap-0.5 rounded text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <ul className="divide-y divide-border" aria-hidden>
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-3">
                <Shimmer className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Shimmer className="h-4 w-2/3" />
                  <Shimmer className="h-4 w-24 rounded-md" />
                </div>
                <Shimmer className="h-4 w-14 shrink-0" />
              </li>
            ))}
          </ul>
        ) : matches.length === 0 ? (
          <div className="px-6 pb-6">
            <Empty className="border-0 bg-transparent px-0 py-6 shadow-none">
              <EmptyMedia>
                <Sparkles aria-hidden />
              </EmptyMedia>
              <div className="space-y-1">
                <EmptyTitle>Nothing matched yet</EmptyTitle>
                <EmptyDescription>
                  Run your rules and the transactions they catch will appear
                  here, newest first.
                </EmptyDescription>
              </div>
            </Empty>
          </div>
        ) : (
          /* Roughly five rows deep before it scrolls, so the list has a
             predictable height whatever has matched. */
          <ul className="max-h-[20rem] divide-y divide-border overflow-y-auto">
            {matches.map((detail) => {
              const credit = detail.type === "credit";

              return (
                <li key={detail.id}>
                  <div className="flex w-full items-center gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        credit
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning",
                      )}
                      aria-hidden
                    >
                      {credit ? (
                        <ArrowDownLeft className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate text-sm font-medium">
                        {detail.description || "—"}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {detail.categoryName && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                            <Zap className="size-3 shrink-0" aria-hidden />
                            {detail.categoryName}
                          </span>
                        )}
                        {detail.clientName && (
                          <span className="truncate text-xs text-muted-foreground">
                            {detail.clientName}
                          </span>
                        )}
                      </span>
                    </span>

                    <span
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular",
                        credit && "text-success",
                      )}
                    >
                      {signedSyncAmount(detail)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
