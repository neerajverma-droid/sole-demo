"use client";

import * as React from "react";

import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { FilterPill } from "@/components/ui/filter-pills";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { ClientCell, StarRow, TonePill } from "@/components/reputation/reputation-ui";
import { paginate } from "@/lib/products";
import {
  FEEDBACK_FILTERS,
  feedbackClientLabel,
  feedbackFilterCounts,
  feedbackReferenceLabel,
  feedbackRouted,
  feedbackScore,
  feedbackStatus,
  matchesFeedbackFilter,
  type FeedbackFilter,
  type ReputationFeedback,
} from "@/lib/reputation";
import { cn } from "@/lib/utils";

const FILTER_DOT: Partial<Record<FeedbackFilter, string>> = {
  Promoters: "bg-success",
  Passives: "bg-amber-500",
  Detractors: "bg-destructive",
};

const FILTER_HINT: Partial<Record<FeedbackFilter, string>> = {
  Promoters: "5 stars · Loyal, happy clients likely to recommend you",
  Passives: "4 stars · Satisfied but neutral clients",
  Detractors: "1–3 stars · Unhappy clients who need recovery or a follow-up",
};

export function ReputationFeedbackTab({
  feedbacks,
  loading,
  filter,
  onFilterChange,
  onOpen,
}: {
  feedbacks: ReputationFeedback[];
  loading: boolean;
  filter: FeedbackFilter;
  onFilterChange: (filter: FeedbackFilter) => void;
  onOpen: (feedback: ReputationFeedback) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  React.useEffect(() => setPage(1), [filter]);

  const counts = feedbackFilterCounts(feedbacks);
  const filtered = feedbacks.filter((feedback) => matchesFeedbackFilter(feedback, filter));
  const paged = paginate(filtered, page, pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter feedback">
        {FEEDBACK_FILTERS.map((option) => {
          const active = filter === option;
          return (
            <FilterPill key={option} active={active} variant="soft" onSelect={() => onFilterChange(option)}>
              {FILTER_DOT[option] && <span className={cn("size-2 rounded-full", FILTER_DOT[option])} aria-hidden />}
              {option}
              {option !== "All" && <span className="text-xs font-bold tabular">{loading ? "…" : counts[option]}</span>}
            </FilterPill>
          );
        })}
      </div>
      {FILTER_HINT[filter] && <p className="text-xs text-muted-foreground">{FILTER_HINT[filter]}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Client</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Routed</TableHead>
              <TableHead className="px-4 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell className="px-4" colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5}>
                  <Empty className="border-0 py-10 shadow-none">
                    <EmptyTitle>No feedback found</EmptyTitle>
                    <EmptyDescription>
                      {filter === "All"
                        ? "Feedback will appear here once clients respond."
                        : `No feedback matches the “${filter}” filter.`}
                    </EmptyDescription>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              paged.rows.map((feedback) => {
                const status = feedbackStatus(feedback);
                const score = feedbackScore(feedback);
                return (
                  <TableRow
                    key={feedback.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => onOpen(feedback)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(feedback);
                      }
                    }}
                  >
                    <TableCell className="px-4 py-3">
                      <ClientCell name={feedbackClientLabel(feedback)} subtitle={feedbackReferenceLabel(feedback)} />
                    </TableCell>
                    <TableCell>
                      <StarRow rating={feedback.starRating ?? 0} />
                    </TableCell>
                    <TableCell>{score ? <TonePill tone={score.tone}>{score.label}</TonePill> : <TonePill tone="neutral">—</TonePill>}</TableCell>
                    <TableCell>
                      <TonePill tone="neutral">{feedbackRouted(feedback)}</TonePill>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      <TonePill tone={status.tone}>{status.label}</TonePill>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {!loading && filtered.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <TablePagination
              page={paged}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              label="responses"
            />
          </div>
        )}
      </div>
    </div>
  );
}
